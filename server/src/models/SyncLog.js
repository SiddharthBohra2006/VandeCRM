const mongoose = require('mongoose');

const syncLogSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  clientCompany: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCompany', default: null, index: true },
  source: { type: String, enum: ['Meta Ads', 'Google Analytics', 'Inbound API', 'Outbound Lead Webhook', 'CSV Import'], required: true },
  status: { type: String, enum: ['success', 'failure'], required: true },
  trigger: { type: String, enum: ['manual', 'scheduled', 'retry', 'api', 'import'], default: 'manual' },
  attempts: { type: Number, default: 1 },
  recordsProcessed: { type: Number, default: 0 },
  recordsCreated: { type: Number, default: 0 },
  recordsUpdated: { type: Number, default: 0 },
  durationMs: { type: Number, default: 0 },
  diagnostics: { type: mongoose.Schema.Types.Mixed, default: {} },
  error: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

module.exports = mongoose.model('SyncLog', syncLogSchema);
