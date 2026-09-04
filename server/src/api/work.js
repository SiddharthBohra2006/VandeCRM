const express = require('express');
const mongoose = require('mongoose');
const { requireApiAuth } = require('./middleware/auth');
const { hasWorkPermission, isRestrictedUser } = require('../config/roles');
const { isClosed, isComplete } = require('../utils/workCompletion');
const { assignableWorkUsers } = require('../utils/workAssignments');
const { logAudit } = require('../utils/audit');
const { parseCsv, rowsToObjects } = require('../utils/csv');
const CustomRecord = require('../models/CustomRecord');
const WorkType = require('../models/WorkType');
const Customer = require('../models/Customer');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

const router = express.Router();
router.use(requireApiAuth);

const priorities = ['low', 'medium', 'high'];
const ids = value => [...new Set((Array.isArray(value) ? value : value ? [value] : []).filter(Boolean))];

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
      .populate('workType assignedTo customer')
      .sort({ deadline: 1, createdAt: -1 })
      .lean();

    const now = new Date();
    const openItems = items.filter(item => !isClosed(item));
    const completedItems = items.filter(item => isComplete(item));
    const overdueItems = items.filter(item => !isClosed(item) && item.deadline && new Date(item.deadline) < now);

    res.json({
      ok: true,
      workTypes,
      items,
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
    const activeWorkspace = String(req.activeCompanyId);
    const organization = req.user.organization._id;
    const { status, assignedTo, priority, q, view = 'open', month = '', page = 1, pageSize = 100 } = req.query;
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
    if (q) {
      filter.$or = [
        { title: new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { notes: new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      ];
    }

    restrictToAssigned(filter, req.user);

    const now = new Date();
    if (view === 'today') {
      const startOfDay = new Date(now.setHours(0, 0, 0, 0));
      const endOfDay = new Date(now.setHours(23, 59, 59, 999));
      filter.deadline = { $gte: startOfDay, $lte: endOfDay };
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
        .populate('workType assignedTo customer collaborators secondaryAssignee parentRecord')
        .sort({ deadline: 1, createdAt: -1 })
        .skip(skip)
        .limit(Number(pageSize))
        .lean(),
      CustomRecord.countDocuments(filter),
      assignableWorkUsers(organization, activeWorkspace, req.workType),
      Customer.find({ organization, clientCompany: activeWorkspace }).select('name company email phone').sort({ name: 1 }).lean(),
      CustomRecord.find({ organization, workspace: activeWorkspace, module: { $ne: req.workType._id } })
        .select('title module workType')
        .populate('workType')
        .limit(50)
        .lean(),
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
      .populate('workType assignedTo customer collaborators secondaryAssignee subtasks.assignedTo createdBy')
      .lean();

    if (!item) {
      return res.status(404).json({ ok: false, error: 'Record not found.' });
    }

    const [childSubtasks, auditLog, users, customers] = await Promise.all([
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
      Customer.find({ organization, clientCompany: activeWorkspace }).select('name company email').sort({ name: 1 }).lean(),
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

    const title = String(body.title || '').trim();
    if (!title) {
      return res.status(400).json({ ok: false, error: 'Title is required.' });
    }

    const status = body.status || req.workType.statuses[0]?.key || 'pending';
    const priority = priorities.includes(body.priority) ? body.priority : 'medium';
    const deadline = body.deadline ? new Date(body.deadline) : null;
    const startDate = body.startDate ? new Date(body.startDate) : null;

    const customFields = body.customFields || {};

    const item = await CustomRecord.create({
      organization,
      workspace: activeWorkspace,
      module: req.workType._id,
      title,
      status,
      priority,
      deadline,
      startDate,
      notes: String(body.notes || '').trim(),
      customer: body.customer || null,
      assignedTo: body.assignedTo || req.user._id,
      collaborators: ids(body.collaborators),
      secondaryAssignee: body.secondaryAssignee || null,
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

    const populated = await CustomRecord.findById(item._id)
      .populate('workType assignedTo customer collaborators')
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

    const item = await CustomRecord.findOne({
      _id: req.params.id,
      organization,
      workspace: activeWorkspace,
      module: req.workType._id,
    });

    if (!item) {
      return res.status(404).json({ ok: false, error: 'Record not found.' });
    }

    if (body.title !== undefined) item.title = String(body.title).trim();
    if (body.status !== undefined) item.status = body.status;
    if (body.priority !== undefined && priorities.includes(body.priority)) item.priority = body.priority;
    if (body.deadline !== undefined) item.deadline = body.deadline ? new Date(body.deadline) : null;
    if (body.startDate !== undefined) item.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.notes !== undefined) item.notes = String(body.notes).trim();
    if (body.customer !== undefined) item.customer = body.customer || null;
    if (body.assignedTo !== undefined) item.assignedTo = body.assignedTo || null;
    if (body.collaborators !== undefined) item.collaborators = ids(body.collaborators);
    if (body.secondaryAssignee !== undefined) item.secondaryAssignee = body.secondaryAssignee || null;

    if (body.customFields && typeof body.customFields === 'object') {
      for (const [k, v] of Object.entries(body.customFields)) {
        item.customFields.set(k, v);
      }
    }

    if (isComplete(item) && !item.deliveredAt) {
      item.deliveredAt = new Date();
    }

    await item.save();

    await logAudit(req, {
      action: 'update',
      entityType: 'custom_record',
      entityId: item._id,
      entityName: item.title,
      message: `Work item "${item.title}" updated.`,
    });

    const populated = await CustomRecord.findById(item._id)
      .populate('workType assignedTo customer collaborators secondaryAssignee')
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

    const item = await CustomRecord.findOne({
      _id: req.params.id,
      organization,
      workspace: activeWorkspace,
      module: req.workType._id,
    });

    if (!item) {
      return res.status(404).json({ ok: false, error: 'Record not found.' });
    }

    item.status = status;
    if (isComplete(item) && !item.deliveredAt) {
      item.deliveredAt = new Date();
    }
    await item.save();

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

// DELETE /api/work/:type/:id — Delete work item
router.delete('/:type/:id', resolveWorkType, async (req, res, next) => {
  try {
    if (!hasWorkPermission(req.user, req.workType, 'delete')) {
      return res.status(403).json({ ok: false, error: 'Permission denied to delete in this work area.' });
    }

    const activeWorkspace = String(req.activeCompanyId);
    const organization = req.user.organization._id;

    const item = await CustomRecord.findOne({
      _id: req.params.id,
      organization,
      workspace: activeWorkspace,
      module: req.workType._id,
    });

    if (!item) {
      return res.status(404).json({ ok: false, error: 'Record not found.' });
    }

    await CustomRecord.deleteOne({ _id: item._id, organization });

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

// POST /api/work/:type/:id/subtasks — Add subtask
router.post('/:type/:id/subtasks', resolveWorkType, async (req, res, next) => {
  try {
    const activeWorkspace = String(req.activeCompanyId);
    const organization = req.user.organization._id;
    const { title, assignedTo, deadline, status, priority } = req.body;

    if (!String(title || '').trim()) {
      return res.status(400).json({ ok: false, error: 'Subtask title is required.' });
    }

    const item = await CustomRecord.findOne({
      _id: req.params.id,
      organization,
      workspace: activeWorkspace,
      module: req.workType._id,
    });

    if (!item) {
      return res.status(404).json({ ok: false, error: 'Record not found.' });
    }

    const subtask = {
      title: String(title).trim(),
      assignedTo: assignedTo || null,
      deadline: deadline ? new Date(deadline) : null,
      status: status || 'pending',
      priority: priorities.includes(priority) ? priority : 'medium',
      createdAt: new Date(),
    };

    item.subtasks.push(subtask);
    await item.save();

    res.json({ ok: true, data: item.subtasks[item.subtasks.length - 1] });
  } catch (error) {
    next(error);
  }
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

      const customFields = {};
      (req.workType.fields || []).forEach(f => {
        const val = row[f.key] ?? row[f.label] ?? row[`custom_${f.key}`];
        if (val !== undefined && val !== '') {
          customFields[f.key] = val;
        }
      });

      await CustomRecord.create({
        organization,
        workspace: activeWorkspace,
        module: req.workType._id,
        title,
        status,
        priority,
        deadline,
        notes,
        customFields,
        createdBy: req.user._id,
      });

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
