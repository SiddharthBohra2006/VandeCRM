const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  type: {
    type: String,
    enum: ['note', 'call', 'email', 'whatsapp', 'meeting', 'meeting_client', 'meeting_internal', 'stage_changed', 'label_changed', 'task'],
    default: 'note'
  },
  note: { type: String, required: true, trim: true },
  callRecordingUrl: { type: String, trim: true, default: '' },
  nextFollowUpAt: { type: Date, default: null },
  followUpAction: { type: String, enum: ['scheduled', 'completed'], default: null },
  comment: { type: String, trim: true, maxlength: 1000, default: '' }
}, { timestamps: true });

activitySchema.index({ organization: 1, note: 'text', comment: 'text' });
module.exports = mongoose.model('Activity', activitySchema);
