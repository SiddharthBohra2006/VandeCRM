const https = require('https');
const Campaign = require('../models/Campaign');
const SyncLog = require('../models/SyncLog');
const { decrypt } = require('./encryption');
const { logAudit } = require('../utils/audit');

const META_REQUEST_TIMEOUT_MS = Number(process.env.META_REQUEST_TIMEOUT_MS || 10000);
const META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v23.0';

function createLogPayload(clientCompany, overrides = {}) {
  return {
    organization: clientCompany.organization._id || clientCompany.organization,
    clientCompany: clientCompany._id,
    source: 'Meta Ads',
    trigger: overrides.trigger || 'manual',
    attempts: overrides.attempts || 1,
    ...overrides
  };
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeRequest(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || META_REQUEST_TIMEOUT_MS);
  if (typeof fetch === 'function') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
      .then(res => {
        if (!res.ok) {
          return res.text().then(text => { throw new Error(text || res.statusText); });
        }
        return res.json();
      })
      .finally(() => clearTimeout(timeout));
  }

  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(json.error?.message || json.message || `Request failed with code ${res.statusCode}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`Failed to parse JSON response: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Meta Ads request timed out after ${timeoutMs}ms`));
    });
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function fetchAllPages(url) {
  const pages = [];
  let nextUrl = url;

  while (nextUrl) {
    const response = await makeRequest(nextUrl);
    pages.push(response);
    nextUrl = response.paging && response.paging.next ? response.paging.next : null;
  }

  return pages;
}

async function syncMetaAds(clientCompany, options = {}) {
  const orgId = clientCompany.organization._id || clientCompany.organization;
  const startedAt = Date.now();
  
  if (!clientCompany.metaAccessTokenEncrypted || !clientCompany.metaAdAccountId) {
    return { status: 'skipped', message: 'Meta Ads integration not configured for this company.' };
  }

  let decryptedToken;
  try {
    decryptedToken = decrypt(clientCompany.metaAccessTokenEncrypted);
  } catch (error) {
    const errMsg = `Meta Ads decryption failed: ${error.message}`;
    await SyncLog.create(createLogPayload(clientCompany, {
      status: 'failure',
      error: errMsg,
      durationMs: Date.now() - startedAt,
      trigger: options.trigger,
      attempts: options.attempts
    }));
    throw new Error(errMsg);
  }

  try {
    const adAccountId = String(clientCompany.metaAdAccountId).trim().replace(/^act_/i, '');
    const datePreset = options.datePreset || process.env.META_SYNC_DATE_PRESET || 'this_month';
    const url = new URL(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/act_${adAccountId}/insights`);
    url.search = new URLSearchParams({
      level: 'campaign',
      fields: 'campaign_id,campaign_name,spend,clicks,impressions,actions',
      date_preset: datePreset,
      access_token: decryptedToken
    }).toString();

    const pages = await fetchAllPages(url.toString());
    const insights = pages.flatMap(page => page.data || []);

    let updatedCount = 0;
    let createdCount = 0;

    for (const insight of insights) {
      const leadAction = (insight.actions || []).find(action => ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'].includes(action.action_type));
      const metrics = {
        spent: Number(insight.spend || 0),
        clicksCount: Number(insight.clicks || 0),
        impressionsCount: Number(insight.impressions || 0),
        conversionsCount: leadAction ? Number(leadAction.value || 0) : 0
      };

      // Find matching campaign in DB under this Client Company
      let campaign = await Campaign.findOne({
        organization: orgId,
        clientCompany: clientCompany._id,
        $or: [
          { metaCampaignId: insight.campaign_id },
          { name: new RegExp(`^${escapeRegex(String(insight.campaign_name).trim())}$`, 'i') }
        ]
      });

      if (campaign) {
        campaign.spent = metrics.spent;
        campaign.clicksCount = metrics.clicksCount;
        campaign.impressionsCount = metrics.impressionsCount;
        campaign.metaCampaignId = insight.campaign_id;
        campaign.conversionsCount = metrics.conversionsCount;
        await campaign.save();
        updatedCount++;
      } else {
        const campaignName = String(insight.campaign_name || insight.campaign_id || 'Meta Campaign').trim();
        campaign = await Campaign.create({
          organization: orgId,
          clientCompany: clientCompany._id,
          name: campaignName,
          platform: 'Meta Ads',
          status: 'active',
          metaCampaignId: insight.campaign_id,
          ...metrics
        });
        await logAudit(null, {
          organization: orgId,
          user: options.user || null,
          action: 'integration_campaign_create',
          entityType: 'campaign',
          entityId: campaign._id,
          entityName: campaign.name,
          message: `Meta campaign "${campaign.name}" created from integration sync.`,
          metadata: {
            clientCompany: clientCompany._id,
            source: 'Meta Ads',
            trigger: options.trigger || 'manual'
          }
        });
        createdCount++;
      }
    }

    await SyncLog.create(createLogPayload(clientCompany, {
      status: 'success',
      recordsProcessed: insights.length,
      recordsCreated: createdCount,
      recordsUpdated: updatedCount,
      durationMs: Date.now() - startedAt,
      trigger: options.trigger,
      attempts: options.attempts,
      diagnostics: {
        datePreset,
        adAccountId,
        campaignsCreated: createdCount,
        pagesFetched: pages.length
      }
    }));

    return { status: 'success', processed: insights.length, created: createdCount, updated: updatedCount };
  } catch (error) {
    const errMsg = `Meta Ads API sync failed: ${error.message}`;
    await SyncLog.create(createLogPayload(clientCompany, {
      status: 'failure',
      error: errMsg,
      durationMs: Date.now() - startedAt,
      trigger: options.trigger,
      attempts: options.attempts
    }));
    return { status: 'failure', error: error.message };
  }
}

module.exports = { syncMetaAds };
