const mongoose = require('mongoose');
const dashboardViewSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true },
  hiddenSections: [{ type: String }],
  cardOrder: [{ type: String }],
  customFieldMetrics: [{ type: String }]
}, { timestamps: true });
dashboardViewSchema.index({ organization: 1, user: 1, name: 1 }, { unique: true });
module.exports = mongoose.model('DashboardView', dashboardViewSchema);
