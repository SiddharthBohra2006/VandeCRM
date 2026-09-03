const mongoose = require('mongoose');

function normalizePhone(phone) {
  const clean = String(phone || '').replace(/\D/g, '');
  if (!clean) return '';
  return clean.length >= 10 ? clean.slice(-10) : clean;
}

const customerSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  company: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true, lowercase: true },
  phone: { type: String, default: '', trim: true },
  phoneNormalized: { type: String, default: '', trim: true, index: true },
  source: { type: String, default: 'Manual', trim: true },
  value: { type: Number, default: 0 },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium', index: true },
  leadScore: { type: Number, default: 0, min: 0, max: 100 },
  stage: { type: mongoose.Schema.Types.ObjectId, ref: 'CrmStage', required: true, index: true },
  labels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CrmLabel' }],
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  clientCompany: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCompany', default: null, index: true },
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', default: null, index: true },
  notes: { type: String, default: '' },
  customData: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  utmSource: { type: String, default: '', trim: true },
  utmMedium: { type: String, default: '', trim: true },
  utmCampaign: { type: String, default: '', trim: true },
  utmContent: { type: String, default: '', trim: true },
  utmTerm: { type: String, default: '', trim: true },
  lastContactedAt: { type: Date, default: null },
  nextFollowUpAt: { type: Date, default: null }
}, { timestamps: true });

customerSchema.index({ organization: 1, name: 'text', company: 'text', email: 'text', phone: 'text' });
customerSchema.index({ organization: 1, email: 1 });
customerSchema.index({ organization: 1, clientCompany: 1, email: 1 });
customerSchema.index({ organization: 1, clientCompany: 1, phoneNormalized: 1 });

customerSchema.pre('validate', function setPhoneNormalized(next) {
  this.phoneNormalized = normalizePhone(this.phone);
  next();
});

module.exports = mongoose.model('Customer', customerSchema);
