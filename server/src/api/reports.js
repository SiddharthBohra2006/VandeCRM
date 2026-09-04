const express = require('express');
const Campaign = require('../models/Campaign');
const ClientCompany = require('../models/ClientCompany');
const CrmStage = require('../models/CrmStage');
const Customer = require('../models/Customer');
const CustomRecord = require('../models/CustomRecord');
const SavedReport = require('../models/SavedReport');
const User = require('../models/User');
const WorkType = require('../models/WorkType');
const { hasPermission, hasWorkPermission, isRestrictedUser } = require('../config/roles');
const { getWonStageIdSet } = require('../services/crmStages');
const { getDateRangeFilter } = require('../utils/reporting');
const { reportOptions, normalizeConfig, buildModuleReport } = require('../utils/moduleReporting');
const { toCsv } = require('../utils/csv');
const { createSimpleReportPdf } = require('../utils/pdf');
const { requireApiAuth } = require('./middleware/auth');

const router = express.Router();
router.use(requireApiAuth);
router.use((req, res, next) => hasPermission(req.user, 'reports.view') ? next() : res.status(403).json({ ok: false, error: 'Access denied' }));

function workspaceRequired(req, res) {
  if (req.activeCompanyId) return req.activeCompanyId;
  res.status(400).json({ ok: false, error: 'Select an active CRM workspace first.' });
  return null;
}

function reportDateLabel(query) {
  return `${query.dateFrom || 'all time'} to ${query.dateTo || 'today'}`;
}

// GET /api/reports — Reporting Center index
router.get('/', async (req, res, next) => {
  try {
    const activeWorkspace = workspaceRequired(req, res);
    if (!activeWorkspace) return;
    const organization = req.user.organization._id;
    const [reportWorkTypes, savedReports] = await Promise.all([
      WorkType.find({ organization, clientCompany: activeWorkspace, isActive: true }).sort({ order: 1, name: 1 }),
      SavedReport.find({ organization, clientCompany: activeWorkspace, user: req.user._id }).sort({ name: 1 })
    ]);
    res.json({
      ok: true,
      reportWorkTypes: reportWorkTypes.filter(workType => hasWorkPermission(req.user, workType, 'view')),
      savedReports
    });
  } catch (error) { next(error); }
});

async function getReportFilters(req) {
  const organization = req.user.organization._id;
  const companyFilter = { organization, _id: req.activeCompanyId, status: 'active' };
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

function scopedLeadFilter(req, extra = {}) {
  const filter = { organization: req.user.organization._id, clientCompany: req.activeCompanyId, ...extra };
  if (isRestrictedUser(req.user)) filter.assignedTo = req.user._id;
  return filter;
}

async function getAgentPerformanceReport(req, filters) {
  const leadFilter = scopedLeadFilter(req, getDateRangeFilter(req.query.dateFrom || '', req.query.dateTo || ''));
  if (req.query.campaign) leadFilter.campaign = req.query.campaign;
  if (req.query.agent) leadFilter.assignedTo = req.query.agent;

  const [customers, stages] = await Promise.all([
    Customer.find(leadFilter).populate('assignedTo stage clientCompany campaign'),
    CrmStage.find({ organization: req.user.organization._id, clientCompany: req.activeCompanyId })
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
    if (wonStageIds.has(stageId)) { row.Won += 1; row['Won Revenue'] += Number(customer.value || 0); }
    else if (lostStageIds.has(stageId)) row.Lost += 1;
    else row.Active += 1;
  });

  const rows = Array.from(grouped.values()).map(row => ({
    ...row,
    'Win Rate': row.Leads ? `${((row.Won / row.Leads) * 100).toFixed(1)}%` : '0.0%'
  })).sort((a, b) => b.Leads - a.Leads);
  return { title: 'Agent Performance Report', columns: ['Agent', 'Leads', 'Active', 'Won', 'Lost', 'Pipeline Value', 'Won Revenue', 'Win Rate'], rows, filters };
}

async function getFollowupComplianceReport(req, filters) {
  const leadFilter = scopedLeadFilter(req, getDateRangeFilter(req.query.dateFrom || '', req.query.dateTo || ''));
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

async function getStaleLeadReport(req, filters) {
  const staleDays = Math.max(1, Number(req.query.staleDays || 14));
  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - staleDays);
  const leadFilter = scopedLeadFilter(req, getDateRangeFilter(req.query.dateFrom || '', req.query.dateTo || ''));
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

async function getSourceAttributionReport(req, filters) {
  const leadFilter = scopedLeadFilter(req, getDateRangeFilter(req.query.dateFrom || '', req.query.dateTo || ''));
  if (req.query.campaign) leadFilter.campaign = req.query.campaign;
  const [customers, stages] = await Promise.all([
    Customer.find(leadFilter).populate('stage clientCompany campaign'),
    CrmStage.find({ organization: req.user.organization._id, clientCompany: req.activeCompanyId })
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

async function getCustomReport(req, filters) {
  const groupBy = ['agent', 'source', 'stage', 'campaign', 'company'].includes(req.query.groupBy) ? req.query.groupBy : 'stage';
  const allowedMetrics = ['leads', 'active', 'won', 'lost', 'pipelineValue', 'wonRevenue', 'winRate'];
  const requested = (Array.isArray(req.query.metrics) ? req.query.metrics : [req.query.metrics || 'leads']).filter(metric => allowedMetrics.includes(metric));
  const metrics = requested.length ? requested : ['leads'];
  const leadFilter = scopedLeadFilter(req, getDateRangeFilter(req.query.dateFrom || '', req.query.dateTo || ''));
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

async function getWorkModuleReport(req, filters) {
  const workTypes = (await WorkType.find({ organization: req.user.organization._id, clientCompany: req.activeCompanyId, isActive: true }).sort({ order: 1, name: 1 }))
    .filter(workType => hasWorkPermission(req.user, workType, 'view'));
  filters.workTypes = workTypes;
  const selected = workTypes.find(workType => workType.key === req.query.module) || workTypes[0];
  if (!selected) return { title: 'Work Module Report', columns: ['Title'], rows: [], filters };
  const itemFilter = {
    organization: req.user.organization._id,
    workspace: req.activeCompanyId,
    module: selected._id,
    ...getDateRangeFilter(req.query.dateFrom || '', req.query.dateTo || '')
  };
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

// GET /api/reports/module-builder
router.get('/module-builder', async (req, res, next) => {
  try {
    const context = await moduleReportContext(req);
    res.json({ ok: true, ...context });
  } catch (error) { next(error); }
});

// GET /api/reports/module-builder/export.csv
router.get('/module-builder/export.csv', async (req, res, next) => {
  try {
    const { report, workType } = await moduleReportContext(req);
    if (!workType) return res.status(404).json({ ok: false, error: 'Module not found' });
    res.json({ ok: true, filename: `${workType.key}-grouped-report.csv`, csv: toCsv(report.columns, report.rows) });
  } catch (error) { next(error); }
});

// GET /api/reports/module-builder/export-raw.csv
router.get('/module-builder/export-raw.csv', async (req, res, next) => {
  try {
    const { report, workType } = await moduleReportContext(req);
    if (!workType) return res.status(404).json({ ok: false, error: 'Module not found' });
    const columns = ['Title', 'Status', 'Priority', 'Owner', 'Due date', ...workType.fields.map(field => field.label), 'Created'];
    const rows = report.records.map(item => {
      const row = { Title: item.title, Status: workType.statuses.find(status => status.key === item.status)?.label || item.status, Priority: item.priority, Owner: item.assignedTo?.name || 'Unassigned', 'Due date': item.deadline?.toISOString().slice(0, 10) || '', Created: item.createdAt.toISOString().slice(0, 10) };
      workType.fields.forEach(field => { const value = item.customFields?.get(field.key); row[field.label] = Array.isArray(value) ? value.join(', ') : value ?? ''; });
      return row;
    });
    res.json({ ok: true, filename: `${workType.key}-records.csv`, csv: toCsv(columns, rows) });
  } catch (error) { next(error); }
});

// POST /api/reports/module-builder/save
router.post('/module-builder/save', async (req, res, next) => {
  try {
    const activeWorkspace = workspaceRequired(req, res);
    if (!activeWorkspace) return;
    const organization = req.user.organization._id;
    const workType = await WorkType.findOne({ _id: req.body.module, organization, clientCompany: activeWorkspace, isActive: true });
    if (!workType || !hasWorkPermission(req.user, workType, 'view')) return res.status(403).json({ ok: false, error: 'Access denied' });
    const name = String(req.body.name || '').trim().slice(0, 80);
    if (!name) return res.status(400).json({ ok: false, error: 'Enter a report name.' });
    const config = normalizeConfig(req.body, workType);
    const saved = await SavedReport.findOneAndUpdate(
      { organization, clientCompany: activeWorkspace, user: req.user._id, name },
      { config }, { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ ok: true, savedReport: saved });
  } catch (error) { next(error); }
});

// DELETE /api/reports/module-builder/:id
router.delete('/module-builder/:id', async (req, res, next) => {
  try {
    const activeWorkspace = workspaceRequired(req, res);
    if (!activeWorkspace) return;
    await SavedReport.deleteOne({ _id: req.params.id, organization: req.user.organization._id, clientCompany: activeWorkspace, user: req.user._id });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// GET /api/reports/:reportKey
router.get('/:reportKey', async (req, res, next) => {
  try {
    const builder = reportBuilders[req.params.reportKey];
    if (!builder) return res.status(404).json({ ok: false, error: 'Report not found' });
    const report = await builder(req, await getReportFilters(req));
    res.json({ ok: true, reportKey: req.params.reportKey, report, query: req.query });
  } catch (error) { next(error); }
});

// GET /api/reports/:reportKey/export.csv — returns CSV string in envelope
router.get('/:reportKey/export.csv', async (req, res, next) => {
  try {
    const builder = reportBuilders[req.params.reportKey];
    if (!builder) return res.status(404).json({ ok: false, error: 'Report not found' });
    const report = await builder(req, await getReportFilters(req));
    res.json({ ok: true, filename: `${req.params.reportKey}.csv`, csv: toCsv(report.columns, report.rows) });
  } catch (error) { next(error); }
});

// GET /api/reports/:reportKey/export.pdf — returns base64 PDF in envelope
router.get('/:reportKey/export.pdf', async (req, res, next) => {
  try {
    const builder = reportBuilders[req.params.reportKey];
    if (!builder) return res.status(404).json({ ok: false, error: 'Report not found' });
    const report = await builder(req, await getReportFilters(req));
    const pdf = createSimpleReportPdf(report.title, reportDateLabel(req.query), report.columns, report.rows);
    res.json({ ok: true, filename: `${req.params.reportKey}.pdf`, base64: Buffer.from(pdf).toString('base64') });
  } catch (error) { next(error); }
});

module.exports = router;
