const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
  theme: {
    gold: { type: String, default: '#ffcc00' },
    teal: { type: String, default: '#0d0d0d' },
    background: { type: String, default: '#f7f7f5' },
    surface: { type: String, default: '#ffffff' },
    text: { type: String, default: '#121214' }
  }
}, { timestamps: true });

module.exports = mongoose.model('Organization', organizationSchema);
