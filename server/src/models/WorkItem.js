const mongoose = require('mongoose');

const workItemSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  workType: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkType', required: true, index: true },
  category: { type: String, default: 'other' },
  title: { type: String, required: true, trim: true },
  clientCompany: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCompany', required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  collaborators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: { type: String, default: 'pending', index: true },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  revisionCount: { type: Number, min: 0, default: 0 },
  deadline: { type: Date, default: null },
  startDate: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  platform: { type: String, default: '', trim: true },
  designType: { type: String, default: '', trim: true },
  contentFormat: { type: String, default: '', trim: true },
  contentPillar: { type: String, default: '', trim: true },
  secondaryAssignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  pageCount: { type: Number, min: 0, default: 0 },
  sopLink: { type: String, default: '', trim: true },
  workingFileLink: { type: String, default: '', trim: true },
  draftLink: { type: String, default: '', trim: true },
  scriptLink: { type: String, default: '', trim: true },
  footageLink: { type: String, default: '', trim: true },
  thumbnailLink: { type: String, default: '', trim: true },
  publishedLink: { type: String, default: '', trim: true },
  requirementDocLink: { type: String, default: '', trim: true },
  contentDocLink: { type: String, default: '', trim: true },
  designLink: { type: String, default: '', trim: true },
  stagingLink: { type: String, default: '', trim: true },
  designBrief: { type: String, default: '', trim: true },
  copyText: { type: String, default: '', trim: true },
  hook: { type: String, default: '', trim: true },
  caption: { type: String, default: '', trim: true },
  cta: { type: String, default: '', trim: true },
  views: { type: Number, min: 0, default: 0 },
  likes: { type: Number, min: 0, default: 0 },
  comments: { type: Number, min: 0, default: 0 },
  shares: { type: Number, min: 0, default: 0 },
  saves: { type: Number, min: 0, default: 0 },
  leadsGenerated: { type: Number, min: 0, default: 0 },
  referenceLink: { type: String, default: '', trim: true },
  deliveryLink: { type: String, default: '', trim: true },
  notes: { type: String, default: '', trim: true },
  customFields: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  relatedRecords: [{
    record: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkItem', required: true },
    relation: { type: String, default: 'related to', trim: true }
  }],
  customData: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} }, // Compatibility with the current form builder.
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

workItemSchema.index({ organization: 1, workType: 1, status: 1, deadline: 1 });

module.exports = mongoose.model('WorkItem', workItemSchema);
