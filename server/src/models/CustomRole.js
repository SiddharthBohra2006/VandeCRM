const mongoose = require('mongoose');
const { ALL_PERMISSIONS } = require('../config/roles');

const customRoleSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  permissions: [{ type: String }],
  scope: { type: String, enum: ['assigned', 'organization'] },
  leadFieldPermissions: {
    configured: { type: Boolean, default: false },
    visible: [{ type: String }],
    editable: [{ type: String }]
  },
  fieldPermissions: { type: Map, of: [String] },
  workTypePermissions: [{
    workTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkType', required: true },
    actions: [{ type: String, enum: ['view', 'create', 'update', 'delete'] }],
    editableFieldKeys: [{ type: String }]
  }]
}, { timestamps: true });

customRoleSchema.index({ organization: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('CustomRole', customRoleSchema);
