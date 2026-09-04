const { hasPermission } = require('../../config/roles');
module.exports = permission => (req, res, next) => hasPermission(req.user, permission)
  ? next() : res.status(403).json({ ok: false, error: 'Access denied' });
