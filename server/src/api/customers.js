const express = require('express');
const Activity = require('../models/Activity');
const Attachment = require('../models/Attachment');
const Campaign = require('../models/Campaign');
const ClientCompany = require('../models/ClientCompany');
const CrmLabel = require('../models/CrmLabel');
const CrmStage = require('../models/CrmStage');
const CustomField = require('../models/CustomField');
const CustomRecord = require('../models/CustomRecord');
const Customer = require('../models/Customer');
const Notification = require('../models/Notification');
const SavedView = require('../models/SavedView');
const User = require('../models/User');
const WorkType = require('../models/WorkType');
const { hasPermission, hasWorkPermission, isRestrictedUser, canAccessLeadField } = require('../config/roles');
const { runLeadAutomation } = require('../services/automation');
const { getWonStageIds } = require('../services/crmStages');
const { logAudit } = require('../utils/audit');
const { potentialFilter } = require('../utils/leadPotential');
const { requireApiAuth } = require('./middleware/auth');

const router = express.Router();
router.use(requireApiAuth);
router.use((req, res, next) => hasPermission(req.user, 'businesses.view') ? next() : res.status(403).json({ ok: false, error: 'Access denied' }));

const isManager = user => ['admin', 'manager'].includes(user.role);
const selectedIds = value => (Array.isArray(value) ? value : value ? [value] : []).map(String).filter(id => /^[a-f\d]{24}$/i.test(id));
const labels = value => Array.isArray(value) ? value : value ? [value] : [];

function workspace(req, res) {
  if (req.activeCompanyId) return String(req.activeCompanyId);
  res.status(400).json({ ok: false, error: 'Select an active CRM workspace first.' });
  return null;
}

function scope(req, extra = {}) {
  return {
    organization: req.user.organization._id,
    clientCompany: req.activeCompanyId,
    ...(isRestrictedUser(req.user) ? { assignedTo: req.user._id } : {}),
    ...extra
  };
}

const permits = permission => (req, res, next) => hasPermission(req.user, permission)
  ? next()
  : res.status(403).json({ ok: false, error: 'Access denied' });

async function formOptions(req) {
  const organization = req.user.organization._id;
  const companyFilter = { organization, status: 'active' };
  if (!isManager(req.user)) companyFilter.assignedUsers = req.user._id;
  const [stages, availableLabels, fields, companies, users] = await Promise.all([
    CrmStage.find({ organization, clientCompany: req.activeCompanyId }).sort({ order: 1, createdAt: 1 }),
    CrmLabel.find({ organization, clientCompany: req.activeCompanyId, isActive: true }).sort({ name: 1 }),
    CustomField.find({ organization, clientCompany: req.activeCompanyId, entity: 'customer', isActive: true }).sort({ order: 1, createdAt: 1 }),
    ClientCompany.find(companyFilter).sort({ name: 1 }),
    User.find({ organization, isActive: true, role: { $in: ['admin', 'manager', 'agent'] } }).sort({ name: 1 })
  ]);
  const campaigns = await Campaign.find({ organization, clientCompany: req.activeCompanyId, status: 'active' }).sort({ name: 1 });
  return { stages, labels: availableLabels, fields, companies, campaigns, users };
}

async function validateRelations(req, body) {
  const organization = req.user.organization._id;
  const activeWorkspace = req.activeCompanyId;
  const checks = [];
  if (body.stage) checks.push(CrmStage.exists({ _id: body.stage, organization, clientCompany: activeWorkspace, isActive: true }).then(Boolean));
  if (body.campaign) checks.push(Campaign.exists({ _id: body.campaign, organization, clientCompany: activeWorkspace, status: 'active' }).then(Boolean));
  if (body.assignedTo && isManager(req.user)) checks.push(User.exists({ _id: body.assignedTo, organization, isActive: true, role: { $in: ['admin', 'manager', 'agent'] } }).then(Boolean));
  const requestedLabels = labels(body.labels);
  if (requestedLabels.length) checks.push(CrmLabel.countDocuments({ _id: { $in: requestedLabels }, organization, clientCompany: activeWorkspace, isActive: true }).then(count => count === requestedLabels.length));
  return (await Promise.all(checks)).every(Boolean);
}

function input(body, fields, user, existing = null) {
  const currentCustomData = existing?.customData?.toObject?.() || Object.fromEntries(existing?.customData || []);
  const requestedCustomData = body.customData && typeof body.customData === 'object' ? body.customData : {};
  for (const field of fields) {
    if (canAccessLeadField(user, field.key, 'edit') && Object.hasOwn(requestedCustomData, field.key)) {
      currentCustomData[field.key] = requestedCustomData[field.key];
    }
  }
  return {
    name: String(body.name || '').trim(),
    company: String(body.company || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    phone: String(body.phone || '').trim(),
    source: String(body.source || 'Manual').trim(),
    value: Math.max(0, Number(body.value) || 0),
    priority: ['low', 'medium', 'high'].includes(body.priority) ? body.priority : 'medium',
    leadScore: Math.max(0, Math.min(100, Number(body.leadScore) || 0)),
    stage: body.stage,
    labels: labels(body.labels),
    campaign: body.campaign || null,
    notes: String(body.notes || ''),
    customData: currentCustomData
  };
}

router.post('/bulk', permits('businesses.update'), async (req, res, next) => {
  try {
    if (!isManager(req.user)) return res.status(403).json({ ok: false, error: 'Access denied' });
    const ids = selectedIds(req.body.selectedIds);
    if (!ids.length) return res.status(400).json({ ok: false, error: 'Select at least one lead.' });
    const customers = await Customer.find(scope(req, { _id: { $in: ids } })).populate('assignedTo stage');
    if (!customers.length) return res.status(404).json({ ok: false, error: 'No matching leads found.' });
    const action = String(req.body.action || '');
    const customerIds = customers.map(customer => customer._id);
    let update;
    let note;
    if (action === 'delete') {
      if (!hasPermission(req.user, 'businesses.delete')) return res.status(403).json({ ok: false, error: 'Access denied' });
      await Promise.all([
        Activity.deleteMany({ organization: req.user.organization._id, customer: { $in: customerIds } }),
        Attachment.deleteMany({ organization: req.user.organization._id, customer: { $in: customerIds } }),
        Customer.deleteMany(scope(req, { _id: { $in: customerIds } }))
      ]);
      await logAudit(req, { action: 'bulk_delete', entityType: 'customer', message: `Bulk deleted ${customers.length} lead(s).`, metadata: { count: customers.length, ids: customerIds } });
      return res.json({ ok: true, message: `${customers.length} lead(s) deleted.` });
    }
    if (action === 'stage') {
      const stage = await CrmStage.findOne({ _id: req.body.stageId || req.body.stage, organization: req.user.organization._id, clientCompany: req.activeCompanyId, isActive: true });
      if (!stage) return res.status(400).json({ ok: false, error: 'Choose a valid stage.' });
      update = { $set: { stage: stage._id } }; note = `Bulk update: stage changed to ${stage.name}.`;
    } else if (action === 'transfer') {
      const assignee = req.body.assignedTo ? await User.findOne({ _id: req.body.assignedTo, organization: req.user.organization._id, isActive: true, role: { $in: ['admin', 'manager', 'agent'] } }) : null;
      if (req.body.assignedTo && !assignee) return res.status(400).json({ ok: false, error: 'Choose a valid active user.' });
      update = { $set: { assignedTo: assignee?._id || null } }; note = `Bulk update: lead assigned to ${assignee?.name || 'Unassigned'}.`;
      if (assignee && String(assignee._id) !== String(req.user._id)) await Notification.create({ organization: req.user.organization._id, user: assignee._id, title: 'Bulk Lead Transfer', message: `${customers.length} lead(s) were assigned to you by ${req.user.name}.`, link: '/customers' });
    } else if (action === 'priority' && ['low', 'medium', 'high'].includes(req.body.priority)) {
      update = { $set: { priority: req.body.priority } }; note = `Bulk update: priority set to ${req.body.priority}.`;
    } else if (action === 'value' && Number.isFinite(Number(req.body.value)) && Number(req.body.value) >= 0) {
      update = { $set: { value: Number(req.body.value) } }; note = `Bulk update: lead value set to Rs. ${Number(req.body.value).toLocaleString('en-IN')}.`;
    } else if (action === 'source' && String(req.body.source || '').trim()) {
      update = { $set: { source: String(req.body.source).trim() } }; note = `Bulk update: source set to ${String(req.body.source).trim()}.`;
    } else return res.status(400).json({ ok: false, error: 'Choose a supported bulk action with a valid value.' });
    await Customer.updateMany(scope(req, { _id: { $in: customerIds } }), update);
    await Activity.insertMany(customers.map(customer => ({ organization: req.user.organization._id, customer: customer._id, user: req.user._id, type: action === 'stage' ? 'stage_changed' : 'note', note })));
    await logAudit(req, { action: `bulk_${action}`, entityType: 'customer', message: `Bulk ${action} applied to ${customers.length} lead(s).`, metadata: { action, count: customers.length } });
    res.json({ ok: true, message: `${customers.length} lead(s) updated.` });
  } catch (error) { next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    if (!workspace(req, res)) return;
    const { q = '', stage = '', label = '', campaign = '', sortBy = 'recent', view = 'all', dateFrom = '', dateTo = '' } = req.query;
    const options = await formOptions(req);
    const wonStageIds = await getWonStageIds(req.user.organization._id, req.activeCompanyId);
    const filter = scope(req, stage ? { stage } : { stage: { $nin: wonStageIds } });
    if (label) filter.labels = label;
    if (campaign) filter.campaign = campaign;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      const from = new Date(dateFrom); const to = new Date(dateTo);
      if (dateFrom && !Number.isNaN(from.getTime())) filter.createdAt.$gte = from;
      if (dateTo && !Number.isNaN(to.getTime())) { to.setHours(23, 59, 59, 999); filter.createdAt.$lte = to; }
      if (!Object.keys(filter.createdAt).length) delete filter.createdAt;
    }
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    if (view === 'recent') filter.updatedAt = { $gte: sevenDaysAgo };
    else if (view === 'new') filter.createdAt = { $gte: sevenDaysAgo };
    else if (view === 'high-value') filter.value = { $gte: 50000 };
    else if (view === 'assigned') filter.assignedTo = req.user._id;
    else if (view === 'overdue') filter.nextFollowUpAt = { $lt: new Date() };
    else if (view === 'potential' || view === 'hot') Object.assign(filter, potentialFilter(options.labels, options.stages));
    else if (view === 'qualified') filter.stage = { $in: options.stages.filter(item => /qualified/i.test(item.name)).map(item => item._id) };
    if (q) {
      const escaped = String(q).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      filter.$or = ['name', 'company', 'email', 'phone'].map(key => ({ [key]: { $regex: escaped, $options: 'i' } }));
    }
    const sorts = { recent: { updatedAt: -1 }, old: { updatedAt: 1 }, 'highest-value': { value: -1 }, 'lowest-value': { value: 1 }, name: { name: 1 } };
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 10));
    const totalResults = await Customer.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
    const page = Math.min(totalPages, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const [customers, savedViews] = await Promise.all([
      Customer.find(filter).populate('stage labels assignedTo clientCompany campaign').sort(sorts[sortBy] || sorts.recent).skip((page - 1) * pageSize).limit(pageSize),
      SavedView.find({ organization: req.user.organization._id, user: req.user._id, entity: 'customer' }).sort({ updatedAt: -1 })
    ]);
    const statsFilter = scope(req, { stage: { $nin: wonStageIds } });
    const qualified = options.stages.filter(item => !item.isWon && /qualified/i.test(item.name)).map(item => item._id);
    const [totalLeads, newLeads, qualifiedLeads, hotLeads, overdueLeads] = await Promise.all([
      Customer.countDocuments(statsFilter), Customer.countDocuments({ ...statsFilter, createdAt: { $gte: sevenDaysAgo } }),
      qualified.length ? Customer.countDocuments({ ...statsFilter, stage: { $in: qualified } }) : 0,
      Customer.countDocuments({ ...statsFilter, ...potentialFilter(options.labels, options.stages) }), Customer.countDocuments({ ...statsFilter, nextFollowUpAt: { $lt: new Date() } })
    ]);
    res.json({ ok: true, data: customers, ...options, fields: options.fields.filter(field => canAccessLeadField(req.user, field.key, 'view')), savedViews, leadStats: { totalLeads, newLeads, qualifiedLeads, hotLeads, overdueLeads }, pagination: { page, pageSize, totalPages, totalResults } });
  } catch (error) { next(error); }
});

router.post('/', permits('businesses.create'), async (req, res, next) => {
  try {
    if (!workspace(req, res)) return;
    if (!String(req.body.name || '').trim()) return res.status(400).json({ ok: false, error: 'Name is required.' });
    const options = await formOptions(req);
    const firstStage = options.stages.find(stage => stage.isDefault && stage.isActive) || options.stages.find(stage => stage.isActive);
    if (!req.body.stage) req.body.stage = firstStage?._id;
    if (!req.body.stage) return res.status(400).json({ ok: false, error: 'Create an active CRM stage before adding leads.' });
    if (!await validateRelations(req, req.body)) return res.status(403).json({ ok: false, error: 'One or more selected relationships are invalid.' });
    const customer = await Customer.create({ organization: req.user.organization._id, clientCompany: req.activeCompanyId, ...input(req.body, options.fields, req.user), assignedTo: isManager(req.user) ? (req.body.assignedTo || req.user._id) : req.user._id });
    await runLeadAutomation({ customer, trigger: 'lead_created' });
    await Activity.create({ organization: req.user.organization._id, customer: customer._id, user: req.user._id, type: 'note', note: 'Customer created.' });
    await logAudit(req, { action: 'create', entityType: 'customer', entityId: customer._id, entityName: customer.name, message: `Lead "${customer.name}" created.` });
    res.status(201).json({ ok: true, data: await customer.populate('stage labels assignedTo clientCompany campaign') });
  } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!workspace(req, res)) return;
    const customer = await Customer.findOne(scope(req, { _id: req.params.id })).populate('stage labels assignedTo clientCompany campaign');
    if (!customer) return res.status(404).json({ ok: false, error: 'Lead not found.' });
    const visibleWorkTypes = (await WorkType.find({ organization: req.user.organization._id, clientCompany: req.activeCompanyId, isActive: true })).filter(type => hasWorkPermission(req.user, type, 'view'));
    const workScope = { organization: req.user.organization._id, workspace: req.activeCompanyId, module: { $in: visibleWorkTypes.map(type => type._id) }, customer: customer._id, ...(isRestrictedUser(req.user) ? { $or: [{ assignedTo: req.user._id }, { collaborators: req.user._id }, { secondaryAssignee: req.user._id }] } : {}) };
    const [activities, attachments, relatedWork, options] = await Promise.all([
      Activity.find({ organization: req.user.organization._id, customer: customer._id }).populate('user', 'name').sort({ createdAt: -1 }),
      Attachment.find({ organization: req.user.organization._id, customer: customer._id }).select('-data').populate('uploadedBy', 'name').sort({ createdAt: -1 }),
      CustomRecord.find(workScope).populate('module assignedTo collaborators secondaryAssignee parentRecord').sort({ createdAt: -1 }),
      formOptions(req)
    ]);
    res.json({ ok: true, data: customer, activities, attachments, relatedWork, stages: options.stages, labels: options.labels, users: options.users, campaigns: options.campaigns, fields: options.fields.filter(field => canAccessLeadField(req.user, field.key, 'view')) });
  } catch (error) { next(error); }
});

router.put('/:id', permits('businesses.update'), async (req, res, next) => {
  try {
    if (!workspace(req, res)) return;
    const customer = await Customer.findOne(scope(req, { _id: req.params.id }));
    if (!customer) return res.status(404).json({ ok: false, error: 'Lead not found.' });
    if (!String(req.body.name || customer.name).trim()) return res.status(400).json({ ok: false, error: 'Name is required.' });
    const options = await formOptions(req);
    const merged = { ...customer.toObject(), ...req.body };
    if (!await validateRelations(req, merged)) return res.status(403).json({ ok: false, error: 'One or more selected relationships are invalid.' });
    const previousStage = customer.stage; const previousOwner = customer.assignedTo;
    customer.set(input(merged, options.fields, req.user, customer));
    customer.clientCompany = req.activeCompanyId;
    if (isManager(req.user)) customer.assignedTo = req.body.assignedTo || null;
    await customer.save();
    if (String(previousStage || '') !== String(customer.stage || '')) await runLeadAutomation({ customer, trigger: 'stage_changed', previousStage });
    if (String(previousOwner || '') !== String(customer.assignedTo || '')) await runLeadAutomation({ customer, trigger: 'owner_changed' });
    await logAudit(req, { action: 'update', entityType: 'customer', entityId: customer._id, entityName: customer.name, message: `Lead "${customer.name}" updated.` });
    res.json({ ok: true, data: await customer.populate('stage labels assignedTo clientCompany campaign') });
  } catch (error) { next(error); }
});

router.delete('/:id', permits('businesses.delete'), async (req, res, next) => {
  try {
    if (!isManager(req.user)) return res.status(403).json({ ok: false, error: 'Access denied' });
    const customer = await Customer.findOne(scope(req, { _id: req.params.id }));
    if (!customer) return res.status(404).json({ ok: false, error: 'Lead not found.' });
    await Promise.all([Activity.deleteMany({ organization: req.user.organization._id, customer: customer._id }), Attachment.deleteMany({ organization: req.user.organization._id, customer: customer._id }), customer.deleteOne()]);
    await logAudit(req, { action: 'delete', entityType: 'customer', entityId: customer._id, entityName: customer.name, message: `Lead "${customer.name}" deleted.` });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

module.exports = router;
