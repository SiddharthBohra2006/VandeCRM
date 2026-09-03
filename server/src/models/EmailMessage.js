const mongoose = require('mongoose');

const emailMessageSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
  template: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailTemplate', default: null },
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  fromEmail: { type: String, default: '', trim: true, lowercase: true },
  toEmail: { type: String, required: true, trim: true, lowercase: true },
  subject: { type: String, required: true, trim: true },
  body: { type: String, required: true },
  status: { type: String, enum: ['sent', 'failed'], default: 'sent', index: true },
  providerMessageId: { type: String, default: '', trim: true },
  error: { type: String, default: '' },
  sentAt: { type: Date, default: Date.now }
}, { timestamps: true });

emailMessageSchema.index({ organization: 1, sentAt: -1 });

module.exports = mongoose.model('EmailMessage', emailMessageSchema);
