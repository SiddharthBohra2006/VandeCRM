const express = require('express');
const { requireApiAuth } = require('./middleware/auth');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');

const router = express.Router();
router.use(requireApiAuth);
const { hasPermission } = require('../config/roles');
router.use((req, res, next) => hasPermission(req.user, 'audit.view')
  ? next()
  : res.status(403).json({ ok: false, error: 'Access denied' }));

// GET /api/audit — Fetch audit logs with filtering
router.get('/', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const { action = '', entityType = '', user = '' } = req.query;

    const filter = { organization };
    if (action) filter.action = action;
    if (entityType) filter.entityType = entityType;
    if (user) filter.user = user;

    const [logs, users, actions, entityTypes] = await Promise.all([
      AuditLog.find(filter)
        .populate('user', 'name email role')
        .sort({ createdAt: -1 })
        .limit(250)
        .lean(),
      User.find({ organization }).select('name email role').sort({ name: 1 }).lean(),
      AuditLog.distinct('action', { organization }),
      AuditLog.distinct('entityType', { organization }),
    ]);

    res.json({
      ok: true,
      logs,
      users,
      actions: actions.sort(),
      entityTypes: entityTypes.sort(),
      filters: { action, entityType, user },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
