const crypto = require('crypto');
const https = require('https');
const Campaign = require('../models/Campaign');
const SyncLog = require('../models/SyncLog');
const { decrypt } = require('./encryption');

const GOOGLE_REQUEST_TIMEOUT_MS = Number(process.env.GOOGLE_REQUEST_TIMEOUT_MS || 10000);

function createLogPayload(clientCompany, overrides = {}) {
  return {
    organization: clientCompany.organization._id || clientCompany.organization,
    clientCompany: clientCompany._id,
    source: 'Google Analytics',
    trigger: overrides.trigger || 'manual',
    attempts: overrides.attempts || 1,
    ...overrides
  };
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makePostRequest(url, bodyString, headers = {}) {
  const urlObj = new URL(url);
  const options = {
    method: 'POST',
    hostname: urlObj.hostname,
    path: urlObj.pathname + urlObj.search,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(json.error?.message || json.message || `Google request failed with code ${res.statusCode}: ${data}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`Failed to parse Google JSON response: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(GOOGLE_REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Google request timed out after ${GOOGLE_REQUEST_TIMEOUT_MS}ms`));
    });
    req.write(bodyString);
    req.end();
  });
}

function normalizeGa4PropertyId(value) {
  return String(value || '').trim().replace(/^properties\//i, '');
}

function generateJwt(clientEmail, privateKey) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    iat: now,
    exp: now + 3600
  })).toString('base64url');
  
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(privateKey, 'base64url');
  
  return `${header}.${payload}.${signature}`;
}

async function getAccessToken(clientEmail, privateKey) {
  const jwtToken = generateJwt(clientEmail, privateKey);
  const tokenUrl = 'https://oauth2.googleapis.com/token';
  const body = JSON.stringify({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwtToken
  });
  
  const response = await makePostRequest(tokenUrl, body, {
    'Content-Type': 'application/json'
  });
  return response.access_token;
}

async function fetchGa4ReportRows(url, accessToken, baseReportBody) {
  const limit = Number(process.env.GA4_SYNC_PAGE_SIZE || 10000);
  let offset = 0;
  let rowCount = null;
  const rows = [];

  do {
    const report = await makePostRequest(url, JSON.stringify({
      ...baseReportBody,
      limit,
      offset
    }), {
      'Authorization': `Bearer ${accessToken}`
    });
    const pageRows = report.rows || [];
    rows.push(...pageRows);
    rowCount = Number(report.rowCount || rows.length);
    offset += pageRows.length;
    if (!pageRows.length) break;
  } while (rows.length < rowCount);

  return { rows, pagesFetched: Math.max(1, Math.ceil(rows.length / limit)), rowCount: rowCount || rows.length };
}

async function syncGoogleAnalytics(clientCompany, options = {}) {
  const orgId = clientCompany.organization._id || clientCompany.organization;
  const startedAt = Date.now();
  
  if (!clientCompany.ga4ServiceAccountJsonEncrypted || !clientCompany.ga4PropertyId) {
    return { status: 'skipped', message: 'Google Analytics 4 integration not configured for this company.' };
  }

  let decryptedJson;
  try {
    decryptedJson = decrypt(clientCompany.ga4ServiceAccountJsonEncrypted);
  } catch (error) {
    const errMsg = `GA4 decryption failed: ${error.message}`;
    await SyncLog.create(createLogPayload(clientCompany, {
      status: 'failure',
      error: errMsg,
      durationMs: Date.now() - startedAt,
      trigger: options.trigger,
      attempts: options.attempts
    }));
    throw new Error(errMsg);
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(decryptedJson);
  } catch (error) {
    const errMsg = `GA4 credentials JSON parsing failed: ${error.message}`;
    await SyncLog.create(createLogPayload(clientCompany, {
      status: 'failure',
      error: errMsg,
      durationMs: Date.now() - startedAt,
      trigger: options.trigger,
      attempts: options.attempts
    }));
    throw new Error(errMsg);
  }

  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    const errMsg = 'GA4 Service Account JSON missing client_email or private_key.';
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
    // 1. Authenticate with Google
    const accessToken = await getAccessToken(serviceAccount.client_email, serviceAccount.private_key);

    // 2. Fetch GA4 Data Report
    const propertyId = normalizeGa4PropertyId(clientCompany.ga4PropertyId);
    const ga4Url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
    
    const startDate = options.startDate || process.env.GA4_SYNC_START_DATE || '30daysAgo';
    const endDate = options.endDate || process.env.GA4_SYNC_END_DATE || 'today';
    const reportBody = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'campaignName' }],
      metrics: [{ name: 'sessions' }, { name: 'conversions' }, { name: 'totalUsers' }]
    };

    const { rows, pagesFetched, rowCount } = await fetchGa4ReportRows(ga4Url, accessToken, reportBody);
    let updatedCount = 0;
    let skippedUnmatched = 0;

    for (const row of rows) {
      const campaignNameVal = row.dimensionValues?.[0]?.value;
      const sessionsCount = Number(row.metricValues?.[0]?.value || 0);
      const conversionsCount = Number(row.metricValues?.[1]?.value || 0);
      const totalUsers = Number(row.metricValues?.[2]?.value || 0);
      
      if (!campaignNameVal || campaignNameVal === '(referral)' || campaignNameVal === '(direct)') {
        continue;
      }

      // Match campaign in DB under this Client Company
      const campaign = await Campaign.findOne({
        organization: orgId,
        clientCompany: clientCompany._id,
        $or: [
          { googleCampaignId: campaignNameVal },
          { name: new RegExp(`^${escapeRegex(String(campaignNameVal).trim())}$`, 'i') }
        ]
      });

      if (campaign) {
        // Track googleCampaignId if matched by name
        if (!campaign.googleCampaignId) {
          campaign.googleCampaignId = campaignNameVal;
        }
        
        campaign.clicksCount = sessionsCount; 
        campaign.conversionsCount = conversionsCount;
        campaign.ga4UsersCount = totalUsers;
        await campaign.save();
        updatedCount++;
      } else {
        skippedUnmatched++;
      }
    }

    await SyncLog.create(createLogPayload(clientCompany, {
      status: 'success',
      recordsProcessed: rows.length,
      recordsCreated: 0,
      recordsUpdated: updatedCount,
      durationMs: Date.now() - startedAt,
      trigger: options.trigger,
      attempts: options.attempts,
      diagnostics: {
        propertyId,
        startDate,
        endDate,
        skippedUnmatched,
        pagesFetched,
        rowCount
      }
    }));

    return { status: 'success', processed: rows.length, updated: updatedCount, skippedUnmatched };
  } catch (error) {
    const errMsg = `Google Analytics API sync failed: ${error.message}`;
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

module.exports = { normalizeGa4PropertyId, syncGoogleAnalytics };
