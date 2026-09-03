const AuditLog = require('../models/AuditLog');

async function logAudit(req, details = {}) {
  try {
    const organization = details.organization || (req && req.user && req.user.organization && req.user.organization._id);
    if (!organization) return null;

    return await AuditLog.create({
      organization,
      user: details.user === undefined ? (req && req.user ? req.user._id : null) : details.user,
      action: details.action || 'event',
      entityType: details.entityType || 'system',
      entityId: details.entityId || null,
      entityName: details.entityName || '',
      message: details.message || '',
      metadata: details.metadata || {},
      ipAddress: req && req.ip ? req.ip : '',
      userAgent: req && req.get ? (req.get('user-agent') || '') : ''
    });
  } catch (error) {
    console.error('Audit log failed:', error.message);
    return null;
  }
}

module.exports = { logAudit };
