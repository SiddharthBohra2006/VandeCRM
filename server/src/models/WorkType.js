const mongoose = require('mongoose');

const statusSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  color: { type: String, default: '#64748b' },
  isTerminalWon: { type: Boolean, default: false },
  isTerminalLost: { type: Boolean, default: false },
  requiresApproval: { type: Boolean, default: false }
}, { _id: false });

const fieldSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  type: { type: String, enum: ['text', 'textarea', 'number', 'currency', 'percentage', 'date', 'datetime', 'email', 'phone', 'select', 'checkbox', 'url', 'user-picker', 'company-picker', 'customer-picker', 'module-picker'], default: 'text' },
  options: [{ type: String, trim: true }],
  required: { type: Boolean, default: false },
  placeholder: { type: String, default: '', trim: true },
  helpText: { type: String, default: '', trim: true },
  defaultValue: { type: mongoose.Schema.Types.Mixed, default: '' },
  min: { type: Number, default: null },
  max: { type: Number, default: null },
  group: { type: String, enum: ['core', 'links'], default: 'core' }
}, { _id: false });

const presentationSchema = new mongoose.Schema({
  enabledViews: { type: [String], default: () => ['list', 'board', 'calendar'] },
  defaultView: { type: String, enum: ['overview', 'list', 'board', 'calendar'], default: 'list' },
  calendarField: { type: String, default: 'deadline' },
  listColumns: { type: [String], default: () => ['title', 'assignedTo', 'status', 'deadline'] },
  boardFields: { type: [String], default: () => ['assignedTo', 'priority', 'deadline'] },
  filterFields: { type: [String], default: () => ['status', 'assignedTo', 'priority'] },
  overviewGroupFields: { type: [String], default: [] },
  overviewProgressFields: { type: [String], default: [] },
  overviewCompleteValue: { type: String, default: 'Done', trim: true },
  fieldLabels: { type: Map, of: String, default: {} }
}, { _id: false });

const workTypeSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  clientCompany: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCompany', required: true, index: true },
  name: { type: String, required: true, trim: true },
  key: { type: String, required: true, trim: true },
  icon: { type: String, default: 'clipboard-list', trim: true },
  color: { type: String, default: '#64748b' },
  statuses: { type: [statusSchema], validate: value => value.length > 0 },
  fields: { type: [fieldSchema], default: [] },
  presentation: { type: presentationSchema, default: () => ({}) },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

workTypeSchema.index({ organization: 1, clientCompany: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('WorkType', workTypeSchema);
