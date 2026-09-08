const express = require('express');
const mongoose = require('mongoose');
const { requireApiAuth } = require('./middleware/auth');
const { hasPermission, hasWorkPermission, isRestrictedUser, canEditWorkField, canChangeWorkStatus } = require('../config/roles');
const { isClosed, isComplete, completionError } = require('../utils/workCompletion');
const { assignableWorkUsers } = require('../utils/workAssignments');
const { logAudit } = require('../utils/audit');
const { runRecordAutomation } = require('../services/automation');
const { parseCsv, rowsToObjects } = require('../utils/csv');
const CustomRecord = require('../models/CustomRecord');
const WorkType = require('../models/WorkType');
const Customer = require('../models/Customer');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');

const router = express.Router();
router.use(requireApiAuth);

const priorities = ['low', 'medium', 'high'];
const ids = value => [...new Set((Array.isArray(value) ? value : value ? [value] : []).filter(Boolean))];

const monthKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

function workspace(req, res) {
  if (req.activeCompanyId) return String(req.activeCompanyId);
  res.status(400).json({ ok: false, error: 'Select an active CRM workspace first.' });
  return null;
}

const restrictToAssigned = (filter, user) => {
  if (isRestrictedUser(user)) {
    (filter.$and ||= []).push({
      $or: [{ assignedTo: user._id }, { collaborators: user._id }, { secondaryAssignee: user._id }],
    });
  }
  return filter;
};

// Work types in this workspace the viewer may access, excluding the current one.
async function viewableRelatedModuleIds(organization, workspace, excludeWorkType, user) {
  const types = await WorkType.find({ organization, clientCompany: workspace, isActive: true }).select('_id key').lean();
  return types
    .filter(type => String(type._id) !== String(excludeWorkType._id) && hasWorkPermission(user, type, 'view'))
    .map(type => type._id);
}

const relatedItemsQuery = async (organization, workspace, excludeWorkType, user) => {
  const moduleIds = await viewableRelatedModuleIds(organization, workspace, excludeWorkType, user);
  if (!moduleIds.length) return [];
  return CustomRecord.find({ organization, workspace, module: { $in: moduleIds } })
    .select('title module workType')
    .populate('workType')
    .limit(50)
    .lean();
};

const customersQuery = (user, organization, workspace, select) =>
  hasPermission(user, 'businesses.view')
    ? Customer.find({ organization, clientCompany: workspace }).select(select).sort({ name: 1 }).lean()
    : [];

const RETURNED_FOR_REVISION = /revision|rework|changes.?requested|needs.?changes/i;

// revisionCount is a plain number customField (video/design pipelines). Bump it
// once each time a record ENTERS a status tagged as a revision/rework step,
// regardless of where that status sits in the pipeline order. Index-based
// "went backward" checks can't see review -> revision because the default
// pipelines order them review(3) ... revision(4) — forward by index.
function bumpRevisionIfReturnedToWork(item, workType, previousStatus) {
  if (!workType.fields?.some(field => field.key === 'revisionCount')) return false;
  if (String(previousStatus || '') === String(item.status || '')) return false;
  const definition = workType.statuses.find(status => status.key === item.status);
  if (!definition || (!RETURNED_FOR_REVISION.test(definition.key) && !RETURNED_FOR_REVISION.test(definition.label))) return false;
  const current = Number(item.customFields?.get?.('revisionCount') || 0);
  item.customFields.set('revisionCount', Number.isFinite(current) ? current + 1 : 1);
  return true;
}

// Status/owner change with no caller mutation of the notification: notify the
// affected assignee unless they made the change themselves. Only the two
// generic write routes (PUT and quick status) go through this helper; create,
// bulk-create, delegate and subtask routes keep their specific notifications.
async function notifyWorkChanges({ organization, actor, item, workType, previousOwner, previousStatus }) {
  const notifications = [];
  const currentOwner = item.assignedTo ? String(item.assignedTo) : null;
  const ownerChanged = String(previousOwner || '') !== String(currentOwner || '');
  const statusChanged = String(previousStatus || '') !== String(item.status || '');
  const toOwner = currentOwner && currentOwner !== String(actor._id) ? currentOwner : null;
  if (toOwner && (ownerChanged || statusChanged)) {
    const definition = workType.statuses.find(status => status.key === item.status);
    const statusLabel = definition?.label || item.status;
    if (ownerChanged && statusChanged) {
      notifications.push({
        organization,
        user: toOwner,
        title: previousOwner ? 'Task reassigned to you' : 'New task assigned to you',
        message: `${actor.name} ${previousOwner ? 'reassigned' : 'assigned'} "${item.title}" to you and moved it to "${statusLabel}".`,
        link: `/work/${workType.key}/${item._id}`,
      });
    } else if (ownerChanged) {
      notifications.push({
        organization,
        user: toOwner,
        title: previousOwner ? 'Task reassigned to you' : 'New task assigned to you',
        message: `${actor.name} ${previousOwner ? 'reassigned' : 'assigned'} "${item.title}" to you.`,
        link: `/work/${workType.key}/${item._id}`,
      });
    } else {
      notifications.push({
        organization,
        user: toOwner,
        title: 'Status updated',
        message: `${actor.name} updated "${item.title}" to "${statusLabel}".`,
        link: `/work/${workType.key}/${item._id}`,
      });
    }
  }
  if (notifications.length) await Notification.create(notifications);
}

async function ensureMonthlyRecords(req) {
  const now = new Date();
  const month = monthKey(now);
  const activeWorkspace = String(req.activeCompanyId || req.activeCompany?._id);
  const base = { organization: req.user.organization._id, workspace: activeWorkspace, module: req.workType._id };
  const company = req.activeCompany || null;
  if (req.workType.key === 'payment') {
    // Upsert keyed on billingMonth so concurrent requests can't double-create.
    await CustomRecord.updateOne(
      { ...base, 'customFields.billingMonth': month },
      {
        $setOnInsert: {
          title: `${company?.name || 'Workspace'} · ${now.toLocaleString('en', { month: 'long', year: 'numeric' })}`,
          status: 'pending',
          deadline: new Date(now.getFullYear(), now.getMonth() + 1, 0),
customFields: { billingMonth: month, expectedAmount: company?.monthlyPackage || 0, paidAmount: 0 },
        createdBy: req.user._id,
      }
      },
      { upsert: true }
    ).catch(err => { if (err?.code !== 11000) throw err; });
  }
  if (req.workType.key !== 'task') return;
  const templates = await CustomRecord.find({
    ...base,
    'customFields.repeatMonthly': true,
    $or: [{ 'customFields.recurringSource': { $exists: false } }, { 'customFields.recurringSource': '' }],
  });
  for (const template of templates) {
    if (monthKey(template.createdAt) === month) continue;
    const day = Math.min(Number((template.customFields && template.customFields.get ? template.customFields.get('repeatDay') : null) || 1), new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
    const tf = template.customFields && template.customFields.toObject ? template.customFields.toObject() : {};
    // Upsert per template-month so concurrent GETs can't duplicate instances.
    await CustomRecord.updateOne(
      { ...base, 'customFields.recurringSource': String(template._id), 'customFields.recurringMonth': month },
      {
        $setOnInsert: {
          title: template.title,
          status: req.workType.statuses[0]?.key || 'pending',
          assignedTo: template.assignedTo,
          collaborators: template.collaborators || [],
          secondaryAssignee: template.secondaryAssignee,
          priority: template.priority,
          deadline: new Date(now.getFullYear(), now.getMonth(), day),
          notes: template.notes,
          customer: template.customer,
customFields: { ...Object.fromEntries(Object.entries(tf)), recurringSource: String(template._id), recurringMonth: month },
        createdBy: req.user._id,
      }
      },
      { upsert: true }
    ).catch(err => { if (err?.code !== 11000) throw err; });
  }
}

// GET /api/work — Work center overview
router.get('/', async (req, res, next) => {
  try {
    const activeWorkspace = workspace(req, res);
    if (!activeWorkspace) return;
    const organization = req.user.organization._id;

    const workTypes = (
      await WorkType.find({ organization, clientCompany: activeWorkspace, isActive: true }).sort({ order: 1, name: 1 })
    ).filter(type => hasWorkPermission(req.user, type, 'view'));

    const filter = restrictToAssigned(
      { organization, workspace: activeWorkspace, module: { $in: workTypes.map(t => t._id) } },
      req.user
    );

    const items = await CustomRecord.find(filter)
      .populate('workType assignedTo customer collaborators secondaryAssignee workflowHistory.actor workflowHistory.fromUser workflowHistory.toUser')
      .sort({ deadline: 1, createdAt: -1 })
      .lean();

    const now = new Date();
    const openItems = items.filter(item => !isClosed(item));
    const completedItems = items.filter(item => isComplete(item));
    const overdueItems = items.filter(item => !isClosed(item) && item.deadline && new Date(item.deadline) < now);

    const userLists = await Promise.all(workTypes.map(type => assignableWorkUsers(organization, activeWorkspace, type)));
    const users = [...new Map(userLists.flat().map(user => [String(user._id), user])).values()];
    res.json({
      ok: true,
      workTypes,
      items,
      users,
      counts: {
        open: openItems.length,
        completed: completedItems.length,
        overdue: overdueItems.length,
        total: items.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Middleware to look up work type by key
async function resolveWorkType(req, res, next) {
  try {
    const activeWorkspace = workspace(req, res);
    if (!activeWorkspace) return;
    const organization = req.user.organization._id;

    const workType = await WorkType.findOne({
      organization,
      clientCompany: activeWorkspace,
      key: req.params.type,
      isActive: true,
    });

    if (!workType) {
      return res.status(404).json({ ok: false, error: `Work area "${req.params.type}" not found.` });
    }

    if (!hasWorkPermission(req.user, workType, 'view')) {
      return res.status(403).json({ ok: false, error: 'Access denied to this work area.' });
    }

    req.workType = workType;
    next();
  } catch (error) {
    next(error);
  }
}

// GET /api/work/:type — Work list for specific work type
router.get('/:type', resolveWorkType, async (req, res, next) => {
  try {
    await ensureMonthlyRecords(req);
    const activeWorkspace = String(req.activeCompanyId);
    const organization = req.user.organization._id;
    const { status, assignedTo, priority, q, view = 'open', month = '', page = 1, pageSize = 100, collaborator, secondaryAssignee } = req.query;
    const presentation = req.workType.presentation || {};
    const calendarField = presentation.calendarField || 'deadline';

    const filter = {
      organization,
      workspace: activeWorkspace,
      module: req.workType._id,
    };

    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (secondaryAssignee) filter.secondaryAssignee = secondaryAssignee;
    if (collaborator) filter.collaborators = collaborator;
    if (q) {
      filter.$or = [
        { title: new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { notes: new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      ];
    }

    for (const [key, value] of Object.entries(req.query)) {
      if (!key.startsWith('cf_') || value === '' || value === undefined) continue;
      const fieldKey = key.slice(3);
      const field = (req.workType.fields || []).find(f => f.key === fieldKey);
      if (!field) continue;
      if (field.type === 'number') {
        const num = Number(value);
        filter[`customFields.${fieldKey}`] = Number.isFinite(num) ? num : { $exists: true };
      } else if (field.type === 'checkbox') {
        filter[`customFields.${fieldKey}`] = ['true', 'yes', '1', 'on'].includes(String(value).toLowerCase());
      } else {
        filter[`customFields.${fieldKey}`] = String(value);
      }
    }

    restrictToAssigned(filter, req.user);

    const now = new Date();
    if (view === 'today') {
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);
      filter.deadline = { $lt: endOfDay };
    } else if (view === 'overdue') {
      filter.deadline = { $lt: new Date() };
    }

    if (month && /^\d{4}-\d{2}$/.test(String(month))) {
      const [y, m] = String(month).split('-').map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end = new Date(Date.UTC(y, m, 1));
      const path = calendarField.startsWith('custom:')
        ? `customFields.${calendarField.slice(7)}`
        : calendarField;
      filter[path] = { $gte: start, $lt: end };
    }

    const skip = (Math.max(1, Number(page)) - 1) * Number(pageSize);
    const [items, total, users, customers, relatedItems] = await Promise.all([
      CustomRecord.find(filter)
        .populate('workType assignedTo customer collaborators secondaryAssignee parentRecord workflowHistory.actor workflowHistory.fromUser workflowHistory.toUser')
        .sort({ deadline: 1, createdAt: -1 })
        .skip(skip)
        .limit(Number(pageSize))
        .lean(),
      CustomRecord.countDocuments(filter),
      assignableWorkUsers(organization, activeWorkspace, req.workType),
      customersQuery(req.user, organization, activeWorkspace, 'name company email phone'),
      relatedItemsQuery(organization, activeWorkspace, req.workType, req.user),
    ]);

    res.json({
      ok: true,
      workType: req.workType,
      data: items,
      users,
      customers,
      relatedItems,
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(total / Number(pageSize)),
        totalResults: total,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/work/:type/:id — Single work item detail
router.get('/:type/:id', resolveWorkType, async (req, res, next) => {
  try {
    const activeWorkspace = String(req.activeCompanyId);
    const organization = req.user.organization._id;

    const filter = {
      _id: req.params.id,
      organization,
      workspace: activeWorkspace,
      module: req.workType._id,
    };
    restrictToAssigned(filter, req.user);

    const item = await CustomRecord.findOne(filter)
      .populate('workType assignedTo customer collaborators secondaryAssignee createdBy relatedRecords workflowHistory.actor workflowHistory.fromUser workflowHistory.toUser')
      .lean();

    if (!item) {
      return res.status(404).json({ ok: false, error: 'Record not found.' });
    }

    const [childSubtasks, auditLog, users, customers, relatedItems] = await Promise.all([
      CustomRecord.find({
        organization,
        workspace: activeWorkspace,
        parentRecord: item._id,
      })
        .populate('assignedTo')
        .sort({ createdAt: 1 })
        .lean(),
      AuditLog.find({
        organization,
        entityType: 'custom_record',
        entityId: item._id,
      })
        .populate('user')
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
      assignableWorkUsers(organization, activeWorkspace, req.workType),
      customersQuery(req.user, organization, activeWorkspace, 'name company email'),
      relatedItemsQuery(organization, activeWorkspace, req.workType, req.user),
    ]);

    const combinedSubtasks = (childSubtasks && childSubtasks.length > 0) ? childSubtasks : (item.subtasks || []);

    res.json({
      ok: true,
      workType: req.workType,
      data: item,
      subtasks: combinedSubtasks,
      auditLog,
      users,
      customers,
      relatedItems,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/work/:type — Create work item
router.post('/:type', resolveWorkType, async (req, res, next) => {
  try {
    if (!hasWorkPermission(req.user, req.workType, 'create')) {
      return res.status(403).json({ ok: false, error: 'Permission denied to create in this work area.' });
    }

    const activeWorkspace = String(req.activeCompanyId);
    const organization = req.user.organization._id;
    const body = req.body;

    const mayEditField = field => canEditWorkField(req.user, req.workType, field);

    const title = String(body.title || '').trim();
    if (!title) {
      return res.status(400).json({ ok: false, error: 'Title is required.' });
    }

    const status = (body.status && mayEditField('status')) ? body.status : (req.workType.statuses[0]?.key || 'pending');
    if (!req.workType.statuses.some(s => s.key === status)) return res.status(400).json({ ok: false, error: 'Invalid status.' });
    const priority = (body.priority && mayEditField('priority') && priorities.includes(body.priority)) ? body.priority : 'medium';
    const deadline = (body.deadline && mayEditField('deadline')) ? new Date(body.deadline) : null;
    const startDate = (body.startDate && mayEditField('startDate')) ? new Date(body.startDate) : null;
    const notes = (body.notes && mayEditField('notes')) ? String(body.notes).trim() : '';
    const customer = (body.customer && mayEditField('customer')) ? body.customer : null;
    const assignedTo = (body.assignedTo && mayEditField('assignedTo')) ? body.assignedTo : req.user._id;

    if (!(await assignableWorkUsers(organization, activeWorkspace, req.workType)).some(user => String(user._id) === String(assignedTo))) {
      return res.status(400).json({ ok: false, error: 'Choose an eligible team member.' });
    }

    const collaborators = (body.collaborators && mayEditField('collaborators')) ? ids(body.collaborators) : [];
    const secondaryAssignee = (body.secondaryAssignee && mayEditField('secondaryAssignee')) ? body.secondaryAssignee : null;
    const relatedRecords = (body.relatedRecords && mayEditField('relatedRecords') && Array.isArray(body.relatedRecords)) ? body.relatedRecords : [];

    const customFields = {};
    if (body.customFields && typeof body.customFields === 'object') {
      for (const [k, v] of Object.entries(body.customFields)) {
        if (mayEditField(k)) customFields[k] = v;
      }
    }

    const item = await CustomRecord.create({
      organization,
      workspace: activeWorkspace,
      module: req.workType._id,
      title,
      status,
      priority,
      deadline,
      startDate,
      notes,
      customer,
      assignedTo,
      collaborators,
      secondaryAssignee,
      relatedRecords,
      workflowHistory: [{ event: 'created', actor: req.user._id, toUser: assignedTo, toStatus: status, note: 'Task created.' }],
      customFields,
      createdBy: req.user._id,
    });

    await logAudit(req, {
      action: 'create',
      entityType: 'custom_record',
      entityId: item._id,
      entityName: item.title,
      message: `Work item "${item.title}" created in ${req.workType.name}.`,
    });

    await runRecordAutomation({ record: item, workType: req.workType, trigger: 'record_created' });

    const populated = await CustomRecord.findById(item._id)
      .populate('workType assignedTo customer collaborators relatedRecords')
      .lean();

    res.json({ ok: true, data: populated });
  } catch (error) {
    next(error);
  }
});

// PUT /api/work/:type/:id — Update work item
router.put('/:type/:id', resolveWorkType, async (req, res, next) => {
  try {
    if (!hasWorkPermission(req.user, req.workType, 'update')) {
      return res.status(403).json({ ok: false, error: 'Permission denied to update in this work area.' });
    }

    const activeWorkspace = String(req.activeCompanyId);
    const organization = req.user.organization._id;
    const body = req.body;

    const item = await CustomRecord.findOne(restrictToAssigned({
      _id: req.params.id,
      organization,
      workspace: activeWorkspace,
      module: req.workType._id,
    }, req.user));

    if (!item) {
      return res.status(404).json({ ok: false, error: 'Record not found.' });
    }

    if (body.status !== undefined && !req.workType.statuses.some(s => s.key === body.status)) return res.status(400).json({ ok: false, error: 'Invalid status.' });
    const previousStatus = item.status;
    const previousOwner = item.assignedTo ? String(item.assignedTo) : null;

    // Enforce field-level work permissions: specialist and custom roles may only
    // update the fields their role allows, even on direct API calls. Admin and
    // manager are unrestricted. Unauthorized fields in the body are dropped so
    // legitimate partial updates from the UI are never blocked.
    const mayEditField = field => canEditWorkField(req.user, req.workType, field);

    if (body.title !== undefined && mayEditField('title')) item.title = String(body.title).trim();
    if (body.status !== undefined && canChangeWorkStatus(req.user, req.workType, previousStatus)) {
      item.status = body.status;
      if (previousStatus !== body.status) {
        const definition = req.workType.statuses.find(s => s.key === body.status);
        item.workflowHistory.push({ event: definition?.isTerminalLost ? 'rejected' : definition?.isTerminalWon ? 'completed' : 'status', actor: req.user._id, fromStatus: previousStatus, toStatus: body.status, note: String(body.statusNote || '').trim().slice(0, 500) });
      }
    }
    if (body.priority !== undefined && mayEditField('priority') && priorities.includes(body.priority)) item.priority = body.priority;
    if (body.deadline !== undefined && mayEditField('deadline')) item.deadline = body.deadline ? new Date(body.deadline) : null;
    if (body.startDate !== undefined && mayEditField('startDate')) item.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.deliveredAt !== undefined && mayEditField('deliveredAt')) item.deliveredAt = body.deliveredAt ? new Date(body.deliveredAt) : null;
    if (body.notes !== undefined && mayEditField('notes')) item.notes = String(body.notes).trim();
    if (body.customer !== undefined && mayEditField('customer')) item.customer = body.customer || null;
    if (body.assignedTo !== undefined && mayEditField('assignedTo')) {
      const nextOwner = body.assignedTo || null;
      if (String(previousOwner || '') !== String(nextOwner || '')) item.workflowHistory.push({ event: previousOwner ? 'forwarded' : 'assigned', actor: req.user._id, fromUser: previousOwner, toUser: nextOwner, note: String(body.assignmentNote || '').trim().slice(0, 500) });
      item.assignedTo = nextOwner;
    }
    if (body.collaborators !== undefined && mayEditField('collaborators')) item.collaborators = ids(body.collaborators);
    if (body.secondaryAssignee !== undefined && mayEditField('secondaryAssignee')) item.secondaryAssignee = body.secondaryAssignee || null;
    if (body.relatedRecords !== undefined && mayEditField('relatedRecords')) item.relatedRecords = Array.isArray(body.relatedRecords) ? body.relatedRecords : [];

    if (body.customFields && typeof body.customFields === 'object') {
      for (const [k, v] of Object.entries(body.customFields)) {
        if (mayEditField(k)) item.customFields.set(k, v);
      }
    }

    if (req.workType.statuses.some(s => s.key === item.status && s.isTerminalWon) && !item.deliveredAt) {
      item.deliveredAt = new Date();
    }

    if (body.status !== undefined && previousStatus !== body.status) {
      const proofRequired = completionError(item, req.workType);
      if (proofRequired) return res.status(400).json({ ok: false, error: proofRequired });
    }
    bumpRevisionIfReturnedToWork(item, req.workType, previousStatus);

    await item.save();

    if (String(previousStatus || '') !== String(item.status || '')) {
      await runRecordAutomation({ record: item, workType: req.workType, trigger: 'status_changed', previousStatus });
    }
    if (String(previousOwner || '') !== String(item.assignedTo || '')) {
      await runRecordAutomation({ record: item, workType: req.workType, trigger: 'owner_changed', previousOwner });
    }

    await notifyWorkChanges({ organization, actor: req.user, item, workType: req.workType, previousOwner, previousStatus });

    await logAudit(req, {
      action: 'update',
      entityType: 'custom_record',
      entityId: item._id,
      entityName: item.title,
      message: `Work item "${item.title}" updated.`,
    });

    const populated = await CustomRecord.findById(item._id)
      .populate('workType assignedTo customer collaborators secondaryAssignee relatedRecords')
      .lean();

    res.json({ ok: true, data: populated });
  } catch (error) {
    next(error);
  }
});

// POST /api/work/:type/:id/status — Quick status change
router.post('/:type/:id/status', resolveWorkType, async (req, res, next) => {
  try {
    if (!hasWorkPermission(req.user, req.workType, 'update')) {
      return res.status(403).json({ ok: false, error: 'Permission denied.' });
    }

    const activeWorkspace = String(req.activeCompanyId);
    const organization = req.user.organization._id;
    const { status } = req.body;

    const item = await CustomRecord.findOne(restrictToAssigned({
      _id: req.params.id,
      organization,
      workspace: activeWorkspace,
      module: req.workType._id,
    }, req.user));

    if (!item) {
      return res.status(404).json({ ok: false, error: 'Record not found.' });
    }

    if (!canChangeWorkStatus(req.user, req.workType, item.status)) {
      return res.status(403).json({ ok: false, error: 'This item is locked for review — only a manager can change its status.' });
    }

    if (!req.workType.statuses.some(s => s.key === status)) return res.status(400).json({ ok: false, error: 'Invalid status.' });
    const previousStatus = item.status;
    const previousOwner = item.assignedTo ? String(item.assignedTo) : null;
    item.status = status;
    if (previousStatus !== status) {
      const definition = req.workType.statuses.find(s => s.key === status);
      item.workflowHistory.push({ event: definition?.isTerminalLost ? 'rejected' : definition?.isTerminalWon ? 'completed' : 'status', actor: req.user._id, fromStatus: previousStatus, toStatus: status, note: String(req.body.note || '').trim().slice(0, 500) });
    }
    if (req.workType.statuses.some(s => s.key === item.status && s.isTerminalWon) && !item.deliveredAt) {
      item.deliveredAt = new Date();
    }
    if (String(previousStatus || '') !== String(item.status || '')) {
      const proofRequired = completionError(item, req.workType);
      if (proofRequired) return res.status(400).json({ ok: false, error: proofRequired });
      bumpRevisionIfReturnedToWork(item, req.workType, previousStatus);
    }
    await item.save();

    if (String(previousStatus || '') !== String(item.status || '')) {
      await runRecordAutomation({ record: item, workType: req.workType, trigger: 'status_changed', previousStatus });
    }

    await notifyWorkChanges({ organization, actor: req.user, item, workType: req.workType, previousOwner, previousStatus });

    await logAudit(req, {
      action: 'status_change',
      entityType: 'custom_record',
      entityId: item._id,
      message: `Status updated to ${status}.`,
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/work/:type/:id/delegate — forward work while preserving its lifecycle.
router.post('/:type/:id/delegate', resolveWorkType, async (req, res, next) => {
  try {
    if (!hasWorkPermission(req.user, req.workType, 'update')) return res.status(403).json({ ok: false, error: 'Permission denied.' });
    if (!canEditWorkField(req.user, req.workType, 'assignedTo')) return res.status(403).json({ ok: false, error: 'Your role does not allow reassigning this work item.' });
    const organization = req.user.organization._id;
    const workspace = String(req.activeCompanyId);
    const item = await CustomRecord.findOne(restrictToAssigned({ _id: req.params.id, organization, workspace, module: req.workType._id }, req.user));
    if (!item) return res.status(404).json({ ok: false, error: 'Record not found.' });
    const assignee = (await assignableWorkUsers(organization, workspace, req.workType)).find(user => String(user._id) === String(req.body.toUser || ''));
    if (!assignee) return res.status(400).json({ ok: false, error: 'Choose an eligible team member.' });
    const fromUser = item.assignedTo || null;
    if (String(fromUser || '') === String(assignee._id)) return res.status(400).json({ ok: false, error: 'This task is already assigned to that person.' });
    const fromStatus = item.status;
    const nextStatus = req.body.status || fromStatus;
    if (!req.workType.statuses.some(status => status.key === nextStatus)) return res.status(400).json({ ok: false, error: 'Invalid status.' });
    item.assignedTo = assignee._id;
    item.status = nextStatus;
    item.workflowHistory.push({ event: fromUser ? 'forwarded' : 'assigned', actor: req.user._id, fromUser, toUser: assignee._id, fromStatus, toStatus: nextStatus, note: String(req.body.note || '').trim().slice(0, 500) });
    if (fromUser && !item.collaborators.some(user => String(user) === String(fromUser))) item.collaborators.push(fromUser);
    await item.save();
    await Promise.all([
      Notification.create({ organization, user: assignee._id, title: 'Task forwarded to you', message: `${req.user.name} forwarded "${item.title}" to you.`, link: `/work/${req.workType.key}/${item._id}` }),
      logAudit(req, { action: 'work_forward', entityType: 'custom_record', entityId: item._id, entityName: item.title, message: `${req.user.name} forwarded "${item.title}" to ${assignee.name}.` }),
      runRecordAutomation({ record: item, workType: req.workType, trigger: 'owner_changed', previousOwner: fromUser })
    ]);
    res.json({ ok: true, data: await CustomRecord.findById(item._id).populate('workType assignedTo collaborators workflowHistory.actor workflowHistory.fromUser workflowHistory.toUser').lean() });
  } catch (error) { next(error); }
});

// POST /api/work/:type/bulk — create one task per non-empty line.
router.post('/:type/bulk', resolveWorkType, async (req, res, next) => {
  try {
    if (!hasWorkPermission(req.user, req.workType, 'create')) return res.status(403).json({ ok: false, error: 'Permission denied.' });
    const titles = (Array.isArray(req.body.titles) ? req.body.titles : String(req.body.titles || '').split(/\r?\n/)).map(title => String(title).trim()).filter(Boolean).slice(0, 100);
    if (!titles.length) return res.status(400).json({ ok: false, error: 'Enter at least one task.' });
    const organization = req.user.organization._id;
    const workspace = String(req.activeCompanyId);
    const status = req.body.status || req.workType.statuses[0]?.key;
    if (!req.workType.statuses.some(item => item.key === status)) return res.status(400).json({ ok: false, error: 'Invalid status.' });
    const assignedTo = req.body.assignedTo || req.user._id;
    if (!(await assignableWorkUsers(organization, workspace, req.workType)).some(user => String(user._id) === String(assignedTo))) return res.status(400).json({ ok: false, error: 'Choose an eligible team member.' });
    const deadline = req.body.deadline ? new Date(req.body.deadline) : null;
    if (deadline && Number.isNaN(deadline.getTime())) return res.status(400).json({ ok: false, error: 'Choose a valid deadline.' });
    const records = await CustomRecord.create(titles.map(title => ({ organization, workspace, module: req.workType._id, title, status, assignedTo, priority: priorities.includes(req.body.priority) ? req.body.priority : 'medium', deadline, createdBy: req.user._id, workflowHistory: [{ event: 'created', actor: req.user._id, toUser: assignedTo, toStatus: status, note: `Created in a batch of ${titles.length} tasks.` }] })));
    if (String(assignedTo) !== String(req.user._id)) await Notification.create({ organization, user: assignedTo, title: `${titles.length} new tasks assigned`, message: `${req.user.name} assigned ${titles.length} tasks to you.`, link: `/work/${req.workType.key}` });
    await logAudit(req, { action: 'work_bulk_create', entityType: 'custom_record', entityName: req.workType.name, message: `Created ${records.length} tasks.` });
    res.status(201).json({ ok: true, created: records.length });
  } catch (error) { next(error); }
});

// DELETE /api/work/:type/:id — Delete work item
router.delete('/:type/:id', resolveWorkType, async (req, res, next) => {
  try {
    if (!hasWorkPermission(req.user, req.workType, 'delete')) {
      return res.status(403).json({ ok: false, error: 'Permission denied to delete in this work area.' });
    }

    const activeWorkspace = String(req.activeCompanyId);
    const organization = req.user.organization._id;

    const item = await CustomRecord.findOne(restrictToAssigned({
      _id: req.params.id,
      organization,
      workspace: activeWorkspace,
      module: req.workType._id,
    }, req.user));

    if (!item) {
      return res.status(404).json({ ok: false, error: 'Record not found.' });
    }

    // Subtasks are separate documents linked via parentRecord — delete them
    // together with the parent so they don't become orphaned.
    await CustomRecord.deleteMany({ organization, $or: [{ _id: item._id }, { parentRecord: item._id }] });

    await logAudit(req, {
      action: 'delete',
      entityType: 'custom_record',
      entityId: req.params.id,
      entityName: item.title,
      message: `Work item "${item.title}" deleted from ${req.workType.name}.`,
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// Subtasks use the same child-record model as EJS, not an embedded array.
router.post('/:type/:id/subtasks', resolveWorkType, async (req, res, next) => {
  try {
    if (!hasWorkPermission(req.user, req.workType, 'create')) return res.status(403).json({ ok: false, error: 'Permission denied.' });
    const organization = req.user.organization._id;
    const workspace = req.activeCompanyId;
    const parent = await CustomRecord.findOne(restrictToAssigned({ _id: req.params.id, organization, workspace, module: req.workType._id, parentRecord: null }, req.user));
    if (!parent) return res.status(404).json({ ok: false, error: 'Parent task not found.' });
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ ok: false, error: 'Subtask title is required.' });
    const assignedTo = isRestrictedUser(req.user) ? req.user._id : (req.body.assignedTo || null);
    if (assignedTo) {
      const eligible = await assignableWorkUsers(organization, workspace, req.workType);
      if (!mongoose.isObjectIdOrHexString(assignedTo) || !eligible.some(user => String(user._id) === String(assignedTo))) return res.status(400).json({ ok: false, error: 'Choose an eligible team member.' });
    }
    const deadline = req.body.deadline ? new Date(req.body.deadline) : null;
    if (deadline && Number.isNaN(deadline.getTime())) return res.status(400).json({ ok: false, error: 'Choose a valid subtask deadline.' });
    const subtask = await CustomRecord.create({ organization, workspace, module: req.workType._id, parentRecord: parent._id, title, assignedTo, deadline, customer: parent.customer, status: req.workType.statuses[0].key, priority: priorities.includes(req.body.priority) ? req.body.priority : 'medium', createdBy: req.user._id });
    if (assignedTo && ![parent.assignedTo, parent.secondaryAssignee, ...(parent.collaborators || [])].some(id => String(id) === String(assignedTo))) {
      parent.collaborators.push(assignedTo);
      await parent.save();
    }
    await logAudit(req, { action: 'work_subtask_create', entityType: 'custom_record', entityId: parent._id, entityName: parent.title, message: 'Added subtask "' + subtask.title + '".', metadata: { subtaskId: subtask._id } });
    if (assignedTo && String(assignedTo) !== String(req.user._id)) await Notification.create({ organization, user: assignedTo, title: 'New Subtask Assigned', message: subtask.title + ' was assigned under ' + parent.title, link: '/work/' + req.workType.key + '/' + subtask._id });
    await subtask.populate('assignedTo');
    res.json({ ok: true, data: subtask });
  } catch (error) { next(error); }
});

// POST /api/work/:type/import — Bulk CSV import
router.post('/:type/import', resolveWorkType, async (req, res, next) => {
  try {
    if (!hasWorkPermission(req.user, req.workType, 'create')) {
      return res.status(403).json({ ok: false, error: 'Permission denied to create in this work area.' });
    }

    const activeWorkspace = String(req.activeCompanyId);
    const organization = req.user.organization._id;
    const { csvText, rows: inputRows } = req.body;

    let rows = inputRows;
    if (!rows && csvText) {
      rows = rowsToObjects(parseCsv(csvText));
    }

    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ ok: false, error: 'No valid rows provided for import.' });
    }

    let created = 0;
    let skipped = 0;
    const defaultStatus = req.workType.statuses[0]?.key || 'pending';
    const eligible = await assignableWorkUsers(organization, activeWorkspace, req.workType);

    for (const row of rows) {
      const title = String(row.title || row.name || '').trim();
      if (!title) {
        skipped += 1;
        continue;
      }

      const status = row.status && req.workType.statuses.some(s => s.key === row.status)
        ? row.status
        : defaultStatus;

      const priority = priorities.includes(row.priority) ? row.priority : 'medium';
      const deadline = row.deadline ? new Date(row.deadline) : null;
      const notes = row.notes || '';

      let assignedTo = null;
      const rawOwner = row.assignedTo || row.assigned_to || row.owner || row.assignee;
      if (isRestrictedUser(req.user)) {
        assignedTo = req.user._id;
      } else if (rawOwner) {
        const match = eligible.find(u => String(u._id) === String(rawOwner) || (u.email && u.email.toLowerCase() === String(rawOwner).toLowerCase()) || (u.name && u.name.toLowerCase() === String(rawOwner).toLowerCase()));
        if (match) assignedTo = match._id;
      }

      const customFields = {};
      (req.workType.fields || []).forEach(f => {
        const val = row[f.key] ?? row[f.label] ?? row[`custom_${f.key}`];
        if (val !== undefined && val !== '') {
          if (f.type === 'number') {
            const num = Number(val);
            customFields[f.key] = Number.isFinite(num) ? num : null;
          } else if (f.type === 'checkbox') {
            customFields[f.key] = ['true', 'yes', '1', 'on'].includes(String(val).toLowerCase());
          } else if (f.type === 'date') {
            const d = new Date(val);
            customFields[f.key] = Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
          } else {
            customFields[f.key] = val;
          }
        }
      });

      const item = await CustomRecord.create({
        organization,
        workspace: activeWorkspace,
        module: req.workType._id,
        title,
        status,
        priority,
        deadline,
        assignedTo,
        notes,
        customFields,
        createdBy: req.user._id,
      });

      await runRecordAutomation({ record: item, workType: req.workType, trigger: 'record_created' });

      created += 1;
    }

    await logAudit(req, {
      action: 'work_import',
      entityType: 'custom_record',
      entityName: req.workType.name,
      message: `Imported ${created} ${req.workType.name} records from CSV (skipped ${skipped}).`,
    });

    res.json({ ok: true, created, skipped });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
