const { getWonStageIdSet } = require('../services/crmStages');

function getStageBuckets(customers, stages) {
  const wonStageIds = getWonStageIdSet(stages);
  const lostStageIds = new Set(stages.filter(stage => stage.isLost).map(stage => String(stage._id)));
  const wonCustomers = customers.filter(customer => customer.stage && wonStageIds.has(String(customer.stage._id || customer.stage)));
  const lostCustomers = customers.filter(customer => customer.stage && lostStageIds.has(String(customer.stage._id || customer.stage)));
  const activeCustomers = customers.filter(customer => {
    const stage = customer.stage || {};
    return !stage.isWon && !stage.isLost;
  });

  return { wonCustomers, lostCustomers, activeCustomers };
}

function calculateCampaignMetrics(campaign, customers, stages) {
  const { wonCustomers, lostCustomers, activeCustomers } = getStageBuckets(customers, stages);
  const totalLeads = customers.length;
  const spent = Number(campaign.spent || 0);
  const budget = Number(campaign.budget || 0);
  const pipelineValue = activeCustomers.reduce((sum, customer) => sum + Number(customer.value || 0), 0);
  const totalPipelineValue = customers.reduce((sum, customer) => sum + Number(customer.value || 0), 0);
  const wonValue = wonCustomers.reduce((sum, customer) => sum + Number(customer.value || 0), 0);
  const clicks = Number(campaign.clicksCount || 0);
  const conversions = Number(campaign.conversionsCount || 0);

  return {
    totalLeads,
    activeCustomers: activeCustomers.length,
    wonCount: wonCustomers.length,
    lostCount: lostCustomers.length,
    pipelineValue,
    totalPipelineValue,
    wonValue,
    spent,
    budget,
    costPerLead: totalLeads ? spent / totalLeads : 0,
    costPerWonLead: wonCustomers.length ? spent / wonCustomers.length : 0,
    roi: spent ? ((wonValue - spent) / spent) * 100 : 0,
    budgetUtilization: budget ? (spent / budget) * 100 : 0,
    clickToLeadRate: clicks ? (totalLeads / clicks) * 100 : 0,
    conversionRate: totalLeads ? (wonCustomers.length / totalLeads) * 100 : 0,
    trackedConversionRate: clicks ? (conversions / clicks) * 100 : 0
  };
}

function calculateCompanyMetrics(company, customers, campaigns, stages) {
  const { wonCustomers, lostCustomers, activeCustomers } = getStageBuckets(customers, stages);
  const totalLeads = customers.length;
  const spend = campaigns.reduce((sum, campaign) => sum + Number(campaign.spent || 0), 0);
  const budget = campaigns.reduce((sum, campaign) => sum + Number(campaign.budget || 0), 0);
  const pipelineValue = activeCustomers.reduce((sum, customer) => sum + Number(customer.value || 0), 0);
  const wonValue = wonCustomers.reduce((sum, customer) => sum + Number(customer.value || 0), 0);
  const now = new Date();
  const overdueFollowups = activeCustomers.filter(customer => customer.nextFollowUpAt && customer.nextFollowUpAt <= now).length;

  return {
    totalLeads,
    activeCount: activeCustomers.length,
    wonCount: wonCustomers.length,
    lostCount: lostCustomers.length,
    pipelineValue,
    wonValue,
    winRate: totalLeads ? ((wonCustomers.length / totalLeads) * 100).toFixed(1) : '0.0',
    campaignCount: campaigns.length,
    activeCampaignCount: campaigns.filter(campaign => campaign.status === 'active').length,
    budget,
    spend,
    costPerLead: totalLeads ? spend / totalLeads : 0,
    roi: spend ? ((wonValue - spend) / spend) * 100 : 0,
    overdueFollowups,
    accountStatus: company.status
  };
}

function getDateRangeFilter(dateFrom, dateTo) {
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
  return Object.keys(createdAt).length ? { createdAt } : {};
}

module.exports = { calculateCampaignMetrics, calculateCompanyMetrics, getDateRangeFilter };
