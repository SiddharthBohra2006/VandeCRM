const https = require('https');
const http = require('http');
const SyncLog = require('../models/SyncLog');

const WEBHOOK_TIMEOUT_MS = Number(process.env.OUTBOUND_WEBHOOK_TIMEOUT_MS || 8000);
const WEBHOOK_MAX_ATTEMPTS = Number(process.env.OUTBOUND_WEBHOOK_MAX_ATTEMPTS || 3);

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function postJsonPayload(url, payload, timeoutMs = WEBHOOK_TIMEOUT_MS) {
  const urlObj = new URL(url);
  const body = JSON.stringify(payload);
  const clientModule = urlObj.protocol === 'https:' ? https : http;

  const options = {
    method: 'POST',
    hostname: urlObj.hostname,
    port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
    path: urlObj.pathname + urlObj.search,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'User-Agent': 'VandeAgencyCRM-Webhook-Dispatcher/1.0'
    }
  };

  return new Promise((resolve, reject) => {
    const req = clientModule.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: data });
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Webhook timed out after ${timeoutMs}ms`));
    });
    req.write(body);
    req.end();
  });
}

async function dispatchLeadWebhook(clientCompany, customer) {
  if (!clientCompany || !clientCompany.outboundWebhookUrl) {
    return;
  }

  const payload = {
    event: 'lead.created',
    timestamp: new Date().toISOString(),
    company: {
      id: clientCompany._id,
      name: clientCompany.name
    },
    lead: {
      id: customer._id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      source: customer.source,
      value: customer.value || 0,
      notes: customer.notes || '',
      utm: {
        source: customer.utmSource || '',
        medium: customer.utmMedium || '',
        campaign: customer.utmCampaign || '',
        content: customer.utmContent || '',
        term: customer.utmTerm || ''
      },
      customFields: customer.customData ? Object.fromEntries(customer.customData.entries()) : {}
    }
  };

  let lastError = null;
  for (let attempt = 1; attempt <= WEBHOOK_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await postJsonPayload(clientCompany.outboundWebhookUrl, payload);
      if (result.statusCode < 200 || result.statusCode >= 300) {
        throw new Error(`Webhook returned HTTP ${result.statusCode}`);
      }

      await SyncLog.create({
        organization: clientCompany.organization._id || clientCompany.organization,
        clientCompany: clientCompany._id,
        source: 'Outbound Lead Webhook',
        status: 'success',
        trigger: 'api',
        recordsProcessed: 1,
        recordsCreated: 0,
        recordsUpdated: 0,
        attempts: attempt,
        diagnostics: {
          url: clientCompany.outboundWebhookUrl,
          statusCode: result.statusCode,
          customerId: customer._id
        }
      });
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < WEBHOOK_MAX_ATTEMPTS) {
        await wait(250 * attempt);
      }
    }
  }

  await SyncLog.create({
    organization: clientCompany.organization._id || clientCompany.organization,
    clientCompany: clientCompany._id,
    source: 'Outbound Lead Webhook',
    status: 'failure',
    trigger: 'api',
    recordsProcessed: 1,
    attempts: WEBHOOK_MAX_ATTEMPTS,
    error: lastError ? lastError.message : 'Webhook dispatch failed.',
    diagnostics: {
      url: clientCompany.outboundWebhookUrl,
      customerId: customer._id
    }
  });
  throw lastError || new Error('Webhook dispatch failed.');
}

module.exports = { dispatchLeadWebhook };
