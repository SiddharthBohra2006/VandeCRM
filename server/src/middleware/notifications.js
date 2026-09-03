const Notification = require('../models/Notification');
const { isRestrictedRole } = require('../config/roles');
const Customer = require('../models/Customer');

async function loadNotifications(req, res) {
  res.locals.unreadNotifications = [];
  res.locals.unreadCount = 0;
  res.locals.dueFollowupCount = 0;
  if (!req.user || req.get('X-Soft-Nav')) return;

  const orgId = req.user.organization._id || req.user.organization;
  const notificationFilter = { organization: orgId, user: req.user._id, read: false };
  const taskFilter = { organization: orgId, nextFollowUpAt: { $ne: null, $lte: new Date() } };
  if (isRestrictedRole(req.user.role)) taskFilter.assignedTo = req.user._id;
  [res.locals.unreadNotifications, res.locals.unreadCount, res.locals.dueFollowupCount] = await Promise.all([
    Notification.find(notificationFilter).sort({ createdAt: -1 }).limit(10),
    Notification.countDocuments(notificationFilter),
    Customer.countDocuments(taskFilter)
  ]);
}

module.exports = { loadNotifications };
