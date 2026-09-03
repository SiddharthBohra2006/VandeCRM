const mongoose = require('mongoose');

const customFieldSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  clientCompany: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCompany', required: true, index: true },
  entity: { type: String, default: 'customer' },
  label: { type: String, required: true, trim: true },
  key: { type: String, required: true, trim: true, lowercase: true },
  type: { type: String, enum: ['text', 'number', 'date', 'select', 'checkbox'], default: 'text' },
  options: [{ type: String, trim: true }],
  required: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

customFieldSchema.index({ organization: 1, clientCompany: 1, entity: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('CustomField', customFieldSchema);
