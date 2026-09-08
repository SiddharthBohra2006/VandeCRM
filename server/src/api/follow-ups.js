const express = require('express');
const { requireApiAuth } = require('./middleware/auth');
const { isRestrictedUser } = require('../config/roles');
const { logAudit } = require('../utils/audit');
const Activity = require('../models/Activity');
const Customer = require('../models/Customer');
const Notification = require('../models/Notification');

const router = express.Router();
router.use(requireApiAuth);
const apiPermission = require('./middleware/permission');
router.use(apiPermission('tasks.view'));
router.use((req, res, next) => ['GET', 'HEAD'].includes(req.method) ? next() : apiPermission('tasks.update')(req, res, next));

function workspace(req, res) {
  if (req.activeCompanyId) return String(req.activeCompanyId);
  res.status(400).json({ ok: false, error: 'Select an active CRM workspace first.' });
  return null;
}

function buildCustomerFilter(req, activeWorkspace, scheduledOnly = true) {
  const organization = req.user.organization._id;
  const filter = {
    organization,
    clientCompany: activeWorkspace,
  };
  if (scheduledOnly) filter.nextFollowUpAt = { $ne: null };
  if (isRestrictedUser(req.user)) filter.assignedTo = req.user._id;
  return filter;
}

// GET /api/follow-ups — List follow-ups
router.get('/', async (req, res, next) => {
  try {
    const activeWorkspace = workspace(req, res);
    if (!activeWorkspace) return;
    const organization = req.user.organization._id;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const nextSevenDays = new Date(now);
    nextSevenDays.setDate(nextSevenDays.getDate() + 7);
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));

    const view = req.query.filter || req.query.view || 'due';
    const filter = buildCustomerFilter(req, activeWorkspace);

    if (view === 'today') {
      filter.nextFollowUpAt = { $gte: startOfToday, $lt: startOfTomorrow };
    } else if (view === 'upcoming') {
      filter.nextFollowUpAt = { $gte: startOfTomorrow, $lte: nextSevenDays };
    } else if (view === 'all' || view === 'all-scheduled') {
      filter.nextFollowUpAt = { $ne: null };
    } else if (view === 'overdue' || view === 'due') {
      filter.nextFollowUpAt = { $lte: now };
    } else if (view === 'completed') {
      filter._id = { $in: [] };
    } else {
      // Default: due/overdue
      filter.nextFollowUpAt = { $lte: now };
    }

    const accessFilter = buildCustomerFilter(req, activeWorkspace, false);
    const scheduledFilter = buildCustomerFilter(req, activeWorkspace);
    const accessibleCustomers = await Customer.find(accessFilter).select('_id').lean();
    const customerIds = accessibleCustomers.map(c => c._id);
    const completedFilter = {
      organization,
      customer: { $in: customerIds },
      type: 'task',
      $or: [{ followUpAction: 'completed' }, { note: /^Follow-up completed/ }],
      createdAt: { $gte: startOfWeek },
    };

    const [followUps, allFollowups, completedActivities, completedCount] = await Promise.all([
      Customer.find(filter)
        .populate('stage assignedTo clientCompany campaign')
        .sort({ nextFollowUpAt: 1 })
        .lean(),
      Customer.find(scheduledFilter).select('nextFollowUpAt').lean(),
      Activity.find(completedFilter)
        .populate('customer user')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      Activity.countDocuments(completedFilter),
    ]);

    const stats = {
      due: allFollowups.filter(c => c.nextFollowUpAt && new Date(c.nextFollowUpAt) <= now).length,
      today: allFollowups.filter(
        c => c.nextFollowUpAt && new Date(c.nextFollowUpAt) >= startOfToday && new Date(c.nextFollowUpAt) < startOfTomorrow
      ).length,
      upcoming: allFollowups.filter(c => c.nextFollowUpAt && new Date(c.nextFollowUpAt) >= startOfTomorrow && new Date(c.nextFollowUpAt) <= nextSevenDays).length,
      overdue: allFollowups.filter(c => c.nextFollowUpAt && new Date(c.nextFollowUpAt) < startOfToday).length,
      completed: completedCount,
      all: allFollowups.length,
    };

    res.json({
      ok: true,
      followUps,
      completedFollowUps: completedActivities,
      stats,
      view,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/follow-ups/:id/complete — Mark follow-up as complete
router.post('/:id/complete', async (req, res, next) => {
  try {
    const activeWorkspace = workspace(req, res);
    if (!activeWorkspace) return;
    const organization = req.user.organization._id;

    const filter = { _id: req.params.id, organization, clientCompany: activeWorkspace };
    if (isRestrictedUser(req.user)) filter.assignedTo = req.user._id;

    const customer = await Customer.findOne(filter);
    if (!customer) {
      return res.status(404).json({ ok: false, error: 'Follow-up or customer not found.' });
    }

    const completedAt = customer.nextFollowUpAt;
    const comment = String(req.body.comment || '').trim().slice(0, 1000);
    if (!comment) {
      return res.status(400).json({ ok: false, error: 'Add a comment before completing the follow-up.' });
    }
    customer.nextFollowUpAt = null;
    customer.lastContactedAt = new Date();
    await customer.save();

    await Activity.create({
      organization,
      customer: customer._id,
      user: req.user._id,
      type: 'task',
      note: `Follow-up completed${completedAt ? ` for ${completedAt.toLocaleString('en-IN')}` : ''}.`,
      nextFollowUpAt: completedAt,
      followUpAction: 'completed',
      comment,
    });

    await logAudit(req, {
      action: 'task_complete',
      entityType: 'customer',
      entityId: customer._id,
      entityName: customer.name,
      message: `Follow-up completed for "${customer.name}".`,
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/follow-ups/:id/reschedule — Reschedule follow-up
router.post('/:id/reschedule', async (req, res, next) => {
  try {
    const activeWorkspace = workspace(req, res);
    if (!activeWorkspace) return;
    const organization = req.user.organization._id;

    const filter = { _id: req.params.id, organization, clientCompany: activeWorkspace };
    if (isRestrictedUser(req.user)) filter.assignedTo = req.user._id;

    const customer = await Customer.findOne(filter).populate('assignedTo');
    if (!customer) {
      return res.status(404).json({ ok: false, error: 'Follow-up or customer not found.' });
    }

    const nextFollowUpAt = req.body.nextFollowUpAt ? new Date(req.body.nextFollowUpAt) : null;
    const comment = String(req.body.comment || '').trim().slice(0, 1000);

    if (!nextFollowUpAt || Number.isNaN(nextFollowUpAt.getTime())) {
      return res.status(400).json({ ok: false, error: 'Please choose a valid follow-up date and time.' });
    }
    if (!comment) {
      return res.status(400).json({ ok: false, error: 'Add a comment explaining the schedule change.' });
    }

    customer.nextFollowUpAt = nextFollowUpAt;
    await customer.save();

    await Activity.create({
      organization,
      customer: customer._id,
      user: req.user._id,
      type: 'task',
      note: `Follow-up scheduled for ${nextFollowUpAt.toLocaleString('en-IN')}.`,
      nextFollowUpAt,
      followUpAction: 'scheduled',
      comment,
    });

    await logAudit(req, {
      action: 'task_reschedule',
      entityType: 'customer',
      entityId: customer._id,
      entityName: customer.name,
      message: `Follow-up rescheduled for "${customer.name}".`,
      metadata: { nextFollowUpAt },
    });

    if (customer.assignedTo && String(customer.assignedTo._id) !== String(req.user._id)) {
      await Notification.create({
        organization,
        user: customer.assignedTo._id,
        title: 'Follow-up Rescheduled',
        message: `Follow-up for "${customer.name}" is now scheduled for ${nextFollowUpAt.toLocaleString('en-IN')}.`,
        link: `/customers/${customer._id}`,
      });
    }

    res.json({ ok: true, nextFollowUpAt });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
