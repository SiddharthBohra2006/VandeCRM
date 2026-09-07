import type { User, WorkType } from '../api/auth';

const SPECIALIST_MODULES: Record<string, string> = {
  video_editor: 'videos', graphic_designer: 'designs', website_developer: 'websites',
  content_manager: 'content', ads_manager: 'ads',
};
const WORK_TYPE_MODULES: Record<string, string> = {
  task: 'tasks', video: 'videos', design: 'designs', website: 'websites', content: 'content',
};

// Mirrors server/src/config/roles.js so route guards and sidebar visibility
// stay consistent with what the API actually enforces.
export function hasPermission(user: User | null | undefined, permission: string): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const [module, action] = permission.split('.');
  if (module === 'tasks') return hasPermission(user, `businesses.${action}`);
  if (Array.isArray(user.hiddenModules) && user.hiddenModules.includes(module)) return false;
  if (user.customRole) return Array.isArray(user.customRole.permissions) && user.customRole.permissions.includes(permission);
  if (user.role === 'manager') return module !== 'team' || action === 'view';
  if (user.role === 'agent') return ['businesses', 'tasks'].includes(module) && ['view', 'create', 'update'].includes(action);
  const specialistModule = SPECIALIST_MODULES[user.role];
  return module === specialistModule && ['view', 'update'].includes(action);
}

export function hasWorkPermission(user: User, workType: WorkType, action: string): boolean {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'manager') return true;
  const legacyModule = WORK_TYPE_MODULES[workType.key];
  if (legacyModule && (user.hiddenModules || []).includes(legacyModule)) return false;
  if (user.customRole) return Boolean(legacyModule && Array.isArray(user.customRole.permissions) && user.customRole.permissions.includes(`${legacyModule}.${action}`));
  if (user.role === 'agent') return ['view', 'create', 'update'].includes(action);
  const specialistType = { video_editor: 'video', graphic_designer: 'design', website_developer: 'website', content_manager: 'content' }[user.role];
  return specialistType === workType.key && ['view', 'update'].includes(action);
}

export function canAccessWorkType(user: User, workType: WorkType): boolean {
  return hasWorkPermission(user, workType, 'view');
}