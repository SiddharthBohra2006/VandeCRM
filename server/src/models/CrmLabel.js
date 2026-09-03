const mongoose = require('mongoose');

const crmLabelSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  clientCompany: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCompany', required: true, index: true },
  name: { type: String, required: true, trim: true },
  isHighPotential: { type: Boolean },
  color: { type: String, default: '#2563eb' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

crmLabelSchema.index({ organization: 1, clientCompany: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('CrmLabel', crmLabelSchema);
