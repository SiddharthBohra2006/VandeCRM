const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  clientCompany: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientCompany', required: true, index: true },
  name: { type: String, required: true, trim: true },
  platform: { type: String, enum: ['Meta Ads', 'Google Ads', 'LinkedIn Ads', 'YouTube', 'TikTok', 'Email Marketing', 'SEO', 'Other'], default: 'Meta Ads' },
  assignedManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  objective: { type: String, default: '', trim: true },
  status: { type: String, enum: ['draft', 'active', 'paused', 'completed', 'archived'], default: 'draft' },
  budget: { type: Number, default: 0 },
  spent: { type: Number, default: 0 },
  leadsCount: { type: Number, default: 0 },
  clicksCount: { type: Number, default: 0 },
  impressionsCount: { type: Number, default: 0 },
  conversionsCount: { type: Number, default: 0 },
  qualifiedLeadsCount: { type: Number, default: 0 },
  salesCount: { type: Number, default: 0 },
  revenue: { type: Number, default: 0 },
  landingPageLink: { type: String, default: '', trim: true },
  creativeLink: { type: String, default: '', trim: true },
  notes: { type: String, default: '', trim: true },
  ga4UsersCount: { type: Number, default: 0 },
  metaCampaignId: { type: String, default: '' },
  googleCampaignId: { type: String, default: '' },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null }
}, { timestamps: true });

campaignSchema.index({ organization: 1, clientCompany: 1, name: 1 }, { unique: true });

campaignSchema.index({ organization: 1, name: 'text', objective: 'text', platform: 'text' });
module.exports = mongoose.model('Campaign', campaignSchema);
