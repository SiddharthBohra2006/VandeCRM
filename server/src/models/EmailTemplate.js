const mongoose = require('mongoose');

const emailTemplateSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: ['intro', 'follow_up', 'proposal', 'payment', 'onboarding', 'support', 'custom'],
    default: 'custom',
    index: true
  },
  subject: { type: String, required: true, trim: true },
  body: { type: String, required: true },
  isActive: { type: Boolean, default: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

emailTemplateSchema.index(
  { organization: 1, name: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

module.exports = mongoose.model('EmailTemplate', emailTemplateSchema);
