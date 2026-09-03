const ClientCompany = require('../models/ClientCompany');
const SyncLog = require('../models/SyncLog');
const { syncMetaAds } = require('./metaService');
const { syncGoogleAnalytics } = require('./googleService');

function getNextSyncAt(intervalMinutes) {
  const minutes = Math.max(15, Number(intervalMinutes || 360));
  return new Date(Date.now() + minutes * 60 * 1000);
}

function hasMetaConfig(company) {
  return Boolean(company.metaAccessTokenEncrypted && company.metaAdAccountId);
}

function hasGa4Config(company) {
  return Boolean(company.ga4ServiceAccountJsonEncrypted && company.ga4PropertyId);
}

async function syncCompanyIntegrations(company, options = {}) {
  const results = [];
  const orgId = company.organization._id || company.organization;

  if (options.source === 'Meta Ads' || (!options.source && hasMetaConfig(company))) {
    results.push({ source: 'Meta Ads', result: await syncMetaAds(company, options) });
  }

  if (options.source === 'Google Analytics' || (!options.source && hasGa4Config(company))) {
    results.push({ source: 'Google Analytics', result: await syncGoogleAnalytics(company, options) });
  }

  const failures = results.filter(item => item.result.status === 'failure');
  const successes = results.filter(item => item.result.status === 'success');
  const status = failures.length && successes.length ? 'partial' : failures.length ? 'failure' : successes.length ? 'success' : 'never';

  await ClientCompany.updateOne(
    { _id: company._id, organization: orgId },
    {
      integrationLastSyncAt: new Date(),
      integrationLastSyncStatus: status,
      integrationNextSyncAt: getNextSyncAt(company.integrationSyncIntervalMinutes)
    }
  );

  return { status, results };
}

async function syncOrganizationIntegrations(organization, options = {}) {
  const companies = await ClientCompany.find({ organization });
  const summary = {
    companies: companies.length,
    metaSuccess: 0,
    ga4Success: 0,
    failures: 0,
    skipped: 0
  };

  for (const company of companies) {
    const result = await syncCompanyIntegrations(company, options);
    if (result.status === 'never') summary.skipped += 1;
    if (result.status === 'failure' || result.status === 'partial') summary.failures += 1;
    result.results.forEach(item => {
      if (item.source === 'Meta Ads' && item.result.status === 'success') summary.metaSuccess += 1;
      if (item.source === 'Google Analytics' && item.result.status === 'success') summary.ga4Success += 1;
    });
  }

  return summary;
}

async function retrySyncLog(log, user) {
  const company = await ClientCompany.findOne({ _id: log.clientCompany, organization: log.organization });
  if (!company) {
    throw new Error('Client company for this sync log no longer exists.');
  }

  return syncCompanyIntegrations(company, {
    source: log.source,
    trigger: 'retry',
    attempts: Number(log.attempts || 1) + 1,
    retriedBy: user ? user._id : null
  });
}

async function runDueScheduledSyncs(organization = null) {
  const filter = {
    integrationSyncEnabled: true,
    status: 'active',
    $or: [
      { integrationNextSyncAt: null },
      { integrationNextSyncAt: { $lte: new Date() } }
    ]
  };

  if (organization) filter.organization = organization;

  const dueCompanies = await ClientCompany.find(filter).limit(20);

  for (const company of dueCompanies) {
    await syncCompanyIntegrations(company, { trigger: 'scheduled' });
  }

  return dueCompanies.length;
}

function startIntegrationScheduler() {
  if (process.env.INTEGRATION_SCHEDULER_ENABLED === 'false') return;
  if (global.__vandeIntegrationScheduler) return;

  const intervalMs = Math.max(1, Number(process.env.INTEGRATION_SCHEDULER_POLL_MINUTES || 5)) * 60 * 1000;
  global.__vandeIntegrationScheduler = setInterval(() => {
    runDueScheduledSyncs().catch(error => {
      console.error('Scheduled integration sync failed:', error.message);
    });
  }, intervalMs);

  runDueScheduledSyncs().catch(error => {
    console.error('Initial integration sync scan failed:', error.message);
  });
}

async function getIntegrationDiagnostics(organization) {
  const [latestLogs, failedLogs, dueCompanies] = await Promise.all([
    SyncLog.find({ organization }).populate('clientCompany').sort({ timestamp: -1 }).limit(30),
    SyncLog.find({ organization, status: 'failure' }).populate('clientCompany').sort({ timestamp: -1 }).limit(10),
    ClientCompany.find({ organization, integrationSyncEnabled: true }).sort({ integrationNextSyncAt: 1 })
  ]);

  return { latestLogs, failedLogs, dueCompanies };
}

module.exports = {
  getNextSyncAt,
  getIntegrationDiagnostics,
  hasMetaConfig,
  hasGa4Config,
  retrySyncLog,
  runDueScheduledSyncs,
  startIntegrationScheduler,
  syncCompanyIntegrations,
  syncOrganizationIntegrations
};
