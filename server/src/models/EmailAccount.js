const mongoose = require('mongoose');

const emailAccountSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, default: 'Default SMTP', trim: true },
  fromName: { type: String, default: '', trim: true },
  fromEmail: { type: String, required: true, trim: true, lowercase: true },
  replyTo: { type: String, default: '', trim: true, lowercase: true },
  smtpHost: { type: String, required: true, trim: true },
  smtpPort: { type: Number, default: 587 },
  smtpSecure: { type: Boolean, default: false },
  smtpUsername: { type: String, required: true, trim: true },
  smtpPasswordEncrypted: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  lastVerifiedAt: { type: Date, default: null }
}, { timestamps: true });

emailAccountSchema.index({ organization: 1, isActive: 1 });

module.exports = mongoose.model('EmailAccount', emailAccountSchema);
