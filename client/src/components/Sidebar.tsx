import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { User, Company, WorkType, CrmTerms } from '../api/auth';
import { api } from '../api/client';
import Icon from './Icons';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission, canAccessWorkType } from '../utils/permissions';

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
  isGroup?: boolean;
};

const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: 'layout-dashboard', navKey: 'nav-pipeline' },
  { path: '/customers', labelKey: 'leadPlural', label: 'Leads', icon: 'users', navKey: 'nav-database', permission: 'businesses.view' },
  { path: '/clients', labelKey: 'recordPlural', label: 'Clients', icon: 'building-2', navKey: 'nav-clients', permission: 'businesses.view' },
  { path: '/analytics', label: 'Analytics', icon: 'bar-chart-3', navKey: 'nav-analytics', permission: 'reports.view' },
  { path: '/reports', label: 'Reports', icon: 'file-text', navKey: 'nav-reports', permission: 'reports.view' },
  { path: '/work', label: 'Work', icon: 'list-todo', navKey: 'nav-work-group', isGroup: true },
  { path: '/follow-ups', label: 'Follow-ups', icon: 'list-checks', navKey: 'nav-follow-ups', permission: 'tasks.view' },
  { path: '/campaigns', label: 'Ads', icon: 'megaphone', navKey: 'nav-campaigns', permission: 'ads.view' },
  { path: '/companies', label: 'CRMs', icon: 'folder-kanban', navKey: 'nav-companies', permission: 'mail.view' },
  { path: '/team', label: 'Team', icon: 'user-check', navKey: 'nav-team', permission: 'team.view' },
  { path: '/mail', label: 'Mail', icon: 'mail', navKey: 'nav-mail', permission: 'mail.view' },
  { path: '/settings', label: 'Settings', icon: 'settings', navKey: 'nav-settings', permission: 'settings.view' },
  { path: '/audit', label: 'Activity', icon: 'activity', navKey: 'nav-audit', permission: 'audit.view' },
];

const NAV_ORDER_KEY = 'sidebar-nav-order';
const NAV_CUSTOM_LABELS_KEY = 'sidebar-custom-labels';
const NAV_CUSTOM_ICONS_KEY = 'sidebar-custom-icons';

export const CURATED_NAV_ICONS = [
  'layout-dashboard', 'users', 'user-check', 'building-2', 'bar-chart-3',
  'file-text', 'list-todo', 'list-checks', 'megaphone', 'folder-kanban',
  'mail', 'settings', 'activity', 'send', 'message-circle',
  'star', 'calendar', 'briefcase', 'globe', 'zap',
  'bookmark', 'inbox', 'pie-chart', 'layers', 'tag',
  'phone', 'clock', 'check-circle-2', 'palette', 'code',
  'database', 'target', 'shield', 'bell', 'wallet',
  'sparkles', 'rocket', 'box', 'compass', 'share-2',
];

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

function loadCustomLabels(): Record<string, string> {
  try {
    const raw = localStorage.getItem(NAV_CUSTOM_LABELS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCustomLabels(labels: Record<string, string>) {
  localStorage.setItem(NAV_CUSTOM_LABELS_KEY, JSON.stringify(labels));
}

function loadCustomIcons(): Record<string, string> {
  try {
    const raw = localStorage.getItem(NAV_CUSTOM_ICONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCustomIcons(icons: Record<string, string>) {
  localStorage.setItem(NAV_CUSTOM_ICONS_KEY, JSON.stringify(icons));
}

export default function Sidebar({ user, activeCompany, companies, workTypes, crmTerms, isOpen, onToggle, onSwitchCompany, currentPath, mobileOpen, onCloseMobile }: SidebarProps) {
  const { logout, refreshUser } = useAuth();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsHidden, setPrefsHidden] = useState<Set<string>>(new Set(user.sidebarHiddenItems || []));
  const [customLabels, setCustomLabels] = useState<Record<string, string>>(loadCustomLabels);
  const [customIcons, setCustomIcons] = useState<Record<string, string>>(loadCustomIcons);
  const [navOrder, setNavOrder] = useState<string[]>(loadNavOrder);
  const [dragNavKey, setDragNavKey] = useState<string | null>(null);
  const switcherRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const resolvedPath = location.pathname;

  function getItemDefaultLabel(item: NavItem): string {
    if (item.path === '/clients') {
      return crmTerms.recordPlural && crmTerms.recordPlural.toLowerCase() !== crmTerms.leadPlural.toLowerCase()
        ? crmTerms.recordPlural
        : 'Clients';
    }
    return item.labelKey && crmTerms[item.labelKey] ? (crmTerms[item.labelKey] as string) : item.label;
  }

  function getItemLabel(item: NavItem): string {
    return (customLabels[item.navKey] && customLabels[item.navKey].trim()) || getItemDefaultLabel(item);
  }

  function getItemIcon(item: NavItem): string {
    return customIcons[item.navKey] || item.icon;
  }

  const isClient = user.role === 'client';

  const brandName = user?.organization?.name || 'Vande';
  const brandInitials = brandName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('') || 'VD';

  const hiddenSet = useMemoSet(user.sidebarHiddenItems || []);

  const accessibleWorkTypes = workTypes.filter(wt => canAccessWorkType(user, wt));

  const [workGroupOpen, setWorkGroupOpen] = useState(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/work')) return true;
    const stored = localStorage.getItem('sidebar-work-group-open');
    return stored !== null ? stored === 'true' : true;
  });

  useEffect(() => {
    if (resolvedPath.startsWith('/work')) {
      setWorkGroupOpen(true);
    }
  }, [resolvedPath]);

  function toggleWorkGroup(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setWorkGroupOpen(prev => {
      const next = !prev;
      localStorage.setItem('sidebar-work-group-open', String(next));
      return next;
    });
  }

  // Work child items
  const workChildren: NavItem[] = [
    { path: '/work', label: 'Work Center', icon: 'layout-grid', navKey: 'nav-task-center' },
    { path: '/work/threads', label: 'Team Chat', icon: 'send', navKey: 'nav-team-chat' },
    ...accessibleWorkTypes.map(wt => ({
      path: `/work/${wt.key}`,
      label: wt.name,
      icon: wt.icon || 'clipboard-list',
      navKey: `nav-work-${wt.key}`,
      color: wt.color,
    })),
  ];

  // Build candidate items list (all items user is permitted to see)
  const candidateNavItems: NavItem[] = isClient ? [] : [
    ...navItems.filter(item => {
      if (item.permission && !hasPermission(user, item.permission)) return false;
      if (item.adminOnly && !['admin', 'manager'].includes(user.role)) return false;
      if (item.mainOnly && !(user.role === 'admin' && activeCompany?.isMain)) return false;
      if (item.navKey === 'nav-work-group' && accessibleWorkTypes.length === 0) return false;
      return true;
    }),
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

        {/* Desktop collapse / expand button */}
        <button
          id="desktopSidebarCollapseBtn"
          className="sidebar-toggle-btn desktop-only-toggle"
          aria-label={isOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
          title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          type="button"
          onClick={onToggle}
        >
          <Icon name={isOpen ? 'panel-left-close' : 'panel-left-open'} size={18} />
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
              const searchParams = new URLSearchParams(location.search);
              const isFromClients = searchParams.get('from') === 'clients' || resolvedPath.startsWith('/clients');

              let isActive = false;
              if (item.path === '/') {
                isActive = resolvedPath === '/';
              } else if (item.path === '/clients') {
                isActive = resolvedPath === '/clients' || resolvedPath.startsWith('/clients/') || (resolvedPath.startsWith('/customers/') && isFromClients);
              } else if (item.path === '/customers') {
                isActive = (resolvedPath === '/customers' || resolvedPath.startsWith('/customers/')) && !isFromClients;
              } else if (item.path === '/work') {
                isActive = resolvedPath === '/work';
              } else {
                isActive = resolvedPath === item.path || resolvedPath.startsWith(item.path + '/');
              }

              if (item.isGroup || item.navKey === 'nav-work-group') {
                const isAnyWorkActive = resolvedPath.startsWith('/work');
                return (
                  <div
                    key={item.navKey}
                    data-nav-id={item.navKey}
                    draggable
                    onDragStart={onNavDragStart(item.navKey)}
                    onDragEnd={onNavDragEnd}
                    className={`nav-group ${isAnyWorkActive ? 'has-active' : ''}`}
                  >
                    <div className={`nav-item nav-group-header ${resolvedPath === '/work' ? 'active' : ''}`}>
                      <Link
                        to="/work"
                        title={getItemLabel(item)}
                        className="nav-group-title-link"
                      >
                        <Icon name={getItemIcon(item)} size={18} />
                        <span>{getItemLabel(item)}</span>
                      </Link>
                      {isOpen && (
                        <button
                          type="button"
                          className="nav-group-toggle-btn"
                          onClick={toggleWorkGroup}
                          aria-label={workGroupOpen ? 'Collapse Work menu' : 'Expand Work menu'}
                          title={workGroupOpen ? 'Collapse' : 'Expand'}
                        >
                          <Icon name="chevron-down" size={14} className={`nav-group-chevron ${workGroupOpen ? 'open' : ''}`} />
                        </button>
                      )}
                    </div>

                    {isOpen && workGroupOpen && (
                      <div className="nav-sub-list">
                        {workChildren.map(child => {
                          const isChildActive = child.path === '/work'
                            ? resolvedPath === '/work'
                            : (child.path === '/work/threads'
                                ? resolvedPath === '/work/threads' || resolvedPath.startsWith('/work/threads/')
                                : resolvedPath === child.path || resolvedPath.startsWith(child.path + '/'));
                          const isModule = child.navKey.startsWith('nav-work-');
                          return (
                            <Link
                              key={child.navKey}
                              to={child.path}
                              title={getItemLabel(child)}
                              className={`nav-sub-item ${isChildActive ? 'active' : ''}`}
                              style={isModule && child.color ? ({ '--module-color': child.color } as React.CSSProperties) : undefined}
                            >
                              <Icon
                                name={getItemIcon(child)}
                                size={15}
                                className={isModule ? 'nav-item-module-icon' : undefined}
                                style={isModule && child.color ? { color: child.color } : undefined}
                              />
                              <span>{getItemLabel(child)}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              const isWorkModule = item.navKey.startsWith('nav-work-');
              return (
                <Link
                  key={item.navKey}
                  to={item.path}
                  data-nav-id={item.navKey}
                  draggable
                  onDragStart={onNavDragStart(item.navKey)}
                  onDragEnd={onNavDragEnd}
                  title={getItemLabel(item)}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  style={isWorkModule && item.color ? ({ '--module-color': item.color } as React.CSSProperties) : undefined}
                >
                  <Icon
                    name={getItemIcon(item)}
                    size={18}
                    className={isWorkModule ? 'nav-item-module-icon' : undefined}
                    style={isWorkModule && item.color ? { color: item.color } : undefined}
                  />
                  <span>{getItemLabel(item)}</span>
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
            <button className="sidebar-tool-btn" type="button" title="Reset sidebar order and custom names/icons" onClick={handleReset}>
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
          customLabels={customLabels}
          customIcons={customIcons}
          onSave={async (newHidden, newLabels, newIcons) => {
            setSavingPrefs(true);
            try {
              await api.post<{ ok: true }>('/dashboard/preferences/sidebar', { hiddenItems: [...newHidden] });
              saveCustomLabels(newLabels);
              saveCustomIcons(newIcons);
              setCustomLabels(newLabels);
              setCustomIcons(newIcons);
              setPrefsHidden(newHidden);
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
  const defaultIndexMap = new Map(items.map((item, idx) => [getKey(item), idx]));
  return [...items].sort((a, b) => {
    const keyA = getKey(a);
    const keyB = getKey(b);
    let ia = order.indexOf(keyA);
    let ib = order.indexOf(keyB);

    // If legacy order had any work-related key (nav-task-center, nav-work-*, nav-tasks), adopt its position for nav-work-group
    if (ia === -1 && keyA === 'nav-work-group') {
      ia = order.findIndex(k => k.startsWith('nav-work-') || k === 'nav-task-center' || k === 'nav-tasks');
    }
    if (ib === -1 && keyB === 'nav-work-group') {
      ib = order.findIndex(k => k.startsWith('nav-work-') || k === 'nav-task-center' || k === 'nav-tasks');
    }

    const posA = ia !== -1 ? ia : (defaultIndexMap.get(keyA) ?? 999);
    const posB = ib !== -1 ? ib : (defaultIndexMap.get(keyB) ?? 999);
    return posA - posB;
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
  customLabels: Record<string, string>;
  customIcons: Record<string, string>;
  onSave: (hidden: Set<string>, labels: Record<string, string>, icons: Record<string, string>) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  navItems: NavItem[];
  crmTerms: CrmTerms;
}

function SidebarPrefsDrawer({ hidden, customLabels, customIcons, onSave, onCancel, saving, navItems, crmTerms }: PrefsDrawerProps) {
  const [draftHidden, setDraftHidden] = useState<Set<string>>(() => new Set(hidden));
  const [draftLabels, setDraftLabels] = useState<Record<string, string>>(() => ({ ...customLabels }));
  const [draftIcons, setDraftIcons] = useState<Record<string, string>>(() => ({ ...customIcons }));
  const [activeIconKey, setActiveIconKey] = useState<string | null>(null);

  function getDefaultLabel(item: NavItem): string {
    if (item.path === '/clients') {
      return crmTerms.recordPlural && crmTerms.recordPlural.toLowerCase() !== crmTerms.leadPlural.toLowerCase()
        ? crmTerms.recordPlural
        : 'Clients';
    }
    return item.labelKey && crmTerms[item.labelKey] ? (crmTerms[item.labelKey] as string) : item.label;
  }

  function handleToggle(key: string) {
    setDraftHidden(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function handleLabelChange(key: string, val: string) {
    setDraftLabels(prev => ({ ...prev, [key]: val }));
  }

  function handleIconSelect(key: string, iconName: string) {
    setDraftIcons(prev => ({ ...prev, [key]: iconName }));
    setActiveIconKey(null);
  }

  function handleResetItem(item: NavItem) {
    setDraftLabels(prev => {
      const next = { ...prev };
      delete next[item.navKey];
      return next;
    });
    setDraftIcons(prev => {
      const next = { ...prev };
      delete next[item.navKey];
      return next;
    });
    if (activeIconKey === item.navKey) setActiveIconKey(null);
  }

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (activeIconKey) {
          setActiveIconKey(null);
        } else {
          onCancel();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, activeIconKey]);

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
          background: 'var(--panel)',
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
          onSubmit={(e) => {
            e.preventDefault();
            void onSave(draftHidden, draftLabels, draftIcons);
          }}
          style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.25rem' }}
        >
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: '0.85rem' }}>
            <div>
              <span className="eyebrow" style={{ fontSize: '0.65rem', letterSpacing: '0.08em', color: 'var(--gold)' }}>Navigation</span>
              <h2 style={{ margin: '0.2rem 0 0.2rem', fontSize: '1.25rem', fontWeight: 800 }}>Customize sidebar</h2>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>Show only the tools you use. Click icon or text to customize.</p>
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
              const isChecked = !draftHidden.has(key);
              const defaultName = getDefaultLabel(item);
              const customName = draftLabels[key];
              const effectiveIcon = draftIcons[key] || item.icon;
              const isCustomized = (customName !== undefined && customName.trim() !== '' && customName !== defaultName) || Boolean(draftIcons[key]);
              const isPickerOpen = activeIconKey === key;

              return (
                <div
                  key={key}
                  className="sidebar-preference-row"
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem 0.9rem',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    background: isChecked ? 'color-mix(in srgb, var(--gold) 4%, var(--panel))' : 'var(--bg-soft)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Icon picker trigger button */}
                  <button
                    type="button"
                    onClick={() => setActiveIconKey(isPickerOpen ? null : key)}
                    title="Click to choose a custom icon"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: isPickerOpen
                        ? 'var(--gold)'
                        : (isChecked ? 'color-mix(in srgb, var(--gold) 12%, var(--panel))' : 'var(--bg-soft)'),
                      color: isPickerOpen ? '#000' : (isChecked ? 'var(--gold)' : 'var(--muted)'),
                      border: isPickerOpen ? '1px solid var(--gold)' : '1px solid var(--border)',
                      flexShrink: 0,
                      cursor: 'pointer',
                      padding: 0,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Icon name={effectiveIcon} size={16} style={!isPickerOpen && item.color ? { color: item.color } : undefined} />
                  </button>

                  {/* Inline editable label text */}
                  <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0, gap: '1px' }}>
                    <input
                      type="text"
                      value={customName !== undefined ? customName : defaultName}
                      onChange={(e) => handleLabelChange(key, e.target.value)}
                      placeholder={defaultName}
                      title="Click to rename"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px dashed transparent',
                        borderRadius: 0,
                        color: isChecked ? 'var(--text)' : 'var(--muted)',
                        fontSize: '0.88rem',
                        fontWeight: 700,
                        padding: '0',
                        margin: 0,
                        outline: 'none',
                        width: '100%',
                        fontFamily: 'inherit',
                        boxShadow: 'none',
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderBottomColor = 'var(--gold)'; }}
                      onBlur={(e) => { e.currentTarget.style.borderBottomColor = 'transparent'; }}
                    />
                    <small style={{ fontSize: '0.72rem', color: 'var(--muted)', paddingLeft: '1px' }}>
                      {isChecked ? 'Visible in sidebar' : 'Hidden from sidebar'}
                    </small>
                  </div>

                  {/* Revert button if customized */}
                  {isCustomized && (
                    <button
                      type="button"
                      onClick={() => handleResetItem(item)}
                      title="Revert name and icon to default"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--muted)',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Icon name="rotate-ccw" size={13} />
                    </button>
                  )}

                  {/* Visibility Checkbox */}
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggle(key)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--gold)', flexShrink: 0 }}
                  />

                  {/* Floating Icon Picker Popup */}
                  {isPickerOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: '0.9rem',
                        width: '280px',
                        background: 'var(--panel)',
                        border: '1px solid var(--border)',
                        borderRadius: '10px',
                        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
                        padding: '8px',
                        zIndex: 1000,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gold)' }}>Select Icon</span>
                        <button
                          type="button"
                          onClick={() => setActiveIconKey(null)}
                          style={{ background: 'none', border: 'none', fontSize: '0.72rem', color: 'var(--muted)', cursor: 'pointer' }}
                        >
                          ✕
                        </button>
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(6, 1fr)',
                          gap: '5px',
                          maxHeight: '150px',
                          overflowY: 'auto',
                        }}
                      >
                        {CURATED_NAV_ICONS.map(iconName => {
                          const isSelected = effectiveIcon === iconName;
                          return (
                            <button
                              key={iconName}
                              type="button"
                              onClick={() => handleIconSelect(key, iconName)}
                              title={iconName}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '32px',
                                height: '32px',
                                borderRadius: '6px',
                                border: isSelected ? '1px solid var(--gold)' : '1px solid var(--border)',
                                background: isSelected ? 'var(--gold)' : 'var(--bg-soft)',
                                color: isSelected ? '#000' : 'var(--text)',
                                cursor: 'pointer',
                                padding: 0,
                              }}
                            >
                              <Icon name={iconName} size={15} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
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
