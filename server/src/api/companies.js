const express = require('express');
const crypto = require('crypto');
const { requireApiAuth, generateToken } = require('./middleware/auth');
const { hasPermission, isRestrictedUser } = require('../config/roles');
const ClientCompany = require('../models/ClientCompany');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Campaign = require('../models/Campaign');
const CrmStage = require('../models/CrmStage');
const CrmLabel = require('../models/CrmLabel');
const Activity = require('../models/Activity');
const Attachment = require('../models/Attachment');
const { calculateCompanyMetrics } = require('../utils/reporting');
const { logAudit } = require('../utils/audit');
const { ensureCrmDefaults } = require('../services/defaults');
const { driveStatus, parseAttachmentPayload, readAttachment, storeAttachment } = require('../services/fileStorage');

const router = express.Router();
router.use(requireApiAuth);
const apiPermission = require('./middleware/permission');
router.use(apiPermission('businesses.view'));

function canAccessCompany(user, company) {
  if (!user) return false;
  if (!isRestrictedUser(user)) return true;
  if (company && company.assignedUsers) {
    return company.assignedUsers.some(u => String(u._id || u) === String(user._id));
  }
  return false;
}

const companyProfileFields = body => ({
  businessType: ['service', 'consumer', 'commerce', 'other'].includes(body.businessType) ? body.businessType : 'service',
  category: String(body.category || '').trim(),
  contactPerson: String(body.contactPerson || '').trim(),
  phone: String(body.phone || '').trim(),
  email: String(body.email || '').trim().toLowerCase(),
  instagram: String(body.instagram || '').trim(),
  location: String(body.location || '').trim(),
  status: ['onboarding', 'active', 'inactive'].includes(body.status) ? body.status : 'active',
  monthlyPackage: Math.max(0, Number(body.monthlyPackage) || 0),
  startDate: body.startDate || null,
  monthlyVideoTarget: Math.max(0, Number(body.monthlyVideoTarget) || 0),
  monthlyDesignTarget: Math.max(0, Number(body.monthlyDesignTarget) || 0),
  monthlyContentTarget: Math.max(0, Number(body.monthlyContentTarget) || 0),
  monthlyLeadTarget: Math.max(0, Number(body.monthlyLeadTarget) || 0),
  sopDocumentLink: String(body.sopDocumentLink || '').trim(),
  googleDriveFolderLink: String(body.googleDriveFolderLink || '').trim(),
  notes: String(body.notes || '').trim(),
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

// GET /api/companies — List companies with lead and campaign counts
router.get('/', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const filter = { organization: orgId };
    if (isRestrictedUser(req.user)) {
      filter.assignedUsers = req.user._id;
    }

    const [companyDocs, users] = await Promise.all([
      ClientCompany.find(filter).populate('assignedUsers accountOwner').sort({ name: 1 }),
      User.find({ organization: orgId, isActive: { $ne: false }, role: { $in: ['admin', 'manager', 'agent'] } }).select('_id name email role').sort({ name: 1 }),
    ]);

    const companyIds = companyDocs.map(c => c._id);
    const [campaignCounts, leadCounts] = await Promise.all([
      Campaign.aggregate([
        { $match: { organization: orgId, clientCompany: { $in: companyIds }, status: 'active' } },
        { $group: { _id: '$clientCompany', count: { $sum: 1 } } },
      ]),
      Customer.aggregate([
        { $match: { organization: orgId, clientCompany: { $in: companyIds } } },
        { $group: { _id: '$clientCompany', count: { $sum: 1 } } },
      ]),
    ]);

    const campaignCountMap = new Map(campaignCounts.map(item => [String(item._id), item.count]));
    const leadCountMap = new Map(leadCounts.map(item => [String(item._id), item.count]));

    const companies = companyDocs.map(company => ({
      ...company.toObject(),
      campaignCount: campaignCountMap.get(String(company._id)) || 0,
      leadCount: leadCountMap.get(String(company._id)) || 0,
    }));

    res.json({ ok: true, data: companies, users });
  } catch (error) {
    next(error);
  }
});

// GET /api/companies/:id — Single company with customers, metrics, activities
router.get('/:id', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const company = await ClientCompany.findOne({ _id: req.params.id, organization: orgId }).populate('assignedUsers accountOwner');
    if (!company) {
      return res.status(404).json({ ok: false, error: 'Company not found' });
    }
    if (!canAccessCompany(req.user, company)) {
      return res.status(403).json({ ok: false, error: 'Access denied to this company.' });
    }

    const [users, customers, allStages, labels, campaigns, attachments] = await Promise.all([
      User.find({ organization: orgId, isActive: { $ne: false } }).sort({ name: 1 }),
      Customer.find({
        clientCompany: company._id,
        organization: orgId,
        ...(isRestrictedUser(req.user) ? { assignedTo: req.user._id } : {}),
      }).populate('stage labels assignedTo campaign').sort({ updatedAt: -1 }),
      CrmStage.find({ organization: orgId, clientCompany: company._id }).sort({ order: 1 }),
      CrmLabel.find({ organization: orgId, clientCompany: company._id, isActive: true }).sort({ name: 1 }),
      Campaign.find({ organization: orgId, clientCompany: company._id, status: 'active' }).sort({ name: 1 }),
      Attachment.find({ organization: orgId, clientCompany: company._id, customer: null }).select('-data').populate('uploadedBy').sort({ createdAt: -1 }),
    ]);

    const populatedStages = new Set(customers.filter(c => c.stage).map(c => String(c.stage._id)));
    const stages = allStages.filter(stage => stage.isActive || populatedStages.has(String(stage._id)));
    const customerIds = customers.map(c => c._id);
    const activities = await Activity.find({ customer: { $in: customerIds }, organization: orgId })
      .populate('customer user')
      .sort({ createdAt: -1 })
      .limit(30);

    const metrics = calculateCompanyMetrics(company, customers, campaigns, stages);

    res.json({
      ok: true,
      data: company,
      customers,
      stages,
      labels,
      campaigns,
      activities,
      attachments,
      fileStorage: driveStatus(company),
      metrics,
      users,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/companies — Create company
router.post('/', async (req, res, next) => {
  try {
    if (!hasPermission(req.user, 'businesses.create')) {
      return res.status(403).json({ ok: false, error: 'Permission denied to create company.' });
    }

    const orgId = req.user.organization._id;
    const name = String(req.body.name || '').trim();
    const website = String(req.body.website || '').trim();
    const metaPixelId = normalizeMetaPixelId(req.body.metaPixelId);
    const ga4MeasurementId = normalizeGa4MeasurementId(req.body.ga4MeasurementId);
    const accountOwner = req.body.accountOwner || null;
    const healthStatus = ['healthy', 'watch', 'at-risk'].includes(req.body.healthStatus) ? req.body.healthStatus : 'healthy';
    const assignedUsers = Array.isArray(req.body.assignedUsers) ? req.body.assignedUsers : req.body.assignedUsers ? [req.body.assignedUsers] : [];

    if (!name) {
      return res.status(400).json({ ok: false, error: 'Company name is required.' });
    }

    const trackingError = validateTrackingIds(metaPixelId, ga4MeasurementId);
    if (trackingError) return res.status(400).json({ ok: false, error: trackingError });

    const duplicate = await ClientCompany.findOne({ organization: orgId, name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
    if (duplicate) {
      return res.status(400).json({ ok: false, error: 'A company with this name already exists.' });
    }

    const [validAssignedUsers, validOwners] = await Promise.all([
      getValidUserIds(orgId, assignedUsers),
      getValidUserIds(orgId, accountOwner ? [accountOwner] : []),
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
      assignedUsers: validAssignedUsers.length ? validAssignedUsers : [req.user._id],
    });

    await logAudit(req, {
      action: 'create',
      entityType: 'client_company',
      entityId: company._id,
      entityName: company.name,
      message: `Client company "${company.name}" created.`,
    });

    await ensureCrmDefaults(orgId, company._id, { moduleSetup: req.body.moduleSetup });

    res.json({ ok: true, data: company });
  } catch (error) {
    next(error);
  }
});

// PUT /api/companies/:id — Update company profile
router.put('/:id', async (req, res, next) => {
  try {
    if (!hasPermission(req.user, 'businesses.update')) {
      return res.status(403).json({ ok: false, error: 'Permission denied to update company.' });
    }

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
      return res.status(400).json({ ok: false, error: 'Company name is required.' });
    }

    const trackingError = validateTrackingIds(metaPixelId, ga4MeasurementId);
    if (trackingError) return res.status(400).json({ ok: false, error: trackingError });

    const company = await ClientCompany.findOne({ _id: req.params.id, organization: orgId });
    if (!company) return res.status(404).json({ ok: false, error: 'Company not found' });

    const duplicate = await ClientCompany.findOne({
      organization: orgId,
      _id: { $ne: req.params.id },
      name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
    });
    if (duplicate) {
      return res.status(400).json({ ok: false, error: 'A company with this name already exists.' });
    }

    const validOwners = await getValidUserIds(orgId, accountOwner ? [accountOwner] : []);

    const updated = await ClientCompany.findByIdAndUpdate(
      req.params.id,
      {
        name,
        website,
        status,
        leadRoutingRule,
        outboundWebhookUrl,
        metaPixelId,
        ga4MeasurementId,
        accountOwner: validOwners[0] || null,
        healthStatus,
        ...companyProfileFields(req.body),
      },
      { new: true }
    );

    await logAudit(req, {
      action: 'update',
      entityType: 'client_company',
      entityId: req.params.id,
      entityName: name,
      message: `Client company "${name}" updated.`,
    });

    res.json({ ok: true, data: updated });
  } catch (error) {
    next(error);
  }
});

// Archive/restore only changes status, leaving profile fields and integrations intact.
router.post('/:id/status', async (req, res, next) => {
  try {
    if (!hasPermission(req.user, 'businesses.update')) {
      return res.status(403).json({ ok: false, error: 'Permission denied.' });
    }
    if (!/^[a-f\d]{24}$/i.test(req.params.id) || !['active', 'inactive'].includes(req.body.status)) {
      return res.status(400).json({ ok: false, error: 'Invalid CRM or status.' });
    }
    const company = await ClientCompany.findOne({ _id: req.params.id, organization: req.user.organization._id });
    if (!company) return res.status(404).json({ ok: false, error: 'CRM not found.' });
    if (!canAccessCompany(req.user, company)) return res.status(403).json({ ok: false, error: 'Access denied to this CRM.' });
    if (req.body.status === 'inactive' && (company.isMain || String(company._id) === String(req.activeCompanyId))) {
      return res.status(400).json({ ok: false, error: company.isMain ? 'The main CRM cannot be archived.' : 'Open another CRM before archiving this one.' });
    }
    company.status = req.body.status;
    await company.save();
    await logAudit(req, {
      action: 'update', entityType: 'client_company', entityId: company._id, entityName: company.name,
      message: `CRM "${company.name}" ${company.status === 'inactive' ? 'archived' : 'restored'}.`,
    });
    res.json({ ok: true, data: { _id: company._id, status: company.status, updatedAt: company.updatedAt } });
  } catch (error) { next(error); }
});

// POST /api/companies/switch — Switch active workspace
router.post('/switch', async (req, res, next) => {
  try {
    const companyId = req.body.companyId || req.body.company;
    const company = await ClientCompany.findOne({
      _id: companyId,
      organization: req.user.organization._id,
      status: { $ne: 'inactive' },
    });

    if (!company || !canAccessCompany(req.user, company)) {
      return res.status(403).json({ ok: false, error: 'Company access denied.' });
    }

    const token = generateToken(req.user, String(company._id));
    res.json({
      ok: true,
      token,
      activeCompany: { _id: company._id, name: company.name, isMain: company.isMain },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/companies/:id/main — Set as main workspace
router.post('/:id/main', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Only admin can set main workspace.' });
    }
    const orgId = req.user.organization._id;
    const company = await ClientCompany.findOne({ _id: req.params.id, organization: orgId, status: { $ne: 'inactive' } });
    if (!company) return res.status(404).json({ ok: false, error: 'Company not found.' });

    await ClientCompany.updateMany({ organization: orgId, isMain: true }, { $set: { isMain: false } });
    company.isMain = true;
    await company.save();

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/companies/:id/attachments — Upload company attachment
router.post('/:id/attachments', async (req, res, next) => {
  try {
    if (!hasPermission(req.user, 'businesses.update')) {
      return res.status(403).json({ ok: false, error: 'Permission denied.' });
    }
    const orgId = req.user.organization._id;
    const company = await ClientCompany.findOne({ _id: req.params.id, organization: orgId }).populate('assignedUsers');
    if (!company) return res.status(404).json({ ok: false, error: 'Company not found.' });
    if (!canAccessCompany(req.user, company)) {
      return res.status(403).json({ ok: false, error: 'Access denied to this company.' });
    }

    const payload = parseAttachmentPayload(req.body);
    if (!payload.ok) {
      return res.status(400).json({ ok: false, error: payload.message });
    }

    const storage = await storeAttachment(company, payload);
    const attachment = await Attachment.create({
      organization: orgId,
      clientCompany: company._id,
      uploadedBy: req.user._id,
      category: payload.category,
      originalName: payload.originalName,
      mimeType: payload.mimeType,
      size: payload.buffer.length,
      notes: payload.notes,
      ...storage
    });

    await logAudit(req, {
      action: 'attachment_upload',
      entityType: 'client_company',
      entityId: company._id,
      entityName: company.name,
      message: `Attachment "${attachment.originalName}" uploaded to company "${company.name}".`,
      metadata: { attachmentId: attachment._id, category: attachment.category, size: attachment.size }
    });

    res.status(201).json({
      ok: true,
      attachment: {
        _id: attachment._id,
        originalName: attachment.originalName,
        category: attachment.category,
        size: attachment.size,
        notes: attachment.notes,
        storageProvider: attachment.storageProvider,
        externalUrl: attachment.externalUrl,
        createdAt: attachment.createdAt,
        uploadedBy: { _id: req.user._id, name: req.user.name },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/companies/:id/attachments/:attachmentId/download — Download attachment
router.get('/:id/attachments/:attachmentId/download', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const company = await ClientCompany.findOne({ _id: req.params.id, organization: orgId }).populate('assignedUsers');
    if (!company) return res.status(404).json({ ok: false, error: 'Company not found.' });
    if (!canAccessCompany(req.user, company)) {
      return res.status(403).json({ ok: false, error: 'Access denied to this company.' });
    }

    const attachment = await Attachment.findOne({ _id: req.params.attachmentId, organization: orgId, clientCompany: company._id, customer: null });
    if (!attachment) return res.status(404).json({ ok: false, error: 'Attachment not found.' });

    const fileData = await readAttachment(company, attachment);
    res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', fileData.length);
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalName.replace(/"/g, '')}"`);
    res.send(fileData);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/companies/:id/attachments/:attachmentId — Delete attachment
router.delete('/:id/attachments/:attachmentId', async (req, res, next) => {
  try {
    if (!hasPermission(req.user, 'businesses.update')) {
      return res.status(403).json({ ok: false, error: 'Permission denied.' });
    }
    const orgId = req.user.organization._id;
    const company = await ClientCompany.findOne({ _id: req.params.id, organization: orgId }).populate('assignedUsers');
    if (!company) return res.status(404).json({ ok: false, error: 'Company not found.' });
    if (!canAccessCompany(req.user, company)) {
      return res.status(403).json({ ok: false, error: 'Access denied to this company.' });
    }

    const attachment = await Attachment.findOne({ _id: req.params.attachmentId, organization: orgId, clientCompany: company._id, customer: null });
    if (!attachment) return res.status(404).json({ ok: false, error: 'Attachment not found.' });
    const canDelete = ['admin', 'manager'].includes(req.user.role) || String(attachment.uploadedBy || '') === String(req.user._id);
    if (!canDelete) return res.status(403).json({ ok: false, error: 'Access denied.' });

    await Attachment.deleteOne({ _id: attachment._id, organization: orgId });
    await logAudit(req, {
      action: 'attachment_delete',
      entityType: 'client_company',
      entityId: company._id,
      entityName: company.name,
      message: `Attachment "${attachment.originalName}" deleted from company "${company.name}".`,
      metadata: { attachmentId: attachment._id }
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/companies/:id/collaborators — Update collaborators
router.post('/:id/collaborators', async (req, res, next) => {
  try {
    if (!hasPermission(req.user, 'businesses.update')) {
      return res.status(403).json({ ok: false, error: 'Permission denied.' });
    }
    const orgId = req.user.organization._id;
    const userIds = req.body.userIds || req.body.assignedUsers || [];
    const company = await ClientCompany.findOne({ _id: req.params.id, organization: orgId });
    if (!company) return res.status(404).json({ ok: false, error: 'CRM not found.' });
    if (!canAccessCompany(req.user, company)) return res.status(403).json({ ok: false, error: 'Access denied to this CRM.' });
    const validAssignedUsers = await getValidUserIds(orgId, userIds);
    if (!['admin', 'manager'].includes(req.user.role) && !validAssignedUsers.some(id => String(id) === String(req.user._id))) {
      return res.status(400).json({ ok: false, error: 'Keep yourself assigned to this CRM.' });
    }

    await ClientCompany.updateOne(
      { _id: req.params.id, organization: orgId },
      { assignedUsers: validAssignedUsers }
    );

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/companies/:id/collaborators/add — Add single collaborator
router.post('/:id/collaborators/add', async (req, res, next) => {
  try {
    if (!hasPermission(req.user, 'businesses.update')) {
      return res.status(403).json({ ok: false, error: 'Permission denied.' });
    }
    const orgId = req.user.organization._id;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ ok: false, error: 'User ID required.' });
    const validUsers = await getValidUserIds(orgId, [userId]);
    if (!validUsers.length) return res.status(400).json({ ok: false, error: 'Invalid user.' });

    await ClientCompany.updateOne(
      { _id: req.params.id, organization: orgId },
      { $addToSet: { assignedUsers: validUsers[0] } }
    );

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/companies/:id/collaborators/remove — Remove single collaborator
router.post('/:id/collaborators/remove', async (req, res, next) => {
  try {
    if (!hasPermission(req.user, 'businesses.update')) {
      return res.status(403).json({ ok: false, error: 'Permission denied.' });
    }
    const orgId = req.user.organization._id;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ ok: false, error: 'User ID required.' });

    await ClientCompany.updateOne(
      { _id: req.params.id, organization: orgId },
      { $pull: { assignedUsers: userId } }
    );

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/companies/:id/api-key/regenerate — Regenerate inbound API key
router.post('/:id/api-key/regenerate', async (req, res, next) => {
  try {
    if (!hasPermission(req.user, 'integrations.update')) {
      return res.status(403).json({ ok: false, error: 'Permission denied.' });
    }
    const orgId = req.user.organization._id;
    const company = await ClientCompany.findOne({ _id: req.params.id, organization: orgId });
    if (!company) return res.status(404).json({ ok: false, error: 'Company not found.' });

    const previousSuffix = company.apiKey ? company.apiKey.slice(-6) : '';
    company.apiKey = 'cc_' + crypto.randomBytes(24).toString('hex');
    company.apiKeyStatus = 'active';
    company.apiKeyRotatedAt = new Date();
    company.apiKeyDisabledAt = null;
    company.apiKeyHistory.push({
      action: 'rotated',
      keySuffix: previousSuffix,
      changedBy: req.user._id,
      reason: 'Regenerated from API.',
    });
    await company.save();

    res.json({ ok: true, apiKey: company.apiKey });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
