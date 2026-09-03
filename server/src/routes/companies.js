const express = require('express');
const crypto = require('crypto');
const Attachment = require('../models/Attachment');
const ClientCompany = require('../models/ClientCompany');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Campaign = require('../models/Campaign');
const CrmStage = require('../models/CrmStage');
const CrmLabel = require('../models/CrmLabel');
const Activity = require('../models/Activity');
const { requireAdmin, requirePermission } = require('../middleware/auth');
const { calculateCompanyMetrics } = require('../utils/reporting');
const { logAudit } = require('../utils/audit');
const { ensureCrmDefaults } = require('../services/defaults');

const router = express.Router();
const companyProfileFields = body => ({
  businessType: ['service', 'consumer', 'commerce', 'other'].includes(body.businessType) ? body.businessType : 'service',
  category: String(body.category || '').trim(), contactPerson: String(body.contactPerson || '').trim(), phone: String(body.phone || '').trim(),
  email: String(body.email || '').trim().toLowerCase(), instagram: String(body.instagram || '').trim(), location: String(body.location || '').trim(),
  status: ['onboarding', 'active', 'inactive'].includes(body.status) ? body.status : 'onboarding',
  monthlyPackage: Math.max(0, Number(body.monthlyPackage) || 0), startDate: body.startDate || null,
  monthlyVideoTarget: Math.max(0, Number(body.monthlyVideoTarget) || 0), monthlyDesignTarget: Math.max(0, Number(body.monthlyDesignTarget) || 0),
  monthlyContentTarget: Math.max(0, Number(body.monthlyContentTarget) || 0), monthlyLeadTarget: Math.max(0, Number(body.monthlyLeadTarget) || 0),
  sopDocumentLink: String(body.sopDocumentLink || '').trim(), googleDriveFolderLink: String(body.googleDriveFolderLink || '').trim(), notes: String(body.notes || '').trim()
});

router.post('/:id/main', requireAdmin, async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const company = await ClientCompany.findOne({ _id: req.params.id, organization, status: { $ne: 'inactive' } });
    if (!company) return res.status(404).render('errors/404', { title: 'CRM not found' });
    await ClientCompany.updateMany({ organization, isMain: true }, { $set: { isMain: false } });
    company.isMain = true;
    await company.save();
    req.session.activeCompanyId = String(company._id);
    res.redirect('/portfolio');
  } catch (error) {
    next(error);
  }
});

function parseAttachmentPayload(body) {
  const rawData = String(body.fileData || '');
  const match = rawData.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return { ok: false, message: 'Please select a valid file before uploading.' };

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) return { ok: false, message: 'Selected file is empty.' };
  if (buffer.length > 3 * 1024 * 1024) return { ok: false, message: 'Attachment must be 3 MB or smaller.' };

  const originalName = String(body.originalName || 'attachment').replace(/[\\/:*?"<>|]+/g, '-').trim();
  return {
    ok: true,
    buffer,
    mimeType: match[1] || 'application/octet-stream',
    originalName: originalName || 'attachment',
    category: ['proposal', 'contract', 'invoice', 'brief', 'screenshot', 'other'].includes(body.category) ? body.category : 'other',
    notes: String(body.notes || '').trim()
  };
}

function canAccessCompany(user, company) {
  if (user && ['admin', 'manager'].includes(user.role)) return true;
  if (user) {
    return company.assignedUsers.some(u => String(u._id || u) === String(user._id));
  }
  return false;
}

router.post('/switch', async (req, res, next) => {
  try {
    const company = await ClientCompany.findOne({ _id: req.body.company, organization: req.user.organization._id, status: { $ne: 'inactive' } });
    if (!company || !canAccessCompany(req.user, company)) return res.status(403).render('errors/403', { title: 'CRM access denied' });
    if (req.session.activeCompanyId && String(req.session.activeCompanyId) !== String(company._id)) req.session.previousCompanyId = req.session.activeCompanyId;
    req.session.activeCompanyId = String(company._id);
    res.redirect(String(req.body.returnTo || '/').startsWith('/') ? req.body.returnTo : '/');
  } catch (error) {
    next(error);
  }
});

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeMetaPixelId(value) {
  return String(value || '').trim().replace(/\D/g, '');
}

function normalizeGa4MeasurementId(value) {
  return String(value || '').trim().toUpperCase();
}

function validateTrackingIds(metaPixelId, ga4MeasurementId) {
  if (metaPixelId && !/^\d{8,20}$/.test(metaPixelId)) return 'Meta Pixel ID must be 8-20 digits.';
  if (ga4MeasurementId && !/^G-[A-Z0-9]{4,}$/.test(ga4MeasurementId)) return 'GA4 Measurement ID must look like G-XXXXXXXXXX.';
  return '';
}

async function getValidUserIds(organization, ids, roles = ['admin', 'manager', 'agent']) {
  const selectedIds = (Array.isArray(ids) ? ids : ids ? [ids] : []).map(id => String(id || '').trim()).filter(Boolean);
  if (!selectedIds.length) return [];
  return User.find({ organization, _id: { $in: selectedIds }, isActive: true, role: { $in: roles } }).distinct('_id');
}

router.get('/', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const filter = { organization: orgId };
    if (req.user.role === 'agent') {
      filter.assignedUsers = req.user._id;
    }
    const [companyDocs, users] = await Promise.all([
      ClientCompany.find(filter).populate('assignedUsers accountOwner').sort({ name: 1 }),
      User.find({ organization: orgId, isActive: { $ne: false } }).sort({ name: 1 })
    ]);

    const companyIds = companyDocs.map(company => company._id);
    const [campaignCounts, leadCounts] = await Promise.all([
      Campaign.aggregate([
        { $match: { organization: orgId, clientCompany: { $in: companyIds }, status: 'active' } },
        { $group: { _id: '$clientCompany', count: { $sum: 1 } } }
      ]),
      Customer.aggregate([
        { $match: { organization: orgId, clientCompany: { $in: companyIds } } },
        { $group: { _id: '$clientCompany', count: { $sum: 1 } } }
      ])
    ]);

    const campaignCountByCompany = new Map(campaignCounts.map(item => [String(item._id), item.count]));
    const leadCountByCompany = new Map(leadCounts.map(item => [String(item._id), item.count]));
    const companies = companyDocs.map(company => ({
      ...company.toObject(),
      campaignsCount: campaignCountByCompany.get(String(company._id)) || 0,
      leadsCount: leadCountByCompany.get(String(company._id)) || 0
    }));

    res.render('companies/index', {
      title: 'Client Companies',
      companies,
      users,
      onboarding: req.query.onboarding === 'true',
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermission('businesses.create'), async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const name = String(req.body.name || '').trim();
    const website = String(req.body.website || '').trim();
    const metaPixelId = normalizeMetaPixelId(req.body.metaPixelId);
    const ga4MeasurementId = normalizeGa4MeasurementId(req.body.ga4MeasurementId);
    const accountOwner = req.body.accountOwner || null;
    const healthStatus = ['healthy', 'watch', 'at-risk'].includes(req.body.healthStatus) ? req.body.healthStatus : 'healthy';
    const assignedUsers = Array.isArray(req.body.assignedUsers) ? req.body.assignedUsers : req.body.assignedUsers ? [req.body.assignedUsers] : [];

    if (!name) {
      return res.status(400).redirect('/companies?error=Company name is required.');
    }
    const trackingError = validateTrackingIds(metaPixelId, ga4MeasurementId);
    if (trackingError) return res.redirect(`/companies?error=${encodeURIComponent(trackingError)}`);
    const duplicate = await ClientCompany.findOne({ organization: orgId, name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
    if (duplicate) {
      return res.redirect('/companies?error=A client company with this name already exists.');
    }
    const [validAssignedUsers, validOwners] = await Promise.all([
      getValidUserIds(orgId, assignedUsers),
      getValidUserIds(orgId, accountOwner ? [accountOwner] : [])
    ]);

    const company = await ClientCompany.create({
      organization: orgId,
      name,
      website,
      metaPixelId,
      ga4MeasurementId,
      accountOwner: validOwners[0] || null,
      healthStatus,
      ...companyProfileFields(req.body),
      assignedUsers: validAssignedUsers
    });
    await logAudit(req, {
      action: 'create',
      entityType: 'client_company',
      entityId: company._id,
      entityName: company.name,
      message: `Client company "${company.name}" created.`
    });
    req.session.activeCompanyId = String(company._id);
    await ensureCrmDefaults(orgId, company._id, { moduleSetup: req.body.moduleSetup });
    res.redirect('/settings/setup');
  } catch (error) {
    next(error);
  }
});

// GET /companies/:id - Client Company Details Portal
router.get('/:id', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const company = await ClientCompany.findOne({ _id: req.params.id, organization: orgId }).populate('assignedUsers accountOwner');
    if (!company) {
      return res.status(404).render('errors/404', { title: 'Company not found' });
    }

    if (!canAccessCompany(req.user, company)) {
      return res.status(403).redirect('/companies?error=You do not have access to this company.');
    }

    const [users, customers, allStages, labels, campaigns, attachments] = await Promise.all([
      User.find({ organization: orgId, isActive: { $ne: false } }).sort({ name: 1 }),
      Customer.find({ clientCompany: company._id, organization: orgId }).populate('stage labels assignedTo campaign').sort({ updatedAt: -1 }),
      CrmStage.find({ organization: orgId, clientCompany: company._id }).sort({ order: 1 }),
      CrmLabel.find({ organization: orgId, clientCompany: company._id, isActive: true }).sort({ name: 1 }),
      Campaign.find({ organization: orgId, clientCompany: company._id, status: 'active' }).sort({ name: 1 }),
      Attachment.find({ organization: orgId, clientCompany: company._id, customer: null }).populate('uploadedBy').sort({ createdAt: -1 })
    ]);
    const customerStageIds = new Set(customers.filter(customer => customer.stage).map(customer => String(customer.stage._id)));
    const stages = allStages.filter(stage => stage.isActive || customerStageIds.has(String(stage._id)));

    const customerIds = customers.map(c => c._id);
    const activities = await Activity.find({ customer: { $in: customerIds }, organization: orgId })
      .populate('customer user')
      .sort({ createdAt: -1 })
      .limit(30);

    const metrics = calculateCompanyMetrics(company, customers, campaigns, stages);

    res.render('companies/show', {
      title: `${company.name} Details`,
      company,
      users,
      customers,
      stages,
      labels,
      campaigns,
      activities,
      attachments,
      metrics,
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requirePermission('businesses.update'), async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const name = String(req.body.name || '').trim();
    const website = String(req.body.website || '').trim();
    const status = ['onboarding', 'active', 'inactive'].includes(req.body.status) ? req.body.status : 'active';
    const leadRoutingRule = ['manual', 'round-robin'].includes(req.body.leadRoutingRule) ? req.body.leadRoutingRule : 'manual';
    const outboundWebhookUrl = String(req.body.outboundWebhookUrl || '').trim();
    const metaPixelId = normalizeMetaPixelId(req.body.metaPixelId);
    const ga4MeasurementId = normalizeGa4MeasurementId(req.body.ga4MeasurementId);
    const accountOwner = req.body.accountOwner || null;
    const healthStatus = ['healthy', 'watch', 'at-risk'].includes(req.body.healthStatus) ? req.body.healthStatus : 'healthy';

    if (!name) {
      return res.redirect(`/companies/${req.params.id}?error=Company name is required.`);
    }
    const trackingError = validateTrackingIds(metaPixelId, ga4MeasurementId);
    if (trackingError) return res.redirect(`/companies/${req.params.id}?error=${encodeURIComponent(trackingError)}`);
    const company = await ClientCompany.findOne({ _id: req.params.id, organization: orgId });
    if (!company) return res.status(404).render('errors/404', { title: 'Company not found' });
    const duplicate = await ClientCompany.findOne({
      organization: orgId,
      _id: { $ne: req.params.id },
      name: new RegExp(`^${escapeRegex(name)}$`, 'i')
    });
    if (duplicate) {
      return res.redirect(`/companies/${req.params.id}?error=A client company with this name already exists.`);
    }
    const validOwners = await getValidUserIds(orgId, accountOwner ? [accountOwner] : []);

    await ClientCompany.updateOne(
      { _id: req.params.id, organization: orgId },
      {
        name,
        website,
        status,
        leadRoutingRule,
        outboundWebhookUrl,
        metaPixelId,
        ga4MeasurementId,
        accountOwner: validOwners[0] || null,
        healthStatus
        , ...companyProfileFields(req.body), status
      }
    );
    await logAudit(req, {
      action: 'update',
      entityType: 'client_company',
      entityId: req.params.id,
      entityName: name,
      message: `Client company "${name}" settings updated.`
    });

    res.redirect(`/companies/${req.params.id}?success=Company settings updated.`);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/attachments', requirePermission('businesses.update'), async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const company = await ClientCompany.findOne({ _id: req.params.id, organization: orgId }).populate('assignedUsers');
    if (!company) return res.status(404).render('errors/404', { title: 'Company not found' });
    if (!canAccessCompany(req.user, company)) {
      return res.status(403).redirect('/companies?error=You do not have access to this company.');
    }

    const payload = parseAttachmentPayload(req.body);
    if (!payload.ok) {
      return res.redirect(`/companies/${company._id}?error=${encodeURIComponent(payload.message)}`);
    }

    const attachment = await Attachment.create({
      organization: orgId,
      clientCompany: company._id,
      uploadedBy: req.user._id,
      category: payload.category,
      originalName: payload.originalName,
      mimeType: payload.mimeType,
      size: payload.buffer.length,
      notes: payload.notes,
      data: payload.buffer
    });

    await logAudit(req, {
      action: 'attachment_upload',
      entityType: 'client_company',
      entityId: company._id,
      entityName: company.name,
      message: `Attachment "${attachment.originalName}" uploaded to client company "${company.name}".`,
      metadata: { attachmentId: attachment._id, category: attachment.category, size: attachment.size }
    });

    res.redirect(`/companies/${company._id}?success=Attachment uploaded.`);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/attachments/:attachmentId/download', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const company = await ClientCompany.findOne({ _id: req.params.id, organization: orgId }).populate('assignedUsers');
    if (!company) return res.status(404).render('errors/404', { title: 'Company not found' });
    if (!canAccessCompany(req.user, company)) {
      return res.status(403).redirect('/companies?error=You do not have access to this company.');
    }

    const attachment = await Attachment.findOne({ _id: req.params.attachmentId, organization: orgId, clientCompany: company._id, customer: null });
    if (!attachment) return res.status(404).render('errors/404', { title: 'Attachment not found' });

    res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', attachment.size || attachment.data.length);
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalName.replace(/"/g, '')}"`);
    res.send(attachment.data);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/attachments/:attachmentId/delete', requirePermission('businesses.update'), async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const company = await ClientCompany.findOne({ _id: req.params.id, organization: orgId }).populate('assignedUsers');
    if (!company) return res.status(404).render('errors/404', { title: 'Company not found' });
    if (!canAccessCompany(req.user, company)) {
      return res.status(403).redirect('/companies?error=You do not have access to this company.');
    }

    const attachment = await Attachment.findOne({ _id: req.params.attachmentId, organization: orgId, clientCompany: company._id, customer: null });
    if (!attachment) return res.status(404).render('errors/404', { title: 'Attachment not found' });
    const canDelete = ['admin', 'manager'].includes(req.user.role) || String(attachment.uploadedBy || '') === String(req.user._id);
    if (!canDelete) return res.status(403).render('errors/403', { title: 'Access denied' });

    await Attachment.deleteOne({ _id: attachment._id, organization: orgId });
    await logAudit(req, {
      action: 'attachment_delete',
      entityType: 'client_company',
      entityId: company._id,
      entityName: company.name,
      message: `Attachment "${attachment.originalName}" deleted from client company "${company.name}".`,
      metadata: { attachmentId: attachment._id }
    });

    res.redirect(`/companies/${company._id}?success=Attachment deleted.`);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/api-key/regenerate', requirePermission('integrations.update'), async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const company = await ClientCompany.findOne({ _id: req.params.id, organization: orgId });
    if (!company) return res.redirect(`/companies/${req.params.id}?error=Company not found.`);
    const previousSuffix = company.apiKey ? company.apiKey.slice(-6) : '';
    company.apiKey = 'cc_' + crypto.randomBytes(24).toString('hex');
    company.apiKeyStatus = 'active';
    company.apiKeyRotatedAt = new Date();
    company.apiKeyDisabledAt = null;
    company.apiKeyHistory.push({
      action: 'rotated',
      keySuffix: previousSuffix,
      changedBy: req.user._id,
      reason: 'Regenerated from company settings.'
    });
    await company.save();
    await logAudit(req, {
      action: 'api_key_regenerate',
      entityType: 'client_company',
      entityId: req.params.id,
      message: 'Inbound API key regenerated.'
    });
    res.redirect(`/companies/${req.params.id}?success=Inbound API key regenerated.`);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/collaborators', requirePermission('businesses.update'), async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const assignedUsers = Array.isArray(req.body.assignedUsers) ? req.body.assignedUsers : req.body.assignedUsers ? [req.body.assignedUsers] : [];
    const validAssignedUsers = await getValidUserIds(orgId, assignedUsers);
    
    await ClientCompany.updateOne(
      { _id: req.params.id, organization: orgId },
      { assignedUsers: validAssignedUsers }
    );
    await logAudit(req, {
      action: 'collaborators_update',
      entityType: 'client_company',
      entityId: req.params.id,
      message: 'Company collaborators updated.',
      metadata: { assignedUsers: validAssignedUsers }
    });
    
    res.redirect(req.headers.referer || `/companies/${req.params.id}`);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/collaborators/add', requirePermission('businesses.update'), async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const { userId } = req.body;
    const validAssignedUsers = await getValidUserIds(orgId, userId ? [userId] : []);
    if (validAssignedUsers.length) {
      await ClientCompany.updateOne(
        { _id: req.params.id, organization: orgId },
        { $addToSet: { assignedUsers: validAssignedUsers[0] } }
      );
      await logAudit(req, {
        action: 'collaborator_add',
        entityType: 'client_company',
        entityId: req.params.id,
        message: 'Collaborator added to client company.',
        metadata: { userId: validAssignedUsers[0] }
      });
    }
    res.redirect(req.headers.referer || `/companies/${req.params.id}`);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/collaborators/remove', requirePermission('businesses.update'), async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const { userId } = req.body;
    if (userId) {
      await ClientCompany.updateOne(
        { _id: req.params.id, organization: orgId },
        { $pull: { assignedUsers: userId } }
      );
      await logAudit(req, {
        action: 'collaborator_remove',
        entityType: 'client_company',
        entityId: req.params.id,
        message: 'Collaborator removed from client company.',
        metadata: { userId }
      });
    }
    res.redirect(req.headers.referer || `/companies/${req.params.id}`);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/tracking', requirePermission('integrations.update'), async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const metaPixelId = normalizeMetaPixelId(req.body.metaPixelId);
    const ga4MeasurementId = normalizeGa4MeasurementId(req.body.ga4MeasurementId);
    const trackingError = validateTrackingIds(metaPixelId, ga4MeasurementId);
    if (trackingError) return res.redirect(`/companies/${req.params.id}?error=${encodeURIComponent(trackingError)}`);

    await ClientCompany.updateOne(
      { _id: req.params.id, organization: orgId },
      { metaPixelId, ga4MeasurementId }
    );
    await logAudit(req, {
      action: 'tracking_update',
      entityType: 'client_company',
      entityId: req.params.id,
      message: 'Tracking codes updated.'
    });
    res.redirect(`/companies/${req.params.id}?success=Tracking codes updated.`);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
