const express = require('express');
const crypto = require('crypto');
const { requireApiAuth } = require('./middleware/auth');
const Campaign = require('../models/Campaign');
const ClientCompany = require('../models/ClientCompany');
const SyncLog = require('../models/SyncLog');
const { encrypt } = require('../services/encryption');
const { logAudit } = require('../utils/audit');
const {
  getIntegrationDiagnostics,
  getNextSyncAt,
  retrySyncLog,
  runDueScheduledSyncs,
  syncCompanyIntegrations,
  syncOrganizationIntegrations,
} = require('../services/integrationSync');

const router = express.Router();
router.use(requireApiAuth);
const apiPermission = require('./middleware/permission');
router.use(apiPermission('integrations.view'));
router.use((req, res, next) => ['GET', 'HEAD'].includes(req.method) ? next() : apiPermission('integrations.update')(req, res, next));

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

// GET /api/integrations — Diagnostics & Integration data
router.get('/', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const [campaigns, companies, diagnostics] = await Promise.all([
      Campaign.find({ organization: orgId }).populate('clientCompany').lean(),
      ClientCompany.find({ organization: orgId }).sort({ name: 1 }).lean(),
      getIntegrationDiagnostics(orgId),
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
      company: {
        _id: company._id,
        name: company.name,
        metaAdAccountId: company.metaAdAccountId,
        ga4PropertyId: company.ga4PropertyId,
        hasMetaToken: Boolean(company.metaAccessTokenEncrypted),
        hasGa4Json: Boolean(company.ga4ServiceAccountJsonEncrypted),
        apiKey: company.apiKey,
        apiKeyStatus: company.apiKeyStatus,
        integrationSyncEnabled: company.integrationSyncEnabled,
        integrationSyncIntervalMinutes: company.integrationSyncIntervalMinutes,
        lastIntegrationSyncAt: company.lastIntegrationSyncAt,
      },
      latestLog: latestLogByCompany.get(String(company._id)) || null,
      items: [
        { label: 'Meta ad account ID saved', done: Boolean(company.metaAdAccountId) },
        { label: 'Meta access token encrypted', done: Boolean(company.metaAccessTokenEncrypted) },
        { label: 'GA4 property ID saved', done: Boolean(company.ga4PropertyId) },
        { label: 'GA4 service account JSON encrypted', done: Boolean(company.ga4ServiceAccountJsonEncrypted) },
        { label: 'Inbound API key active', done: company.apiKeyStatus !== 'disabled' && Boolean(company.apiKey) },
        { label: 'Scheduled sync enabled', done: Boolean(company.integrationSyncEnabled) },
      ],
    }));

    res.json({
      ok: true,
      campaigns,
      companies,
      logs: diagnostics.latestLogs,
      failedLogs: diagnostics.failedLogs,
      dueCompanies: diagnostics.dueCompanies,
      setupChecklist,
      hasMetaConnected,
      hasGaConnected,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/integrations/companies/:id/credentials — Save credentials
router.post('/companies/:id/credentials', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const { metaAccessToken, ga4ServiceAccountJson, clearMeta, clearGa4 } = req.body;
    const updateData = {};

    if (clearMeta) {
      updateData.metaAdAccountId = '';
      updateData.metaAccessTokenEncrypted = '';
      updateData.metaTokenExpiresAt = null;
    } else {
      if (req.body.metaAdAccountId !== undefined) {
        const metaAdAccountId = normalizeMetaAdAccountId(req.body.metaAdAccountId);
        if (metaAdAccountId && !/^\d{6,30}$/.test(metaAdAccountId)) {
          return res.status(400).json({ ok: false, error: 'Meta Ad Account ID must be digits only.' });
        }
        updateData.metaAdAccountId = metaAdAccountId;
      }
      if (metaAccessToken && metaAccessToken.trim() !== '') {
        updateData.metaAccessTokenEncrypted = encrypt(metaAccessToken.trim());
        updateData.metaTokenExpiresAt = req.body.metaTokenExpiresAt ? new Date(req.body.metaTokenExpiresAt) : null;
      }
    }

    if (clearGa4) {
      updateData.ga4PropertyId = '';
      updateData.ga4ServiceAccountJsonEncrypted = '';
    } else {
      if (req.body.ga4PropertyId !== undefined) {
        const ga4PropertyId = normalizeGa4PropertyId(req.body.ga4PropertyId);
        if (ga4PropertyId && !/^\d+$/.test(ga4PropertyId)) {
          return res.status(400).json({ ok: false, error: 'GA4 Property ID must be numeric.' });
        }
        updateData.ga4PropertyId = ga4PropertyId;
      }
      if (ga4ServiceAccountJson && ga4ServiceAccountJson.trim() !== '') {
        try {
          updateData.ga4ServiceAccountJsonEncrypted = encrypt(parseGa4ServiceAccountJson(ga4ServiceAccountJson));
        } catch (error) {
          return res.status(400).json({ ok: false, error: error.message });
        }
      }
    }

    const company = await ClientCompany.findOneAndUpdate(
      { _id: req.params.id, organization: orgId },
      updateData,
      { new: true }
    );

    if (!company) {
      return res.status(404).json({ ok: false, error: 'Client Company not found.' });
    }

    await logAudit(req, {
      action: 'integration_credentials_update',
      entityType: 'client_company',
      entityId: company._id,
      entityName: company.name,
      message: `Integration credentials updated for "${company.name}".`,
    });

    res.json({ ok: true, data: company });
  } catch (error) {
    next(error);
  }
});

// POST /api/integrations/companies/:id/meta/clear — Clear Meta credentials
router.post('/companies/:id/meta/clear', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const company = await ClientCompany.findOne({ _id: req.params.id, organization: orgId });
    if (!company) return res.status(404).json({ ok: false, error: 'Client Company not found.' });

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
      message: `Meta credentials cleared for "${company.name}".`,
    });

    res.json({ ok: true, data: company });
  } catch (error) {
    next(error);
  }
});

// POST /api/integrations/companies/:id/ga4/clear — Clear GA4 credentials
router.post('/companies/:id/ga4/clear', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const company = await ClientCompany.findOne({ _id: req.params.id, organization: orgId });
    if (!company) return res.status(404).json({ ok: false, error: 'Client Company not found.' });

    company.ga4PropertyId = '';
    company.ga4ServiceAccountJsonEncrypted = '';
    if (!company.metaAccessTokenEncrypted || !company.metaAdAccountId) {
      company.integrationSyncEnabled = false;
      company.integrationNextSyncAt = null;
    }
    await company.save();

    await logAudit(req, {
      action: 'ga4_credentials_clear',
      entityType: 'client_company',
      entityId: company._id,
      entityName: company.name,
      message: `GA4 credentials cleared for "${company.name}".`,
    });

    res.json({ ok: true, data: company });
  } catch (error) {
    next(error);
  }
});

// POST /api/integrations/companies/:id/api-key/status — Enable or disable Inbound API key
router.post('/companies/:id/api-key/status', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const apiKeyStatus = req.body.apiKeyStatus === 'disabled' ? 'disabled' : 'active';
    const action = apiKeyStatus === 'disabled' ? 'disabled' : 'enabled';
    const company = await ClientCompany.findOne({ _id: req.params.id, organization: orgId });
    if (!company) return res.status(404).json({ ok: false, error: 'Client Company not found.' });

    company.apiKeyStatus = apiKeyStatus;
    company.apiKeyDisabledAt = apiKeyStatus === 'disabled' ? new Date() : null;
    if (!company.apiKeyHistory) company.apiKeyHistory = [];
    company.apiKeyHistory.push({
      action,
      keySuffix: company.apiKey ? company.apiKey.slice(-6) : '',
      changedBy: req.user._id,
      reason: req.body.reason || '',
    });
    await company.save();

    await logAudit(req, {
      action: `api_key_${action}`,
      entityType: 'client_company',
      entityId: company._id,
      entityName: company.name,
      message: `Inbound API key ${action} for "${company.name}".`,
    });

    res.json({ ok: true, data: company });
  } catch (error) {
    next(error);
  }
});

// POST /api/integrations/companies/:id/api-key/rotate — Rotate Inbound API key
router.post('/companies/:id/api-key/rotate', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const company = await ClientCompany.findOne({ _id: req.params.id, organization: orgId });
    if (!company) return res.status(404).json({ ok: false, error: 'Client Company not found.' });

    const previousSuffix = company.apiKey ? company.apiKey.slice(-6) : '';
    company.apiKey = 'cc_' + crypto.randomBytes(24).toString('hex');
    company.apiKeyStatus = 'active';
    company.apiKeyRotatedAt = new Date();
    company.apiKeyDisabledAt = null;
    if (!company.apiKeyHistory) company.apiKeyHistory = [];
    company.apiKeyHistory.push({
      action: 'rotated',
      keySuffix: previousSuffix,
      changedBy: req.user._id,
      reason: req.body.reason || 'Rotated from integrations API.',
    });
    await company.save();

    await logAudit(req, {
      action: 'api_key_rotate',
      entityType: 'client_company',
      entityId: company._id,
      entityName: company.name,
      message: `Inbound API key rotated for "${company.name}".`,
    });

    res.json({ ok: true, data: company });
  } catch (error) {
    next(error);
  }
});

// POST /api/integrations/scheduled/run-due — Trigger due scheduled syncs
router.post('/scheduled/run-due', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const syncedCount = await runDueScheduledSyncs(orgId);

    await logAudit(req, {
      action: 'scheduled_sync_run',
      entityType: 'integration',
      message: `Ran due scheduled syncs for ${syncedCount} companies.`,
    });

    res.json({ ok: true, count: syncedCount });
  } catch (error) {
    next(error);
  }
});

// POST /api/integrations/companies/:id/sync — Sync single company
router.post('/companies/:id/sync', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const company = await ClientCompany.findOne({ _id: req.params.id, organization: orgId });
    if (!company) {
      return res.status(404).json({ ok: false, error: 'Client Company not found.' });
    }

    const result = await syncCompanyIntegrations(company, { trigger: 'manual', user: req.user._id });
    res.json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
});

// POST /api/integrations/companies/:id/sync-settings — Update sync schedule
router.post('/companies/:id/sync-settings', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const interval = Math.max(15, Number(req.body.integrationSyncIntervalMinutes || 360));
    const enabled = req.body.integrationSyncEnabled === true || req.body.integrationSyncEnabled === 'true' || req.body.integrationSyncEnabled === 'on';

    const company = await ClientCompany.findOneAndUpdate(
      { _id: req.params.id, organization: orgId },
      {
        integrationSyncEnabled: enabled,
        integrationSyncIntervalMinutes: interval,
        nextIntegrationSyncAt: enabled ? getNextSyncAt(interval) : null,
      },
      { new: true }
    );

    if (!company) {
      return res.status(404).json({ ok: false, error: 'Client Company not found.' });
    }

    res.json({ ok: true, data: company });
  } catch (error) {
    next(error);
  }
});

// POST /api/integrations/sync — Trigger sync across all companies
router.post('/sync', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const summary = await syncOrganizationIntegrations(orgId, { trigger: 'manual', user: req.user._id });

    await logAudit(req, {
      action: 'integration_sync',
      entityType: 'integration',
      message: `Platform synchronization completed: Meta (${summary.metaSuccess}), GA4 (${summary.ga4Success}), failed (${summary.failures}).`,
      metadata: summary,
    });

    res.json({ ok: true, summary });
  } catch (error) {
    next(error);
  }
});

// POST /api/integrations/logs/:id/retry — Retry failed sync log
router.post('/logs/:id/retry', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const log = await SyncLog.findOne({ _id: req.params.id, organization: orgId });
    if (!log) {
      return res.status(404).json({ ok: false, error: 'Sync log not found.' });
    }

    const result = await retrySyncLog(log, req.user._id);
    res.json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
