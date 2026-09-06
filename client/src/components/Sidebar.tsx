import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  color?: string;
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

  // Build candidate items list (all items user is permitted to see)
  const candidateNavItems: NavItem[] = isClient ? [] : [
    ...navItems.filter(item => {
      if (item.permission && !hasPermission(user, item.permission)) return false;
      if (item.adminOnly && !['admin', 'manager'].includes(user.role)) return false;
      if (item.mainOnly && !(user.role === 'admin' && activeCompany?.isMain)) return false;
      if ((item.navKey === 'nav-task-center' || item.navKey === 'nav-team-chat') && accessibleWorkTypes.length === 0) return false;
      return true;
    }),
    ...accessibleWorkTypes.map(wt => ({
      path: `/work/${wt.key}`,
      label: wt.name,
      icon: wt.icon || 'clipboard-list',
      navKey: `nav-work-${wt.key}`,
      color: wt.color,
    }))
  ];

  // Visible nav items (excluding hidden)
  const visibleNavItems = candidateNavItems.filter(item => !hiddenSet.has(item.navKey));
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
    if (!afterElement) {
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
              onClick={() => setSwitcherOpen(!switcherOpen)}
              aria-expanded={switcherOpen}
              aria-label={`Switch CRM. Current workspace: ${activeCompany ? activeCompany.name : 'none'}`}
            >
              <span className="crm-current-avatar">{activeCompany ? initials(activeCompany.name) : '+'}</span>
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
                          role="menuitem"
                          className={`crm-workspace-item ${selected ? 'active' : ''}`}
                          onClick={async () => {
                            setSwitcherOpen(false);
                            if (!selected) await onSwitchCompany(company._id);
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
            <span className="brand-text"><strong>{brandName}</strong><small>CRM</small></span>
          </Link>
        )}

        {/* Desktop collapse button */}
        <button
          id="desktopSidebarCollapseBtn"
          className="sidebar-toggle-btn desktop-only-toggle"
          aria-label="Toggle Sidebar"
          title="Collapse sidebar"
          type="button"
          onClick={onToggle}
        >
          <Icon name="panel-left-close" size={18} />
        </button>

        {/* Mobile close button */}
        <button
          id="mobileSidebarCloseBtn"
          className="sidebar-toggle-btn mobile-only-toggle"
          aria-label="Close Menu"
          type="button"
          onClick={onCloseMobile}
        >
          <Icon name="x" size={18} />
        </button>
      </div>

      <nav className="sidebar-nav" ref={navContainerRef} onDragOver={onNavDragOver}>
        {isClient ? (
          <Link
            to="/client-dashboard"
            data-nav-id="nav-client-dashboard"
            draggable
            title="Reporting Dashboard"
            className={`nav-item ${resolvedPath === '/client-dashboard' ? 'active' : ''}`}
          >
            <Icon name="layout-dashboard" size={18} />
            <span>Reporting Dashboard</span>
          </Link>
        ) : (
          <>
            {orderedNavItems.map(item => {
              const isActive = item.path === '/'
                ? resolvedPath === '/'
                : resolvedPath === item.path || resolvedPath.startsWith(item.path + '/');

              const isWorkModule = item.navKey.startsWith('nav-work-');
              return (
                <Link
                  key={item.navKey}
                  to={item.path}
                  data-nav-id={item.navKey}
                  draggable
                  onDragStart={onNavDragStart(item.navKey)}
                  onDragEnd={onNavDragEnd}
                  title={item.label}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  style={isWorkModule && item.color ? ({ '--module-color': item.color } as React.CSSProperties) : undefined}
                >
                  <Icon
                    name={item.icon}
                    size={18}
                    className={isWorkModule ? 'nav-item-module-icon' : undefined}
                    style={isWorkModule && item.color ? { color: item.color } : undefined}
                  />
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
            <button
              className="sidebar-tool-btn"
              type="button"
              title="Customize sidebar"
              onClick={() => {
                setPrefsHidden(new Set(user.sidebarHiddenItems || []));
                setPrefsOpen(true);
              }}
            >
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
            } catch (err) {
              console.error('Failed to save sidebar preferences', err);
            } finally {
              setSavingPrefs(false);
            }
          }}
          onCancel={() => setPrefsOpen(false)}
          saving={savingPrefs}
          navItems={candidateNavItems}
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

// ---- Sidebar Preferences Drawer (Rendered via React Portal) ----

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
  function getLabel(item: NavItem): string {
    if (item.labelKey && crmTerms[item.labelKey]) return crmTerms[item.labelKey] as string;
    return item.label;
  }

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return createPortal(
    <div
      className="sidebar-preferences-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="sidebar-preferences-drawer open"
        style={{
          width: '420px',
          maxWidth: '100vw',
          height: '100vh',
          background: 'var(--panel, #0f172a)',
          borderLeft: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          padding: '1.5rem',
          boxShadow: '-10px 0 40px rgba(0,0,0,0.4)',
          animation: 'slideInFromRight 0.24s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <form
          onSubmit={(e) => { e.preventDefault(); void onSave(); }}
          style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.25rem' }}
        >
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: '0.85rem' }}>
            <div>
              <span className="eyebrow" style={{ fontSize: '0.65rem', letterSpacing: '0.08em', color: 'var(--gold)' }}>Navigation</span>
              <h2 style={{ margin: '0.2rem 0 0.2rem', fontSize: '1.25rem', fontWeight: 800 }}>Customize sidebar</h2>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>Show only the tools you use. Permissions are not affected.</p>
            </div>
            <button
              className="modal-close"
              type="button"
              onClick={onCancel}
              aria-label="Close"
              style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: 'var(--muted)', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
            >
              &times;
            </button>
          </header>

          <div
            className="sidebar-preference-list"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              overflowY: 'auto',
              flexGrow: 1,
              paddingRight: '0.35rem',
            }}
          >
            {navItems.map(item => {
              const key = item.navKey;
              const isChecked = !hidden.has(key);
              return (
                <label
                  key={key}
                  className="sidebar-preference-row"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem 0.9rem',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    background: isChecked ? 'color-mix(in srgb, var(--gold) 4%, var(--panel))' : 'var(--bg-soft)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span
                    className="sidebar-preference-icon"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: isChecked ? 'color-mix(in srgb, var(--gold) 12%, var(--panel))' : 'var(--bg-soft)',
                      color: isChecked ? 'var(--gold)' : 'var(--muted)',
                      border: '1px solid var(--border)',
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={item.icon} size={16} style={item.color ? { color: item.color } : undefined} />
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: '0.88rem', color: isChecked ? 'var(--text)' : 'var(--muted)', fontWeight: 700 }}>
                      {getLabel(item)}
                    </strong>
                    <small style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                      {isChecked ? 'Visible in sidebar' : 'Hidden from sidebar'}
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggle(key)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--gold)' }}
                  />
                </label>
              );
            })}
          </div>

          <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.85rem' }}>
            <button className="btn" type="button" onClick={onCancel} style={{ padding: '8px 16px', borderRadius: '8px' }}>
              Cancel
            </button>
            <button className="btn primary" type="submit" disabled={saving} style={{ padding: '8px 20px', borderRadius: '8px' }}>
              {saving ? 'Saving…' : 'Save navigation'}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body
  );
}
