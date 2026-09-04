const express = require('express');
const ClientCompany = require('../models/ClientCompany');
const CrmStage = require('../models/CrmStage');
const Campaign = require('../models/Campaign');
const Customer = require('../models/Customer');
const { hasPermission, isRestrictedUser } = require('../config/roles');
const { requireApiAuth } = require('./middleware/auth');
const { getDateRangeFilter } = require('../utils/reporting');
const { getWonStageIdSet } = require('../services/crmStages');

const router = express.Router();
router.use(requireApiAuth);
router.use((req, res, next) => hasPermission(req.user, 'reports.view') ? next() : res.status(403).json({ ok: false, error: 'Access denied' }));

// GET /api/analytics — Analytics & Insights for the active CRM
router.get('/', async (req, res, next) => {
  try {
    if (!req.activeCompanyId) return res.status(400).json({ ok: false, error: 'Select an active CRM workspace first.' });
    const organization = req.user.organization._id;
    const now = new Date();
    const { clientCompany, campaign, dateFrom = '', dateTo = '' } = req.query;
    const companyFilter = { organization, _id: req.activeCompanyId, status: 'active' };
    const customerFilter = { organization, clientCompany: req.activeCompanyId, ...getDateRangeFilter(dateFrom, dateTo) };

    if (campaign) customerFilter.campaign = campaign;

    if (isRestrictedUser(req.user)) {
      companyFilter.assignedUsers = req.user._id;
      customerFilter.assignedTo = req.user._id;
    }
    const agentCompanyIds = isRestrictedUser(req.user)
      ? await ClientCompany.find(companyFilter).distinct('_id')
      : null;

    const [stages, customers, companies, campaigns] = await Promise.all([
      CrmStage.find({ organization, clientCompany: req.activeCompanyId }).sort({ order: 1, createdAt: 1 }),
      Customer.find(customerFilter).populate('stage clientCompany campaign'),
      ClientCompany.find(companyFilter).sort({ name: 1 }),
      Campaign.find({
        organization,
        clientCompany: req.activeCompanyId,
        status: 'active',
        ...(agentCompanyIds ? { clientCompany: { $in: agentCompanyIds } } : {})
      }).sort({ name: 1 })
    ]);

    const stageSummary = stages.map(stage => {
      const stageLeads = customers.filter(c => c.stage && String(c.stage._id) === String(stage._id));
      const value = stageLeads.reduce((sum, c) => sum + (c.value || 0), 0);
      return { name: stage.name, color: stage.color || '#ffcc00', count: stageLeads.length, value };
    });

    const totalLeads = customers.length;
    const wonStageIds = getWonStageIdSet(stages);
    const lostStageIds = new Set(stages.filter(stage => stage.isLost).map(stage => String(stage._id)));

    const wonCount = customers.filter(customer => customer.stage && wonStageIds.has(String(customer.stage._id))).length;
    const lostCount = customers.filter(customer => customer.stage && lostStageIds.has(String(customer.stage._id))).length;
    const activeCount = totalLeads - wonCount - lostCount;
    const winRate = totalLeads > 0 ? ((wonCount / totalLeads) * 100).toFixed(1) : 0;

    const campaignSummary = campaigns.map(cam => {
      const camLeads = customers.filter(c => c.campaign && String(c.campaign._id) === String(cam._id));
      const value = camLeads.reduce((sum, c) => sum + (c.value || 0), 0);
      const wonLeads = camLeads.filter(customer => customer.stage && wonStageIds.has(String(customer.stage._id)));
      const revenue = wonLeads.reduce((sum, c) => sum + (c.value || 0), 0);
      return {
        name: cam.name,
        platform: cam.platform,
        status: cam.status,
        budget: cam.budget || 0,
        leadsCount: camLeads.length,
        pipelineValue: value,
        wonValue: revenue
      };
    });

    const companySummary = companies.map(com => {
      const comLeads = customers.filter(c => c.clientCompany && String(c.clientCompany._id) === String(com._id));
      const value = comLeads.reduce((sum, c) => sum + (c.value || 0), 0);
      return { name: com.name, status: com.status, leadsCount: comLeads.length, pipelineValue: value };
    });

    const ingestionTrend = [];
    let rangeEnd = dateTo ? new Date(dateTo) : new Date();
    if (Number.isNaN(rangeEnd.getTime())) rangeEnd = new Date();
    let rangeStart = dateFrom ? new Date(dateFrom) : new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate() - 6);
    if (Number.isNaN(rangeStart.getTime())) rangeStart = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate() - 6);
    const totalDays = Math.max(1, Math.min(31, Math.floor((rangeEnd - rangeStart) / (1000 * 60 * 60 * 24)) + 1));

    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate() - i);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const count = customers.filter(c => {
        const cDate = new Date(c.createdAt);
        return cDate.getDate() === d.getDate() && cDate.getMonth() === d.getMonth() && cDate.getFullYear() === d.getFullYear();
      }).length;
      ingestionTrend.push({ dateStr, count });
    }

    const totalLeadsTrend = [];
    const activeLeadsTrend = [];
    const wonDealsTrend = [];
    for (let i = 4; i >= 0; i--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const leadsUpToDay = customers.filter(c => new Date(c.createdAt) <= targetDate);
      const totalCount = leadsUpToDay.length;
      const wonUpToDay = leadsUpToDay.filter(customer => customer.stage && wonStageIds.has(String(customer.stage._id))).length;
      const lostUpToDay = leadsUpToDay.filter(customer => customer.stage && lostStageIds.has(String(customer.stage._id))).length;
      const activeCountVal = totalCount - wonUpToDay - lostUpToDay;
      totalLeadsTrend.push(totalCount);
      activeLeadsTrend.push(activeCountVal);
      wonDealsTrend.push(wonUpToDay);
    }

    res.json({
      ok: true,
      stageSummary,
      campaignSummary,
      companySummary,
      companies,
      campaigns,
      ingestionTrend,
      trends: { totalLeads: totalLeadsTrend, activeLeads: activeLeadsTrend, wonDeals: wonDealsTrend },
      filters: { clientCompany: clientCompany || '', campaign: campaign || '', dateFrom, dateTo },
      stats: {
        totalLeads,
        wonCount,
        lostCount,
        activeCount,
        winRate,
        totalValue: customers.reduce((sum, c) => sum + (c.value || 0), 0),
        wonValue: customers.filter(customer => customer.stage && wonStageIds.has(String(customer.stage._id))).reduce((sum, customer) => sum + (customer.value || 0), 0)
      }
    });
  } catch (error) { next(error); }
});

module.exports = router;
