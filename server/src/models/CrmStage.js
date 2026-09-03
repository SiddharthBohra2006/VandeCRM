const mongoose = require('mongoose');

const crmStageSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  clientCompany: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCompany', required: true, index: true },
  name: { type: String, required: true, trim: true },
  key: { type: String, required: true, trim: true, lowercase: true },
  color: { type: String, default: '#475569' },
  order: { type: Number, default: 0 },
  isWon: { type: Boolean, default: false },
  isLost: { type: Boolean, default: false },
  isDefault: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

crmStageSchema.index({ organization: 1, clientCompany: 1, key: 1 }, { unique: true });
crmStageSchema.index({ organization: 1, clientCompany: 1, isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });

module.exports = mongoose.model('CrmStage', crmStageSchema);
