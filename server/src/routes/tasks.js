const express = require('express');

const Activity = require('../models/Activity');
const Customer = require('../models/Customer');
const Notification = require('../models/Notification');
const { requirePermission } = require('../middleware/auth');
const { isRestrictedUser } = require('../config/roles');
const { logAudit } = require('../utils/audit');

const router = express.Router();

router.use(requirePermission('tasks.view'));

function buildCustomerFilter(req) {
  const organization = req.user.organization._id;
  const filter = { organization, clientCompany: req.activeCompany._id, nextFollowUpAt: { $ne: null } };
  if (isRestrictedUser(req.user)) filter.assignedTo = req.user._id;
  return filter;
}

router.get('/', async (req, res, next) => {
  try {
    const now = new Date();
    const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const endOfWeek = new Date(now);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const { view = 'due' } = req.query;
    const filter = buildCustomerFilter(req);

    if (view === 'today') {
      filter.nextFollowUpAt = { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()), $lt: startOfTomorrow };
    } else if (view === 'upcoming') {
      filter.nextFollowUpAt = { $gte: startOfTomorrow, $lte: endOfWeek };
    } else if (view === 'all') {
      filter.nextFollowUpAt = { $ne: null };
    } else {
      filter.nextFollowUpAt = { $lte: now };
    }

    const accessibleCustomers = await Customer.find({ ...buildCustomerFilter(req), nextFollowUpAt: { $exists: true } }).select('_id');
    const [tasks, allFollowups, completedTasks] = await Promise.all([
      Customer.find(filter).populate('stage assignedTo clientCompany campaign').sort({ nextFollowUpAt: 1 }),
      Customer.find(buildCustomerFilter(req)).select('nextFollowUpAt'),
      Activity.find({ organization: req.user.organization._id, customer: { $in: accessibleCustomers.map(item => item._id) }, type: 'task', $or: [{ followUpAction: 'completed' }, { note: /^Follow-up completed/ }] })
        .populate('customer user').sort({ createdAt: -1 }).limit(20)
    ]);

    const stats = {
      due: allFollowups.filter(customer => customer.nextFollowUpAt && customer.nextFollowUpAt <= now).length,
      today: allFollowups.filter(customer => customer.nextFollowUpAt && customer.nextFollowUpAt >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) && customer.nextFollowUpAt < startOfTomorrow).length,
      upcoming: allFollowups.filter(customer => customer.nextFollowUpAt && customer.nextFollowUpAt >= startOfTomorrow).length,
      all: allFollowups.length
    };

    res.render('tasks/index', {
      title: 'Follow-up Tasks',
      tasks,
      completedTasks,
      stats,
      filters: { view },
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/complete', requirePermission('tasks.update'), async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const filter = { _id: req.params.id, organization, clientCompany: req.activeCompany._id };
    if (isRestrictedUser(req.user)) filter.assignedTo = req.user._id;

    const customer = await Customer.findOne(filter);
    if (!customer) return res.status(404).render('errors/404', { title: 'Task not found' });

    const completedAt = customer.nextFollowUpAt;
    const comment = String(req.body.comment || '').trim().slice(0, 1000);
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
      comment
    });
    await logAudit(req, {
      action: 'task_complete',
      entityType: 'customer',
      entityId: customer._id,
      entityName: customer.name,
      message: `Follow-up completed for "${customer.name}".`
    });

    res.redirect(req.headers.referer || '/tasks?success=Follow-up completed.');
  } catch (error) {
    next(error);
  }
});

router.post('/:id/reschedule', requirePermission('tasks.update'), async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const filter = { _id: req.params.id, organization, clientCompany: req.activeCompany._id };
    if (isRestrictedUser(req.user)) filter.assignedTo = req.user._id;

    const customer = await Customer.findOne(filter).populate('assignedTo');
    if (!customer) return res.status(404).render('errors/404', { title: 'Task not found' });

    const nextFollowUpAt = req.body.nextFollowUpAt ? new Date(req.body.nextFollowUpAt) : null;
    const comment = String(req.body.comment || '').trim().slice(0, 1000);
    if (!nextFollowUpAt || Number.isNaN(nextFollowUpAt.getTime())) {
      return res.redirect('/tasks?error=Please choose a valid follow-up date and time.');
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
      comment
    });
    await logAudit(req, {
      action: 'task_reschedule',
      entityType: 'customer',
      entityId: customer._id,
      entityName: customer.name,
      message: `Follow-up rescheduled for "${customer.name}".`,
      metadata: { nextFollowUpAt }
    });

    if (customer.assignedTo && String(customer.assignedTo._id) !== String(req.user._id)) {
      await Notification.create({
        organization,
        user: customer.assignedTo._id,
        title: 'Follow-up Rescheduled',
        message: `Follow-up for "${customer.name}" is now scheduled for ${nextFollowUpAt.toLocaleString('en-IN')}.`,
        link: `/customers/${customer._id}`
      });
    }

    res.redirect(req.headers.referer || '/tasks?success=Follow-up rescheduled.');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
