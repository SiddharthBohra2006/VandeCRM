const express = require('express');
const router = express.Router();
const Customer = require('../../models/Customer');
const User = require('../../models/User');

router.get('/', async (req, res) => {
  try {
    const companyId = req.user.activeCompany;
    const userId = req.user._id;
    const userRole = req.user.role;
    const isSpecialist = userRole === 'specialist';

    // Get date ranges
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Build base filter
    const baseFilter = { company: companyId };
    if (isSpecialist) {
      baseFilter.assignedTo = userId;
    }

    // Get all leads for the company (or assigned to specialist)
    const leads = await Customer.find({
      ...baseFilter,
      isDeleted: { $ne: true }
    }).populate('stage', 'name color isWon isLost').lean();

    // Calculate stats
    const totalLeads = leads.length;
    const activeLeads = leads.filter(l => !l.stage?.isWon && !l.stage?.isLost).length;
    const wonLeads = leads.filter(l => l.stage?.isWon).length;
    const lostLeads = leads.filter(l => l.stage?.isLost).length;
    const hotLeads = leads.filter(l => l.priority === 'high' && !l.stage?.isWon && !l.stage?.isLost).length;

    // New leads this month
    const newLeadsThisMonth = leads.filter(l => 
      new Date(l.createdAt) >= startOfMonth
    ).length;

    // Total value
    const totalValue = leads.reduce((sum, l) => sum + (l.value || 0), 0);
    const wonValue = leads.filter(l => l.stage?.isWon).reduce((sum, l) => sum + (l.value || 0), 0);

    // Overdue follow-ups
    const overdueFollowUps = leads.filter(l => 
      l.nextFollowUpAt && new Date(l.nextFollowUpAt) < now && !l.stage?.isWon && !l.stage?.isLost
    ).length;

    // Leads by stage
    const stageMap = {};
    leads.forEach(l => {
      const stageName = l.stage?.name || 'No Stage';
      if (!stageMap[stageName]) stageMap[stageName] = { count: 0, value: 0, color: l.stage?.color || '#64748b' };
      stageMap[stageName].count++;
      stageMap[stageName].value += l.value || 0;
    });

    // Leads by source
    const sourceMap = {};
    leads.forEach(l => {
      const source = l.source || 'Unknown';
      if (!sourceMap[source]) sourceMap[source] = 0;
      sourceMap[source]++;
    });

    // Leads by priority
    const priorityMap = { high: 0, medium: 0, low: 0 };
    leads.forEach(l => {
      if (priorityMap.hasOwnProperty(l.priority)) {
        priorityMap[l.priority]++;
      }
    });

    // Recent activity (leads updated in last 7 days)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentActivity = leads
      .filter(l => new Date(l.updatedAt) >= sevenDaysAgo)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 10);

    // Team performance (if not specialist)
    let teamPerformance = [];
    if (!isSpecialist) {
      const teamLeads = await Customer.find({
        company: companyId,
        isDeleted: { $ne: true }
      }).populate('assignedTo', 'name').lean();

      const userMap = {};
      teamLeads.forEach(l => {
        const userName = l.assignedTo?.name || 'Unassigned';
        const userId = l.assignedTo?._id?.toString() || 'unassigned';
        if (!userMap[userId]) userMap[userId] = { name: userName, total: 0, won: 0, value: 0 };
        userMap[userId].total++;
        if (l.stage?.isWon) userMap[userId].won++;
        userMap[userId].value += l.value || 0;
      });

      teamPerformance = Object.values(userMap)
        .sort((a, b) => b.won - a.won)
        .slice(0, 5);
    }

    res.json({
      ok: true,
      data: {
        stats: {
          totalLeads,
          activeLeads,
          wonLeads,
          lostLeads,
          hotLeads,
          newLeadsThisMonth,
          totalValue,
          wonValue,
          overdueFollowUps
        },
        charts: {
          leadsByStage: Object.entries(stageMap).map(([name, data]) => ({
            name,
            ...data
          })),
          leadsBySource: Object.entries(sourceMap)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8),
          leadsByPriority: Object.entries(priorityMap).map(([name, count]) => ({ name, count }))
        },
        recentActivity,
        teamPerformance
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ ok: false, error: 'Failed to load dashboard' });
  }
});

module.exports = router;
