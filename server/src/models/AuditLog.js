const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  action: { type: String, required: true, trim: true, index: true },
  entityType: { type: String, required: true, trim: true, index: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  entityName: { type: String, default: '', trim: true },
  message: { type: String, default: '', trim: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  ipAddress: { type: String, default: '', trim: true },
  userAgent: { type: String, default: '', trim: true }
}, { timestamps: true });

auditLogSchema.index({ organization: 1, createdAt: -1 });
auditLogSchema.index({ organization: 1, entityType: 1, entityId: 1, createdAt: -1 });

auditLogSchema.index({ organization: 1, entityName: 'text', message: 'text' });
module.exports = mongoose.model('AuditLog', auditLogSchema);
