const mongoose = require('mongoose');
const crypto = require('crypto');

const clientCompanySchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  isMain: { type: Boolean, default: false, index: true },
  businessType: { type: String, enum: ['service', 'consumer', 'commerce', 'other'], default: 'service' },
  terminology: {
    leadSingular: { type: String, default: 'Lead', trim: true },
    leadPlural: { type: String, default: 'Leads', trim: true },
    recordSingular: { type: String, default: 'Client', trim: true },
    recordPlural: { type: String, default: 'Clients', trim: true },
    pipelineName: { type: String, default: 'Sales pipeline', trim: true }
  },
  website: { type: String, default: '', trim: true },
  category: { type: String, default: '', trim: true },
  contactPerson: { type: String, default: '', trim: true },
  phone: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true, lowercase: true },
  instagram: { type: String, default: '', trim: true },
  location: { type: String, default: '', trim: true },
  monthlyPackage: { type: Number, min: 0, default: 0 },
  startDate: { type: Date, default: null },
  monthlyVideoTarget: { type: Number, min: 0, default: 0 },
  monthlyDesignTarget: { type: Number, min: 0, default: 0 },
  monthlyContentTarget: { type: Number, min: 0, default: 0 },
  monthlyLeadTarget: { type: Number, min: 0, default: 0 },
  sopDocumentLink: { type: String, default: '', trim: true },
  googleDriveFolderLink: { type: String, default: '', trim: true },
  notes: { type: String, default: '', trim: true },
  metaPixelId: { type: String, default: '', trim: true },
  ga4MeasurementId: { type: String, default: '', trim: true },
  metaAccessTokenEncrypted: { type: String, default: '' },
  ga4ServiceAccountJsonEncrypted: { type: String, default: '' },
  metaAdAccountId: { type: String, default: '', trim: true },
  ga4PropertyId: { type: String, default: '', trim: true },
  apiKey: { type: String, unique: true, sparse: true },
  apiKeyStatus: { type: String, enum: ['active', 'disabled'], default: 'active' },
  apiKeyRotatedAt: { type: Date, default: null },
  apiKeyDisabledAt: { type: Date, default: null },
  apiKeyHistory: [{
    action: { type: String, enum: ['created', 'rotated', 'disabled', 'enabled'], default: 'rotated' },
    keySuffix: { type: String, default: '' },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    changedAt: { type: Date, default: Date.now },
    reason: { type: String, default: '' }
  }],
  integrationSyncEnabled: { type: Boolean, default: false },
  integrationSyncIntervalMinutes: { type: Number, default: 360 },
  integrationNextSyncAt: { type: Date, default: null },
  integrationLastSyncAt: { type: Date, default: null },
  integrationLastSyncStatus: { type: String, enum: ['never', 'success', 'failure', 'partial'], default: 'never' },
  leadRoutingRule: { type: String, enum: ['manual', 'round-robin'], default: 'manual' },
  lastAssignedAgentIndex: { type: Number, default: 0 },
  outboundWebhookUrl: { type: String, default: '', trim: true },
  metaTokenExpiresAt: { type: Date, default: null },
  accountOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  healthStatus: { type: String, enum: ['healthy', 'watch', 'at-risk'], default: 'healthy' },
  assignedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: { type: String, enum: ['onboarding', 'active', 'inactive'], default: 'onboarding' }
}, { timestamps: true });

clientCompanySchema.pre('save', function(next) {
  if (!this.apiKey) {
    this.apiKey = 'cc_' + crypto.randomBytes(24).toString('hex');
  }
  next();
});

clientCompanySchema.index({ organization: 1, name: 1 }, { unique: true });

clientCompanySchema.index({ organization: 1, name: 'text', website: 'text' });
module.exports = mongoose.model('ClientCompany', clientCompanySchema);
