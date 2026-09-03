const express = require('express');
const Campaign = require('../models/Campaign');
const ClientCompany = require('../models/ClientCompany');
const Customer = require('../models/Customer');
const CrmStage = require('../models/CrmStage');
const User = require('../models/User');
const { requirePermission } = require('../middleware/auth');
const { hasPermission, isRestrictedRole } = require('../config/roles');
const { calculateCampaignMetrics, getDateRangeFilter } = require('../utils/reporting');
const { logAudit } = require('../utils/audit');
const router = express.Router();

const platformOptions = ['Meta Ads', 'Google Ads', 'LinkedIn Ads', 'YouTube', 'TikTok', 'Email Marketing', 'SEO', 'Other'];
const statusOptions = ['draft', 'active', 'paused', 'completed', 'archived'];

function requireCampaignEditor(req, res, next) {
  if (hasPermission(req.user, 'ads.update')) return next();
  return res.status(403).render('errors/403', { title: 'Access denied' });
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getCampaignPayload(body) {
  return {
    name: String(body.name || '').trim(),
    clientCompany: body.clientCompany || null,
    platform: platformOptions.includes(body.platform) ? body.platform : 'Meta Ads',
    status: statusOptions.includes(body.status) ? body.status : 'active',
    budget: Number(body.budget || 0),
    spent: Number(body.spent || 0),
    leadsCount: Number(body.leadsCount || 0),
    clicksCount: Number(body.clicksCount || 0),
    conversionsCount: Number(body.conversionsCount || 0),
    metaCampaignId: String(body.metaCampaignId || '').trim(),
    googleCampaignId: String(body.googleCampaignId || '').trim(),
    startDate: body.startDate || null,
    endDate: body.endDate || null
    , assignedManager: body.assignedManager || null, objective: String(body.objective || '').trim(),
    qualifiedLeadsCount: Math.max(0, Number(body.qualifiedLeadsCount) || 0), salesCount: Math.max(0, Number(body.salesCount) || 0),
    revenue: Math.max(0, Number(body.revenue) || 0), landingPageLink: String(body.landingPageLink || '').trim(),
    creativeLink: String(body.creativeLink || '').trim(), notes: String(body.notes || '').trim()
  };
}

async function findAccessibleCompany(user, companyId) {
  const filter = { _id: companyId, organization: user.organization._id };
  if (isRestrictedRole(user.role)) filter.assignedUsers = user._id;
  return ClientCompany.findOne(filter);
}

async function findAccessibleCampaign(user, campaignId) {
  const campaign = await Campaign.findOne({ _id: campaignId, organization: user.organization._id });
  if (!campaign || !isRestrictedRole(user.role)) return campaign;
  return await findAccessibleCompany(user, campaign.clientCompany) ? campaign : null;
}

router.get('/', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const { status = '', clientCompany = '', dateFrom = '', dateTo = '' } = req.query;
    const filter = { organization: orgId };
    const leadDateFilter = getDateRangeFilter(dateFrom, dateTo);
    const companyFilter = { organization: orgId };

    if (isRestrictedRole(req.user.role)) {
      companyFilter.assignedUsers = req.user._id;
      const assignedCompanies = await ClientCompany.find(companyFilter).select('_id');
      const assignedCompanyIds = assignedCompanies.map(company => company._id);
      filter.clientCompany = { $in: assignedCompanyIds };
      if (clientCompany) {
        filter.clientCompany = assignedCompanyIds.some(id => String(id) === String(clientCompany))
          ? clientCompany
          : { $in: [] };
      }
    } else if (clientCompany) {
      filter.clientCompany = clientCompany;
    }

    if (status) filter.status = status;

    const [campaignDocs, companies, leadCounts, stages, users] = await Promise.all([
      Campaign.find(filter).populate('clientCompany').sort({ updatedAt: -1, name: 1 }),
      ClientCompany.find(companyFilter).sort({ name: 1 }),
      Customer.aggregate([
        { $match: { organization: orgId, campaign: { $ne: null }, ...leadDateFilter } },
        { $group: { _id: '$campaign', count: { $sum: 1 }, value: { $sum: '$value' } } }
      ]),
      CrmStage.find({ organization: orgId, clientCompany: req.activeCompany._id }).sort({ order: 1 }),
      User.find({ organization: orgId, isActive: true }).sort({ name: 1 })
    ]);

    const leadStatsByCampaign = new Map(leadCounts.map(item => [String(item._id), item]));
    const leadsByCampaign = await Customer.find({
      organization: orgId,
      campaign: { $in: campaignDocs.map(campaign => campaign._id) },
      ...leadDateFilter
    }).populate('stage');
    const campaigns = campaignDocs.map(campaign => {
      const stats = leadStatsByCampaign.get(String(campaign._id)) || {};
      const campaignLeads = leadsByCampaign.filter(customer => customer.campaign && String(customer.campaign) === String(campaign._id));
      const metrics = calculateCampaignMetrics(campaign, campaignLeads, stages);
      return {
        ...campaign.toObject(),
        actualLeadsCount: stats.count || 0,
        pipelineValue: stats.value || 0,
        reportMetrics: metrics
      };
    });

    res.render('campaigns/index', {
      title: 'Ad Campaigns',
      campaigns,
      companies,
      platformOptions,
      statusOptions,
      users,
      filters: { status, clientCompany, dateFrom, dateTo },
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermission('ads.create'), async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const payload = getCampaignPayload(req.body);

    if (!payload.name || !payload.clientCompany) {
      return res.status(400).redirect('/campaigns?error=Name and Client Company are required.');
    }
    const company = await findAccessibleCompany(req.user, payload.clientCompany);
    if (!company) {
      return res.status(403).redirect('/campaigns?error=Selected client company is not available.');
    }
    const duplicate = await Campaign.findOne({
      organization: orgId,
      clientCompany: company._id,
      name: new RegExp(`^${escapeRegex(payload.name)}$`, 'i')
    });
    if (duplicate) {
      return res.redirect('/campaigns?error=A campaign with this name already exists for that client company.');
    }
    payload.clientCompany = company._id;
    if (payload.assignedManager && !await User.exists({ _id: payload.assignedManager, organization: orgId, isActive: true })) payload.assignedManager = null;

    const campaign = await Campaign.create({
      organization: orgId,
      ...payload
    });
    await logAudit(req, {
      action: 'create',
      entityType: 'campaign',
      entityId: campaign._id,
      entityName: campaign.name,
      message: `Campaign "${campaign.name}" created.`
    });

    res.redirect('/campaigns?success=Campaign created.');
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const { dateFrom = '', dateTo = '' } = req.query;
    const leadDateFilter = getDateRangeFilter(dateFrom, dateTo);
    const campaign = await Campaign.findOne({ _id: req.params.id, organization: orgId }).populate('clientCompany');
    if (!campaign) return res.status(404).render('errors/404', { title: 'Campaign not found' });
    if (isRestrictedRole(req.user.role)) {
      const company = await ClientCompany.findOne({
        _id: campaign.clientCompany._id || campaign.clientCompany,
        organization: orgId,
        assignedUsers: req.user._id
      });
      if (!company) {
        return res.status(403).render('errors/403', { title: 'Access denied' });
      }
    }

    const [companies, customers, stages, users] = await Promise.all([
      ClientCompany.find(isRestrictedRole(req.user.role) ? { organization: orgId, assignedUsers: req.user._id } : { organization: orgId }).sort({ name: 1 }),
      Customer.find({ organization: orgId, campaign: campaign._id, ...leadDateFilter }).populate('stage assignedTo clientCompany').sort({ updatedAt: -1 }),
      CrmStage.find({ organization: orgId, clientCompany: campaign.clientCompany }).sort({ order: 1 }),
      User.find({ organization: orgId, isActive: true }).sort({ name: 1 })
    ]);

    const metrics = calculateCampaignMetrics(campaign, customers, stages);

    res.render('campaigns/show', {
      title: campaign.name,
      campaign,
      companies,
      customers,
      platformOptions,
      statusOptions,
      users,
      metrics,
      filters: { dateFrom, dateTo },
      error: req.query.error || '',
      success: req.query.success || ''
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requireCampaignEditor, async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const payload = getCampaignPayload(req.body);
    if (!payload.name || !payload.clientCompany) {
      return res.redirect(`/campaigns/${req.params.id}?error=Name and Client Company are required.`);
    }
    const existingCampaign = await findAccessibleCampaign(req.user, req.params.id);
    if (!existingCampaign) return res.status(404).render('errors/404', { title: 'Campaign not found' });
    const company = await findAccessibleCompany(req.user, payload.clientCompany);
    if (!company) {
      return res.status(403).redirect(`/campaigns/${req.params.id}?error=Selected client company is not available.`);
    }
    const duplicate = await Campaign.findOne({
      organization: orgId,
      clientCompany: company._id,
      _id: { $ne: req.params.id },
      name: new RegExp(`^${escapeRegex(payload.name)}$`, 'i')
    });
    if (duplicate) {
      return res.redirect(`/campaigns/${req.params.id}?error=A campaign with this name already exists for that client company.`);
    }
    payload.clientCompany = company._id;
    if (payload.assignedManager && !await User.exists({ _id: payload.assignedManager, organization: orgId, isActive: true })) payload.assignedManager = null;

    await Campaign.updateOne(
      { _id: req.params.id, organization: orgId },
      payload
    );
    await logAudit(req, {
      action: 'update',
      entityType: 'campaign',
      entityId: req.params.id,
      entityName: payload.name,
      message: `Campaign "${payload.name}" updated.`
    });

    res.redirect(`/campaigns/${req.params.id}?success=Campaign updated.`);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/status', requireCampaignEditor, async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    if (!await findAccessibleCampaign(req.user, req.params.id)) return res.status(403).render('errors/403', { title: 'Access denied' });
    const status = statusOptions.includes(req.body.status) ? req.body.status : 'active';
    await Campaign.updateOne(
      { _id: req.params.id, organization: orgId },
      { status }
    );
    await logAudit(req, {
      action: 'status_change',
      entityType: 'campaign',
      entityId: req.params.id,
      message: `Campaign status changed to ${status}.`
    });
    res.redirect(req.headers.referer || '/campaigns');
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requirePermission('ads.delete'), async (req, res, next) => {
  try {
    const orgId = req.user.organization._id;
    const linkedLeadCount = await Customer.countDocuments({ organization: orgId, campaign: req.params.id });
    if (linkedLeadCount > 0) {
      return res.redirect(`/campaigns/${req.params.id}?error=This campaign has linked leads. Archive it instead of deleting.`);
    }

    const campaign = await Campaign.findOne({ _id: req.params.id, organization: orgId });
    await Campaign.deleteOne({ _id: req.params.id, organization: orgId });
    await logAudit(req, {
      action: 'delete',
      entityType: 'campaign',
      entityId: req.params.id,
      entityName: campaign ? campaign.name : '',
      message: `Campaign "${campaign ? campaign.name : req.params.id}" deleted.`
    });
    res.redirect('/campaigns?success=Campaign deleted.');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
