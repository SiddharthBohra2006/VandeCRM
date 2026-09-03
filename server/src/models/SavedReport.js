const mongoose = require('mongoose');

const savedReportSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  clientCompany: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCompany', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  config: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });

savedReportSchema.index({ organization: 1, clientCompany: 1, user: 1, name: 1 }, { unique: true });
module.exports = mongoose.model('SavedReport', savedReportSchema);
