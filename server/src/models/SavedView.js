const mongoose = require('mongoose');

const savedViewSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  entity: { type: String, enum: ['customer'], default: 'customer', index: true },
  name: { type: String, required: true, trim: true },
  filters: { type: mongoose.Schema.Types.Mixed, default: {} },
  columns: { type: mongoose.Schema.Types.Mixed, default: [] }
}, { timestamps: true });

savedViewSchema.index({ organization: 1, user: 1, entity: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('SavedView', savedViewSchema);
