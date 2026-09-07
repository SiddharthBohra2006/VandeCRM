const express = require('express');
const mongoose = require('mongoose');
const { requireApiAuth } = require('./middleware/auth');
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
router.use(requireApiAuth);

const PAGE_SIZE = 12;

// GET /api/search — Universal workspace search
router.get('/', async (req, res, next) => {
  let options;
  try {
    options = searchOptions(req.query);
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message });
  }

  try {
    const organization = req.user.organization._id;
    const assigned = isRestrictedUser(req.user);
    const activeCompanyId = req.activeCompanyId ? String(req.activeCompanyId) : null;

    // Retrieve user's accessible client companies
    const filter = { organization, status: { $ne: 'inactive' } };
    if (!['admin', 'manager'].includes(req.user.role)) filter.assignedUsers = req.user._id;
    const accessibleCompanies = await ClientCompany.find(filter).select('_id name').lean().maxTimeMS(1500);
    const accessibleCompanyIds = accessibleCompanies.length ? accessibleCompanies.map(c => c._id) : (activeCompanyId ? [activeCompanyId] : []);
    const companyMap = new Map(accessibleCompanies.map(c => [String(c._id), c.name]));

    const modules = accessibleCompanyIds.length
      ? (await WorkType.find({ organization, clientCompany: { $in: accessibleCompanyIds }, isActive: true }).select('name key statuses clientCompany').lean().maxTimeMS(1500)).filter(module =>
          hasWorkPermission(req.user, module, 'view')
        )
      : [];

    const moduleIds = modules.filter(module => !options.module || String(module._id) === options.module).map(module => module._id);
    const moduleMap = new Map(modules.map(module => [String(module._id), module]));
    const groups = [];
    const warnings = [];
    const base = { organization };
    const customerScope = { ...base, ...(accessibleCompanyIds.length ? { clientCompany: { $in: accessibleCompanyIds } } : {}), ...(assigned ? { assignedTo: req.user._id } : {}) };
    const workScope = {
      ...base,
      ...(accessibleCompanyIds.length ? { workspace: { $in: accessibleCompanyIds } } : {}),
      ...(moduleIds.length ? { module: { $in: moduleIds } } : {}),
      ...(assigned ? { $or: [{ assignedTo: req.user._id }, { collaborators: req.user._id }, { secondaryAssignee: req.user._id }] } : {}),
    };

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
      jobs.push(
        (async () => {
          try {
            const rows = await execute();
            groups.push({ id, label, items: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE });
          } catch (error) {
            console.error(`Search ${id} failed:`, error.message || error.code || error.name);
            warnings.push(`${label} search is temporarily unavailable.`);
          }
        })()
      );
    };

    const find = (Model, scope, fields, select, scheduled) => {
      const text = matchText(fields);
      return Model.find({ ...scope, ...text, ...dated(scheduled) })
        .select(select)
        .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
        .skip((options.page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE + 1)
        .lean()
        .maxTimeMS(1500);
    };

    const row = (item, title, subtitle, href, kind, date, badge) => ({
      id: String(item._id),
      title: String(title || 'Untitled'),
      subtitle: String(subtitle || '').slice(0, 220),
      href,
      kind,
      date: date || item.updatedAt || item.createdAt,
      badge: badge || null,
    });

    // Quick Stats Calculation
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const [myFollowUps, openTasks, todayMeetings, unreadMessages] = await Promise.all([
      accessibleCompanyIds.length && hasPermission(req.user, 'businesses.view')
        ? Customer.countDocuments({ ...customerScope, nextFollowUpAt: { $exists: true, $ne: null, $lte: endOfToday } })
            .maxTimeMS(1000)
            .catch(() => 0)
        : 0,
      accessibleCompanyIds.length
        ? CustomRecord.countDocuments({ ...workScope, status: { $nin: ['completed', 'won', 'delivered', 'archived'] } })
            .maxTimeMS(1000)
            .catch(() => 0)
        : 0,
      Activity.countDocuments({ organization, user: req.user._id, createdAt: { $gte: startOfToday, $lte: endOfToday } })
        .maxTimeMS(1000)
        .catch(() => 0),
      Notification.countDocuments({ organization, user: req.user._id, read: false })
        .maxTimeMS(1000)
        .catch(() => 0),
    ]);

    const stats = { myFollowUps, openTasks, todayMeetings, unreadMessages };

    if (accessibleCompanyIds.length || !assigned) {
      const won = await CrmStage.find({ organization, ...(accessibleCompanyIds.length ? { clientCompany: { $in: accessibleCompanyIds } } : {}), isWon: true }).select('_id').lean().maxTimeMS(1500);
      const wonIds = won.map(stage => stage._id);

      for (const type of ['leads', 'clients']) {
        queue(type, type === 'leads' ? 'Leads' : 'Clients', hasPermission(req.user, 'businesses.view'), async () => {
          const items = await find(
            Customer,
            { ...customerScope, stage: { [type === 'clients' ? '$in' : '$nin']: wonIds } },
            ['name', 'company', 'email', 'phone', 'notes', 'source'],
            'name company email phone stage notes clientCompany nextFollowUpAt updatedAt createdAt',
            'nextFollowUpAt'
          );
          return items.map(item => {
            const compName = accessibleCompanies.length > 1 ? companyMap.get(String(item.clientCompany)) : null;
            const subtitle = [item.company, item.email, item.phone, compName].filter(Boolean).join(' · ');
            return row(
              item,
              item.name,
              subtitle,
              `/customers/${item._id}`,
              type === 'leads' ? 'Lead' : 'Client',
              options.dateField === 'scheduled' ? item.nextFollowUpAt : null,
              type === 'leads' ? 'Lead' : 'Client'
            );
          });
        });
      }

      queue('work', 'Work & Tasks', moduleIds.length > 0 || !assigned, async () => {
        const matchedModuleIds = options.q ? modules.filter(m => m.name.toLowerCase().includes(options.q.toLowerCase()) || m.key.toLowerCase().includes(options.q.toLowerCase())).map(m => m._id) : [];
        const textFilter = matchText(['title', 'notes', 'status']);
        const queryFilter = matchedModuleIds.length
          ? { ...workScope, $or: [textFilter, { module: { $in: matchedModuleIds } }], ...dated('deadline') }
          : { ...workScope, ...textFilter, ...dated('deadline') };

        const items = await CustomRecord.find(queryFilter)
          .select('title notes module workspace status deadline updatedAt createdAt')
          .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
          .skip((options.page - 1) * PAGE_SIZE)
          .limit(PAGE_SIZE + 1)
          .lean()
          .maxTimeMS(1500);

        return items.map(item => {
          const module = moduleMap.get(String(item.module));
          const compName = accessibleCompanies.length > 1 ? companyMap.get(String(item.workspace)) : null;
          const statusObj = module?.statuses?.find(status => status.key === item.status);
          const statusLabel = statusObj?.label || item.status || 'Active';
          const subParts = [module?.name || 'Task', compName, statusLabel, item.notes].filter(Boolean);
          return row(
            item,
            item.title,
            subParts.join(' · '),
            `/work/${module?.key || 'tasks'}/${item._id}`,
            'Work',
            options.dateField === 'scheduled' ? item.deadline : null,
            statusLabel
          );
        });
      });

      queue('activities', 'Meetings & Activity', hasPermission(req.user, 'businesses.view'), async () => {
        const text = matchText(['note', 'type']);
        const items = await Activity.aggregate([
          { $match: { organization, ...text, ...dated('nextFollowUpAt') } },
          { $lookup: { from: Customer.collection.name, localField: 'customer', foreignField: '_id', pipeline: [{ $match: customerScope }, { $project: { name: 1, company: 1, clientCompany: 1 } }], as: 'parent' } },
          { $match: { 'parent.0': { $exists: true } } },
          { $sort: { createdAt: -1, _id: -1 } },
          { $skip: (options.page - 1) * PAGE_SIZE },
          { $limit: PAGE_SIZE + 1 },
          { $project: { note: 1, type: 1, customer: 1, createdAt: 1, nextFollowUpAt: 1, parent: 1 } },
        ]).option({ maxTimeMS: 1500 });
        return items.map(item => {
          const typeLabel = (item.type || 'note').replace(/_/g, ' ');
          const compName = accessibleCompanies.length > 1 ? companyMap.get(String(item.parent[0]?.clientCompany)) : null;
          const subtitle = [item.note || 'No notes logged', compName].filter(Boolean).join(' · ');
          return row(
            item,
            `${item.parent[0].name} · ${typeLabel}`,
            subtitle,
            `/customers/${item.customer}`,
            'Meeting & Activity',
            options.dateField === 'scheduled' ? item.nextFollowUpAt : item.createdAt,
            typeLabel
          );
        });
      });

      queue('history', 'Work History', hasPermission(req.user, 'audit.view'), async () => {
        const text = matchText(['message', 'entityName', 'action']);
        // Restricted users (custom role scope 'assigned') never see the org-wide
        // trail — scope history to their own actions.
        const historyScope = isRestrictedUser(req.user) ? { ...base, user: req.user._id } : base;
        const items = await AuditLog.find({ ...historyScope, ...text, ...dated(null) })
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
          const title = item.entityName ? `${item.entityName} · ${item.action || 'Updated'}` : item.action || 'Work history logged';
          const subtitle = (item.message || 'Audit history entry') + userLabel;
          return row(item, title, subtitle, href, 'Work History', item.createdAt, item.action || 'History');
        });
      });

      queue('team', 'Team Members', hasPermission(req.user, 'team.view') && !isRestrictedUser(req.user), async () => {
        const items = await find(User, base, ['name', 'email', 'role', 'phone'], 'name email role phone updatedAt createdAt', null);
        return items.map(item => row(item, item.name, `${item.email} · Role: ${item.role}`, '/team', 'Team', null, item.role));
      });

      queue('campaigns', 'Campaigns', hasPermission(req.user, 'ads.view'), async () => {
        const items = await find(Campaign, { ...base, ...(accessibleCompanyIds.length ? { clientCompany: { $in: accessibleCompanyIds } } : {}) }, ['name', 'platform', 'status'], 'name platform status budget clientCompany updatedAt createdAt', null);
        return items.map(item => {
          const compName = accessibleCompanies.length > 1 ? companyMap.get(String(item.clientCompany)) : null;
          const subtitle = [item.platform || 'Ads', item.status || 'Active', compName].filter(Boolean).join(' · ');
          return row(item, item.name, subtitle, `/campaigns/${item._id}`, 'Campaign', null, item.status);
        });
      });

      queue('workspaces', 'Workspaces', hasPermission(req.user, 'businesses.view'), async () => {
        const items = await find(ClientCompany, { ...base, ...(accessibleCompanyIds.length ? { _id: { $in: accessibleCompanyIds } } : {}), ...(assigned ? { assignedUsers: req.user._id } : {}) }, ['name', 'website', 'industry', 'description'], 'name website industry updatedAt createdAt', null);
        return items.map(item => row(item, item.name, item.website || item.industry || 'Company Workspace', `/companies/${item._id}`, 'Workspace', null, 'Workspace'));
      });

      await Promise.all(jobs);
    }

    groups.sort((a, b) => TYPES.indexOf(a.id) - TYPES.indexOf(b.id));
    res.json({
      ok: true,
      search: options,
      groups,
      stats,
      warnings,
      modules: modules.map(module => ({ id: String(module._id), name: module.name })),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
