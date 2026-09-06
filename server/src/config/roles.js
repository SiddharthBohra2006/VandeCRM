const ROLE_DEFINITIONS = {
  admin: { label: 'Admin', description: 'Full access to everything', workTypes: ['task', 'video', 'design', 'website', 'content'] },
  manager: { label: 'Manager', description: 'Create and edit operational records', workTypes: ['task', 'video', 'design', 'website', 'content'] },
  video_editor: { label: 'Video Editor', description: 'View and update assigned videos only', workTypes: ['video'] },
  graphic_designer: { label: 'Graphic Designer', description: 'View and update assigned designs only', workTypes: ['design'] },
  website_developer: { label: 'Website Developer', description: 'View and update assigned websites only', workTypes: ['website'] },
  content_manager: { label: 'Content Manager', description: 'View and update assigned content only', workTypes: ['content'] },
  ads_manager: { label: 'Ads Manager', description: 'View and update assigned campaigns only', workTypes: [] },
  agent: { label: 'Team Member', description: 'View and update assigned CRM records', workTypes: ['task', 'video', 'design', 'website', 'content'] },
  client: { label: 'Client', description: 'View client reporting only', workTypes: [] }
};

const INTERNAL_ROLES = Object.keys(ROLE_DEFINITIONS).filter(role => role !== 'client');
const SPECIALIST_ROLES = ['video_editor', 'graphic_designer', 'website_developer', 'content_manager', 'ads_manager'];
const PERMISSION_MODULES = ['businesses', 'tasks', 'videos', 'designs', 'websites', 'content', 'ads', 'targets', 'reports', 'mail', 'integrations', 'settings', 'audit', 'team'];
const PERMISSION_ACTIONS = ['view', 'create', 'update', 'delete'];
const ALL_PERMISSIONS = PERMISSION_MODULES.flatMap(module => PERMISSION_ACTIONS.map(action => `${module}.${action}`));
const WORK_FIELD_GROUPS = {
  task: { core: ['title', 'clientCompany', 'assignedTo', 'collaborators', 'status', 'priority', 'deadline', 'notes'], links: ['sopLink', 'referenceLink', 'workingFileLink', 'draftLink', 'deliveryLink'] },
  video: { core: ['title', 'clientCompany', 'assignedTo', 'collaborators', 'status', 'priority', 'deadline', 'revisionCount', 'notes'], links: ['scriptLink', 'footageLink', 'referenceLink', 'draftLink', 'deliveryLink', 'thumbnailLink', 'publishedLink'] },
  design: { core: ['title', 'clientCompany', 'assignedTo', 'collaborators', 'status', 'priority', 'deadline', 'revisionCount', 'designType', 'designBrief', 'copyText'], links: ['referenceLink', 'draftLink', 'deliveryLink'] },
  website: { core: ['title', 'clientCompany', 'assignedTo', 'collaborators', 'secondaryAssignee', 'status', 'priority', 'deadline', 'pageCount', 'notes'], links: ['requirementDocLink', 'contentDocLink', 'designLink', 'stagingLink', 'deliveryLink'] },
  content: { core: ['title', 'clientCompany', 'assignedTo', 'collaborators', 'status', 'priority', 'deadline', 'contentFormat', 'platform', 'contentPillar', 'hook', 'caption', 'cta'], links: ['scriptLink', 'publishedLink'] }
};
const WORK_FIELDS = Object.fromEntries(Object.entries(WORK_FIELD_GROUPS).map(([type, groups]) => [type, [...groups.core, ...groups.links]]));

const isRestrictedRole = role => role === 'agent' || SPECIALIST_ROLES.includes(role);
const recordScope = user => user?.customRole?.scope || (isRestrictedRole(user?.role) ? 'assigned' : 'organization');
const isRestrictedUser = user => recordScope(user) === 'assigned';
const workTypeKey = workType => String(workType?.key || workType || '');
const workTypeId = workType => String(workType?._id || workType?.workTypeId || workType || '');
const customWorkPermission = (user, workType) => {
  const configured = user?.customRole?.workTypePermissions || [];
  return configured.find(item => [workTypeId(workType), workTypeKey(workType)].includes(String(item.workTypeId)));
};
const hasWorkPermission = (user, workType, action) => {
  if (!user) return false;
  if (['admin', 'manager'].includes(user.role)) return true;
  const dynamic = customWorkPermission(user, workType);
  if (user.customRole?.workTypePermissions?.length) return (dynamic?.actions || []).includes(action);
  const key = workTypeKey(workType);
  const legacyModule = { task: 'tasks', video: 'videos', design: 'designs', website: 'websites', content: 'content' }[key];
  if (legacyModule && user.hiddenModules?.includes(legacyModule)) return false;
  if (user.customRole) return Boolean(legacyModule && user.customRole.permissions.includes(`${legacyModule}.${action}`));
  if (user.role === 'agent') return ['view', 'create', 'update'].includes(action);
  const specialistType = { video_editor: 'video', graphic_designer: 'design', website_developer: 'website', content_manager: 'content' }[user.role];
  return specialistType === key && ['view', 'update'].includes(action);
};
const canAccessWorkType = (userOrRole, workType) => {
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
  if (!role) return false;
  if (typeof userOrRole !== 'string') return hasWorkPermission(userOrRole, workType, 'view');
  if (['admin', 'manager', 'agent'].includes(role)) return true;
  const key = workTypeKey(workType);
  return (ROLE_DEFINITIONS[role]?.workTypes || []).includes(key);
};
const canAssignRole = (actor, targetRole) => actor?.role === 'admin' || targetRole !== 'admin';
const canManageUser = (actor, target) => actor?.role === 'admin' || target?.role !== 'admin';
const hasPermission = (user, permission) => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const [module, action] = permission.split('.');
  // Follow-ups are part of the lead lifecycle in every workspace.
  if (module === 'tasks') return hasPermission(user, `businesses.${action}`);
  if (module.startsWith('work:')) return hasWorkPermission(user, module.slice(5), action);
  if (Array.isArray(user.hiddenModules) && user.hiddenModules.includes(module)) return false;
  if (Array.isArray(user.customRole?.permissions)) return user.customRole.permissions.includes(permission);
  if (user.role === 'manager') return module !== 'team' || action === 'view';
  if (user.role === 'agent') return ['businesses', 'tasks'].includes(module) && ['view', 'create', 'update'].includes(action);
  const specialistModule = { video_editor: 'videos', graphic_designer: 'designs', website_developer: 'websites', content_manager: 'content', ads_manager: 'ads' }[user.role];
  return module === specialistModule && ['view', 'update'].includes(action);
};

const moduleForWorkType = workType => `work:${workTypeId(workType)}`;
const canEditWorkField = (user, workType, field) => {
  if (!hasWorkPermission(user, workType, 'update')) return false;
  if (field === 'status') return true;
  if (user.role === 'admin' || user.role === 'manager') return true;
  const dynamic = customWorkPermission(user, workType);
  if (dynamic) return Array.isArray(dynamic.editableFieldKeys) && dynamic.editableFieldKeys.includes(field);
  const configured = user.customRole?.fieldPermissions;
  if (configured) {
    const key = workTypeKey(workType);
    const fields = configured.get ? configured.get(key) : configured[key];
    return Array.isArray(fields) && fields.includes(field);
  }
  const defaults = {
    video_editor: ['status', 'revisionCount', 'notes', ...WORK_FIELD_GROUPS.video.links],
    graphic_designer: ['status', 'revisionCount', 'designBrief', 'copyText', ...WORK_FIELD_GROUPS.design.links],
    website_developer: ['status', 'pageCount', 'notes', 'designLink', 'stagingLink', 'deliveryLink'],
    content_manager: ['status', 'contentFormat', 'platform', 'contentPillar', 'hook', 'caption', 'cta', ...WORK_FIELD_GROUPS.content.links]
  };
  const allowed = defaults[user.role];
  return !allowed || allowed.includes(field);
};

const canAccessLeadField = (user, field, action = 'view') => {
  if (!user || user.role === 'admin' || user.role === 'manager' || !user.customRole) return true;
  const access = user.customRole.leadFieldPermissions;
  if (!access?.configured) return true;
  return action === 'edit'
    ? (access.editable || []).includes(field)
    : (access.visible || []).includes(field) || (access.editable || []).includes(field);
};

module.exports = { ROLE_DEFINITIONS, INTERNAL_ROLES, SPECIALIST_ROLES, PERMISSION_MODULES, PERMISSION_ACTIONS, ALL_PERMISSIONS, WORK_FIELD_GROUPS, WORK_FIELDS, isRestrictedRole, isRestrictedUser, recordScope, canAccessWorkType, canAssignRole, canManageUser, hasPermission, hasWorkPermission, moduleForWorkType, canEditWorkField, canAccessLeadField };
