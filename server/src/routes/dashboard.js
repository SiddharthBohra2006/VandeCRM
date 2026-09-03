const express = require('express');
const { hasPermission, hasWorkPermission, isRestrictedRole, isRestrictedUser } = require('../config/roles');
const { requirePermission } = require('../middleware/auth');

const Customer = require('../models/Customer');
const CrmStage = require('../models/CrmStage');
const Activity = require('../models/Activity');
const AuditLog = require('../models/AuditLog');
const { movementAuditFilter, dashboardMovements, sampleMovements } = require('../utils/dashboardMovements');
const CustomField = require('../models/CustomField');
const ClientCompany = require('../models/ClientCompany');
const Campaign = require('../models/Campaign');
const CustomRecord = require('../models/CustomRecord');
const WorkType = require('../models/WorkType');
const { getWonStageIdSet } = require('../services/crmStages');
const DashboardView = require('../models/DashboardView');
const SavedReport = require('../models/SavedReport');
const User = require('../models/User');
const { toCsv } = require('../utils/csv');
const { calculateCampaignMetrics, calculateCompanyMetrics, getDateRangeFilter } = require('../utils/reporting');
const { createSimpleReportPdf } = require('../utils/pdf');
const { logAudit } = require('../utils/audit');
const { isClosed, isComplete } = require('../utils/workCompletion');
const { reportOptions, normalizeConfig, buildModuleReport } = require('../utils/moduleReporting');

const router = express.Router();

router.post('/preferences/sidebar', async (req, res, next) => {
  try {
    const allowed = ['nav-task-center', 'nav-portfolio', 'nav-pipeline', 'nav-database', 'nav-tasks', 'nav-analytics', 'nav-reports', 'nav-mail', 'nav-companies', 'nav-campaigns', 'nav-team', 'nav-settings', 'nav-audit'];
    if (req.activeCompany) {
      const workTypes = await WorkType.find({ organization: req.user.organization._id, clientCompany: req.activeCompany._id }).select('key').lean();
      allowed.push(...workTypes.map(workType => `nav-work-${workType.key}`));
    }
    const selected = Array.isArray(req.body.hiddenItems) ? req.body.hiddenItems : (req.body.hiddenItems ? [req.body.hiddenItems] : []);
    req.user.sidebarHiddenItems = selected.filter(item => allowed.includes(item));
    await req.user.save();
    res.redirect(req.body.returnTo?.startsWith('/') ? req.body.returnTo : '/');
  } catch (error) {
    next(error);
  }
});

router.post('/preferences/dashboard', async (req, res, next) => {
  try {
    const allowed = ['metrics', 'work-progress', 'deadlines', 'pipeline', 'attention', 'recent', 'activity'];
    const selected = Array.isArray(req.body.hiddenSections) ? req.body.hiddenSections : (req.body.hiddenSections ? [req.body.hiddenSections] : []);
    const cleanCardKeys = value => String(value || '').split(',').map(item => item.trim()).filter(item => /^[a-z0-9_-]+$/i.test(item)).slice(0, 200);
    const hiddenCards = cleanCardKeys(req.body.dashboardHiddenCards);
    const cardOrder = cleanCardKeys(req.body.dashboardCardOrder);
    console.log('[dashboard-customizer] request received', {
      hiddenFieldType: Array.isArray(req.body.dashboardHiddenCards) ? 'array' : typeof req.body.dashboardHiddenCards,
      orderFieldType: Array.isArray(req.body.dashboardCardOrder) ? 'array' : typeof req.body.dashboardCardOrder,
      hiddenCards,
      cardOrder
    });
    req.user.dashboardHiddenSections = selected.filter(section => allowed.includes(section));
    req.user.dashboardHiddenCards = hiddenCards;
    req.user.dashboardCardOrder = cardOrder;
    req.user.dashboardCardsCustomized = true;
    await req.user.save();
    console.log('[dashboard-customizer] preferences saved', {
      hiddenCards: req.user.dashboardHiddenCards,
      cardOrder: req.user.dashboardCardOrder,
      hiddenSections: req.user.dashboardHiddenSections
    });
    if (req.get('accept')?.includes('application/json')) {
      return res.json({
        hiddenCards: req.user.dashboardHiddenCards,
        cardOrder: req.user.dashboardCardOrder,
        hiddenSections: req.user.dashboardHiddenSections
      });
    }
    res.redirect('/');
  } catch (error) {
    next(error);
  }
});

router.post('/preferences/dashboard/diagnostic', (req, res) => {
  const list = value => Array.isArray(value) ? value.map(String).slice(0, 200) : [];
  console.log('[dashboard-customizer] browser initialized', {
    scriptVersion: Number(req.body.scriptVersion || 0),
    cardCount: Number(req.body.cardCount || 0),
    toggleCount: Number(req.body.toggleCount || 0),
    serverCustomized: req.body.serverCustomized === true,
    committedHidden: list(req.body.committedHidden),
    committedOrder: list(req.body.committedOrder),
    checkedCards: list(req.body.checkedCards),
    visibleDashboardCards: list(req.body.visibleDashboardCards),
    pinnedCountText: String(req.body.pinnedCountText || ''),
    previousSubmissionMatchedServer: req.body.previousSubmissionMatchedServer || null
  });
  res.sendStatus(204);
});

router.post('/preferences/dashboard/views', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 60);
    const allowed = ['metrics', 'work-progress', 'deadlines', 'pipeline', 'attention', 'recent', 'activity'];
    const hiddenSections = (Array.isArray(req.body.hiddenSections) ? req.body.hiddenSections : String(req.body.hiddenSections || '').split(',')).filter(item => allowed.includes(item));
    const cardOrder = String(req.body.cardOrder || '').split(',').map(item => item.trim()).filter(Boolean).slice(0, 40);
    const customFieldMetrics = String(req.body.customFieldMetrics || '').split(',').map(item => item.trim()).filter(Boolean).slice(0, 6);
    if (!name) return res.redirect('/?error=Enter+a+dashboard+view+name.');
    await DashboardView.findOneAndUpdate({ organization: req.user.organization._id, user: req.user._id, name }, { hiddenSections, cardOrder, customFieldMetrics }, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.redirect('/?success=Dashboard+view+saved.');
  } catch (error) { next(error); }
});

router.get('/portfolio', async (req, res, next) => {
  if (req.user.role !== 'admin' || !req.activeCompany?.isMain) return res.status(403).render('errors/403', { title: 'Main CRM access required' });
  try {
    const organization = req.user.organization._id;
    const requestedDetail = String(req.query.detail || '');
    const detail = ['leads', 'work'].includes(requestedDetail) || /^[a-f0-9]{24}$/i.test(requestedDetail) ? requestedDetail : '';
    const companies = await ClientCompany.find({ organization, status: { $ne: 'inactive' } }).sort({ isMain: -1, name: 1 });
    const companyIds = companies.map(company => company._id);
    const [leadGroups, workItems, workTypes, campaigns, detailLeads] = await Promise.all([
      Customer.aggregate([
        { $match: { organization, clientCompany: { $in: companyIds } } },
        { $group: { _id: '$clientCompany', count: { $sum: 1 }, value: { $sum: '$value' } } }
      ]),
      CustomRecord.find({ organization, workspace: { $in: companyIds } }).populate('clientCompany workType').sort({ updatedAt: -1 }),
      WorkType.find({ organization, clientCompany: { $in: companyIds }, isActive: true }).populate('clientCompany').sort({ order: 1, name: 1 }),
      Campaign.find({ organization, clientCompany: { $in: companyIds } }),
      detail === 'leads'
        ? Customer.find({ organization, clientCompany: { $in: companyIds } }).populate('clientCompany stage').sort({ updatedAt: -1 }).limit(100)
        : []
    ]);
    const leadMap = new Map(leadGroups.map(row => [String(row._id), row]));
    const perCrm = companies.map(company => {
      const companyWork = workItems.filter(item => String(item.clientCompany?._id) === String(company._id));
      const companyCampaigns = campaigns.filter(item => String(item.clientCompany) === String(company._id));
      const leads = leadMap.get(String(company._id)) || { count: 0, value: 0 };
      return {
        company,
        leads: leads.count,
        value: leads.value,
        openWork: companyWork.filter(item => !isClosed(item) && item.status !== 'on_hold').length,
        moduleCounts: workTypes.filter(type => String(type.clientCompany?._id) === String(company._id)).map(type => ({ name: type.name, count: companyWork.filter(item => String(item.workType?._id) === String(type._id)).length })),
        adSpend: companyCampaigns.reduce((sum, item) => sum + Number(item.spent || 0), 0)
      };
    });
    const visibleWork = detail === 'work'
      ? workItems.filter(item => !isClosed(item) && item.status !== 'on_hold').slice(0, 100)
      : detail && detail !== 'leads' ? workItems.filter(item => String(item.workType?._id) === detail).slice(0, 100) : [];
    const workLibrary = workTypes
      .map(workType => ({
        _id: workType._id,
        name: workType.name,
        company: workType.clientCompany?.name || '',
        count: workItems.filter(item => String(item.workType?._id) === String(workType._id) && !isClosed(item) && item.status !== 'on_hold').length
      }))
      .filter(item => item.count > 0);
    res.render('dashboard/portfolio', {
      title: 'All CRM Overview',
      companies,
      perCrm,
      detail,
      detailLeads,
      visibleWork,
      workLibrary,
      totals: {
        crms: companies.length,
        leads: perCrm.reduce((sum, item) => sum + item.leads, 0),
        value: perCrm.reduce((sum, item) => sum + item.value, 0),
        openWork: perCrm.reduce((sum, item) => sum + item.openWork, 0)
      }
    });
  } catch (error) {
    next(error);
  }
});

async function getClientPortalCompany(req) {
  const organization = req.user.organization._id;
  const selectedCompanyId = req.query.company || '';
  const companyFilter = { organization, status: 'active' };

  if (req.user.role === 'client') {
    companyFilter.assignedUsers = req.user._id;
  }

  const companies = await ClientCompany.find(companyFilter).sort({ name: 1 });
  const company = companies.find(item => String(item._id) === selectedCompanyId) || companies[0] || null;
  return { organization, companies, company };
}

function getPackageDateRange(query) {
  if (query.month && /^\d{4}-\d{2}$/.test(query.month)) {
    const [year, month] = query.month.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    return {
      dateFrom: start.toISOString().slice(0, 10),
      dateTo: end.toISOString().slice(0, 10),
      label: start.toLocaleString('en-IN', { month: 'long', year: 'numeric' })
    };
  }
  return {
    dateFrom: query.dateFrom || '',
    dateTo: query.dateTo || '',
    label: reportDateLabel(query)
  };
}

function scopedLeadFilter(req, extra = {}) {
  const filter = { organization: req.user.organization._id, clientCompany: req.activeCompany._id, ...extra };
  if (isRestrictedUser(req.user)) filter.assignedTo = req.user._id;
  return filter;
}

function getDateFilterFromQuery(query) {
  return getDateRangeFilter(query.dateFrom || '', query.dateTo || '');
}

function reportDateLabel(query) {
  const from = query.dateFrom || 'all time';
  const to = query.dateTo || 'today';
  return `${from} to ${to}`;
}

function sendReportCsv(res, filename, columns, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(columns, rows));
}

function sendReportPdf(res, filename, title, subtitle, columns, rows) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(createSimpleReportPdf(title, subtitle, columns, rows));
}

async function buildClientReportPackage(req) {
  const { organization, company } = await getClientPortalCompany(req);
  const range = getPackageDateRange(req.query);
  const leadDateFilter = getDateRangeFilter(range.dateFrom, range.dateTo);
  if (!company) return null;

  const [campaignDocs, customers, stages] = await Promise.all([
    Campaign.find({ clientCompany: company._id, organization }),
    Customer.find({ clientCompany: company._id, organization, ...leadDateFilter }).populate('stage campaign').sort({ createdAt: -1 }),
    CrmStage.find({ organization, clientCompany: company._id })
  ]);
  const metrics = calculateCompanyMetrics(company, customers, campaignDocs, stages);
  const rows = [
    { Section: 'Summary', Item: 'Total Leads', Metric: metrics.totalLeads, Value: '', Notes: range.label },
    { Section: 'Summary', Item: 'Active Pipeline', Metric: metrics.activeCount, Value: `Rs. ${metrics.pipelineValue.toLocaleString('en-IN')}`, Notes: 'Open lead value' },
    { Section: 'Summary', Item: 'Won Revenue', Metric: metrics.wonCount, Value: `Rs. ${metrics.wonValue.toLocaleString('en-IN')}`, Notes: `${metrics.winRate}% win rate` },
    { Section: 'Summary', Item: 'Ad Spend', Metric: `Rs. ${metrics.spend.toLocaleString('en-IN')}`, Value: `Rs. ${Math.round(metrics.costPerLead).toLocaleString('en-IN')} CPL`, Notes: `${Math.round(metrics.roi).toLocaleString('en-IN')}% ROI` }
  ];

  campaignDocs.forEach(campaign => {
    const campaignCustomers = customers.filter(customer => customer.campaign && String(customer.campaign._id || customer.campaign) === String(campaign._id));
    const campaignMetrics = calculateCampaignMetrics(campaign, campaignCustomers, stages);
    rows.push({
      Section: 'Campaign',
      Item: campaign.name,
      Metric: campaign.platform,
      Value: `Rs. ${Number(campaign.spent || 0).toLocaleString('en-IN')}`,
      Notes: `${campaignMetrics.totalLeads} leads, Rs. ${Math.round(campaignMetrics.costPerLead).toLocaleString('en-IN')} CPL`
    });
  });

  customers.slice(0, 40).forEach(customer => {
    rows.push({
      Section: 'Lead',
      Item: customer.name,
      Metric: customer.stage ? customer.stage.name : 'Intake',
      Value: `Rs. ${Number(customer.value || 0).toLocaleString('en-IN')}`,
      Notes: customer.campaign ? customer.campaign.name : customer.source || 'Organic / Direct'
    });
  });

  return {
    company,
    range,
    columns: ['Section', 'Item', 'Metric', 'Value', 'Notes'],
    rows
  };
}

async function getReportFilters(req) {
  const organization = req.user.organization._id;
  const companyFilter = { organization, _id: req.activeCompany._id, status: 'active' };
  if (isRestrictedUser(req.user)) companyFilter.assignedUsers = req.user._id;
  const agentCompanyIds = isRestrictedUser(req.user)
    ? await ClientCompany.find(companyFilter).distinct('_id')
    : null;
  const [companies, campaigns, agents] = await Promise.all([
    ClientCompany.find(companyFilter).sort({ name: 1 }),
    Campaign.find({ organization, ...(agentCompanyIds ? { clientCompany: { $in: agentCompanyIds } } : {}) }).sort({ name: 1 }),
    User.find({ organization, isActive: { $ne: false }, role: { $in: ['admin', 'manager', 'agent'] } }).sort({ name: 1 })
  ]);
  return { companies, campaigns, agents, agentCompanyIds };
}

async function getAgentPerformanceReport(req) {
  const organization = req.user.organization._id;
  const filters = await getReportFilters(req);
  const leadFilter = scopedLeadFilter(req, getDateFilterFromQuery(req.query));
  if (req.query.campaign) leadFilter.campaign = req.query.campaign;
  if (req.query.agent) leadFilter.assignedTo = req.query.agent;

  const [customers, stages] = await Promise.all([
    Customer.find(leadFilter).populate('assignedTo stage clientCompany campaign'),
    CrmStage.find({ organization, clientCompany: req.activeCompany._id })
  ]);
  const wonStageIds = getWonStageIdSet(stages);
  const lostStageIds = new Set(stages.filter(stage => stage.isLost).map(stage => String(stage._id)));
  const grouped = new Map();

  customers.forEach(customer => {
    const key = customer.assignedTo ? String(customer.assignedTo._id) : 'unassigned';
    if (!grouped.has(key)) {
      grouped.set(key, {
        Agent: customer.assignedTo ? customer.assignedTo.name : 'Unassigned',
        Leads: 0,
        Active: 0,
        Won: 0,
        Lost: 0,
        'Pipeline Value': 0,
        'Won Revenue': 0,
        'Win Rate': '0.0%'
      });
    }
    const row = grouped.get(key);
    row.Leads += 1;
    row['Pipeline Value'] += Number(customer.value || 0);
    const stageId = customer.stage && String(customer.stage._id || customer.stage);
    if (wonStageIds.has(stageId)) {
      row.Won += 1;
      row['Won Revenue'] += Number(customer.value || 0);
    } else if (lostStageIds.has(stageId)) {
      row.Lost += 1;
    } else {
      row.Active += 1;
    }
  });

  const rows = Array.from(grouped.values()).map(row => ({
    ...row,
    'Win Rate': row.Leads ? `${((row.Won / row.Leads) * 100).toFixed(1)}%` : '0.0%'
  })).sort((a, b) => b.Leads - a.Leads);
  return { title: 'Agent Performance Report', columns: ['Agent', 'Leads', 'Active', 'Won', 'Lost', 'Pipeline Value', 'Won Revenue', 'Win Rate'], rows, filters };
}

async function getFollowupComplianceReport(req) {
  const filters = await getReportFilters(req);
  const leadFilter = scopedLeadFilter(req, getDateFilterFromQuery(req.query));
  if (req.query.agent) leadFilter.assignedTo = req.query.agent;
  const now = new Date();
  const customers = await Customer.find(leadFilter).populate('assignedTo stage clientCompany campaign').sort({ nextFollowUpAt: 1 });
  const rows = customers.map(customer => {
    const dueDate = customer.nextFollowUpAt;
    const overdueDays = dueDate && dueDate < now ? Math.ceil((now - dueDate) / (1000 * 60 * 60 * 24)) : 0;
    return {
      Lead: customer.name,
      Agent: customer.assignedTo ? customer.assignedTo.name : 'Unassigned',
      Company: customer.clientCompany ? customer.clientCompany.name : customer.company || '',
      Stage: customer.stage ? customer.stage.name : '',
      'Next Follow-up': dueDate ? dueDate.toISOString().slice(0, 10) : 'Missing',
      Status: !dueDate ? 'Missing' : dueDate < now ? 'Overdue' : 'Scheduled',
      'Overdue Days': overdueDays
    };
  });
  return { title: 'Follow-up Compliance Report', columns: ['Lead', 'Agent', 'Company', 'Stage', 'Next Follow-up', 'Status', 'Overdue Days'], rows, filters };
}

async function getStaleLeadReport(req) {
  const filters = await getReportFilters(req);
  const staleDays = Math.max(1, Number(req.query.staleDays || 14));
  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - staleDays);
  const leadFilter = scopedLeadFilter(req, getDateFilterFromQuery(req.query));
  if (req.query.agent) leadFilter.assignedTo = req.query.agent;
  leadFilter.$or = [{ lastContactedAt: null }, { lastContactedAt: { $lte: staleDate } }];

  const customers = await Customer.find(leadFilter).populate('assignedTo stage clientCompany campaign').sort({ lastContactedAt: 1 });
  const rows = customers.map(customer => {
    const reference = customer.lastContactedAt || customer.createdAt;
    const staleFor = Math.max(0, Math.ceil((new Date() - reference) / (1000 * 60 * 60 * 24)));
    return {
      Lead: customer.name,
      Agent: customer.assignedTo ? customer.assignedTo.name : 'Unassigned',
      Company: customer.clientCompany ? customer.clientCompany.name : customer.company || '',
      Stage: customer.stage ? customer.stage.name : '',
      Source: customer.source || '',
      'Last Contacted': customer.lastContactedAt ? customer.lastContactedAt.toISOString().slice(0, 10) : 'Never',
      'Stale Days': staleFor,
      Value: Number(customer.value || 0)
    };
  });
  return { title: 'Stale Lead Report', columns: ['Lead', 'Agent', 'Company', 'Stage', 'Source', 'Last Contacted', 'Stale Days', 'Value'], rows, filters, staleDays };
}

async function getSourceAttributionReport(req) {
  const organization = req.user.organization._id;
  const filters = await getReportFilters(req);
  const leadFilter = scopedLeadFilter(req, getDateFilterFromQuery(req.query));
  if (req.query.campaign) leadFilter.campaign = req.query.campaign;
  const [customers, stages] = await Promise.all([
    Customer.find(leadFilter).populate('stage clientCompany campaign'),
    CrmStage.find({ organization, clientCompany: req.activeCompany._id })
  ]);
  const wonStageIds = getWonStageIdSet(stages);
  const grouped = new Map();
  customers.forEach(customer => {
    const key = [
      customer.source || 'Unknown',
      customer.utmSource || '',
      customer.utmMedium || '',
      customer.utmCampaign || ''
    ].join('|');
    if (!grouped.has(key)) {
      grouped.set(key, {
        Source: customer.source || 'Unknown',
        'UTM Source': customer.utmSource || '',
        'UTM Medium': customer.utmMedium || '',
        'UTM Campaign': customer.utmCampaign || '',
        Leads: 0,
        Won: 0,
        'Pipeline Value': 0,
        'Won Revenue': 0,
        'Win Rate': '0.0%'
      });
    }
    const row = grouped.get(key);
    row.Leads += 1;
    row['Pipeline Value'] += Number(customer.value || 0);
    if (customer.stage && wonStageIds.has(String(customer.stage._id || customer.stage))) {
      row.Won += 1;
      row['Won Revenue'] += Number(customer.value || 0);
    }
  });
  const rows = Array.from(grouped.values()).map(row => ({
    ...row,
    'Win Rate': row.Leads ? `${((row.Won / row.Leads) * 100).toFixed(1)}%` : '0.0%'
  })).sort((a, b) => b.Leads - a.Leads);
  return { title: 'Source Attribution Report', columns: ['Source', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'Leads', 'Won', 'Pipeline Value', 'Won Revenue', 'Win Rate'], rows, filters };
}

async function getCustomReport(req) {
  const organization = req.user.organization._id;
  const filters = await getReportFilters(req);
  const groupBy = ['agent', 'source', 'stage', 'campaign', 'company'].includes(req.query.groupBy) ? req.query.groupBy : 'stage';
  const allowedMetrics = ['leads', 'active', 'won', 'lost', 'pipelineValue', 'wonRevenue', 'winRate'];
  const requested = (Array.isArray(req.query.metrics) ? req.query.metrics : [req.query.metrics || 'leads']).filter(metric => allowedMetrics.includes(metric));
  const metrics = requested.length ? requested : ['leads'];
  const leadFilter = scopedLeadFilter(req, getDateFilterFromQuery(req.query));
  const customers = await Customer.find(leadFilter).populate('assignedTo stage clientCompany campaign');
  const labelFor = customer => ({
    agent: customer.assignedTo?.name || 'Unassigned',
    source: customer.source || 'Unknown',
    stage: customer.stage?.name || 'No stage',
    campaign: customer.campaign?.name || 'No campaign',
    company: customer.clientCompany?.name || customer.company || 'No company'
  })[groupBy];
  const groups = new Map();
  customers.forEach(customer => {
    const label = labelFor(customer);
    if (!groups.has(label)) groups.set(label, { label, leads: 0, active: 0, won: 0, lost: 0, pipelineValue: 0, wonRevenue: 0 });
    const row = groups.get(label);
    const value = Number(customer.value || 0);
    row.leads += 1;
    row.pipelineValue += value;
    if (customer.stage?.isWon) { row.won += 1; row.wonRevenue += value; }
    else if (customer.stage?.isLost) row.lost += 1;
    else row.active += 1;
  });
  const names = { agent: 'Agent', source: 'Source', stage: 'Stage', campaign: 'Campaign', company: 'Company' };
  const metricNames = { leads: 'Leads', active: 'Active', won: 'Won', lost: 'Lost', pipelineValue: 'Pipeline Value', wonRevenue: 'Won Revenue', winRate: 'Win Rate' };
  const columns = [names[groupBy], ...metrics.map(metric => metricNames[metric])];
  const rows = Array.from(groups.values()).map(item => Object.fromEntries(columns.map((column, index) => {
    if (!index) return [column, item.label];
    const metric = metrics[index - 1];
    return [column, metric === 'winRate' ? `${(item.leads ? item.won / item.leads * 100 : 0).toFixed(1)}%` : item[metric]];
  }))).sort((a, b) => Number(b.Leads || b['Pipeline Value'] || 0) - Number(a.Leads || a['Pipeline Value'] || 0));
  return { title: `Custom Report by ${names[groupBy]}`, columns, rows, filters };
}

async function getWorkModuleReport(req) {
  const organization = req.user.organization._id;
  const filters = await getReportFilters(req);
  const workTypes = (await WorkType.find({ organization, clientCompany: req.activeCompany._id, isActive: true }).sort({ order: 1, name: 1 }))
    .filter(workType => hasWorkPermission(req.user, workType, 'view'));
  filters.workTypes = workTypes;
  const selected = workTypes.find(workType => workType.key === req.query.module) || workTypes[0];
  if (!selected) return { title: 'Work Module Report', columns: ['Title'], rows: [], filters };
  const itemFilter = { organization, workspace: req.activeCompany._id, module: selected._id, ...getDateFilterFromQuery(req.query) };
  if (isRestrictedUser(req.user)) itemFilter.$or = [{ assignedTo: req.user._id }, { collaborators: req.user._id }, { secondaryAssignee: req.user._id }];
  const items = await CustomRecord.find(itemFilter).populate('assignedTo').sort({ createdAt: -1 });
  const columns = ['Title', 'Status', 'Priority', 'Assigned To', 'Due Date', ...selected.fields.map(field => field.label), 'Created'];
  const rows = items.map(item => {
    const row = {
      Title: item.title,
      Status: selected.statuses.find(status => status.key === item.status)?.label || item.status,
      Priority: item.priority,
      'Assigned To': item.assignedTo?.name || 'Unassigned',
      'Due Date': item.deadline ? item.deadline.toISOString().slice(0, 10) : '',
      Created: item.createdAt.toISOString().slice(0, 10)
    };
    selected.fields.forEach(field => {
      const value = item.customFields?.get(field.key);
      row[field.label] = Array.isArray(value) ? value.join(', ') : value ?? '';
    });
    return row;
  });
  return { title: `${selected.name} Report`, columns, rows, filters, selectedWorkType: selected };
}

const reportBuilders = {
  custom: getCustomReport,
  'work-modules': getWorkModuleReport,
  'agent-performance': getAgentPerformanceReport,
  'follow-up-compliance': getFollowupComplianceReport,
  'stale-leads': getStaleLeadReport,
  'source-attribution': getSourceAttributionReport
};

router.get('/dashboard', (req, res) => res.redirect('/'));

router.get('/', async (req, res, next) => {
  if (req.user.role === 'client') {
    return res.redirect('/client-dashboard');
  }

  try {
    const organization = req.user.organization._id;
    const clientCompany = String(req.activeCompany._id);
    const { campaign } = req.query;
    const filter = { organization, clientCompany };
    
    if (campaign) filter.campaign = campaign;

    if (isRestrictedUser(req.user)) {
      filter.assignedTo = req.user._id;
    }
    const canViewAds = hasPermission(req.user, 'ads.view');
    const visibleWorkTypes = (await WorkType.find({ organization, clientCompany: req.activeCompany._id, isActive: true }).sort({ order: 1, name: 1 }))
      .filter(workType => hasWorkPermission(req.user, workType, 'view'));

    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const staleDate = new Date(now);
    staleDate.setDate(staleDate.getDate() - 14);

    const [allStages, customers, customFields, campaigns, workItems, dashboardViews] = await Promise.all([
      CrmStage.find({ organization, clientCompany: req.activeCompany._id }).sort({ order: 1, createdAt: 1 }),
      Customer.find(filter).populate('stage labels assignedTo clientCompany campaign').sort({ updatedAt: -1 }),
      CustomField.find({ organization, clientCompany, entity: 'customer', isActive: true }).sort({ order: 1, createdAt: 1 }),
      canViewAds ? Campaign.find({
        organization,
        clientCompany
      }).sort({ name: 1 }) : [],
      CustomRecord.find({ organization, module: { $in: visibleWorkTypes.map(workType => workType._id) }, workspace: clientCompany, ...(isRestrictedUser(req.user) ? { $or: [{ assignedTo: req.user._id }, { collaborators: req.user._id }, { secondaryAssignee: req.user._id }] } : {}) }).populate('workType').select('title status deadline deliveredAt notes createdAt updatedAt module'),
      DashboardView.find({ organization, user: req.user._id }).sort({ name: 1 })
    ]);

    const customerStageIds = new Set(customers.filter(customer => customer.stage).map(customer => String(customer.stage._id)));
    const stages = allStages.filter(stage => stage.isActive || customerStageIds.has(String(stage._id)));
    const stageCards = stages.map(stage => {
      const items = customers
        .filter(customer => customer.stage && String(customer.stage._id) === String(stage._id))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const value = items.reduce((sum, customer) => sum + (customer.value || 0), 0);
      return { stage, customers: items, count: items.length, value };
    });

    const recentActivities = await Activity.find({
      organization,
      ...((clientCompany || isRestrictedUser(req.user)) ? { customer: { $in: customers.map(customer => customer._id) } } : {})
    })
      .populate('customer user')
      .sort({ createdAt: -1 })
      .limit(30);

    const auditFilter = movementAuditFilter(organization, workItems, campaigns);
    const movementAudits = auditFilter ? await AuditLog.find(auditFilter).populate('user', 'name').sort({ createdAt: -1 }).limit(30) : [];
    const recentMovements = dashboardMovements(hasPermission(req.user, 'businesses.view') ? recentActivities : [], movementAudits, visibleWorkTypes);
    const movementSamples = sampleMovements(visibleWorkTypes, hasPermission(req.user, 'businesses.view'), canViewAds, now);

    const activeCustomers = customers.filter(customer => {
      const stage = customer.stage || {};
      return !stage.isWon && !stage.isLost;
    });
    const wonCustomers = customers.filter(customer => customer.stage?.isWon);
    const followupsDue = activeCustomers.filter(customer => customer.nextFollowUpAt && customer.nextFollowUpAt <= now);
    const staleCustomers = activeCustomers.filter(customer => !customer.lastContactedAt || customer.lastContactedAt <= staleDate);
    const newThisWeek = activeCustomers.filter(customer => customer.createdAt >= weekAgo);
    const recentCustomers = customers.slice(0, 6);
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const isOpenWork = item => !isClosed(item) && item.status !== 'on_hold';
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));

    const weeklyWorkProgress = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, index) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + index);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      const items = workItems.filter(item => {
        if (!isComplete(item)) return false;
        const completedAt = item.deliveredAt || item.updatedAt;
        return completedAt && completedAt >= date && completedAt < nextDate;
      }).map(item => ({ _id: item._id, title: item.title, type: item.workType?.key, module: item.workType?.name, completedAt: item.deliveredAt || item.updatedAt }));
      return { label, date, count: items.length, items, isToday: date.toDateString() === now.toDateString() };
    });
    const upcomingDeadlines = workItems
      .filter(item => isOpenWork(item) && item.deadline && item.deadline <= nextWeek)
      .sort((a, b) => a.deadline - b.deadline)
      .slice(0, 6);
    const attentionCustomers = [...followupsDue, ...staleCustomers]
      .filter((customer, index, list) => list.findIndex(item => String(item._id) === String(customer._id)) === index)
      .slice(0, 6);
    const displayFields = customFields.slice(0, 3);
    const activeDashboardView = dashboardViews.find(view => String(view._id) === String(req.query.dashboardView)) || null;
    const metricKeys = new Set((activeDashboardView?.customFieldMetrics || []).map(String));
    const dashboardFieldMetrics = customFields.filter(field => metricKeys.has(field.key)).map(field => ({
      key: field.key,
      label: field.label,
      total: customers.filter(customer => {
        const value = customer.customData?.get(field.key);
        return value !== undefined && value !== null && value !== '' && value !== false;
      }).length
    }));
    console.log('[dashboard-customizer] dashboard rendering', {
      customized: req.user.dashboardCardsCustomized,
      hiddenCards: req.user.dashboardHiddenCards,
      cardOrder: req.user.dashboardCardOrder
    });
    res.render('dashboard/index', {
      title: 'CRM Pipeline',
      stageCards,
      recentActivities,
      recentMovements,
      movementSamples,
      displayFields,
      availableDashboardFields: customFields,
      recentCustomers,
      attentionCustomers,
      dashboardStats: {
        totalLeads: activeCustomers.length,
        totalClients: wonCustomers.length,
        newThisWeek: newThisWeek.length,
        followupsDue: followupsDue.length,
        staleCustomers: staleCustomers.length,
        openWork: workItems.filter(isOpenWork).length,
        completedWork: workItems.filter(isComplete).length,
        overdue: workItems.filter(item => isOpenWork(item) && item.deadline && item.deadline < now).length,
        adSpend: campaigns.reduce((sum, campaign) => sum + (campaign.spent || 0), 0),
        deliveredPercent: workItems.length ? Math.round((workItems.filter(isComplete).length / workItems.length) * 100) : 0
      },
      moduleStats: visibleWorkTypes.map(workType => {
        const records = workItems.filter(item => String(item.workType?._id) === String(workType._id));
        return {
          key: workType.key, name: workType.name, icon: workType.icon, color: workType.color,
          total: records.length, open: records.filter(isOpenWork).length, completed: records.filter(isComplete).length,
          statuses: workType.statuses.map(status => ({ key: status.key, label: status.label, count: records.filter(item => item.status === status.key).length }))
        };
      }),
      upcomingDeadlines,
      weeklyWorkProgress,
      dashboardViews,
      activeDashboardView,
      dashboardFieldMetrics,
      totalCustomers: customers.length,
      totalValue: activeCustomers.reduce((sum, customer) => sum + (customer.value || 0), 0),
      campaigns,
      filters: {
        clientCompany: clientCompany || '',
        campaign: campaign || ''
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/pipeline/move', requirePermission('businesses.update'), async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const customer = await Customer.findOne({ _id: req.body.customerId, organization, ...(req.activeCompany ? { clientCompany: req.activeCompany._id } : {}) }).populate('stage assignedTo');
    const stage = await CrmStage.findOne({ _id: req.body.stageId, organization, clientCompany: req.activeCompany._id, isActive: true });

    if (!customer || !stage) {
      return res.status(404).json({ ok: false, message: 'Record not found.' });
    }
    if (isRestrictedUser(req.user)) {
      const isAssignedDirectly = customer.assignedTo && String(customer.assignedTo._id || customer.assignedTo) === String(req.user._id);
      if (!isAssignedDirectly) {
        return res.status(403).json({ ok: false, message: 'You do not have access to this lead.' });
      }
    }

    const previousStage = customer.stage ? customer.stage.name : 'None';
    customer.stage = stage._id;
    await customer.save();

    await Activity.create({
      organization,
      customer: customer._id,
      user: req.user._id,
      type: 'stage_changed',
      note: `Stage changed from ${previousStage} to ${stage.name} by drag and drop.`
    });
    await logAudit(req, {
      action: 'stage_drag_drop',
      entityType: 'customer',
      entityId: customer._id,
      entityName: customer.name,
      message: `Stage changed from ${previousStage} to ${stage.name} by drag and drop.`
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/analytics', requirePermission('reports.view'), async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const now = new Date();
    const { clientCompany, campaign, dateFrom = '', dateTo = '' } = req.query;
    const companyFilter = { organization, _id: req.activeCompany._id, status: 'active' };
    const customerFilter = { organization, clientCompany: req.activeCompany._id, ...getDateRangeFilter(dateFrom, dateTo) };

    if (campaign) customerFilter.campaign = campaign;

    if (isRestrictedUser(req.user)) {
      companyFilter.assignedUsers = req.user._id;
      customerFilter.assignedTo = req.user._id;
    }
    const agentCompanyIds = isRestrictedUser(req.user)
      ? await ClientCompany.find(companyFilter).distinct('_id')
      : null;

    const [stages, customers, companies, campaigns] = await Promise.all([
      CrmStage.find({ organization, clientCompany: req.activeCompany._id }).sort({ order: 1, createdAt: 1 }),
      Customer.find(customerFilter).populate('stage clientCompany campaign'),
      ClientCompany.find(companyFilter).sort({ name: 1 }),
      Campaign.find({
        organization,
        clientCompany: req.activeCompany._id,
        status: 'active',
        ...(agentCompanyIds ? { clientCompany: { $in: agentCompanyIds } } : {})
      }).sort({ name: 1 })
    ]);

    // 1. Pipeline Funnel Analytics
    const stageSummary = stages.map(stage => {
      const stageLeads = customers.filter(c => c.stage && String(c.stage._id) === String(stage._id));
      const value = stageLeads.reduce((sum, c) => sum + (c.value || 0), 0);
      return {
        name: stage.name,
        color: stage.color || '#ffcc00',
        count: stageLeads.length,
        value
      };
    });

    // 2. Conversion Funnel (Leads -> Contacted -> Qualified -> Won)
    const totalLeads = customers.length;
    const wonStageIds = getWonStageIdSet(stages);
    const lostStageIds = new Set(stages.filter(stage => stage.isLost).map(stage => String(stage._id)));
    
    const wonCount = customers.filter(customer => customer.stage && wonStageIds.has(String(customer.stage._id))).length;
    const lostCount = customers.filter(customer => customer.stage && lostStageIds.has(String(customer.stage._id))).length;
    
    const activeCount = totalLeads - wonCount - lostCount;
    const winRate = totalLeads > 0 ? ((wonCount / totalLeads) * 100).toFixed(1) : 0;

    // 3. Campaign Performance (ROI & Lead Volume)
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

    // 4. Client Companies Breakdown
    const companySummary = companies.map(com => {
      const comLeads = customers.filter(c => c.clientCompany && String(c.clientCompany._id) === String(com._id));
      const value = comLeads.reduce((sum, c) => sum + (c.value || 0), 0);
      return {
        name: com.name,
        status: com.status,
        leadsCount: comLeads.length,
        pipelineValue: value
      };
    });

    // 5. Ingestion Trend over selected range, capped to a scan-friendly window
    const ingestionTrend = [];
    const rangeEnd = dateTo ? new Date(dateTo) : new Date();
    if (Number.isNaN(rangeEnd.getTime())) rangeEnd.setTime(Date.now());
    const rangeStart = dateFrom ? new Date(dateFrom) : new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate() - 6);
    if (Number.isNaN(rangeStart.getTime())) rangeStart.setTime(new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate() - 6).getTime());
    const totalDays = Math.max(1, Math.min(31, Math.floor((rangeEnd - rangeStart) / (1000 * 60 * 60 * 24)) + 1));

    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate() - i);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      const count = customers.filter(c => {
        const cDate = new Date(c.createdAt);
        return cDate.getDate() === d.getDate() && 
               cDate.getMonth() === d.getMonth() && 
               cDate.getFullYear() === d.getFullYear();
      }).length;
      
      ingestionTrend.push({ dateStr, count });
    }

    // 6. 5-Day Cumulative Sparkline trends for KPIs
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

    res.render('dashboard/analytics', {
      title: 'Analytics & Insights',
      path: '/analytics',
      stageSummary,
      campaignSummary,
      companySummary,
      companies,
      campaigns,
      ingestionTrend,
      trends: {
        totalLeads: totalLeadsTrend,
        activeLeads: activeLeadsTrend,
        wonDeals: wonDealsTrend
      },
      filters: {
        clientCompany: clientCompany || '',
        campaign: campaign || '',
        dateFrom,
        dateTo
      },
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
  } catch (error) {
    next(error);
  }
});

router.get('/reports', requirePermission('reports.view'), async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const [reportWorkTypes, savedReports] = await Promise.all([
      WorkType.find({ organization, clientCompany: req.activeCompany._id, isActive: true }).sort({ order: 1, name: 1 }),
      SavedReport.find({ organization, clientCompany: req.activeCompany._id, user: req.user._id }).sort({ name: 1 })
    ]);
    res.render('dashboard/reports-index', {
      title: 'Reporting Center',
      path: '/reports', reportWorkTypes: reportWorkTypes.filter(workType => hasWorkPermission(req.user, workType, 'view')), savedReports
    });
  } catch (error) {
    next(error);
  }
});

async function moduleReportContext(req) {
  const organization = req.user.organization._id;
  const workTypes = (await WorkType.find({ organization, clientCompany: req.activeCompany._id, isActive: true }).sort({ order: 1, name: 1 }))
    .filter(workType => hasWorkPermission(req.user, workType, 'view'));
  const saved = req.query.saved ? await SavedReport.findOne({ _id: req.query.saved, organization, clientCompany: req.activeCompany._id, user: req.user._id }) : null;
  const query = saved ? { ...saved.config, saved: String(saved._id) } : req.query;
  const workType = workTypes.find(item => [String(item._id), item.key].includes(String(query.module))) || workTypes[0];
  if (!workType) return { workTypes, workType: null, saved, query, users: [], savedReports: [], config: null, report: { columns: ['Group', 'Record count'], rows: [], totalRecords: 0 } };
  const config = normalizeConfig(query, workType);
  if (config.owner && !/^[a-f0-9]{24}$/i.test(config.owner)) config.owner = '';
  const filter = { organization, workspace: req.activeCompany._id, module: workType._id, ...getDateRangeFilter(config.dateFrom, config.dateTo) };
  if (config.status) filter.status = config.status;
  if (config.owner) filter.assignedTo = config.owner;
  if (isRestrictedUser(req.user)) filter.$or = [{ assignedTo: req.user._id }, { collaborators: req.user._id }, { secondaryAssignee: req.user._id }];
  const [items, users, savedReports] = await Promise.all([
    CustomRecord.find(filter).populate('assignedTo').sort({ createdAt: -1 }),
    User.find({ organization, isActive: true }).sort({ name: 1 }),
    SavedReport.find({ organization, clientCompany: req.activeCompany._id, user: req.user._id }).sort({ name: 1 })
  ]);
  return { workTypes, workType, saved, query, users, savedReports, config, options: reportOptions(workType), report: buildModuleReport(items, workType, config) };
}

router.get('/reports/module-builder', requirePermission('reports.view'), async (req, res, next) => {
  try {
    const context = await moduleReportContext(req);
    res.render('dashboard/module-report-builder', { title: 'Custom Module Report Builder', path: '/reports/module-builder', ...context, success: req.query.success || '', error: req.query.error || '' });
  } catch (error) { next(error); }
});

router.get('/reports/module-builder/export.csv', requirePermission('reports.view'), async (req, res, next) => {
  try {
    const { report, workType } = await moduleReportContext(req);
    if (!workType) return res.status(404).render('errors/404', { title: 'Module not found' });
    sendReportCsv(res, `${workType.key}-grouped-report.csv`, report.columns, report.rows);
  } catch (error) { next(error); }
});

router.get('/reports/module-builder/export-raw.csv', requirePermission('reports.view'), async (req, res, next) => {
  try {
    const { report, workType } = await moduleReportContext(req);
    if (!workType) return res.status(404).render('errors/404', { title: 'Module not found' });
    const columns = ['Title', 'Status', 'Priority', 'Owner', 'Due date', ...workType.fields.map(field => field.label), 'Created'];
    const rows = report.records.map(item => {
      const row = { Title: item.title, Status: workType.statuses.find(status => status.key === item.status)?.label || item.status, Priority: item.priority, Owner: item.assignedTo?.name || 'Unassigned', 'Due date': item.deadline?.toISOString().slice(0, 10) || '', Created: item.createdAt.toISOString().slice(0, 10) };
      workType.fields.forEach(field => { const value = item.customFields?.get(field.key); row[field.label] = Array.isArray(value) ? value.join(', ') : value ?? ''; });
      return row;
    });
    sendReportCsv(res, `${workType.key}-records.csv`, columns, rows);
  } catch (error) { next(error); }
});

router.post('/reports/module-builder/save', requirePermission('reports.view'), async (req, res, next) => {
  try {
    const organization = req.user.organization._id;
    const workType = await WorkType.findOne({ _id: req.body.module, organization, clientCompany: req.activeCompany._id, isActive: true });
    if (!workType || !hasWorkPermission(req.user, workType, 'view')) return res.status(403).render('errors/403', { title: 'Access denied' });
    const name = String(req.body.name || '').trim().slice(0, 80);
    if (!name) return res.redirect('/reports/module-builder?error=Enter+a+report+name.');
    const config = normalizeConfig(req.body, workType);
    const saved = await SavedReport.findOneAndUpdate(
      { organization, clientCompany: req.activeCompany._id, user: req.user._id, name },
      { config }, { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.redirect(`/reports/module-builder?saved=${saved._id}&success=Report+saved.`);
  } catch (error) { next(error); }
});

router.post('/reports/module-builder/:id/delete', requirePermission('reports.view'), async (req, res, next) => {
  try {
    await SavedReport.deleteOne({ _id: req.params.id, organization: req.user.organization._id, clientCompany: req.activeCompany._id, user: req.user._id });
    res.redirect('/reports?success=Saved+report+deleted.');
  } catch (error) { next(error); }
});

router.get('/reports/:reportKey', requirePermission('reports.view'), async (req, res, next) => {
  try {
    const builder = reportBuilders[req.params.reportKey];
    if (!builder) return res.status(404).render('errors/404', { title: 'Report not found' });
    const report = await builder(req);
    res.render('dashboard/report-table', {
      title: report.title,
      path: `/reports/${req.params.reportKey}`,
      reportKey: req.params.reportKey,
      report,
      query: req.query
    });
  } catch (error) {
    next(error);
  }
});

router.get('/reports/:reportKey/export.csv', requirePermission('reports.view'), async (req, res, next) => {
  try {
    const builder = reportBuilders[req.params.reportKey];
    if (!builder) return res.status(404).render('errors/404', { title: 'Report not found' });
    const report = await builder(req);
    sendReportCsv(res, `${req.params.reportKey}.csv`, report.columns, report.rows);
  } catch (error) {
    next(error);
  }
});

router.get('/reports/:reportKey/export.pdf', requirePermission('reports.view'), async (req, res, next) => {
  try {
    const builder = reportBuilders[req.params.reportKey];
    if (!builder) return res.status(404).render('errors/404', { title: 'Report not found' });
    const report = await builder(req);
    sendReportPdf(res, `${req.params.reportKey}.pdf`, report.title, reportDateLabel(req.query), report.columns, report.rows);
  } catch (error) {
    next(error);
  }
});

router.get('/client-dashboard', async (req, res, next) => {
  try {
    if (req.user.role !== 'client' && req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).render('errors/403', { title: 'Access denied' });
    }

    const { organization, companies, company } = await getClientPortalCompany(req);
    const { dateFrom = '', dateTo = '' } = req.query;
    const leadDateFilter = getDateRangeFilter(dateFrom, dateTo);

    if (!company) {
      return res.render('dashboard/clientDashboard', {
        title: 'Client Dashboard',
        company: null,
        companies: [],
        metrics: null,
        campaigns: [],
        customers: [],
        filters: { company: '' }, clientWork: [],
        error: 'No assigned client company found.'
      });
    }

    const [campaignDocs, customers, stages, taskType] = await Promise.all([
      Campaign.find({ clientCompany: company._id, organization }),
      Customer.find({ clientCompany: company._id, organization, ...leadDateFilter }).populate('stage campaign').sort({ createdAt: -1 }),
      CrmStage.find({ organization, clientCompany: company._id }),
      WorkType.findOne({ organization, clientCompany: company._id, key: 'task', isActive: true })
    ]);
    const taskRecords = taskType ? await CustomRecord.find({ organization, workspace: company._id, module: taskType._id }).select('title status deadline parentRecord') : [];
    const childrenByParent = taskRecords.reduce((map, record) => {
      if (record.parentRecord) map.set(String(record.parentRecord), [...(map.get(String(record.parentRecord)) || []), record]);
      return map;
    }, new Map());
    const clientWork = taskRecords.filter(record => !record.parentRecord).map(record => {
      const children = childrenByParent.get(String(record._id)) || [];
      const completed = children.filter(child => taskType.statuses.find(status => status.key === child.status)?.isTerminalWon).length;
      return { title: record.title, status: taskType.statuses.find(status => status.key === record.status)?.label || record.status, deadline: record.deadline, completed, total: children.length, progress: children.length ? Math.round((completed / children.length) * 100) : null };
    }).slice(0, 12);

    const campaigns = campaignDocs.map(campaign => {
      const campaignCustomers = customers.filter(customer => customer.campaign && String(customer.campaign._id || customer.campaign) === String(campaign._id));
      return {
        ...campaign.toObject(),
        reportMetrics: calculateCampaignMetrics(campaign, campaignCustomers, stages)
      };
    });
    const metrics = calculateCompanyMetrics(company, customers, campaignDocs, stages);

    res.render('dashboard/clientDashboard', {
      title: `${company.name} Client Portal`,
      company,
      companies,
      campaigns,
      customers,
      filters: { company: String(company._id), dateFrom, dateTo },
      metrics, clientWork
    });
  } catch (error) {
    next(error);
  }
});

router.get('/client-dashboard/export.csv', async (req, res, next) => {
  try {
    if (req.user.role !== 'client' && req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).render('errors/403', { title: 'Access denied' });
    }

    const { organization, company } = await getClientPortalCompany(req);
    const { dateFrom = '', dateTo = '' } = req.query;
    const leadDateFilter = getDateRangeFilter(dateFrom, dateTo);
    if (!company) {
      return res.status(404).render('errors/404', { title: 'Company not found' });
    }

    const customers = await Customer.find({ clientCompany: company._id, organization, ...leadDateFilter })
      .populate('stage campaign')
      .sort({ createdAt: -1 });
    const headers = ['createdAt', 'name', 'source', 'campaign', 'stage', 'value'];
    const rows = customers.map(customer => ({
      createdAt: customer.createdAt ? customer.createdAt.toISOString().slice(0, 10) : '',
      name: customer.name,
      source: customer.source || '',
      campaign: customer.campaign ? customer.campaign.name : 'Organic / Direct',
      stage: customer.stage ? customer.stage.name : '',
      value: customer.value || 0
    }));

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${company.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-client-report.csv"`);
    res.send(toCsv(headers, rows));
  } catch (error) {
    next(error);
  }
});

router.get('/client-dashboard/export.pdf', async (req, res, next) => {
  try {
    if (req.user.role !== 'client' && req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).render('errors/403', { title: 'Access denied' });
    }

    const report = await buildClientReportPackage(req);
    if (!report) return res.status(404).render('errors/404', { title: 'Company not found' });

    await logAudit(req, {
      action: 'client_report_package_export',
      entityType: 'client_company',
      entityId: report.company._id,
      entityName: report.company.name,
      message: `Client PDF report package exported for "${report.company.name}".`,
      metadata: { range: report.range }
    });

    const filename = `${report.company.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-client-report-package.pdf`;
    sendReportPdf(res, filename, `${report.company.name} Client Report Package`, report.range.label, report.columns, report.rows);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
