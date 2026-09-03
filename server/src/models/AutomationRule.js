const mongoose = require('mongoose');

const automationRuleSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  clientCompany: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCompany', required: true, index: true },
  entityType: { type: String, enum: ['lead', 'module'], default: 'lead', index: true },
  workType: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkType', default: null, index: true },
  name: { type: String, required: true, trim: true },
  trigger: { type: String, enum: ['lead_created', 'record_created', 'stage_changed', 'status_changed', 'owner_changed'], required: true },
  stage: { type: mongoose.Schema.Types.ObjectId, ref: 'CrmStage', default: null },
  status: { type: String, default: '', trim: true },
  conditionField: { type: String, default: '', trim: true },
  conditionValue: { type: String, default: '', trim: true },
  action: { type: String, enum: ['assign_user', 'add_label', 'remove_label', 'set_priority', 'set_status', 'set_field', 'create_record'], required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
  actionField: { type: String, default: '', trim: true },
  actionValue: { type: String, default: '', trim: true },
  runCount: { type: Number, default: 0 },
  lastRunAt: { type: Date, default: null },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

automationRuleSchema.index({ organization: 1, clientCompany: 1, entityType: 1, workType: 1, trigger: 1, isActive: 1 });
module.exports = mongoose.model('AutomationRule', automationRuleSchema);
