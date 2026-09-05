const https = require('https');
const http = require('http');
const dns = require('dns');
const { promisify } = require('util');
const SyncLog = require('../models/SyncLog');

const lookup = promisify(dns.lookup);

const WEBHOOK_TIMEOUT_MS = Number(process.env.OUTBOUND_WEBHOOK_TIMEOUT_MS || 8000);
const WEBHOOK_MAX_ATTEMPTS = Number(process.env.OUTBOUND_WEBHOOK_MAX_ATTEMPTS || 3);

function isPrivateIpv4(ip) {
  const parts = String(ip).split('.').map(Number);
  if (parts.length !== 4 || parts.some(value => Number.isNaN(value))) return false;
  const [a, b] = parts;
  if (a === 0) return true;                                   // 0.0.0.0/8
  if (a === 10) return true;                                  // 10.0.0.0/8
  if (a === 127) return true;                                 // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true;                    // 169.254.0.0/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true;           // 172.16.0.0/12
  if (a === 100 && b >= 64 && b <= 127) return true;          // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 168) return true;                    // 192.168.0.0/16
  if (a === 192 && b === 0 && parts[2] === 0) return true;    // 192.0.0.0/24
  if (a === 192 && b === 0 && parts[2] === 2) return true;    // 192.0.2.0/24 TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true;       // 198.18.0.0/15 benchmark
  if (a === 198 && b === 51 && parts[2] === 100) return true; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && parts[2] === 113) return true;  // 203.0.113.0/24 TEST-NET-3
  if (a >= 224 && a <= 239) return true;                      // 224.0.0.0/4 multicast
  if (a === 255) return true;                                 // 255.255.255.255/32
  return false;
}

function isForbiddenAddress(address) {
  const normalized = String(address || '').toLowerCase();
  if (isPrivateIpv4(normalized)) return true;
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true; // IPv6 loopback
  if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;  // IPv6 unspecified
  if (/^::ffff:(\d{1,3}(\.\d{1,3}){3})/.test(normalized)) return isPrivateIpv4(normalized.slice(7)); // IPv4-mapped
  if (/^fe[89ab]/i.test(normalized) || /^f[cd]/i.test(normalized)) return true; // fe80::/10 link-local, fc00::/7 ULA
  return false;
}

// Reject URLs whose target resolves — directly or via DNS — to private,
// loopback, link-local, or cloud-metadata addresses (SSRF mitigation).
async function assertPublicWebhookUrl(url) {
  let urlObj;
  try {
    urlObj = new URL(url);
  } catch (error) {
    throw new Error('Webhook URL is invalid.');
  }
  if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
    throw new Error('Webhook URL must be http or https.');
  }
  const hostname = String(urlObj.hostname || '').replace(/^\[|\]$/g, '');
  if (!hostname) {
    throw new Error('Webhook URL is missing a host.');
  }
  const literalIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
  if (hostname === 'localhost' || (literalIp && isPrivateIpv4(hostname))) {
    throw new Error(`Webhook target "${hostname}" is a reserved/internal address and is blocked.`);
  }
  let addresses = [];
  try {
    const records = await lookup(hostname, { all: true });
    addresses = (records || []).map(record => record.address);
  } catch (error) {
    throw new Error(`Webhook host "${hostname}" could not be resolved.`);
  }
  for (const address of addresses) {
    if (isForbiddenAddress(address)) {
      throw new Error(`Webhook target "${hostname}" resolves to private/internal address ${address} and is blocked.`);
    }
  }
  return urlObj;
}

// Resolve + validate once, then return the concrete public IP to connect to.
// Connecting to the validated IP (instead of re-resolving the hostname at
// request time) closes the classic DNS-rebinding race: an attacker can no
// longer return a public IP for the check and a private IP for the connect.
async function assertAndResolveWebhookUrl(url) {
  const urlObj = await assertPublicWebhookUrl(url);
  const hostname = String(urlObj.hostname || '').replace(/^\[|\]$/g, '');
  let addresses = [];
  try {
    const records = await lookup(hostname, { all: true });
    addresses = (records || []).map(record => record.address);
  } catch (error) {
    throw new Error(`Webhook host "${hostname}" could not be resolved.`);
  }
  for (const address of addresses) {
    if (isForbiddenAddress(address)) {
      throw new Error(`Webhook target "${hostname}" resolves to private/internal address ${address} and is blocked.`);
    }
  }
  const address = addresses[0];
  if (!address) {
    throw new Error(`Webhook host "${hostname}" could not be resolved.`);
  }
  return { urlObj, address };
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function postJsonPayload(url, payload, timeoutMs = WEBHOOK_TIMEOUT_MS) {
  const { urlObj, address } = await assertAndResolveWebhookUrl(url);
  const body = JSON.stringify(payload);
  const clientModule = urlObj.protocol === 'https:' ? https : http;

  const options = {
    method: 'POST',
    hostname: address,
    port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
    path: urlObj.pathname + urlObj.search,
    // servername keeps HTTPS SNI + certificate hostname validation pointing at
    // the original hostname even though we are connecting to the validated IP.
    servername: urlObj.hostname,
    headers: {
      'Host': urlObj.host,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'User-Agent': process.env.WEBHOOK_USER_AGENT || 'CRM-Webhook-Dispatcher/1.0'
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

module.exports = { dispatchLeadWebhook, postJsonPayload, assertPublicWebhookUrl, assertAndResolveWebhookUrl };
