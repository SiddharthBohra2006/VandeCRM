const express = require('express');
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const WorkType = require('../models/WorkType');
const CrmStage = require('../models/CrmStage');
const CustomRecord = require('../models/CustomRecord');
const Activity = require('../models/Activity');
const AuditLog = require('../models/AuditLog');
const Campaign = require('../models/Campaign');
const ClientCompany = require('../models/ClientCompany');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { hasPermission, hasWorkPermission, isRestrictedUser } = require('../config/roles');
const { TYPES, searchOptions, textMatch } = require('../utils/search');
const router = express.Router();
const PAGE_SIZE = 12;

router.get('/', async (req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  let options;
  try { options = searchOptions(req.query); }
  catch (error) {
    if (req.query.format === 'json') return res.status(400).json({ error: error.message });
    options = searchOptions({});
    return res.status(400).render('search/index', { title: 'Search', search: {...options, error: error.message}, groups: [], modules: [], warnings: [], stats: {} });
  }
  try {
    const organization = req.user.organization._id;
    const workspace = req.activeCompany?._id;
    const assigned = isRestrictedUser(req.user);
    const modules = workspace ? (await WorkType.find({ organization, clientCompany: workspace }).select('name key statuses').lean().maxTimeMS(1500)).filter(module => hasWorkPermission(req.user, module, 'view')) : [];
    const moduleIds = modules.filter(module => !options.module || String(module._id) === options.module).map(module => module._id);
    const moduleMap = new Map(modules.map(module => [String(module._id), module]));
    const groups = [], warnings = [];
    const base = { organization };
    const customerScope = { ...base, clientCompany: workspace, ...(assigned ? { assignedTo: req.user._id } : {}) };
    const workScope = { ...base, workspace, module: { $in: moduleIds }, ...(assigned ? { $or: [{ assignedTo: req.user._id }, { collaborators: req.user._id }, { secondaryAssignee: req.user._id }] } : {}) };
    const jobs = [];
    
    const matchText = (fields = []) => {
      const match = textMatch(options.q, fields);
      if (match._id) match._id = new mongoose.Types.ObjectId(match._id);
      return match;
    };
    const dated = scheduled => {
      if (!Object.keys(options.range).length) return {};
      const field = options.dateField === 'scheduled' ? scheduled : options.dateField === 'created' ? 'createdAt' : 'updatedAt';
      return field ? { [field]: options.range } : { _id: { $in: [] } };
    };
    const queue = (id, label, allowed, execute) => {
      if (!allowed || (options.type !== 'all' && options.type !== id)) return;
      jobs.push((async () => {
        try {
          const rows = await execute();
          groups.push({ id, label, items: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE });
        } catch (error) {
          console.error(`Search ${id} failed:`, error.code || error.name);
          warnings.push(`${label} search is temporarily unavailable.`);
        }
      })());
    };
    const find = (Model, scope, fields, select, scheduled) => {
      const text = matchText(fields);
      return Model.find({ ...scope, ...text, ...dated(scheduled) }).select(select).sort({ updatedAt: -1, _id: -1 }).skip((options.page - 1) * PAGE_SIZE).limit(PAGE_SIZE + 1).lean().maxTimeMS(1500);
    };
    const row = (item, title, subtitle, href, kind, date, badge) => ({
      id: String(item._id),
      title: String(title || 'Untitled'),
      subtitle: String(subtitle || '').slice(0, 220),
      href,
      kind,
      date: date || item.updatedAt || item.createdAt,
      badge: badge || null
    });
    
    // Quick Stats Calculation (for the 4 KPI cards in modal overview)
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const [myFollowUps, openTasks, todayMeetings, unreadMessages] = await Promise.all([
      workspace ? Customer.countDocuments({ ...customerScope, nextFollowUpAt: { $exists: true, $ne: null, $lte: endOfToday } }).maxTimeMS(1000).catch(() => 0) : 0,
      workspace ? CustomRecord.countDocuments({ ...workScope, status: { $nin: ['completed', 'won', 'delivered', 'archived'] } }).maxTimeMS(1000).catch(() => 0) : 0,
      Activity.countDocuments({ organization, createdAt: { $gte: startOfToday, $lte: endOfToday } }).maxTimeMS(1000).catch(() => 0),
      Notification.countDocuments({ organization, user: req.user._id, read: false }).maxTimeMS(1000).catch(() => 0)
    ]);

    const stats = { myFollowUps, openTasks, todayMeetings, unreadMessages };

    if (workspace) {
      const won = await CrmStage.find({ organization, clientCompany: workspace, isWon: true }).select('_id').lean().maxTimeMS(1500);
      const wonIds = won.map(stage => stage._id);

      for (const type of ['leads', 'clients']) queue(type, type === 'leads' ? 'Leads' : 'Clients', hasPermission(req.user, 'businesses.view'), async () => {
        const items = await find(Customer, { ...customerScope, stage: { [type === 'clients' ? '$in' : '$nin']: wonIds } }, ['name', 'company', 'email', 'phone', 'notes', 'source', 'campaign'], 'name company email phone stage notes nextFollowUpAt updatedAt createdAt', 'nextFollowUpAt');
        return items.map(item => row(item, item.name, [item.company, item.email, item.phone].filter(Boolean).join(' · '), `/customers/${item._id}`, type === 'leads' ? 'Lead' : 'Client', options.dateField === 'scheduled' ? item.nextFollowUpAt : null, type === 'leads' ? 'Lead' : 'Client'));
      });

      queue('work', 'Work & Tasks', moduleIds.length, async () => {
        const items = await find(CustomRecord, workScope, ['title', 'notes', 'status'], 'title notes module status deadline updatedAt createdAt', 'deadline');
        return items.map(item => {
          const module = moduleMap.get(String(item.module));
          const statusObj = module?.statuses?.find(status => status.key === item.status);
          const statusLabel = statusObj?.label || item.status || 'Active';
          return row(item, item.title, `${module?.name || 'Task'} · ${statusLabel}${item.notes ? ' · ' + item.notes : ''}`, `/work/${module?.key || 'tasks'}/${item._id}`, 'Work', options.dateField === 'scheduled' ? item.deadline : null, statusLabel);
        });
      });

      queue('activities', 'Meetings & Activity', hasPermission(req.user, 'businesses.view'), async () => {
        const text = matchText(['note', 'type']);
        const items = await Activity.aggregate([
          { $match: { organization, ...text, ...dated('nextFollowUpAt') } },
          { $lookup: { from: Customer.collection.name, localField: 'customer', foreignField: '_id', pipeline: [{ $match: customerScope }, { $project: { name: 1, company: 1 } }], as: 'parent' } },
          { $match: { 'parent.0': { $exists: true } } },
          { $sort: { createdAt: -1, _id: -1 } },
          { $skip: (options.page - 1) * PAGE_SIZE },
          { $limit: PAGE_SIZE + 1 },
          { $project: { note: 1, type: 1, customer: 1, createdAt: 1, nextFollowUpAt: 1, parent: 1 } }
        ]).option({ maxTimeMS: 1500 });
        return items.map(item => {
          const typeLabel = (item.type || 'note').replace(/_/g, ' ');
          return row(item, `${item.parent[0].name} · ${typeLabel}`, item.note || 'No notes logged', `/customers/${item.customer}#history`, 'Meeting & Activity', options.dateField === 'scheduled' ? item.nextFollowUpAt : item.createdAt, typeLabel);
        });
      });

      queue('history', 'Work History', true, async () => {
        const text = matchText(['message', 'entityName', 'action']);
        const items = await AuditLog.find({ organization, ...text, ...dated(null) })
          .populate('user', 'name email')
          .sort({ createdAt: -1, _id: -1 })
          .skip((options.page - 1) * PAGE_SIZE)
          .limit(PAGE_SIZE + 1)
          .lean()
          .maxTimeMS(1500);

        return items.map(item => {
          let href = '/settings';
          if (item.entityType === 'customer' || item.entityType === 'lead' || item.entityType === 'client') {
            href = item.entityId ? `/customers/${item.entityId}` : '/customers';
          } else if (item.entityType) {
            const mod = moduleMap.get(String(item.entityType)) || modules.find(m => m.key === item.entityType);
            href = mod ? `/work/${mod.key}/${item.entityId || ''}` : '/work';
          }
          const userLabel = item.user?.name ? ` by ${item.user.name}` : '';
          const title = item.entityName ? `${item.entityName} · ${item.action || 'Updated'}` : (item.action || 'Work history logged');
          const subtitle = (item.message || 'Audit history entry') + userLabel;
          return row(item, title, subtitle, href, 'Work History', item.createdAt, item.action || 'History');
        });
      });

      queue('team', 'Team Members', hasPermission(req.user, 'team.view'), async () => {
        const items = await find(User, base, ['name', 'email', 'role', 'phone'], 'name email role phone updatedAt createdAt', null);
        return items.map(item => row(item, item.name, `${item.email} · Role: ${item.role}`, '/team', 'Team', null, item.role));
      });

      queue('campaigns', 'Campaigns', hasPermission(req.user, 'ads.view'), async () => {
        const items = await find(Campaign, { ...base, clientCompany: workspace }, ['name', 'platform', 'status'], 'name platform status budget updatedAt createdAt', null);
        return items.map(item => row(item, item.name, `${item.platform || 'Ads'} · ${item.status || 'Active'}`, `/campaigns/${item._id}`, 'Campaign', null, item.status));
      });

      queue('workspaces', 'Workspaces', hasPermission(req.user, 'businesses.view'), async () => {
        const items = await find(ClientCompany, { ...base, ...(assigned ? { assignedUsers: req.user._id } : {}) }, ['name', 'website', 'industry', 'description'], 'name website industry updatedAt createdAt', null);
        return items.map(item => row(item, item.name, item.website || item.industry || 'Company Workspace', `/companies/${item._id}`, 'Workspace', null, 'Workspace'));
      });

      await Promise.all(jobs);
    }

    groups.sort((a,b) => TYPES.indexOf(a.id) - TYPES.indexOf(b.id));
    const payload = { search: options, groups, stats, warnings, modules: modules.map(module => ({ id: String(module._id), name: module.name })) };
    if (req.query.format === 'json') return res.json(payload);
    res.render('search/index', { title: 'Search your workspace', ...payload });
  } catch (error) { next(error); }
});

module.exports = router;
