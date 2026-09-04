const express = require('express');
const Campaign = require('../models/Campaign');
const ClientCompany = require('../models/ClientCompany');
const CrmLabel = require('../models/CrmLabel');
const CrmStage = require('../models/CrmStage');
const CustomField = require('../models/CustomField');
const Customer = require('../models/Customer');
const SavedView = require('../models/SavedView');
const User = require('../models/User');
const { hasPermission, isRestrictedUser, canAccessLeadField } = require('../config/roles');
const { getWonStageIds } = require('../services/crmStages');
const { requireApiAuth } = require('./middleware/auth');

const router = express.Router();
router.use(requireApiAuth);
router.use((req, res, next) => hasPermission(req.user, 'businesses.view') ? next() : res.status(403).json({ ok: false, error: 'Access denied' }));

function scope(req, extra = {}) {
  return {
    organization: req.user.organization._id,
    clientCompany: req.activeCompanyId,
    ...(isRestrictedUser(req.user) ? { assignedTo: req.user._id } : {}),
    ...extra
  };
}

// GET /api/clients — Won-customer sub-view of the Customer domain
router.get('/', async (req, res, next) => {
  try {
    if (!req.activeCompanyId) return res.status(400).json({ ok: false, error: 'Select an active CRM workspace first.' });
    const organization = req.user.organization._id;
    const { q, stage, label, campaign, sortBy = 'recent', view = 'all', dateFrom = '', dateTo = '', viewId = '', page: pageParam = '1' } = req.query;
    const selectedStageId = stage || '';
    const wonStageIds = await getWonStageIds(organization, req.activeCompanyId);

    const filter = { ...scope(req), stage: { $in: wonStageIds } };
    if (stage && wonStageIds.some(id => String(id) === String(stage))) filter.stage = stage;

    if (view === 'new') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      filter.createdAt = { $gte: sevenDaysAgo };
    } else if (view === 'high-value') {
      filter.value = { $gte: 50000 };
    } else if (view === 'assigned') {
      filter.assignedTo = req.user._id;
    } else if (view === 'high-priority') {
      filter.priority = 'high';
    }

    if (label) filter.labels = label;
    if (campaign) filter.campaign = campaign;
    const createdAt = {};
    if (dateFrom) {
      const start = new Date(dateFrom);
      if (!Number.isNaN(start.getTime())) createdAt.$gte = start;
    }
    if (dateTo) {
      const end = new Date(dateTo);
      if (!Number.isNaN(end.getTime())) { end.setHours(23, 59, 59, 999); createdAt.$lte = end; }
    }
    if (Object.keys(createdAt).length) filter.createdAt = Object.assign(filter.createdAt || {}, createdAt);
    if (q) filter.$text = { $search: q };

    let sortObj = { updatedAt: -1 };
    if (sortBy === 'old') sortObj = { updatedAt: 1 };
    else if (sortBy === 'highest-value') sortObj = { value: -1 };
    else if (sortBy === 'lowest-value') sortObj = { value: 1 };
    else if (sortBy === 'name') sortObj = { name: 1 };

    const companyFilter = { organization, status: 'active' };
    if (!['admin', 'manager'].includes(req.user.role)) companyFilter.assignedUsers = req.user._id;

    const pageSize = 50;
    const totalResults = await Customer.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
    const page = Math.min(Math.max(1, Number.parseInt(pageParam, 10) || 1), totalPages);

    const [customers, allStages, availableLabels, fields, companies, campaigns, users, savedViews] = await Promise.all([
      Customer.find(filter).populate('stage labels assignedTo clientCompany campaign').sort(sortObj).skip((page - 1) * pageSize).limit(pageSize),
      CrmStage.find({ organization, clientCompany: req.activeCompanyId }).sort({ order: 1 }),
      CrmLabel.find({ organization, clientCompany: req.activeCompanyId, isActive: true }).sort({ name: 1 }),
      CustomField.find({ organization, clientCompany: req.activeCompanyId, entity: 'customer', isActive: true }).sort({ order: 1, createdAt: 1 }),
      ClientCompany.find(companyFilter).sort({ name: 1 }),
      Campaign.find({ organization, clientCompany: req.activeCompanyId, status: 'active' }).sort({ name: 1 }),
      User.find({ organization, isActive: true, role: { $in: ['admin', 'manager', 'agent'] } }).sort({ name: 1 }),
      SavedView.find({ organization, user: req.user._id, entity: 'customer' }).sort({ updatedAt: -1 })
    ]);

    const customerStageIds = new Set(customers.filter(c => c.stage).map(c => String(c.stage._id)));
    const stages = allStages.filter(stage => stage.isWon && (stage.isActive || customerStageIds.has(String(stage._id)) || String(stage._id) === String(selectedStageId)));
    const activeSavedView = savedViews.find(sv => String(sv._id) === String(viewId)) || null;

    const statsFilter = scope(req, { stage: { $in: wonStageIds } });
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const [totalClients, newClients, valAgg, highPriorityCount] = await Promise.all([
      Customer.countDocuments(statsFilter),
      Customer.countDocuments({ ...statsFilter, createdAt: { $gte: sevenDaysAgo } }),
      Customer.aggregate([{ $match: statsFilter }, { $group: { _id: null, total: { $sum: '$value' } } }]),
      Customer.countDocuments({ ...statsFilter, priority: 'high' })
    ]);
    const totalValue = (valAgg && valAgg[0] && valAgg[0].total) || 0;

    res.json({
      ok: true,
      data: customers,
      stages,
      labels: availableLabels,
      fields: fields.filter(field => canAccessLeadField(req.user, field.key)),
      companies,
      campaigns,
      users,
      savedViews,
      activeSavedView,
      filters: { q, stage: selectedStageId, label, campaign, sortBy, view: view || 'all', dateFrom, dateTo, viewId },
      clientStats: { totalClients, newClients, totalValue, highPriorityCount },
      pagination: { page, pageSize, totalPages, totalResults }
    });
  } catch (error) { next(error); }
});

module.exports = router;
