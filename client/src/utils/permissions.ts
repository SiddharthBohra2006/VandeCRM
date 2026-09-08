import type { User, WorkType } from '../api/auth';

const SPECIALIST_MODULES: Record<string, string> = {
  video_editor: 'videos', graphic_designer: 'designs', website_developer: 'websites',
  content_manager: 'content', ads_manager: 'ads',
};
const WORK_TYPE_MODULES: Record<string, string> = {
  task: 'tasks', video: 'videos', design: 'designs', website: 'websites', content: 'content',
};

const WORK_FIELD_GROUPS: Record<string, { core: string[]; links: string[] }> = {
  task: { core: ['title', 'clientCompany', 'assignedTo', 'collaborators', 'status', 'priority', 'deadline', 'notes'], links: ['sopLink', 'referenceLink', 'workingFileLink', 'draftLink', 'deliveryLink'] },
  video: { core: ['title', 'clientCompany', 'assignedTo', 'collaborators', 'status', 'priority', 'deadline', 'revisionCount', 'notes'], links: ['scriptLink', 'footageLink', 'referenceLink', 'draftLink', 'deliveryLink', 'thumbnailLink', 'publishedLink'] },
  design: { core: ['title', 'clientCompany', 'assignedTo', 'collaborators', 'status', 'priority', 'deadline', 'revisionCount', 'designType', 'designBrief', 'copyText'], links: ['referenceLink', 'draftLink', 'deliveryLink'] },
  website: { core: ['title', 'clientCompany', 'assignedTo', 'collaborators', 'secondaryAssignee', 'status', 'priority', 'deadline', 'pageCount', 'notes'], links: ['requirementDocLink', 'contentDocLink', 'designLink', 'stagingLink', 'deliveryLink'] },
  content: { core: ['title', 'clientCompany', 'assignedTo', 'collaborators', 'status', 'priority', 'deadline', 'contentFormat', 'platform', 'contentPillar', 'hook', 'caption', 'cta'], links: ['scriptLink', 'publishedLink'] }
};

const workTypeKey = (workType: any) => String(workType?.key || workType || '');
const workTypeId = (workType: any) => String(workType?._id || workType?.workTypeId || workType || '');

const customWorkPermission = (user: User | null | undefined, workType: any) => {
  const configured = user?.customRole?.workTypePermissions || [];
  return configured.find(item => [workTypeId(workType), workTypeKey(workType)].includes(String(item.workTypeId)));
};

// Mirrors server/src/config/roles.js so route guards and sidebar visibility
// stay consistent with what the API actually enforces.
export function hasPermission(user: User | null | undefined, permission: string): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const [module, action] = permission.split('.');
  if (module === 'tasks') return hasPermission(user, `businesses.${action}`);
  if (module.startsWith('work:')) return hasWorkPermission(user, module.slice(5), action);
  if (Array.isArray(user.hiddenModules) && user.hiddenModules.includes(module)) return false;
  if (user.customRole) return Array.isArray(user.customRole.permissions) && user.customRole.permissions.includes(permission);
  if (user.role === 'manager') return module !== 'team' || action === 'view';
  if (user.role === 'agent') return ['businesses', 'tasks'].includes(module) && ['view', 'create', 'update'].includes(action);
  const specialistModule = SPECIALIST_MODULES[user.role];
  return module === specialistModule && ['view', 'update'].includes(action);
}

export function hasWorkPermission(user: User | null | undefined, workType: any, action: string): boolean {
  if (!user) return false;
  if (['admin', 'manager'].includes(user.role)) return true;
  const dynamic = customWorkPermission(user, workType);
  if (user.customRole?.workTypePermissions?.length) return (dynamic?.actions || []).includes(action);
  const key = workTypeKey(workType);
  const legacyModule = WORK_TYPE_MODULES[key] || (key.endsWith('s') ? key : `${key}s`);
  if (legacyModule && (user.hiddenModules || []).includes(legacyModule)) return false;
  if (user.customRole) return Boolean(legacyModule && Array.isArray(user.customRole.permissions) && user.customRole.permissions.includes(`${legacyModule}.${action}`));
  if (user.role === 'agent') return ['view', 'create', 'update'].includes(action);
  const specialistType: Record<string, string> = { video_editor: 'video', graphic_designer: 'design', website_developer: 'website', content_manager: 'content' };
  return specialistType[user.role] === key && ['view', 'update'].includes(action);
}

export function canAccessWorkType(user: User | null | undefined, workType: any): boolean {
  if (!user) return false;
  return hasWorkPermission(user, workType, 'view');
}

export function canEditWorkField(user: User | null | undefined, workType: any, field: string): boolean {
  if (!user) return false;
  if (!hasWorkPermission(user, workType, 'update')) return false;
  if (user.role === 'admin' || user.role === 'manager') return true;
  const dynamic = customWorkPermission(user, workType);
  if (dynamic) return Array.isArray(dynamic.editableFieldKeys) && dynamic.editableFieldKeys.includes(field);
  const configured = (user.customRole as any)?.fieldPermissions;
  if (configured) {
    const key = workTypeKey(workType);
    const fields = configured.get ? configured.get(key) : configured[key];
    return Array.isArray(fields) && fields.includes(field);
  }
  const defaults: Record<string, string[]> = {
    video_editor: ['status', 'revisionCount', 'notes', ...WORK_FIELD_GROUPS.video.links],
    graphic_designer: ['status', 'revisionCount', 'designBrief', 'copyText', ...WORK_FIELD_GROUPS.design.links],
    website_developer: ['status', 'pageCount', 'notes', 'designLink', 'stagingLink', 'deliveryLink'],
    content_manager: ['status', 'contentFormat', 'platform', 'contentPillar', 'hook', 'caption', 'cta', ...WORK_FIELD_GROUPS.content.links]
  };
  const allowed = defaults[user.role];
  return !allowed || allowed.includes(field);
}

export function canChangeWorkStatus(user: User | null | undefined, workType: any, currentStatusKey: string): boolean {
  if (!user) return false;
  if (['admin', 'manager'].includes(user.role)) return true;
  if (currentStatusKey && Array.isArray(workType?.statuses)) {
    const currentStatus = workType.statuses.find((s: any) => s.key === currentStatusKey);
    if (currentStatus?.requiresApproval) {
      return false;
    }
  }
  return canEditWorkField(user, workType, 'status');
}