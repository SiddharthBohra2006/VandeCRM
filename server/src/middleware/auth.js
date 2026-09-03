const User = require('../models/User');
const ClientCompany = require('../models/ClientCompany');
const WorkType = require('../models/WorkType');
const { INTERNAL_ROLES, ROLE_DEFINITIONS, canAccessWorkType, hasPermission, hasWorkPermission } = require('../config/roles');

async function attachUser(req, res, next) {
  try {
    req.user = null;
    if (req.session && req.session.userId) {
      req.user = await User.findById(req.session.userId).populate('organization customRole');
      if (req.user && req.user.isActive === false) {
        req.session.userId = null;
        req.user = null;
      }
    }
    res.locals.user = req.user;
    res.locals.path = req.path;
    res.locals.crmCompanies = [];
    res.locals.activeCompany = null;
    res.locals.previousCompany = null;
    res.locals.workTypes = [];
    res.locals.crmTerms = {
      leadSingular: 'Lead',
      leadPlural: 'Leads',
      recordSingular: 'Client',
      recordPlural: 'Clients',
      pipelineName: 'Sales pipeline'
    };
    res.locals.roleDefinitions = ROLE_DEFINITIONS;
    res.locals.canAccessWorkType = workType => canAccessWorkType(req.user, workType);
    res.locals.canPermission = permission => {
      const [module, action] = permission.split('.');
      if (module.startsWith('work:')) {
        const key = module.slice(5);
        const workType = (res.locals.workTypes || []).find(item => item.key === key || String(item._id) === key);
        return Boolean(workType && hasWorkPermission(req.user, workType, action));
      }
      return hasPermission(req.user, permission);
    };
    next();
  } catch (error) {
    next(error);
  }
}

async function loadCompanyContext(req, res) {
  const filter = { organization: req.user.organization._id, status: { $ne: 'inactive' } };
  if (!['admin', 'manager'].includes(req.user.role)) filter.assignedUsers = req.user._id;
  const companies = await ClientCompany.find(filter).select('_id name isMain').sort({ name: 1 });
  const activeCompany = companies.find(company => String(company._id) === String(req.session.activeCompanyId)) || companies[0] || null;
  req.activeCompany = activeCompany;
  if (activeCompany) req.session.activeCompanyId = String(activeCompany._id);
  res.locals.crmCompanies = companies;
  res.locals.activeCompany = activeCompany;
  const terminology = activeCompany?.terminology?.toObject?.() || activeCompany?.terminology || {};
  res.locals.crmTerms = {
    leadSingular: terminology.leadSingular || 'Lead',
    leadPlural: terminology.leadPlural || 'Leads',
    recordSingular: terminology.recordSingular || 'Client',
    recordPlural: terminology.recordPlural || 'Clients',
    pipelineName: terminology.pipelineName || 'Sales pipeline'
  };
  res.locals.previousCompany = companies.find(company => String(company._id) === String(req.session.previousCompanyId)) || null;
  res.locals.workTypes = activeCompany
    ? await WorkType.find({ organization: req.user.organization._id, clientCompany: activeCompany._id, isActive: true }).sort({ order: 1, name: 1 }).lean()
    : [];

  if (activeCompany && req.method === 'GET') {
    if (req.path === '/' || req.path === '/analytics' || req.path.startsWith('/reports') || req.path.startsWith('/customers') || req.path.startsWith('/campaigns')) {
      req.query.clientCompany ||= String(activeCompany._id);
    } else if (req.path.startsWith('/work/')) {
      req.query.company ||= String(activeCompany._id);
    }
  }

  if (!activeCompany && req.user && req.user.role !== 'client') {
    const allowedPaths = ['/companies', '/auth', '/logout', '/team', '/settings', '/api/inbound-lead'];
    const isAllowed = allowedPaths.some(p => req.path === p || req.path.startsWith(p));
    if (!isAllowed) {
      return res.redirect('/companies?onboarding=true');
    }
  }
}

const attachCompanyContext = (req, res, next) => {
  return loadCompanyContext(req, res).then(() => {
    if (res.headersSent) return;
    next();
  }, next);
};

function requireWorkPermission(action) {
  return (req, res, next) => hasWorkPermission(req.user, req.workType || req.params.type, action)
    ? next()
    : res.status(403).render('errors/403', { title: 'Access denied' });
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  return res.redirect('/auth/login');
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).render('errors/403', { title: 'Access denied' });
}

function requireManagerOrAdmin(req, res, next) {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'manager')) return next();
  return res.status(403).render('errors/403', { title: 'Access denied' });
}

function requireInternalUser(req, res, next) {
  if (req.user && INTERNAL_ROLES.includes(req.user.role)) return next();
  return res.status(403).render('errors/403', { title: 'Access denied' });
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (req.user && roles.includes(req.user.role)) return next();
    return res.status(403).render('errors/403', { title: 'Access denied' });
  };
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (hasPermission(req.user, permission)) return next();
    return res.status(403).render('errors/403', { title: 'Access denied' });
  };
}

module.exports = { attachUser, attachCompanyContext, loadCompanyContext, requireAuth, requireAdmin, requireManagerOrAdmin, requireInternalUser, requireRoles, requirePermission, requireWorkPermission };
