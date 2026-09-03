const express = require('express');
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const CrmStage = require('../models/CrmStage');
const CrmLabel = require('../models/CrmLabel');
const CustomField = require('../models/CustomField');
const ClientCompany = require('../models/ClientCompany');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const SavedView = require('../models/SavedView');
const { requirePermission } = require('../middleware/auth');
const { canAccessLeadField } = require('../config/roles');
const { getWonStageIds } = require('../services/crmStages');

const router = express.Router();

router.get('/', requirePermission('businesses.view'), async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const { q, stage, label, campaign, sortBy = 'recent', view = 'all', dateFrom = '', dateTo = '', error = '', success = '', viewId = '', page: pageParam = '1' } = req.query;
    const selectedStageId = stage || '';
    const filter = { organization, clientCompany: req.activeCompany._id };

    // Fetch Won Stages to filter only won customers/clients
    const wonStageIds = await getWonStageIds(organization, req.activeCompany._id);

    if (stage && wonStageIds.some(id => String(id) === String(stage))) {
      filter.stage = stage;
    } else {
      filter.stage = { $in: wonStageIds };
    }

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
      if (!Number.isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        createdAt.$lte = end;
      }
    }
    if (Object.keys(createdAt).length) filter.createdAt = Object.assign(filter.createdAt || {}, createdAt);

    const companyFilter = { organization, status: 'active' };
    if (req.user.role === 'agent') {
      companyFilter.assignedUsers = req.user._id;
      filter.assignedTo = req.user._id;
    }

    if (q) filter.$text = { $search: q };

    let sortObj = { updatedAt: -1 };
    if (sortBy === 'old') {
      sortObj = { updatedAt: 1 };
    } else if (sortBy === 'highest-value') {
      sortObj = { value: -1 };
    } else if (sortBy === 'lowest-value') {
      sortObj = { value: 1 };
    } else if (sortBy === 'name') {
      sortObj = { name: 1 };
    }

    const campaignFilterQuery = { organization, clientCompany: req.activeCompany._id, status: 'active' };
    const pageSize = 50;
    const totalResults = await Customer.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
    const page = Math.min(Math.max(1, Number.parseInt(pageParam, 10) || 1), totalPages);

    const [customers, allStages, labels, fields, companies, campaigns, users, savedViews] = await Promise.all([
      Customer.find(filter).populate('stage labels assignedTo clientCompany campaign').sort(sortObj).skip((page - 1) * pageSize).limit(pageSize),
      CrmStage.find({ organization, clientCompany: req.activeCompany._id }).sort({ order: 1 }),
      CrmLabel.find({ organization, clientCompany: req.activeCompany._id, isActive: true }).sort({ name: 1 }),
      CustomField.find({ organization, clientCompany: req.activeCompany._id, entity: 'customer', isActive: true }).sort({ order: 1, createdAt: 1 }),
      ClientCompany.find(companyFilter).sort({ name: 1 }),
      Campaign.find(campaignFilterQuery).sort({ name: 1 }),
      User.find({ organization, isActive: true, role: { $in: ['admin', 'manager', 'agent'] } }).sort({ name: 1 }),
      SavedView.find({ organization, user: req.user._id, entity: 'customer' }).sort({ updatedAt: -1 })
    ]);

    const customerStageIds = new Set(customers.filter(customer => customer.stage).map(customer => String(customer.stage._id)));
    const stages = allStages.filter(stage => stage.isWon && (stage.isActive || customerStageIds.has(String(stage._id)) || String(stage._id) === String(selectedStageId)));
    const activeSavedView = savedViews.find(savedView => String(savedView._id) === String(viewId)) || null;

    const statsFilter = { organization, clientCompany: req.activeCompany._id, stage: { $in: wonStageIds } };
    if (req.user.role === 'agent') statsFilter.assignedTo = req.user._id;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [totalClients, newClients, valAgg, highPriorityCount] = await Promise.all([
      Customer.countDocuments(statsFilter),
      Customer.countDocuments({ ...statsFilter, createdAt: { $gte: sevenDaysAgo } }),
      Customer.aggregate([
        { $match: statsFilter },
        { $group: { _id: null, total: { $sum: '$value' } } }
      ]),
      Customer.countDocuments({ ...statsFilter, priority: 'high' })
    ]);
    const totalValue = (valAgg && valAgg[0] && valAgg[0].total) || 0;

    res.render('customers/index', {
      title: 'Clients',
      pageTitle: 'Clients',
      isClientView: true,
      customers,
      stages,
      labels,
      fields: fields.filter(field => canAccessLeadField(req.user, field.key)),
      companies,
      campaigns,
      users,
      savedViews,
      activeSavedView,
      filters: { q, stage: selectedStageId, label, campaign, sortBy, view: view || 'all', dateFrom, dateTo, viewId },
      clientStats: { totalClients, newClients, totalValue, highPriorityCount },
      error: error || req.query.error || '',
      success: success || req.query.success || '',
      importResult: { imported: '', updated: '', skipped: '', fieldsCreated: '' },
      pagination: { page, pageSize, totalPages, totalResults }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requirePermission('businesses.view'), async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, organization: req.user.organization._id, clientCompany: req.activeCompany._id }).populate('stage');
    if (!customer || !customer.stage?.isWon) return res.status(404).render('errors/404', { title: 'Client not found' });
    res.redirect(`/customers/${customer._id}?from=clients`);
  } catch (error) { next(error); }
});

module.exports = router;
