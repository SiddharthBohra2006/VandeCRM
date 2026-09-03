const express = require('express');
const Campaign = require('../models/Campaign');
const ClientCompany = require('../models/ClientCompany');
const SyncLog = require('../models/SyncLog');
const { requirePermission } = require('../middleware/auth');
const { encrypt } = require('../services/encryption');
const { logAudit } = require('../utils/audit');
const {
  getIntegrationDiagnostics,
  getNextSyncAt,
  retrySyncLog,
  runDueScheduledSyncs,
  syncCompanyIntegrations,
  syncOrganizationIntegrations
} = require('../services/integrationSync');
const crypto = require('crypto');

const router = express.Router();

router.use(requirePermission('integrations.view'));
router.use((req, res, next) => req.method === 'GET' ? next() : requirePermission('integrations.update')(req, res, next));

function normalizeMetaAdAccountId(value) {
  return String(value || '').trim().replace(/^act_/i, '').replace(/\D/g, '');
}

function normalizeGa4PropertyId(value) {
  return String(value || '').trim().replace(/^properties\//i, '');
}

function parseGa4ServiceAccountJson(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = JSON.parse(raw);
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('GA4 JSON must include client_email and private_key.');
  }
  return JSON.stringify(parsed);
}

router.get('/', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const [campaigns, companies, diagnostics] = await Promise.all([
      Campaign.find({ organization: orgId }).populate('clientCompany'),
      ClientCompany.find({ organization: orgId }).sort({ name: 1 }),
      getIntegrationDiagnostics(orgId)
    ]);

    const hasMetaConnected = companies.some(c => c.metaAccessTokenEncrypted && c.metaAdAccountId);
    const hasGaConnected = companies.some(c => c.ga4ServiceAccountJsonEncrypted && c.ga4PropertyId);
    const latestLogByCompany = new Map();
    diagnostics.latestLogs
      .filter(log => log.clientCompany)
      .forEach(log => {
        const companyId = String(log.clientCompany._id || log.clientCompany);
        if (!latestLogByCompany.has(companyId)) latestLogByCompany.set(companyId, log);
      });
    const setupChecklist = companies.map(company => ({
      company,
      latestLog: latestLogByCompany.get(String(company._id)) || null,
      items: [
        { label: 'Meta ad account ID saved', done: Boolean(company.metaAdAccountId) },
        { label: 'Meta access token encrypted', done: Boolean(company.metaAccessTokenEncrypted) },
        { label: 'GA4 property ID saved', done: Boolean(company.ga4PropertyId) },
        { label: 'GA4 service account JSON encrypted', done: Boolean(company.ga4ServiceAccountJsonEncrypted) },
        { label: 'Inbound API key active', done: company.apiKeyStatus !== 'disabled' && Boolean(company.apiKey) },
        { label: 'Scheduled sync enabled', done: Boolean(company.integrationSyncEnabled) }
      ]
    }));

    res.render('integrations/index', {
      title: 'Platform Integrations',
      campaigns,
      companies,
      logs: diagnostics.latestLogs,
      failedLogs: diagnostics.failedLogs,
      dueCompanies: diagnostics.dueCompanies,
      setupChecklist,
      hasMetaConnected,
      hasGaConnected,
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (error) {
    next(error);
  }
});

router.post('/companies/:id/credentials', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const { metaAccessToken, ga4ServiceAccountJson } = req.body;
    const metaAdAccountId = normalizeMetaAdAccountId(req.body.metaAdAccountId);
    const ga4PropertyId = normalizeGa4PropertyId(req.body.ga4PropertyId);

    const updateData = {
      metaAdAccountId,
      ga4PropertyId
    };

    if (metaAdAccountId && !/^\d{6,30}$/.test(metaAdAccountId)) {
      return res.redirect('/integrations?error=Meta Ad Account ID must be digits only.');
    }
    if (ga4PropertyId && !/^\d+$/.test(ga4PropertyId)) {
      return res.redirect('/integrations?error=GA4 Property ID must be numeric.');
    }

    // Encrypt fields only if provided
    if (metaAccessToken && metaAccessToken.trim() !== '') {
      updateData.metaAccessTokenEncrypted = encrypt(metaAccessToken.trim());
      updateData.metaTokenExpiresAt = req.body.metaTokenExpiresAt ? new Date(req.body.metaTokenExpiresAt) : null;
    }
    if (ga4ServiceAccountJson && ga4ServiceAccountJson.trim() !== '') {
      try {
        updateData.ga4ServiceAccountJsonEncrypted = encrypt(parseGa4ServiceAccountJson(ga4ServiceAccountJson));
      } catch (error) {
        return res.redirect(`/integrations?error=${encodeURIComponent(error.message)}`);
      }
    }

    const company = await ClientCompany.findOneAndUpdate(
      { _id: req.params.id, organization: orgId },
      updateData,
      { new: true }
    );

    if (!company) {
      return res.status(404).redirect('/integrations?error=Client Company not found.');
    }
    await logAudit(req, {
      action: 'integration_credentials_update',
      entityType: 'client_company',
      entityId: company._id,
      entityName: company.name,
      message: `Integration credentials updated for "${company.name}".`
    });

    res.redirect('/integrations?success=API configuration credentials saved and encrypted successfully.');
  } catch (error) {
    next(error);
  }
});

router.post('/sync', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const summary = await syncOrganizationIntegrations(orgId, { trigger: 'manual', user: req.user._id });
    const successMsg = `Platform synchronization completed. Synced Meta for ${summary.metaSuccess} client(s), GA4 for ${summary.ga4Success} client(s), skipped ${summary.skipped}, failures ${summary.failures}.`;
    await logAudit(req, {
      action: 'integration_sync',
      entityType: 'integration',
      message: successMsg,
      metadata: summary
    });
    res.redirect(`/integrations?success=${encodeURIComponent(successMsg)}`);
  } catch (error) {
    next(error);
  }
});

router.post('/scheduled/run-due', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const syncedCount = await runDueScheduledSyncs(orgId);
    await logAudit(req, {
      action: 'scheduled_sync_run',
      entityType: 'integration',
      message: `Ran due scheduled syncs for ${syncedCount} companies.`
    });
    res.redirect(`/integrations?success=${encodeURIComponent(`Ran due scheduled syncs for ${syncedCount} companies.`)}`);
  } catch (error) {
    next(error);
  }
});

router.post('/companies/:id/sync-settings', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const interval = Math.max(15, Number(req.body.integrationSyncIntervalMinutes || 360));
    const integrationSyncEnabled = req.body.integrationSyncEnabled === 'on';
    const company = await ClientCompany.findOneAndUpdate(
      { _id: req.params.id, organization: orgId },
      {
        integrationSyncEnabled,
        integrationSyncIntervalMinutes: interval,
        integrationNextSyncAt: integrationSyncEnabled ? getNextSyncAt(interval) : null
      },
      { new: true }
    );
    if (!company) return res.redirect('/integrations?error=Client Company not found.');

    await logAudit(req, {
      action: 'integration_schedule_update',
      entityType: 'client_company',
      entityId: company._id,
      entityName: company.name,
      message: `Integration schedule ${integrationSyncEnabled ? 'enabled' : 'disabled'} for "${company.name}".`,
      metadata: { interval }
    });
    res.redirect('/integrations?success=Integration schedule updated.');
  } catch (error) {
    next(error);
  }
});

router.post('/companies/:id/meta/clear', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const company = await ClientCompany.findOne({ _id: req.params.id, organization: orgId });
    if (!company) return res.redirect('/integrations?error=Client Company not found.');

    company.metaAdAccountId = '';
    company.metaAccessTokenEncrypted = '';
    company.metaTokenExpiresAt = null;
    if (!company.ga4ServiceAccountJsonEncrypted || !company.ga4PropertyId) {
      company.integrationSyncEnabled = false;
      company.integrationNextSyncAt = null;
    }
    await company.save();

    await logAudit(req, {
      action: 'meta_credentials_clear',
      entityType: 'client_company',
      entityId: company._id,
      entityName: company.name,
      message: `Meta credentials cleared for "${company.name}".`
    });

    res.redirect('/integrations?success=Meta credentials cleared.');
  } catch (error) {
    next(error);
  }
});

router.post('/companies/:id/sync-now', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const company = await ClientCompany.findOne({ _id: req.params.id, organization: orgId });
    if (!company) return res.redirect('/integrations?error=Client Company not found.');
    const result = await syncCompanyIntegrations(company, { trigger: 'manual', user: req.user._id });
    res.redirect(`/integrations?success=${encodeURIComponent(`Manual sync for ${company.name} finished with status ${result.status}.`)}`);
  } catch (error) {
    next(error);
  }
});

router.post('/logs/:id/retry', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const log = await SyncLog.findOne({ _id: req.params.id, organization: orgId });
    if (!log) return res.redirect('/integrations?error=Sync log not found.');
    const result = await retrySyncLog(log, req.user);
    await logAudit(req, {
      action: 'integration_retry',
      entityType: 'sync_log',
      entityId: log._id,
      message: `Retried ${log.source} sync with status ${result.status}.`
    });
    res.redirect(`/integrations?success=${encodeURIComponent(`Retry finished with status ${result.status}.`)}`);
  } catch (error) {
    next(error);
  }
});

router.post('/companies/:id/api-key/status', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const apiKeyStatus = req.body.apiKeyStatus === 'disabled' ? 'disabled' : 'active';
    const action = apiKeyStatus === 'disabled' ? 'disabled' : 'enabled';
    const company = await ClientCompany.findOne({ _id: req.params.id, organization: orgId });
    if (!company) return res.redirect('/integrations?error=Client Company not found.');
    company.apiKeyStatus = apiKeyStatus;
    company.apiKeyDisabledAt = apiKeyStatus === 'disabled' ? new Date() : null;
    company.apiKeyHistory.push({
      action,
      keySuffix: company.apiKey ? company.apiKey.slice(-6) : '',
      changedBy: req.user._id,
      reason: req.body.reason || ''
    });
    await company.save();
    await logAudit(req, {
      action: `api_key_${action}`,
      entityType: 'client_company',
      entityId: company._id,
      entityName: company.name,
      message: `Inbound API key ${action} for "${company.name}".`
    });
    res.redirect('/integrations?success=API key status updated.');
  } catch (error) {
    next(error);
  }
});

router.post('/companies/:id/api-key/rotate', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const company = await ClientCompany.findOne({ _id: req.params.id, organization: orgId });
    if (!company) return res.redirect('/integrations?error=Client Company not found.');
    const previousSuffix = company.apiKey ? company.apiKey.slice(-6) : '';
    company.apiKey = 'cc_' + crypto.randomBytes(24).toString('hex');
    company.apiKeyStatus = 'active';
    company.apiKeyRotatedAt = new Date();
    company.apiKeyDisabledAt = null;
    company.apiKeyHistory.push({
      action: 'rotated',
      keySuffix: previousSuffix,
      changedBy: req.user._id,
      reason: req.body.reason || 'Rotated from integrations screen.'
    });
    await company.save();
    await logAudit(req, {
      action: 'api_key_rotate',
      entityType: 'client_company',
      entityId: company._id,
      entityName: company.name,
      message: `Inbound API key rotated for "${company.name}".`
    });
    res.redirect('/integrations?success=API key rotated and enabled.');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
