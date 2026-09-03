const mongoose = require('mongoose');

const customRecordSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCompany', required: true, index: true },
  module: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkType', required: true, index: true },
  title: { type: String, required: true, trim: true },
  status: { type: String, required: true, index: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  collaborators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  secondaryAssignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  deadline: { type: Date, default: null },
  startDate: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  notes: { type: String, default: '' },
  customFields: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
  parentRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomRecord', default: null, index: true },
  relatedRecords: [{ record: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomRecord', required: true }, relation: { type: String, default: 'related to', trim: true } }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

customRecordSchema.index({ organization: 1, workspace: 1, module: 1, status: 1, updatedAt: -1 });
customRecordSchema.virtual('clientCompany', { ref: 'ClientCompany', localField: 'workspace', foreignField: '_id', justOne: true });
customRecordSchema.virtual('workType', { ref: 'WorkType', localField: 'module', foreignField: '_id', justOne: true });
customRecordSchema.set('toObject', { virtuals: true });
customRecordSchema.set('toJSON', { virtuals: true });
customRecordSchema.index({ organization: 1, title: 'text', notes: 'text' });
module.exports = mongoose.model('CustomRecord', customRecordSchema);
