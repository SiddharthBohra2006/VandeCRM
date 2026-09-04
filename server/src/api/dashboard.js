const express = require('express');
const { hasPermission, hasWorkPermission, isRestrictedUser, INTERNAL_ROLES } = require('../config/roles');
const { requireApiAuth } = require('./middleware/auth');
const Customer = require('../models/Customer');
const CrmStage = require('../models/CrmStage');
const Activity = require('../models/Activity');
const Campaign = require('../models/Campaign');
const ClientCompany = require('../models/ClientCompany');
const CustomField = require('../models/CustomField');
const CustomRecord = require('../models/CustomRecord');
const DashboardView = require('../models/DashboardView');
const WorkType = require('../models/WorkType');
const AuditLog = require('../models/AuditLog');
const { logAudit } = require('../utils/audit');
const { movementAuditFilter, dashboardMovements, sampleMovements } = require('../utils/dashboardMovements');
const { isClosed, isComplete } = require('../utils/workCompletion');
const { getWonStageIdSet } = require('../services/crmStages');
const { getDateRangeFilter } = require('../utils/reporting');

const router = express.Router();
router.use(requireApiAuth);
router.use((req, res, next) => INTERNAL_ROLES.includes(req.user.role) ? next() : res.status(403).json({ ok: false, error: 'Access denied' }));

function workspace(req, res) {
  if (req.activeCompanyId) return String(req.activeCompanyId);
  res.status(400).json({ ok: false, error: 'Select an active CRM workspace first.' });
  return null;
}

const asList = value => Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
const cardKeys = value => (Array.isArray(value) ? value : String(value || '').split(','))
  .map(item => String(item).trim()).filter(item => /^[a-z0-9_-]+$/i.test(item)).slice(0, 200);

router.post('/preferences/sidebar', async (req, res, next) => {
  try {
    const activeWorkspace = workspace(req, res);
    if (!activeWorkspace) return;
    const allowed = ['nav-task-center', 'nav-portfolio', 'nav-pipeline', 'nav-database', 'nav-tasks', 'nav-analytics', 'nav-reports', 'nav-mail', 'nav-companies', 'nav-campaigns', 'nav-team', 'nav-settings', 'nav-audit'];
    const workTypes = await WorkType.find({ organization: req.user.organization._id, clientCompany: activeWorkspace }).select('key').lean();
    allowed.push(...workTypes.map(type => `nav-work-${type.key}`));
    req.user.sidebarHiddenItems = asList(req.body.hiddenItems).filter(item => allowed.includes(item));
    await req.user.save();
    res.json({ ok: true, hiddenItems: req.user.sidebarHiddenItems });
  } catch (error) { next(error); }
});

router.post('/preferences/dashboard', async (req, res, next) => {
  try {
    const allowed = ['metrics', 'work-progress', 'deadlines', 'pipeline', 'attention', 'recent', 'activity'];
    req.user.dashboardHiddenSections = asList(req.body.hiddenSections).filter(item => allowed.includes(item));
    req.user.dashboardHiddenCards = cardKeys(req.body.dashboardHiddenCards);
    req.user.dashboardCardOrder = cardKeys(req.body.dashboardCardOrder);
    req.user.dashboardCardsCustomized = true;
    await req.user.save();
    res.json({ ok: true, hiddenCards: req.user.dashboardHiddenCards, cardOrder: req.user.dashboardCardOrder, hiddenSections: req.user.dashboardHiddenSections });
  } catch (error) { next(error); }
});

router.post('/preferences/dashboard/views', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 60);
    const allowed = ['metrics', 'work-progress', 'deadlines', 'pipeline', 'attention', 'recent', 'activity'];
    const hiddenSections = (Array.isArray(req.body.hiddenSections) ? req.body.hiddenSections : String(req.body.hiddenSections || '').split(',')).filter(item => allowed.includes(item));
    const cardOrder = String(req.body.cardOrder || '').split(',').map(item => item.trim()).filter(Boolean).slice(0, 40);
    const customFieldMetrics = String(req.body.customFieldMetrics || '').split(',').map(item => item.trim()).filter(Boolean).slice(0, 6);
    if (!name) return res.status(400).json({ ok: false, error: 'Enter a dashboard view name.' });
    const view = await DashboardView.findOneAndUpdate(
      { organization: req.user.organization._id, user: req.user._id, name },
      { hiddenSections, cardOrder, customFieldMetrics },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ ok: true, data: view });
  } catch (error) { next(error); }
});

router.post('/pipeline/move', async (req, res, next) => {
  try {
    if (!hasPermission(req.user, 'businesses.update')) return res.status(403).json({ ok: false, error: 'Access denied' });
    const activeWorkspace = workspace(req, res);
    if (!activeWorkspace) return;
    const organization = req.user.organization._id;
    const customer = await Customer.findOne({ _id: req.body.customerId, organization, clientCompany: activeWorkspace, ...(isRestrictedUser(req.user) ? { assignedTo: req.user._id } : {}) }).populate('stage assignedTo');
    const stage = await CrmStage.findOne({ _id: req.body.stageId, organization, clientCompany: activeWorkspace, isActive: true });
    if (!customer || !stage) return res.status(404).json({ ok: false, error: 'Lead or stage not found.' });
    const previousStage = customer.stage?.name || 'Unassigned';
    customer.stage = stage._id;
    await customer.save();
    const note = `Stage changed from ${previousStage} to ${stage.name} by drag and drop.`;
    await Activity.create({ organization, customer: customer._id, user: req.user._id, type: 'stage_changed', note });
    await logAudit(req, { action: 'stage_drag_drop', entityType: 'customer', entityId: customer._id, entityName: customer.name, message: note });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    const activeWorkspace = workspace(req, res);
    if (!activeWorkspace) return;
    const organization = req.user.organization._id;
    const customerFilter = { organization, clientCompany: activeWorkspace };
    if (req.query.campaign) customerFilter.campaign = req.query.campaign;
    if (isRestrictedUser(req.user)) customerFilter.assignedTo = req.user._id;
    const canViewAds = hasPermission(req.user, 'ads.view');
    const visibleWorkTypes = (await WorkType.find({ organization, clientCompany: activeWorkspace, isActive: true }).sort({ order: 1, name: 1 }))
      .filter(type => hasWorkPermission(req.user, type, 'view'));
    const [allStages, customers, customFields, campaigns, workItems, dashboardViews] = await Promise.all([
      CrmStage.find({ organization, clientCompany: activeWorkspace }).sort({ order: 1, createdAt: 1 }),
      Customer.find(customerFilter).populate('stage labels assignedTo clientCompany campaign').sort({ updatedAt: -1 }),
      CustomField.find({ organization, clientCompany: activeWorkspace, entity: 'customer', isActive: true }).sort({ order: 1, createdAt: 1 }),
      canViewAds ? Campaign.find({ organization, clientCompany: activeWorkspace }).sort({ name: 1 }) : [],
      CustomRecord.find({ organization, module: { $in: visibleWorkTypes.map(type => type._id) }, workspace: activeWorkspace, ...(isRestrictedUser(req.user) ? { $or: [{ assignedTo: req.user._id }, { collaborators: req.user._id }, { secondaryAssignee: req.user._id }] } : {}) }).populate('workType').select('title status deadline deliveredAt notes createdAt updatedAt module'),
      DashboardView.find({ organization, user: req.user._id }).sort({ name: 1 })
    ]);
    const populatedStages = new Set(customers.filter(item => item.stage).map(item => String(item.stage._id)));
    const stages = allStages.filter(stage => stage.isActive || populatedStages.has(String(stage._id)));
    const stageCards = stages.map(stage => {
      const items = customers.filter(item => item.stage && String(item.stage._id) === String(stage._id)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return { stage, customers: items, count: items.length, value: items.reduce((sum, item) => sum + (item.value || 0), 0) };
    });
    const now = new Date();
    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
    const staleDate = new Date(now); staleDate.setDate(staleDate.getDate() - 14);
    const activeCustomers = customers.filter(item => !item.stage?.isWon && !item.stage?.isLost);
    const wonCustomers = customers.filter(item => item.stage?.isWon);
    const followupsDue = activeCustomers.filter(item => item.nextFollowUpAt && item.nextFollowUpAt <= now);
    const staleCustomers = activeCustomers.filter(item => !item.lastContactedAt || item.lastContactedAt <= staleDate);
    const isOpenWork = item => !isClosed(item) && item.status !== 'on_hold';
    const nextWeek = new Date(now); nextWeek.setDate(nextWeek.getDate() + 7);
    const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const weeklyWorkProgress = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, index) => {
      const date = new Date(weekStart); date.setDate(date.getDate() + index);
      const tomorrow = new Date(date); tomorrow.setDate(tomorrow.getDate() + 1);
      const items = workItems.filter(item => { const completedAt = item.deliveredAt || item.updatedAt; return isComplete(item) && completedAt >= date && completedAt < tomorrow; })
        .sort((a, b) => new Date(b.deliveredAt || b.updatedAt) - new Date(a.deliveredAt || a.updatedAt));
      return { label, date, count: items.length, isToday: date.toDateString() === now.toDateString(), items: items.slice(0, 6).map(item => ({ _id: item._id, title: item.title, module: item.workType?.name || 'Work', type: item.workType?.key || 'task', completedAt: item.deliveredAt || item.updatedAt, status: item.status })) };
    });
    const attentionCustomers = [...followupsDue, ...staleCustomers].filter((item, index, list) => list.findIndex(other => String(other._id) === String(item._id)) === index).slice(0, 6);
    const recentActivities = await Activity.find({
      organization,
      ...(isRestrictedUser(req.user) ? { customer: { $in: customers.map(customer => customer._id) } } : {})
    }).populate('customer user').sort({ createdAt: -1 }).limit(30);
    const auditFilter = movementAuditFilter(organization, workItems, campaigns);
    const movementAudits = auditFilter ? await AuditLog.find(auditFilter).populate('user', 'name').sort({ createdAt: -1 }).limit(30) : [];
    const recentMovements = dashboardMovements(hasPermission(req.user, 'businesses.view') ? recentActivities : [], movementAudits, visibleWorkTypes);
    const movementSamples = sampleMovements(visibleWorkTypes, hasPermission(req.user, 'businesses.view'), canViewAds, now);
    res.json({
      ok: true,
      stats: { totalLeads: activeCustomers.length, totalClients: wonCustomers.length, newThisWeek: activeCustomers.filter(item => item.createdAt >= weekAgo).length, followupsDue: followupsDue.length, staleCustomers: staleCustomers.length, openWork: workItems.filter(isOpenWork).length, completedWork: workItems.filter(isComplete).length, overdue: workItems.filter(item => isOpenWork(item) && item.deadline && item.deadline < now).length, adSpend: campaigns.reduce((sum, item) => sum + (item.spent || 0), 0), deliveredPercent: workItems.length ? Math.round(workItems.filter(isComplete).length / workItems.length * 100) : 0 },
      stageCards,
      moduleStats: visibleWorkTypes.map(type => { const records = workItems.filter(item => String(item.workType?._id) === String(type._id)); return { key: type.key, name: type.name, icon: type.icon, color: type.color, total: records.length, open: records.filter(isOpenWork).length, completed: records.filter(isComplete).length, statuses: type.statuses.map(status => ({ key: status.key, label: status.label, count: records.filter(item => item.status === status.key).length })) }; }),
      upcomingDeadlines: workItems.filter(item => isOpenWork(item) && item.deadline && item.deadline <= nextWeek).sort((a, b) => a.deadline - b.deadline).slice(0, 6),
      weeklyWorkProgress,
      recentCustomers: customers.slice(0, 6), attentionCustomers, campaigns, dashboardViews,
      availableDashboardFields: customFields, totalCustomers: customers.length,
      totalValue: activeCustomers.reduce((sum, item) => sum + (item.value || 0), 0),
      dashboardCardsCustomized: req.user.dashboardCardsCustomized || false,
      dashboardHiddenCards: req.user.dashboardHiddenCards || [],
      dashboardCardOrder: req.user.dashboardCardOrder || [],
      dashboardHiddenSections: req.user.dashboardHiddenSections || [],
      recentMovements,
      movementSamples
    });
  } catch (error) { next(error); }
});

module.exports = router;