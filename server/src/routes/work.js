const express = require('express');
const mongoose = require('mongoose');

const AuditLog = require('../models/AuditLog');
const ClientCompany = require('../models/ClientCompany');
const Notification = require('../models/Notification');
const CustomRecord = require('../models/CustomRecord');
const WorkType = require('../models/WorkType');
const { logAudit } = require('../utils/audit');
const { parseCsv, rowsToObjects } = require('../utils/csv');
const { canEditWorkField, hasWorkPermission, hasPermission, isRestrictedUser } = require('../config/roles');
const { isClosed } = require('../utils/workCompletion');
const Customer = require('../models/Customer');
const { runRecordAutomation } = require('../services/automation');
const { assignableWorkUsers } = require('../utils/workAssignments');

const router = express.Router();
const priorities = ['low', 'medium', 'high'];
const coreDisplayFields = [
  { key: 'title', label: 'Title', type: 'text' }, { key: 'customer', label: 'Linked Customer/Lead', type: 'customer-picker' }, { key: 'assignedTo', label: 'Owner', type: 'user-picker' },
  { key: 'collaborators', label: 'Collaborators', type: 'user-picker' }, { key: 'secondaryAssignee', label: 'Secondary assignee', type: 'user-picker' },
  { key: 'relatedRecords', label: 'Linked records / dependencies', type: 'record-picker' },
  { key: 'status', label: 'Status', type: 'status' }, { key: 'priority', label: 'Priority', type: 'priority' },
  { key: 'deadline', label: 'Deadline', type: 'date' }, { key: 'startDate', label: 'Start date', type: 'date' },
  { key: 'deliveredAt', label: 'Delivered date', type: 'date' }, { key: 'notes', label: 'Notes', type: 'textarea' }
];
const ids = value => [...new Set((Array.isArray(value) ? value : value ? [value] : []).filter(Boolean))];
const sameWorkValue = (left, right, key) => {
  const normalize = value => {
    if (value == null || value === '') return '';
    if (Array.isArray(value)) return value.map(item => String(item?._id || item)).sort().join(',');
    if (key === 'deadline' || key === 'startDate' || key === 'deliveredAt') return new Date(value).toISOString().slice(0, 10);
    return String(value?._id || value);
  };
  return normalize(left) === normalize(right);
};
const changedWorkFields = (item, core, custom, workType) => {
  const coreLabels = { title: 'Title', customer: 'Linked relationship', assignedTo: 'Owner', collaborators: 'Collaborators', secondaryAssignee: 'Secondary assignee', status: 'Status', priority: 'Priority', deadline: 'Deadline', startDate: 'Start date', deliveredAt: 'Delivered date', notes: 'Notes' };
  const changed = Object.entries(coreLabels)
    .filter(([key]) => !sameWorkValue(item[key], core[key], key))
    .map(([, label]) => label);
  for (const field of workType.fields) {
    if (!sameWorkValue(item.customFields?.get(field.key), custom[field.key], field.key)) changed.push(field.label);
  }
  return changed;
};
const restrictToAssigned = (filter, user) => {
  if (isRestrictedUser(user)) (filter.$and ||= []).push({ $or: [{ assignedTo: user._id }, { collaborators: user._id }, { secondaryAssignee: user._id }] });
  return filter;
};
const redirect = (key, kind, message) => `/work/${key}?${kind}=${encodeURIComponent(message)}`;
const monthKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

async function accessibleReferences(req) {
  const organization = req.user.organization._id, workspace = req.activeCompany._id;
  const types = (await WorkType.find({ organization, clientCompany: workspace, isActive: true })).filter(type => hasWorkPermission(req.user, type, 'view'));
  return restrictToAssigned({ organization, workspace, module: { $in: types.map(type => type._id) } }, req.user);
}

async function ensureMonthlyRecords(req) {
  const now = new Date(), month = monthKey(now), base = { organization: req.user.organization._id, workspace: req.activeCompany._id, module: req.workType._id };
  if (req.workType.key === 'payment' && !await CustomRecord.exists({ ...base, 'customFields.billingMonth': month })) {
    await CustomRecord.create({ ...base, title: `${req.activeCompany.name} · ${now.toLocaleString('en', { month: 'long', year: 'numeric' })}`, status: 'pending', deadline: new Date(now.getFullYear(), now.getMonth() + 1, 0), customFields: { billingMonth: month, expectedAmount: req.activeCompany.monthlyPackage || 0, paidAmount: 0 }, createdBy: req.user._id });
  }
  if (req.workType.key !== 'task') return;
  const templates = await CustomRecord.find({ ...base, 'customFields.repeatMonthly': true, $or: [{ 'customFields.recurringSource': { $exists: false } }, { 'customFields.recurringSource': '' }] });
  for (const template of templates) {
    if (monthKey(template.createdAt) === month || await CustomRecord.exists({ ...base, 'customFields.recurringSource': String(template._id), 'customFields.recurringMonth': month })) continue;
    const day = Math.min(Number(template.customFields.get('repeatDay')) || 1, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
    await CustomRecord.create({ ...base, title: template.title, status: req.workType.statuses[0].key, assignedTo: template.assignedTo, collaborators: template.collaborators, secondaryAssignee: template.secondaryAssignee, priority: template.priority, deadline: new Date(now.getFullYear(), now.getMonth(), day), notes: template.notes, customer: template.customer, customFields: { ...Object.fromEntries(template.customFields), recurringSource: String(template._id), recurringMonth: month }, createdBy: req.user._id });
  }
}

async function loadWorkType(req, res, next) {
  try {
    req.workType = await WorkType.findOne({ organization: req.user.organization._id, clientCompany: req.activeCompany._id, key: req.params.type });
    if (!req.workType) return res.status(404).render('errors/404', { title: 'Work area not found' });
    if (!hasWorkPermission(req.user, req.workType, 'view')) return res.status(403).render('errors/403', { title: 'Access denied' });
    next();
  } catch (error) { next(error); }
}

const requireAction = action => (req, res, next) => hasWorkPermission(req.user, req.workType, action)
  ? next()
  : res.status(403).render('errors/403', { title: 'Access denied' });

function customFieldsFor(body, workType, useDefaults = false) {
  const values = {};
  for (const field of workType.fields) {
    let value = body[`custom_${field.key}`];
    if (useDefaults && (value === undefined || value === '')) value = field.defaultValue;
    if (field.required && field.type !== 'checkbox' && !String(value || '').trim()) return { error: `${field.label} is required.` };
    if (field.type === 'select' && value && !field.options.includes(value)) return { error: `${field.label} has an invalid option.` };
    if (['number', 'currency', 'percentage'].includes(field.type) && value !== '' && value != null) {
      value = Number(value);
      if (!Number.isFinite(value)) return { error: `${field.label} must be a number.` };
      const min = field.type === 'percentage' && field.min == null ? 0 : field.min;
      const max = field.type === 'percentage' && field.max == null ? 100 : field.max;
      if (min != null && value < min) return { error: `${field.label} must be at least ${min}.` };
      if (max != null && value > max) return { error: `${field.label} must be at most ${max}.` };
    }
    if (['date', 'datetime'].includes(field.type) && value && Number.isNaN(new Date(value).getTime())) return { error: `${field.label} must be a valid date.` };
    if (field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { error: `${field.label} must be a valid email address.` };
    if (field.type === 'url' && value) {
      try { if (!['http:', 'https:'].includes(new URL(value).protocol)) throw new Error(); } catch { return { error: `${field.label} must be a valid web address.` }; }
    }
    values[field.key] = field.type === 'checkbox' ? (value === 'on' || value === true) : (value ?? '');
  }
  return { values };
}

function coreFields(body, user, existing = null) {
  const deadline = body.deadline ? new Date(body.deadline) : null;
  if (deadline && Number.isNaN(deadline.getTime())) return { error: 'Please choose a valid due date.' };
  return {
    values: {
      title: String(body.title || '').trim(),
      clientCompany: body.clientCompany || null,
      customer: body.customer || null,
      assignedTo: isRestrictedUser(user) ? (existing ? existing.assignedTo : user._id) : (body.assignedTo || null),
      collaborators: isRestrictedUser(user) ? (existing?.collaborators || []) : ids(body.collaborators),
      secondaryAssignee: isRestrictedUser(user) && existing ? existing.secondaryAssignee : (body.secondaryAssignee || null),
      status: body.status,
      priority: priorities.includes(body.priority) ? body.priority : 'medium',
      deadline,
      startDate: body.startDate || null,
      deliveredAt: body.deliveredAt || null,
      notes: body.notes || ''
    }
  };
}

async function relatedRecordsFor(body, req) {
  const recordIds = ids(body.relatedRecords);
  if (!recordIds.length) return { values: [] };
  if (recordIds.some(id => !mongoose.isObjectIdOrHexString(id))) return { error: 'A related record is invalid.' };
  if (req.params.id && recordIds.includes(req.params.id)) return { error: 'A record cannot be related to itself.' };
  const filter = { ...await accessibleReferences(req), _id: { $in: recordIds } };
  if (recordIds.length !== await CustomRecord.countDocuments(filter)) return { error: 'A related record is outside your accessible CRM records.' };
  const relation = String(body.relatedRelation || 'related to').trim().slice(0, 80) || 'related to';
  return { values: recordIds.map(record => ({ record, relation })) };
}

async function validateReferences(core, custom, workType, req) {
  const userIds = ids([core.assignedTo, ...core.collaborators, core.secondaryAssignee,
    ...workType.fields.filter(field => field.type === 'user-picker').map(field => custom[field.key])]);
  if (userIds.some(id => !mongoose.isObjectIdOrHexString(id))) return 'A selected team member is invalid.';
  if (userIds.length) {
    const eligible = await assignableWorkUsers(req.user.organization._id, req.activeCompany._id, workType);
    const eligibleIds = new Set(eligible.map(user => String(user._id)));
    if (userIds.some(id => !eligibleIds.has(String(id)))) return 'A selected team member cannot access this work area in the active CRM.';
  }
  const companyIds = ids(workType.fields.filter(field => field.type === 'company-picker').map(field => custom[field.key]));
  if (companyIds.some(id => String(id) !== String(req.activeCompany._id))) return 'A selected company is outside the active CRM.';
  const customerIds = ids(workType.fields.filter(field => field.type === 'customer-picker').map(field => custom[field.key]));
  if (customerIds.some(id => !mongoose.isObjectIdOrHexString(id))) return 'A selected customer is invalid.';
  if (customerIds.length) {
    const Customer = require('../models/Customer');
    const customerCount = await Customer.countDocuments({ _id: { $in: customerIds }, organization: req.user.organization._id, clientCompany: req.activeCompany._id });
    if (customerIds.length !== customerCount) return 'A selected customer does not belong to this CRM.';
  }
  if (core.customer) {
    if (!mongoose.isObjectIdOrHexString(core.customer)) return 'The selected customer is invalid.';
    const Customer = require('../models/Customer');
    const customerExists = await Customer.exists({ _id: core.customer, organization: req.user.organization._id, clientCompany: req.activeCompany._id });
    if (!customerExists) return 'The selected customer does not belong to this CRM.';
  }
  return '';
}

router.get('/', async (req, res, next) => {
  try {
    const organization = req.user.organization._id, workspace = req.activeCompany._id;
    const workTypes = (await WorkType.find({ organization, clientCompany: workspace, isActive: true }).sort({ order: 1, name: 1 }))
      .filter(type => hasWorkPermission(req.user, type, 'view'));
    const filter = restrictToAssigned({ organization, workspace, module: { $in: workTypes.map(type => type._id) } }, req.user);
    const items = await CustomRecord.find(filter).populate('workType assignedTo customer').sort({ deadline: 1, createdAt: -1 });
    const now = new Date(), tomorrow = new Date(now); tomorrow.setHours(24, 0, 0, 0);
    const isMine = item => [item.assignedTo?._id, ...(item.collaborators || []), item.secondaryAssignee].some(id => String(id) === String(req.user._id));
    const view = ['open', 'today', 'overdue', 'completed', 'all'].includes(req.query.view) ? req.query.view : 'open';
    const owner = req.query.owner === 'me' ? 'me' : 'all';
    const moduleKey = workTypes.some(type => type.key === req.query.module) ? req.query.module : '';
    const visible = items.filter(item => (owner !== 'me' || isMine(item)) && (!moduleKey || item.workType?.key === moduleKey || item.key === 'task'));
    const matches = item => view === 'all' || (view === 'completed' ? isClosed(item) : !isClosed(item) && (view === 'open' || item.deadline && item.deadline < (view === 'today' ? tomorrow : now)));
    const leadFilter = { organization, clientCompany: workspace, nextFollowUpAt: { $lte: now } };
    if (isRestrictedUser(req.user) || owner === 'me') leadFilter.assignedTo = req.user._id;
    const followupCount = hasPermission(req.user, 'tasks.view') ? await Customer.countDocuments(leadFilter) : null;
    res.render('work/center', { title: 'Task Center', workTypes, items: visible.filter(matches), filters: { view, owner, module: moduleKey },
      counts: { open: visible.filter(item => !isClosed(item)).length, overdue: visible.filter(item => !isClosed(item) && item.deadline && item.deadline < now).length, completed: visible.filter(isClosed).length },
      followupCount, canCreateType: type => hasWorkPermission(req.user, type, 'create') });
  } catch (error) { next(error); }
});

router.use('/:type', loadWorkType);

router.post('/:type/import/preview', requireAction('create'), async (req, res, next) => {
  try {
    const csvText = String(req.body.csvText || '');
    const rows = parseCsv(csvText);
    if (rows.length < 2) return res.redirect(redirect(req.workType.key, 'error', 'Upload a CSV with a header row and at least one record.'));
    res.render('work/import-preview', { title: `Preview ${req.workType.name} import`, workType: req.workType, headers: rows[0], rows: rows.slice(1, 11), csvText, error: '' });
  } catch (error) { next(error); }
});

router.post('/:type/import', requireAction('create'), express.text({ type: ['text/csv', 'text/plain', 'application/octet-stream'], limit: '4mb' }), async (req, res, next) => {
  try {
    const rows = rowsToObjects(parseCsv(req.body.csvText || req.body || ''));
    if (!rows.length) return res.redirect(redirect(req.workType.key, 'error', 'Upload a CSV with at least one record.'));
    let created = 0, skipped = 0;
    for (const row of rows) {
      const body = { title: row.title || row.name || '', status: row.status || req.workType.statuses[0].key, assignedTo: row.assignedTo || '', priority: row.priority || 'medium', deadline: row.deadline || '', notes: row.notes || '' };
      req.workType.fields.forEach(field => { body[`custom_${field.key}`] = row[field.key] ?? row[field.label] ?? ''; });
      if (!body.title || !req.workType.statuses.some(status => status.key === body.status)) { skipped += 1; continue; }
      const custom = customFieldsFor(body, req.workType, true);
      if (custom.error) { skipped += 1; continue; }
      const core = coreFields(body, req.user);
      if (core.error) { skipped += 1; continue; }
      const referenceError = await validateReferences(core.values, custom.values, req.workType, req);
      if (referenceError) { skipped += 1; continue; }
      delete core.values.clientCompany;
      const item = await CustomRecord.create({ organization: req.user.organization._id, workspace: req.activeCompany._id, module: req.workType._id, ...core.values, customFields: custom.values, createdBy: req.user._id });
      await runRecordAutomation({ record: item, workType: req.workType, trigger: 'record_created' });
      created += 1;
    }
    await logAudit(req, { action: 'work_import', entityType: req.workType.key, entityName: req.workType.name, message: `Imported ${created} ${req.workType.name} records.` });
    res.redirect(redirect(req.workType.key, 'success', `Imported ${created} records; skipped ${skipped}.`));
  } catch (error) { next(error); }
});

router.get('/:type', async (req, res, next) => {
  try {
    await ensureMonthlyRecords(req);
    const organization = req.user.organization._id;
    const filter = { organization, workspace: req.activeCompany._id, module: req.workType._id };
    const presentation = req.workType.presentation || {};
    const savedFieldLabels = req.workType.presentation?.fieldLabels;
    const fieldLabels = savedFieldLabels instanceof Map ? Object.fromEntries(savedFieldLabels) : (savedFieldLabels || {});
    const displayFields = [...coreDisplayFields, ...req.workType.fields.map(field => ({ key: `custom:${field.key}`, label: field.label, type: field.type, options: field.options }))]
      .map(field => ({ ...field, label: fieldLabels[field.key] || field.label }));
    const displayFieldMap = new Map(displayFields.map(field => [field.key, field]));
    const filterValues = {};
    for (const key of presentation.filterFields || ['status', 'assignedTo', 'priority']) {
      const definition = displayFieldMap.get(key), value = String(req.query[`filter_${key}`] || '').trim();
      filterValues[key] = value;
      if (!definition || !value) continue;
      const path = key.startsWith('custom:') ? `customFields.${key.slice(7)}` : key === 'relatedRecords' ? 'relatedRecords.record' : key;
      if (['user-picker', 'company-picker', 'customer-picker', 'record-picker'].includes(definition.type)) {
        if (mongoose.isObjectIdOrHexString(value)) filter[path] = value;
      } else if (['number', 'currency', 'percentage'].includes(definition.type)) {
        if (Number.isFinite(Number(value))) filter[path] = Number(value);
      } else if (definition.type === 'checkbox') filter[path] = value === 'true';
      else if (definition.type === 'date' || definition.type === 'datetime') {
        const start = new Date(value), end = new Date(value); end.setDate(end.getDate() + 1);
        if (!Number.isNaN(start.getTime())) filter[path] = { $gte: start, $lt: end };
      } else filter[path] = value;
    }
    restrictToAssigned(filter, req.user);
    const relatedFilter = await accessibleReferences(req);
    const Customer = require('../models/Customer');
    const [items, companies, activeUsers, relatedRecords, customersList] = await Promise.all([
      CustomRecord.find(filter).populate('clientCompany customer assignedTo collaborators secondaryAssignee workType parentRecord').populate({ path: 'relatedRecords.record', match: relatedFilter }).sort({ deadline: 1, createdAt: -1 }),
      ClientCompany.find({ _id: req.activeCompany._id, organization }),
      assignableWorkUsers(organization, req.activeCompany._id, req.workType),
      CustomRecord.find(relatedFilter).populate('workType', 'name').select('title module').sort({ updatedAt: -1 }).limit(200),
      Customer.find({ organization, clientCompany: req.activeCompany._id }).sort({ company: 1, name: 1 }).select('name company')
    ]);
    const referencedRecordIds = [];
    items.forEach(item => {
      if (item.customFields) {
        for (const field of req.workType.fields.filter(f => f.type === 'module-picker')) {
          const val = item.customFields.get(field.key);
          if (mongoose.isObjectIdOrHexString(val)) referencedRecordIds.push(val);
        }
      }
    });
    const targetModuleIds = [...new Set(
      req.workType.fields
        .filter(f => f.type === 'module-picker' && f.options && f.options[0])
        .map(f => f.options[0])
    )];
    const targetRecords = targetModuleIds.length ? await CustomRecord.find({
      ...relatedFilter,
      module: { $in: targetModuleIds.filter(id => relatedFilter.module.$in.some(allowed => String(allowed) === String(id))) }
    }).select('title module').sort({ title: 1 }) : [];
    targetRecords.forEach(r => referencedRecordIds.push(r._id));
    const referencedRecords = referencedRecordIds.length ? await CustomRecord.find({ ...relatedFilter, _id: { $in: referencedRecordIds } }).populate('module').select('title module') : [];
    const recordNames = Object.fromEntries(referencedRecords.map(r => [String(r._id), { title: r.title, moduleKey: r.module?.key || '' }]));

    const users = activeUsers.filter(user => hasWorkPermission(user, req.workType, 'view'));
    const logs = await AuditLog.find({ organization, entityType: req.workType.key, entityId: { $in: items.map(item => item._id) } }).populate('user').sort({ createdAt: -1 }).limit(1000);
    const historyByItem = logs.reduce((map, log) => map.set(String(log.entityId), [...(map.get(String(log.entityId)) || []), log]), new Map());
    const counts = items.reduce((result, item) => ({ ...result, [item.status]: (result[item.status] || 0) + 1 }), {});
    const subtasksByParent = items.reduce((map, item) => {
      if (item.parentRecord) map.set(String(item.parentRecord._id || item.parentRecord), [...(map.get(String(item.parentRecord._id || item.parentRecord)) || []), item]);
      return map;
    }, new Map());
    const editableWorkFields = ['title', 'clientCompany', 'customer', 'assignedTo', 'collaborators', 'secondaryAssignee', 'status', 'priority', 'deadline', 'startDate', 'deliveredAt', 'notes', ...req.workType.fields.map(field => field.key)]
      .filter(field => canEditWorkField(req.user, req.workType, field));
    res.render('work/index', {
      title: req.workType.name, type: req.workType.key, label: req.workType.name, workType: req.workType,
      items, subtasksByParent, historyByItem, totalItems: items.length, companies, users, secondaryUsers: activeUsers, relatedRecords, customers: customersList, counts,
      statuses: req.workType.statuses.map(status => status.key), editableWorkFields, workCustomFields: req.workType.fields, displayFields, presentation,
      targetRecords, recordNames,
      filters: { view: (presentation.enabledViews || []).includes(req.query.view) ? req.query.view : presentation.defaultView || 'list', values: filterValues, month: req.query.month || '' },
      error: req.query.error || '', success: req.query.success || ''
    });
  } catch (error) { next(error); }
});

router.get('/:type/:id', async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(404).render('errors/404', { title: 'Work item not found' });
    const organization = req.user.organization._id;
    const filter = { _id: req.params.id, organization, workspace: req.activeCompany._id, module: req.workType._id };
    restrictToAssigned(filter, req.user);
    const item = await CustomRecord.findOne(filter).populate('customer assignedTo collaborators secondaryAssignee createdBy parentRecord').populate({ path: 'relatedRecords.record', match: await accessibleReferences(req) });
    if (!item) return res.status(404).render('errors/404', { title: 'Work item not found' });
    const subtaskFilter = { organization, workspace: req.activeCompany._id, module: req.workType._id, parentRecord: item._id };
    restrictToAssigned(subtaskFilter, req.user);
    const [subtasks, users] = await Promise.all([
      CustomRecord.find(subtaskFilter).populate('assignedTo').sort({ deadline: 1, createdAt: 1 }),
      assignableWorkUsers(organization, req.activeCompany._id, req.workType)
    ]);
    const logs = await AuditLog.find({ organization, entityType: req.workType.key, entityId: { $in: [item._id, ...subtasks.map(subtask => subtask._id)] } }).populate('user').sort({ createdAt: -1 }).limit(100);
    const savedLabels = req.workType.presentation?.fieldLabels;
    const fieldLabels = savedLabels instanceof Map ? Object.fromEntries(savedLabels) : (savedLabels || {});
    const displayFields = [...coreDisplayFields, ...req.workType.fields.map(field => ({ key: `custom:${field.key}`, label: field.label, type: field.type }))]
      .map(field => ({ ...field, label: fieldLabels[field.key] || field.label }));
    const editableWorkFields = ['title', 'clientCompany', 'customer', 'assignedTo', 'collaborators', 'secondaryAssignee', 'status', 'priority', 'deadline', 'startDate', 'deliveredAt', 'notes', ...req.workType.fields.map(field => field.key)]
      .filter(field => canEditWorkField(req.user, req.workType, field));
    res.render('work/detail', {
      title: item.title, type: req.workType.key, workType: req.workType, item, logs, subtasks, users, displayFields, editableWorkFields,
      canUpdateWork: hasWorkPermission(req.user, req.workType, 'update'), error: req.query.error || ''
    });
  } catch (error) { next(error); }
});

router.post('/:type/:id/subtasks', requireAction('create'), async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const parentFilter = { _id: req.params.id, organization, workspace: req.activeCompany._id, module: req.workType._id, parentRecord: null };
    restrictToAssigned(parentFilter, req.user);
    const parent = await CustomRecord.findOne(parentFilter);
    if (!parent) return res.status(404).render('errors/404', { title: 'Parent task not found' });
    const title = String(req.body.title || '').trim();
    if (!title) return res.redirect(`/work/${req.workType.key}/${parent._id}?error=${encodeURIComponent('Enter a subtask title.')}`);
    const assignedTo = isRestrictedUser(req.user) ? req.user._id : (req.body.assignedTo || null);
    const referenceError = await validateReferences({ assignedTo, collaborators: [] }, {}, { ...req.workType.toObject(), fields: [] }, req);
    if (referenceError) return res.redirect(`/work/${req.workType.key}/${parent._id}?error=${encodeURIComponent(referenceError)}`);
    const deadline = req.body.deadline ? new Date(req.body.deadline) : null;
    if (deadline && Number.isNaN(deadline.getTime())) return res.redirect(`/work/${req.workType.key}/${parent._id}?error=${encodeURIComponent('Choose a valid subtask deadline.')}`);
    if (assignedTo && ![parent.assignedTo, parent.secondaryAssignee, ...(parent.collaborators || [])].some(userId => String(userId) === String(assignedTo))) {
      parent.collaborators.push(assignedTo);
      await parent.save();
    }
    const subtask = await CustomRecord.create({ organization, workspace: req.activeCompany._id, module: req.workType._id, parentRecord: parent._id, title, status: req.workType.statuses[0].key, assignedTo, priority: priorities.includes(req.body.priority) ? req.body.priority : 'medium', deadline, customer: parent.customer, createdBy: req.user._id });
    await logAudit(req, { action: 'work_subtask_create', entityType: req.workType.key, entityId: parent._id, entityName: parent.title, message: `${req.user.name} added subtask "${subtask.title}".`, metadata: { subtaskId: subtask._id } });
    if (subtask.assignedTo && String(subtask.assignedTo) !== String(req.user._id)) await Notification.create({ organization, user: subtask.assignedTo, title: 'New Subtask Assigned', message: `"${subtask.title}" was assigned to you under "${parent.title}".`, link: `/work/${req.workType.key}/${subtask._id}` });
    res.redirect(`/work/${req.workType.key}/${parent._id}`);
  } catch (error) { next(error); }
});

router.post('/:type', requireAction('create'), async (req, res, next) => {
  try {
    if (!String(req.body.title || '').trim()) return res.redirect(redirect(req.workType.key, 'error', 'Please enter a title.'));
    if (!req.workType.statuses.some(status => status.key === req.body.status)) return res.redirect(redirect(req.workType.key, 'error', 'Invalid status.'));
    const core = coreFields(req.body, req.user);
    const custom = customFieldsFor(req.body, req.workType, true);
    const related = await relatedRecordsFor(req.body, req);
    if (core.error || custom.error || related.error) return res.redirect(redirect(req.workType.key, 'error', core.error || custom.error || related.error));
    const referenceError = await validateReferences(core.values, custom.values, req.workType, req);
    if (referenceError) return res.redirect(redirect(req.workType.key, 'error', referenceError));
    delete core.values.clientCompany;
    const item = await CustomRecord.create({ organization: req.user.organization._id, workspace: req.activeCompany._id, module: req.workType._id, ...core.values, customFields: custom.values, relatedRecords: related.values, createdBy: req.user._id });
    await runRecordAutomation({ record: item, workType: req.workType, trigger: 'record_created' });
    await logAudit(req, { action: 'work_create', entityType: req.workType.key, entityId: item._id, entityName: item.title, message: `${req.workType.name} item created: "${item.title}".` });
    if (item.assignedTo && String(item.assignedTo) !== String(req.user._id)) await Notification.create({ organization: item.organization, user: item.assignedTo, title: 'New Work Assigned', message: `"${item.title}" was assigned to you by ${req.user.name}.`, link: `/work/${req.workType.key}/${item._id}` });
    res.redirect(redirect(req.workType.key, 'success', 'Saved.'));
  } catch (error) { next(error); }
});

router.post('/:type/:id/status', requireAction('update'), async (req, res, next) => {
  try {
    if (!canEditWorkField(req.user, req.workType, 'status')) return res.status(403).render('errors/403', { title: 'Access denied' });
    if (!req.workType.statuses.some(status => status.key === req.body.status)) return res.redirect(redirect(req.workType.key, 'error', 'Invalid status.'));
    const filter = { _id: req.params.id, organization: req.user.organization._id, workspace: req.activeCompany._id, module: req.workType._id };
    restrictToAssigned(filter, req.user);
    const item = await CustomRecord.findOne(filter);
    if (!item) return res.status(404).render('errors/404', { title: 'Work item not found' });
    const previousStatus = item.status;
    item.status = req.body.status;
    const statusObj = req.workType.statuses.find(status => status.key === item.status);
    if (statusObj?.isTerminalWon) {
      if (!item.deliveredAt) item.deliveredAt = new Date();
    } else {
      item.deliveredAt = null;
    }
    await item.save();
    if (item.parentRecord && item.assignedTo) await CustomRecord.updateOne({ _id: item.parentRecord, organization: req.user.organization._id, workspace: req.activeCompany._id }, { $addToSet: { collaborators: item.assignedTo } });
    await runRecordAutomation({ record: item, workType: req.workType, trigger: 'status_changed', previousStatus });
    await logAudit(req, { action: 'work_status', entityType: req.workType.key, entityId: item._id, entityName: item.title, message: `${req.user.name} changed status from ${previousStatus} to ${item.status}.`, metadata: { previousStatus, status: item.status } });
    res.redirect(req.headers.referer || `/work/${req.workType.key}`);
  } catch (error) { next(error); }
});

router.put('/:type/:id', requireAction('update'), async (req, res, next) => {
  try {
    const filter = { _id: req.params.id, organization: req.user.organization._id, workspace: req.activeCompany._id, module: req.workType._id };
    restrictToAssigned(filter, req.user);
    const item = await CustomRecord.findOne(filter);
    if (!item) return res.status(404).render('errors/404', { title: 'Work item not found' });
    const editBody = { ...req.body };
    for (const field of coreDisplayFields) if (!canEditWorkField(req.user, req.workType, field.key)) editBody[field.key] = item[field.key];
    for (const field of req.workType.fields) if (!canEditWorkField(req.user, req.workType, field.key)) editBody[`custom_${field.key}`] = item.customFields.get(field.key);
    const core = coreFields(editBody, req.user, item);
    const custom = customFieldsFor(editBody, req.workType);
    const related = canEditWorkField(req.user, req.workType, 'relatedRecords') ? await relatedRecordsFor(editBody, req) : { values: item.relatedRecords };
    if (core.error || custom.error || related.error) return res.redirect(redirect(req.workType.key, 'error', core.error || custom.error || related.error));
    const referenceError = await validateReferences(core.values, custom.values, req.workType, req);
    if (referenceError) return res.redirect(redirect(req.workType.key, 'error', referenceError));
    delete core.values.clientCompany;
    if (!req.workType.statuses.some(status => status.key === core.values.status)) return res.redirect(redirect(req.workType.key, 'error', 'Invalid status.'));
    const previousStatus = item.status, previousOwner = item.assignedTo;
    const changedFields = changedWorkFields(item, core.values, custom.values, req.workType);
    Object.keys(core.values).forEach(field => { if (canEditWorkField(req.user, req.workType, field)) item[field] = core.values[field]; });
    for (const field of req.workType.fields) if (canEditWorkField(req.user, req.workType, field.key)) item.customFields.set(field.key, custom.values[field.key]);
    item.relatedRecords = related.values;
    const statusObj = req.workType.statuses.find(status => status.key === item.status);
    if (statusObj?.isTerminalWon) {
      if (!item.deliveredAt) item.deliveredAt = new Date();
    } else {
      item.deliveredAt = null;
    }
    await item.save();
    if (item.parentRecord && item.assignedTo) await CustomRecord.updateOne({ _id: item.parentRecord, organization: req.user.organization._id, workspace: req.activeCompany._id }, { $addToSet: { collaborators: item.assignedTo } });
    if (String(previousStatus || '') !== String(item.status || '')) await runRecordAutomation({ record: item, workType: req.workType, trigger: 'status_changed', previousStatus });
    if (String(previousOwner || '') !== String(item.assignedTo || '')) await runRecordAutomation({ record: item, workType: req.workType, trigger: 'owner_changed', previousOwner });
    if (item.assignedTo && String(previousOwner || '') !== String(item.assignedTo) && String(item.assignedTo) !== String(req.user._id)) await Notification.create({ organization: item.organization, user: item.assignedTo, title: 'Work Assigned to You', message: `"${item.title}" was assigned to you by ${req.user.name}.`, link: `/work/${req.workType.key}/${item._id}` });
    await logAudit(req, { action: 'work_update', entityType: req.workType.key, entityId: item._id, entityName: item.title, message: `${req.workType.name} item updated${changedFields.length ? `: ${changedFields.join(', ')}.` : '.'}`, metadata: { changedFields } });
    res.redirect(redirect(req.workType.key, 'success', 'Updated.'));
  } catch (error) { next(error); }
});

router.delete('/:type/:id', requireAction('delete'), async (req, res, next) => {
  try {
    const filter = { _id: req.params.id, organization: req.user.organization._id, workspace: req.activeCompany._id, module: req.workType._id };
    restrictToAssigned(filter, req.user);
    if (await CustomRecord.exists({ organization: req.user.organization._id, workspace: req.activeCompany._id, parentRecord: req.params.id })) return res.redirect(redirect(req.workType.key, 'error', 'Delete or move the subtasks before deleting their parent task.'));
    const item = await CustomRecord.findOneAndDelete(filter);
    if (item) await logAudit(req, { action: 'work_delete', entityType: req.workType.key, entityId: item._id, entityName: item.title, message: `${req.user.name} deleted "${item.title}".`, metadata: { customer: String(item.customer || ''), workspace: String(item.workspace), participants: [item.assignedTo, item.secondaryAssignee, ...(item.collaborators || [])].filter(Boolean).map(String) } });
    res.redirect(redirect(req.workType.key, 'success', 'Deleted.'));
  } catch (error) { next(error); }
});

module.exports = router;
