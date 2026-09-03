const express = require('express');
const router = express.Router();
const Customer = require('../../models/Customer');
const Activity = require('../../models/Activity');
const User = require('../../models/User');

// List customers with filtering, sorting, pagination
router.get('/', async (req, res) => {
  try {
    const companyId = req.user.activeCompany;
    const userId = req.user._id;
    const userRole = req.user.role;
    const isSpecialist = userRole === 'specialist';

    const {
      page = 1,
      pageSize = 20,
      q,
      stage,
      assignedTo,
      priority,
      source,
      sortBy = 'recent',
      label,
      campaign,
      valueMin,
      valueMax,
      createdAfter,
      createdBefore,
      nextFollowUp
    } = req.query;

    // Build filter
    const filter = { company: companyId, isDeleted: { $ne: true } };

    // Specialists only see their leads
    if (isSpecialist) {
      filter.assignedTo = userId;
    }

    // Text search
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
        { company: { $regex: q, $options: 'i' } }
      ];
    }

    // Stage filter
    if (stage) {
      filter.stage = stage;
    }

    // Assigned to filter
    if (assignedTo) {
      filter.assignedTo = assignedTo;
    }

    // Priority filter
    if (priority) {
      filter.priority = priority;
    }

    // Source filter
    if (source) {
      filter.source = source;
    }

    // Label filter
    if (label) {
      filter.labels = label;
    }

    // Campaign filter
    if (campaign) {
      filter.campaign = campaign;
    }

    // Value range
    if (valueMin || valueMax) {
      filter.value = {};
      if (valueMin) filter.value.$gte = Number(valueMin);
      if (valueMax) filter.value.$lte = Number(valueMax);
    }

    // Date range
    if (createdAfter || createdBefore) {
      filter.createdAt = {};
      if (createdAfter) filter.createdAt.$gte = new Date(createdAfter);
      if (createdBefore) filter.createdAt.$lte = new Date(createdBefore);
    }

    // Next follow-up filter
    if (nextFollowUp === 'overdue') {
      filter.nextFollowUpAt = { $lt: new Date() };
    } else if (nextFollowUp === 'today') {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      filter.nextFollowUpAt = { $gte: startOfDay, $lte: endOfDay };
    } else if (nextFollowUp === 'week') {
      const startOfWeek = new Date();
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date();
      endOfWeek.setDate(endOfWeek.getDate() + 7);
      filter.nextFollowUpAt = { $gte: startOfWeek, $lte: endOfWeek };
    }

    // Build sort
    let sort = {};
    switch (sortBy) {
      case 'recent':
        sort = { updatedAt: -1 };
        break;
      case 'old':
        sort = { createdAt: 1 };
        break;
      case 'highest-value':
        sort = { value: -1 };
        break;
      case 'lowest-value':
        sort = { value: 1 };
        break;
      case 'name':
        sort = { name: 1 };
        break;
      case 'next-follow-up':
        sort = { nextFollowUpAt: 1 };
        break;
      default:
        sort = { updatedAt: -1 };
    }

    // Execute query
    const skip = (Number(page) - 1) * Number(pageSize);
    const [leads, total] = await Promise.all([
      Customer.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(Number(pageSize))
        .populate('stage', 'name color isWon isLost')
        .populate('assignedTo', 'name')
        .populate('labels', 'name color')
        .populate('campaign', 'name')
        .lean(),
      Customer.countDocuments(filter)
    ]);

    // Get stats
    const allLeads = await Customer.find({ company: companyId, isDeleted: { $ne: true } }).lean();
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const leadStats = {
      totalLeads: allLeads.length,
      newLeads: allLeads.filter(l => new Date(l.createdAt) >= sevenDaysAgo).length,
      qualifiedLeads: allLeads.filter(l => !l.stage?.isWon && !l.stage?.isLost && l.priority !== 'low').length,
      hotLeads: allLeads.filter(l => l.priority === 'high' && !l.stage?.isWon && !l.stage?.isLost).length,
      overdueLeads: allLeads.filter(l => 
        l.nextFollowUpAt && new Date(l.nextFollowUpAt) < now && !l.stage?.isWon && !l.stage?.isLost
      ).length
    };

    // Get filter options
    const [stages, labels, fields, companies, campaigns, users] = await Promise.all([
      require('../../models/Stage').find({ company: companyId, isActive: true }).sort({ order: 1 }).lean(),
      require('../../models/Label').find({ company: companyId, isActive: true }).lean(),
      require('../../models/CustomField').find({ company: companyId, entityType: 'lead' }).sort({ order: 1 }).lean(),
      require('../../models/ClientCompany').find({ company: companyId, isActive: true }).select('name').lean(),
      require('../../models/Campaign').find({ company: companyId, isActive: true }).select('name').lean(),
      User.find({ company: companyId, role: { $in: ['admin', 'manager', 'specialist'] } }).select('name').lean()
    ]);

    res.json({
      ok: true,
      data: leads,
      stages,
      labels,
      fields,
      companies,
      campaigns,
      users,
      savedViews: [], // TODO: implement saved views
      leadStats,
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(total / Number(pageSize)),
        totalResults: total
      }
    });
  } catch (error) {
    console.error('Customers list error:', error);
    res.status(500).json({ ok: false, error: 'Failed to load customers' });
  }
});

// Get single customer
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user.activeCompany;

    const customer = await Customer.findOne({ _id: id, company: companyId })
      .populate('stage', 'name color isWon isLost')
      .populate('assignedTo', 'name email')
      .populate('labels', 'name color')
      .populate('campaign', 'name')
      .populate('clientCompany', 'name')
      .lean();

    if (!customer) {
      return res.status(404).json({ ok: false, error: 'Lead not found' });
    }

    // Get activities
    const activities = await Activity.find({ customer: id })
      .sort({ createdAt: -1 })
      .populate('user', 'name')
      .lean();

    // Get custom fields
    const fields = await require('../../models/CustomField').find({ 
      company: companyId, 
      entityType: 'lead' 
    }).sort({ order: 1 }).lean();

    res.json({ ok: true, data: customer, activities, fields });
  } catch (error) {
    console.error('Customer get error:', error);
    res.status(500).json({ ok: false, error: 'Failed to load customer' });
  }
});

// Create customer
router.post('/', async (req, res) => {
  try {
    const companyId = req.user.activeCompany;
    const userId = req.user._id;
    const { customData, ...customerData } = req.body;

    const customer = await Customer.create({
      ...customerData,
      company: companyId,
      createdBy: userId,
      assignedTo: customerData.assignedTo || userId,
      customData: customData || {}
    });

    // Log activity
    await Activity.create({
      customer: customer._id,
      type: 'created',
      note: 'Lead created',
      user: userId,
      company: companyId
    });

    res.status(201).json({ ok: true, data: customer });
  } catch (error) {
    console.error('Customer create error:', error);
    res.status(500).json({ ok: false, error: 'Failed to create customer' });
  }
});

// Update customer
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user.activeCompany;
    const userId = req.user._id;
    const { customData, ...updateData } = req.body;

    const customer = await Customer.findOne({ _id: id, company: companyId });
    if (!customer) {
      return res.status(404).json({ ok: false, error: 'Lead not found' });
    }

    // Track changes for activity
    const changes = [];
    Object.keys(updateData).forEach(key => {
      if (customer[key] !== updateData[key]) {
        changes.push(key);
      }
    });

    // Update customer
    Object.assign(customer, updateData);
    if (customData) {
      customer.customData = { ...customer.customData, ...customData };
    }
    await customer.save();

    // Log activity
    if (changes.length > 0) {
      await Activity.create({
        customer: id,
        type: 'updated',
        note: `Updated fields: ${changes.join(', ')}`,
        user: userId,
        company: companyId
      });
    }

    res.json({ ok: true, data: customer });
  } catch (error) {
    console.error('Customer update error:', error);
    res.status(500).json({ ok: false, error: 'Failed to update customer' });
  }
});

// Delete customer (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user.activeCompany;
    const userId = req.user._id;

    const customer = await Customer.findOne({ _id: id, company: companyId });
    if (!customer) {
      return res.status(404).json({ ok: false, error: 'Lead not found' });
    }

    customer.isDeleted = true;
    customer.deletedAt = new Date();
    await customer.save();

    // Log activity
    await Activity.create({
      customer: id,
      type: 'deleted',
      note: 'Lead deleted',
      user: userId,
      company: companyId
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Customer delete error:', error);
    res.status(500).json({ ok: false, error: 'Failed to delete customer' });
  }
});

// Bulk actions
router.post('/bulk', async (req, res) => {
  try {
    const companyId = req.user.activeCompany;
    const userId = req.user._id;
    const { action, selectedIds, ...params } = req.body;

    if (!selectedIds || selectedIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'No leads selected' });
    }

    const filter = { _id: { $in: selectedIds }, company: companyId };

    switch (action) {
      case 'delete':
        await Customer.updateMany(filter, { 
          isDeleted: true, 
          deletedAt: new Date() 
        });
        break;

      case 'assign':
        if (!params.assignedTo) {
          return res.status(400).json({ ok: false, error: 'No user specified' });
        }
        await Customer.updateMany(filter, { assignedTo: params.assignedTo });
        break;

      case 'stage':
        if (!params.stage) {
          return res.status(400).json({ ok: false, error: 'No stage specified' });
        }
        await Customer.updateMany(filter, { stage: params.stage });
        break;

      case 'priority':
        if (!params.priority) {
          return res.status(400).json({ ok: false, error: 'No priority specified' });
        }
        await Customer.updateMany(filter, { priority: params.priority });
        break;

      case 'addLabel':
        if (!params.label) {
          return res.status(400).json({ ok: false, error: 'No label specified' });
        }
        await Customer.updateMany(filter, { 
          $addToSet: { labels: params.label } 
        });
        break;

      case 'removeLabel':
        if (!params.label) {
          return res.status(400).json({ ok: false, error: 'No label specified' });
        }
        await Customer.updateMany(filter, { 
          $pull: { labels: params.label } 
        });
        break;

      default:
        return res.status(400).json({ ok: false, error: 'Invalid action' });
    }

    // Log activity for bulk action
    await Activity.create({
      customer: selectedIds[0], // Log to first customer
      type: 'bulk_action',
      note: `Bulk ${action} on ${selectedIds.length} leads`,
      user: userId,
      company: companyId
    });

    res.json({ ok: true, message: `Bulk ${action} completed` });
  } catch (error) {
    console.error('Bulk action error:', error);
    res.status(500).json({ ok: false, error: 'Failed to perform bulk action' });
  }
});

module.exports = router;
