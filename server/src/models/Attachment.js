const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
  clientCompany: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCompany', default: null, index: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  category: {
    type: String,
    enum: ['proposal', 'contract', 'invoice', 'brief', 'screenshot', 'other'],
    default: 'other',
    index: true
  },
  originalName: { type: String, required: true, trim: true },
  mimeType: { type: String, default: 'application/octet-stream', trim: true },
  size: { type: Number, default: 0 },
  notes: { type: String, default: '', trim: true },
  storageProvider: { type: String, enum: ['crm', 'google_drive'], default: 'crm', index: true },
  externalFileId: { type: String, default: '', trim: true },
  externalUrl: { type: String, default: '', trim: true },
  data: { type: Buffer, default: null }
}, { timestamps: true });

attachmentSchema.index({ organization: 1, customer: 1, createdAt: -1 });
attachmentSchema.index({ organization: 1, clientCompany: 1, createdAt: -1 });

module.exports = mongoose.model('Attachment', attachmentSchema);
