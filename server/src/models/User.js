const mongoose = require('mongoose');
const { ROLE_DEFINITIONS, PERMISSION_MODULES } = require('../config/roles');

const userSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true },
  passwordHash: { type: String, required: true },
  passwordResetTokenHash: { type: String, default: '' },
  passwordResetExpiresAt: { type: Date, default: null },
  avatar: { type: String, default: '' },
  role: { type: String, enum: Object.keys(ROLE_DEFINITIONS), default: 'agent' },
  customRole: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomRole', default: null },
  hiddenModules: [{ type: String }],
  sidebarHiddenItems: [{ type: String }],
  dashboardHiddenSections: [{ type: String, enum: ['metrics', 'work-progress', 'deadlines', 'pipeline', 'attention', 'recent', 'activity'] }],
  dashboardHiddenCards: [{ type: String, trim: true }],
  dashboardCardOrder: [{ type: String, trim: true }],
  dashboardCardsCustomized: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  lastLoginAt: { type: Date, default: null },
  loginCount: { type: Number, default: 0 }
}, { timestamps: true });

userSchema.index({ organization: 1, name: 'text', email: 'text' });

userSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.passwordHash;
    delete ret.passwordResetTokenHash;
    delete ret.passwordResetExpiresAt;
    return ret;
  }
});
userSchema.set('toObject', {
  transform(doc, ret) {
    delete ret.passwordHash;
    delete ret.passwordResetTokenHash;
    delete ret.passwordResetExpiresAt;
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);
