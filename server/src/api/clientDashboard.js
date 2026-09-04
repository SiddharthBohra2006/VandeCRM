const express = require('express');
const { requireApiAuth } = require('./middleware/auth');
const ClientCompany = require('../models/ClientCompany');
const Campaign = require('../models/Campaign');
const Customer = require('../models/Customer');
const CrmStage = require('../models/CrmStage');
const WorkType = require('../models/WorkType');
const CustomRecord = require('../models/CustomRecord');
const { toCsv } = require('../utils/csv');
const { createSimpleReportPdf } = require('../utils/pdf');
const { calculateCampaignMetrics, calculateCompanyMetrics, getDateRangeFilter } = require('../utils/reporting');
const { logAudit } = require('../utils/audit');

const router = express.Router();
router.use(requireApiAuth);

const ALLOWED_ROLES = ['client', 'admin', 'manager'];

function workspace(req, res) {
  if (req.activeCompanyId) return String(req.activeCompanyId);
  res.status(400).json({ ok: false, error: 'Select an active CRM workspace first.' });
  return null;
}

function allowRole(req, res) {
  if (ALLOWED_ROLES.includes(req.user.role)) return true;
  res.status(403).json({ ok: false, error: 'Access denied' });
  return false;
}

async function getClientPortalCompany(req) {
  const organization = req.user.organization._id;
  const selectedCompanyId = req.query.company || '';
  const companyFilter = { organization, status: 'active' };

  if (req.user.role === 'client') {
    companyFilter.assignedUsers = req.user._id;
  }

  const companies = await ClientCompany.find(companyFilter).sort({ name: 1 }).lean();
  const company = companies.find(item => String(item._id) === selectedCompanyId) || companies[0] || null;
  return { organization, companies, company };
}

function reportDateLabel(query) {
  const from = query.dateFrom || 'all time';
  const to = query.dateTo || 'today';
  return `${from} to ${to}`;
}

function getPackageDateRange(query) {
  if (query.month && /^\d{4}-\d{2}$/.test(query.month)) {
    const [year, month] = query.month.split('-').map(Number);
    const start = new Date(year, month - 1, 1).toISOString().slice(0, 10);
    const end = new Date(year, month, 0).toISOString().slice(0, 10);
    return {
      dateFrom: start,
      dateTo: end,
      label: new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
    };
  }
  return {
    dateFrom: query.dateFrom || '',
    dateTo: query.dateTo || '',
    label: reportDateLabel(query)
  };
}

async function buildClientReportPackage(req) {
  const { organization, company } = await getClientPortalCompany(req);
  if (!company) return null;
  const range = getPackageDateRange(req.query);
  const leadDateFilter = getDateRangeFilter(range.dateFrom, range.dateTo);

  const [campaignDocs, customers, stages] = await Promise.all([
    Campaign.find({ clientCompany: company._id, organization }).lean(),
    Customer.find({ clientCompany: company._id, organization, ...leadDateFilter }).populate('stage campaign').sort({ createdAt: -1 }),
    CrmStage.find({ organization, clientCompany: company._id }).lean()
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

// GET /api/client-dashboard — client portal reporting dashboard
router.get('/', async (req, res, next) => {
  try {
    if (!allowRole(req, res)) return;
    workspace(req, res);

    const { organization, companies, company } = await getClientPortalCompany(req);
    const { dateFrom = '', dateTo = '' } = req.query;
    const leadDateFilter = getDateRangeFilter(dateFrom, dateTo);

    if (!company) {
      return res.json({
        ok: true,
        company: null,
        companies: [],
        campaigns: [],
        customers: [],
        clientWork: [],
        metrics: null,
        filters: { company: '' },
      });
    }

    const [campaignDocs, customers, stages, taskType] = await Promise.all([
      Campaign.find({ clientCompany: company._id, organization }).lean(),
      Customer.find({ clientCompany: company._id, organization, ...leadDateFilter }).populate('stage campaign').sort({ createdAt: -1 }),
      CrmStage.find({ organization, clientCompany: company._id }).lean(),
      WorkType.findOne({ organization, clientCompany: company._id, key: 'task', isActive: true }).lean()
    ]);

    const taskRecords = taskType ? await CustomRecord.find({ organization, workspace: company._id, module: taskType._id }).select('title status deadline parentRecord').lean() : [];
    const childrenByParent = taskRecords.reduce((map, record) => {
      if (record.parentRecord) map.set(String(record.parentRecord), [...(map.get(String(record.parentRecord)) || []), record]);
      return map;
    }, new Map());
    const clientWork = taskRecords.filter(record => !record.parentRecord).map(record => {
      const children = childrenByParent.get(String(record._id)) || [];
      const completed = children.filter(child => taskType.statuses.find(status => status.key === child.status)?.isTerminalWon).length;
      return {
        title: record.title,
        status: taskType.statuses.find(status => status.key === record.status)?.label || record.status,
        deadline: record.deadline,
        completed,
        total: children.length,
        progress: children.length ? Math.round((completed / children.length) * 100) : null
      };
    }).slice(0, 12);

    const campaigns = campaignDocs.map(campaign => {
      const campaignCustomers = customers.filter(customer => customer.campaign && String(customer.campaign._id || customer.campaign) === String(campaign._id));
      return {
        ...campaign,
        reportMetrics: calculateCampaignMetrics(campaign, campaignCustomers, stages)
      };
    });
    const metrics = calculateCompanyMetrics(company, customers, campaignDocs, stages);

    res.json({
      ok: true,
      company,
      companies,
      campaigns,
      customers,
      clientWork,
      metrics,
      filters: { company: String(company._id), dateFrom, dateTo },
    });
  } catch (error) { next(error); }
});

// GET /api/client-dashboard/export.csv — CSV export of leads
router.get('/export.csv', async (req, res, next) => {
  try {
    if (!allowRole(req, res)) return;
    const { organization, company } = await getClientPortalCompany(req);
    const { dateFrom = '', dateTo = '' } = req.query;
    const leadDateFilter = getDateRangeFilter(dateFrom, dateTo);
    if (!company) return res.status(404).json({ ok: false, error: 'Company not found' });

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
    res.setHeader('Content-Disposition', `attachment; filename="${String(company.name).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-client-report.csv"`);
    res.send(toCsv(headers, rows));
  } catch (error) { next(error); }
});

// GET /api/client-dashboard/export.pdf — PDF report package
router.get('/export.pdf', async (req, res, next) => {
  try {
    if (!allowRole(req, res)) return;
    const { organization, company } = await getClientPortalCompany(req);
    if (!company) return res.status(404).json({ ok: false, error: 'Company not found' });

    const report = await buildClientReportPackage(req);
    if (!report) return res.status(404).json({ ok: false, error: 'Company not found' });

    await logAudit(req, {
      action: 'client_report_package_export',
      entityType: 'client_company',
      entityId: report.company._id,
      entityName: report.company.name,
      message: `Client PDF report package exported for "${report.company.name}".`,
      metadata: { range: report.range }
    });

    const filename = `${String(report.company.name).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-client-report-package.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(createSimpleReportPdf(`${report.company.name} Client Report Package`, report.range.label, report.columns, report.rows));
  } catch (error) { next(error); }
});

module.exports = router;