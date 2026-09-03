const express = require('express');

const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const { requirePermission } = require('../middleware/auth');

const router = express.Router();

router.use(requirePermission('audit.view'));

router.get('/', async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const { action = '', entityType = '', user = '' } = req.query;
    const filter = { organization };
    if (action) filter.action = action;
    if (entityType) filter.entityType = entityType;
    if (user) filter.user = user;

    const [logs, users, actions, entityTypes] = await Promise.all([
      AuditLog.find(filter).populate('user').sort({ createdAt: -1 }).limit(250),
      User.find({ organization }).sort({ name: 1 }),
      AuditLog.distinct('action', { organization }),
      AuditLog.distinct('entityType', { organization })
    ]);

    res.render('audit/index', {
      title: 'Audit Trail',
      logs,
      users,
      actions: actions.sort(),
      entityTypes: entityTypes.sort(),
      filters: { action, entityType, user }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
