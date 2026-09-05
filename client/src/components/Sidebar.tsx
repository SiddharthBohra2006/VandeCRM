import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { User, Company, WorkType, CrmTerms } from '../api/auth';
import { api } from '../api/client';
import Icon from './Icons';
import { useAuth } from '../contexts/AuthContext';

interface SidebarProps {
  user: User;
  activeCompany: Company | null;
  companies: Company[];
  workTypes: WorkType[];
  crmTerms: CrmTerms;
  isOpen: boolean;
  onToggle: () => void;
  onSwitchCompany: (companyId: string) => Promise<void>;
  currentPath: string;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

type NavItem = {
  path: string;
  label: string;
  icon: string;
  navKey: string;
  labelKey?: keyof CrmTerms;
  permission?: string;
  adminOnly?: boolean;
  managerOnly?: boolean;
  mainOnly?: boolean;
  reportOnly?: boolean;
};

const navItems: NavItem[] = [
  { path: '/portfolio', label: 'All CRMs', icon: 'layout-grid', navKey: 'nav-portfolio', adminOnly: true, mainOnly: true },
  { path: '/', label: 'Dashboard', icon: 'layout-dashboard', navKey: 'nav-pipeline' },
  { path: '/customers', labelKey: 'leadPlural', label: 'Leads', icon: 'users', navKey: 'nav-database', permission: 'businesses.view' },
  { path: '/clients', labelKey: 'recordPlural', label: 'Clients', icon: 'building-2', navKey: 'nav-clients', permission: 'businesses.view' },
  { path: '/analytics', label: 'Analytics', icon: 'bar-chart-3', navKey: 'nav-analytics', permission: 'reports.view' },
  { path: '/reports', label: 'Reports', icon: 'file-text', navKey: 'nav-reports', permission: 'reports.view' },
  { path: '/work', label: 'Work Center', icon: 'list-todo', navKey: 'nav-task-center' },
  { path: '/work/threads', label: 'Team Chat', icon: 'send', navKey: 'nav-team-chat' },
  { path: '/follow-ups', label: 'Follow-ups', icon: 'list-checks', navKey: 'nav-follow-ups', permission: 'tasks.view' },
  { path: '/campaigns', label: 'Ads', icon: 'megaphone', navKey: 'nav-campaigns', permission: 'ads.view' },
  { path: '/companies', label: 'CRMs', icon: 'folder-kanban', navKey: 'nav-companies', permission: 'mail.view' },
  { path: '/team', label: 'Team', icon: 'user-check', navKey: 'nav-team', permission: 'team.view' },
  { path: '/mail', label: 'Mail', icon: 'mail', navKey: 'nav-mail', permission: 'mail.view' },
  { path: '/settings', label: 'Settings', icon: 'settings', navKey: 'nav-settings', permission: 'settings.view' },
  { path: '/audit', label: 'Activity', icon: 'activity', navKey: 'nav-audit', permission: 'audit.view' },
];

const NAV_ORDER_KEY = 'sidebar-nav-order';

function initials(name: string) {
  return name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

function loadNavOrder(): string[] {
  try {
    const raw = localStorage.getItem(NAV_ORDER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveNavOrder(order: string[]) {
  localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(order));
}

const SPECIALIST_MODULES: Record<string, string> = {
  video_editor: 'videos', graphic_designer: 'designs', website_developer: 'websites',
  content_manager: 'content', ads_manager: 'ads',
};
const WORK_TYPE_MODULES: Record<string, string> = {
  task: 'tasks', video: 'videos', design: 'designs', website: 'websites', content: 'content',
};

function hasPermission(user: User, permission: string): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const [module, action] = permission.split('.');
  if (module === 'tasks') return hasPermission(user, `businesses.${action}`);
  if (Array.isArray(user.hiddenModules) && user.hiddenModules.includes(module)) return false;
  if (user.customRole) return (user.customRole.permissions || []).includes(permission);
  if (user.role === 'manager') return module !== 'team' || action === 'view';
  if (user.role === 'agent') return ['businesses', 'tasks'].includes(module) && ['view', 'create', 'update'].includes(action);
  const specialistModule = SPECIALIST_MODULES[user.role];
  return module === specialistModule && ['view', 'update'].includes(action);
}

function hasWorkPermission(user: User, workType: WorkType, action: string): boolean {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'manager') return true;
  const wp = (user.customRole?.workTypePermissions || []).find(item =>
    String(item.workTypeId) === String(workType._id) || item.workTypeId === workType.key
  );
  if (user.customRole?.workTypePermissions?.length) return (wp?.actions || []).includes(action);
  const legacyModule = WORK_TYPE_MODULES[workType.key];
  if (legacyModule && (user.hiddenModules || []).includes(legacyModule)) return false;
  if (user.customRole) return Boolean(legacyModule && (user.customRole.permissions || []).includes(`${legacyModule}.${action}`));
  if (user.role === 'agent') return ['view', 'create', 'update'].includes(action);
  const specialistType = { video_editor: 'video', graphic_designer: 'design', website_developer: 'website', content_manager: 'content' }[user.role];
  return specialistType === workType.key && ['view', 'update'].includes(action);
}

function canAccessWorkType(user: User, workType: WorkType): boolean {
  return hasWorkPermission(user, workType, 'view');
}

export default function Sidebar({ user, activeCompany, companies, workTypes, crmTerms, isOpen, onToggle, onSwitchCompany, currentPath, mobileOpen, onCloseMobile }: SidebarProps) {
  const { logout, refreshUser } = useAuth();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsHidden, setPrefsHidden] = useState<Set<string>>(new Set(user.sidebarHiddenItems || []));
  const [navOrder, setNavOrder] = useState<string[]>(loadNavOrder);
  const [dragNavKey, setDragNavKey] = useState<string | null>(null);
  const switcherRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const resolvedPath = location.pathname;

  const isClient = user.role === 'client';

  const brandName = user?.organization?.name || 'Vande';
  const brandInitials = brandName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('') || 'VD';

  const hiddenSet = useMemoSet(user.sidebarHiddenItems || []);

  const accessibleWorkTypes = workTypes.filter(wt => canAccessWorkType(user, wt));

  const visibleNavItems = isClient ? [] : navItems.filter(item => {
    if (item.permission && !hasPermission(user, item.permission)) return false;
    if (item.adminOnly && !['admin', 'manager'].includes(user.role)) return false;
    if (item.mainOnly && !(user.role === 'admin' && activeCompany?.isMain)) return false;
    if ((item.navKey === 'nav-task-center' || item.navKey === 'nav-team-chat') && accessibleWorkTypes.length === 0) return false;
    if (hiddenSet.has(item.navKey)) return false;
    return true;
  });

  const orderedNavItems = applyOrder(visibleNavItems, navOrder, item => item.navKey);

  // Workspace switcher: click outside to close
  useEffect(() => {
    if (!switcherOpen) return;
    function handleClick(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setSwitcherOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [switcherOpen]);

  // Workspace switcher: auto-close when sidebar collapses
  useEffect(() => {
    if (!isOpen && switcherOpen) setSwitcherOpen(false);
  }, [isOpen, switcherOpen]);

  function handlePrefsSave() {
    setPrefsOpen(false);
    refreshUser();
  }

  function handleReset() {
    localStorage.removeItem(NAV_ORDER_KEY);
    setNavOrder([]);
    window.location.reload();
  }

  // ---- Sidebar nav drag-to-reorder (matches EJS app.js) ----
  const navContainerRef = useRef<HTMLElement>(null);

  function onNavDragStart(key: string) {
    return (e: React.DragEvent) => {
      setDragNavKey(key);
      (e.currentTarget as HTMLElement).classList.add('dragging');
      try { e.dataTransfer.setData('text/plain', key); } catch (_) {}
    };
  }
  function onNavDragEnd() {
    (document.querySelectorAll('.sidebar-nav .dragging') as NodeListOf<HTMLElement>).forEach(el => el.classList.remove('dragging'));
    const order: string[] = [];
    navContainerRef.current?.querySelectorAll('[data-nav-id]').forEach(el => order.push(el.getAttribute('data-nav-id') || ''));
    saveNavOrder(order);
    setNavOrder(order);
    setDragNavKey(null);
  }
  function onNavDragOver(e: React.DragEvent) {
    e.preventDefault();
    const dragging = navContainerRef.current?.querySelector('.dragging') as HTMLElement | null;
    if (!dragging || !navContainerRef.current) return;
    const afterElement = getDragAfterElement(navContainerRef.current, e.clientY);
    if (afterElement == null) {
      navContainerRef.current.appendChild(dragging);
    } else {
      navContainerRef.current.insertBefore(dragging, afterElement);
    }
  }

  return (
    <aside className={`sidebar ${isOpen ? '' : 'collapsed'} ${mobileOpen ? 'mobile-open' : ''}`} id="appSidebar">
      <div className="sidebar-logo" ref={switcherRef}>
        {!isClient ? (
          <div className="crm-switcher" ref={switcherRef}>
            <button
              type="button"
              className="crm-switcher-summary"
              aria-label="Switch CRM workspace"
              aria-expanded={switcherOpen}
              onClick={() => setSwitcherOpen(prev => !prev)}
            >
              <span className="crm-current-avatar">
                {activeCompany ? initials(activeCompany.name) : '+'}
              </span>
              <span className="brand-text">
                <strong>{activeCompany ? activeCompany.name : 'Choose CRM'}</strong>
                <small>CRM Workspace</small>
              </span>
              <Icon name="chevrons-up-down" className="crm-switcher-chevron" size={16} />
            </button>

            {switcherOpen && (
              <div className="crm-switcher-popover" role="menu">
                <header className="crm-switcher-head">
                  <span>Workspaces</span>
                </header>
                <div className="crm-switcher-list">
                  {companies.length === 0 ? (
                    <div className="crm-switcher-empty" style={{ padding: '0.75rem', color: 'var(--muted)', fontSize: '0.75rem', textAlign: 'center' }}>No workspaces</div>
                  ) : (
                    companies.map(company => {
                      const selected = activeCompany && String(activeCompany._id) === String(company._id);
                      return (
                        <button
                          key={company._id}
                          type="button"
                          className={`crm-workspace-item ${selected ? 'active' : ''}`}
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              await onSwitchCompany(company._id);
                            } catch (err) {
                              console.error('Failed to switch workspace:', err);
                            } finally {
                              setSwitcherOpen(false);
                            }
                          }}
                        >
                          <span className="crm-item-avatar">{initials(company.name)}</span>
                          <div className="crm-item-info">
                            <strong>{company.name}</strong>
                            {selected && <small>Active workspace</small>}
                          </div>
                          {selected && <Icon name="check" className="crm-item-check" size={16} />}
                        </button>
                      );
                    })
                  )}
                </div>
                {hasPermission(user, 'businesses.create') && (
                  <Link to="/companies" className="crm-new-workspace-btn" onClick={() => setSwitcherOpen(false)}>
                    <Icon name="plus" size={16} />
                    <span>New Workspace</span>
                  </Link>
                )}
              </div>
            )}
          </div>
        ) : (
          <Link to="/client-dashboard" className="brand">
            <span className="crm-current-avatar">{brandInitials}</span>
            <span className="brand-text">
              <strong>{brandName}</strong>
              <small>CRM</small>
            </span>
          </Link>
        )}

        <button
          className="sidebar-toggle-btn desktop-only-toggle"
          onClick={onToggle}
          aria-label="Toggle Sidebar"
          title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          <Icon name={isOpen ? "panel-left-close" : "panel-left-open"} size={16} />
        </button>

        <button
          className="sidebar-toggle-btn mobile-only-toggle"
          onClick={onCloseMobile}
          aria-label="Close Menu"
          title="Close menu"
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      <nav className="sidebar-nav" ref={navContainerRef} onDragOver={onNavDragOver}>
        {isClient ? (
          <Link
            key="client-dashboard"
            to="/client-dashboard"
            data-nav-id="nav-client-dashboard"
            className={`nav-item ${resolvedPath === '/client-dashboard' ? 'active' : ''}`}
          >
            <Icon name="layout-dashboard" size={18} />
            <span>Reporting Dashboard</span>
          </Link>
        ) : (
          <>
        {orderedNavItems.map(item => {
          const isClientsPath = item.path === '/clients';
          const isCustomersPath = item.path === '/customers';
          const isFromClients = location.search.includes('from=clients') || location.pathname.startsWith('/clients');

          let isActive = false;
          if (item.path === '/') {
            isActive = resolvedPath === '/';
          } else if (isClientsPath) {
            isActive = resolvedPath.startsWith('/clients') || (resolvedPath.startsWith('/customers') && isFromClients);
          } else if (isCustomersPath) {
            isActive = resolvedPath.startsWith('/customers') && !isFromClients;
          } else if (item.path === '/work') {
            isActive = resolvedPath === '/work' || (resolvedPath.startsWith('/work/') && !resolvedPath.startsWith('/work/threads'));
          } else if (item.path === '/work/threads') {
            isActive = resolvedPath.startsWith('/work/threads');
          } else {
            isActive = resolvedPath.startsWith(item.path);
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              data-nav-id={item.navKey}
              draggable
              className={`nav-item ${isActive ? 'active' : ''}`}
              onDragStart={onNavDragStart(item.navKey)}
              onDragEnd={onNavDragEnd}
            >
              <Icon name={item.icon} size={18} />
              <span>
                {item.path === '/clients'
                  ? (crmTerms.recordPlural && crmTerms.recordPlural.toLowerCase() !== crmTerms.leadPlural.toLowerCase() ? crmTerms.recordPlural : 'Clients')
                  : (item.labelKey && crmTerms[item.labelKey] ? crmTerms[item.labelKey] : item.label)}
              </span>
            </Link>
          );
        })}
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        {!isClient && (
          <div className="sidebar-footer-tools">
            <button className="sidebar-tool-btn" type="button" title="Customize sidebar" onClick={() => { setPrefsHidden(new Set(user.sidebarHiddenItems || [])); setPrefsOpen(true); }}>
              <Icon name="sliders-horizontal" size={16} />
              <span>Customize</span>
            </button>
            <button className="sidebar-tool-btn" type="button" title="Reset sidebar order" onClick={handleReset}>
              <Icon name="rotate-ccw" size={16} />
              <span>Reset</span>
            </button>
          </div>
        )}
        <div className="sidebar-user">
          <div className="user-avatar" title={user.name}>
            {initials(user.name)}
          </div>
          <div className="user-info">
            <span className="user-name">{user.name}</span>
            <span className="user-role">{user.role}</span>
          </div>
          <button type="button" className="logout-icon-btn" title="Logout" onClick={logout}>
            <Icon name="log-out" size={16} />
          </button>
        </div>
      </div>

      {prefsOpen && (
        <SidebarPrefsDrawer
          hidden={prefsHidden}
          onToggle={(key) => setPrefsHidden(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
          })}
          onSave={async () => {
            setSavingPrefs(true);
            try {
              await api.post<{ ok: true }>('/dashboard/preferences/sidebar', { hiddenItems: [...prefsHidden] });
              handlePrefsSave();
            } catch {
              setSavingPrefs(false);
            }
          }}
          onCancel={() => setPrefsOpen(false)}
          saving={savingPrefs}
          navItems={orderedNavItems}
          crmTerms={crmTerms}
        />
      )}
    </aside>
  );
}

// ---- Helpers ----

function useMemoSet(arr: string[]) {
  const [set, setSet] = useState(() => new Set(arr));
  useEffect(() => { setSet(new Set(arr)); }, [arr.join(',')]);
  return set;
}

function applyOrder<T extends { navKey: string }>(items: T[], order: string[], getKey: (item: T) => string): T[] {
  if (!order.length) return items;
  return [...items].sort((a, b) => {
    const ia = order.indexOf(getKey(a));
    const ib = order.indexOf(getKey(b));
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

function getDragAfterElement(container: HTMLElement, y: number): HTMLElement | null {
  const draggableElements = [...container.querySelectorAll('[data-nav-id]:not(.dragging)')] as HTMLElement[];
  return draggableElements.reduce<{ offset: number; element: HTMLElement | null }>(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

// ---- Sidebar Preferences Drawer ----

interface PrefsDrawerProps {
  hidden: Set<string>;
  onToggle: (key: string) => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  navItems: NavItem[];
  crmTerms: CrmTerms;
}

function SidebarPrefsDrawer({ hidden, onToggle, onSave, onCancel, saving, navItems, crmTerms }: PrefsDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  function getLabel(item: NavItem): string {
    if (item.labelKey && crmTerms[item.labelKey]) return crmTerms[item.labelKey];
    return item.label;
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);

  return (
    <dialog className="sidebar-preferences-drawer" ref={dialogRef} onClose={onCancel}>
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); void onSave(); }}>
        <header>
          <div>
            <span className="eyebrow">Navigation</span>
            <h2>Customize sidebar</h2>
            <p>Show only the tools you use. Permissions are not affected.</p>
          </div>
          <button className="modal-close" type="button" onClick={onCancel} aria-label="Close">&times;</button>
        </header>
        <div className="sidebar-preference-list">
          {navItems.map(item => {
            const key = item.navKey;
            return (
              <label key={key} className="sidebar-preference-row">
                <span className="sidebar-preference-icon">
                  <Icon name={item.icon} size={16} />
                </span>
                <span>
                  <strong>{getLabel(item)}</strong>
                  <small>Visible in your sidebar</small>
                </span>
                <input
                  type="checkbox"
                  checked={!hidden.has(key)}
                  onChange={() => onToggle(key)}
                />
              </label>
            );
          })}
        </div>
        <footer>
          <button className="btn" type="button" onClick={onCancel}>Cancel</button>
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save navigation'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
