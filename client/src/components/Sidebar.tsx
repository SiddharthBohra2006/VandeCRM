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
}

type NavItem = {
  path: string;
  label: string;
  icon: string;
  navKey: string;
  labelKey?: keyof CrmTerms;
  adminOnly?: boolean;
  managerOnly?: boolean;
  mainOnly?: boolean;
  reportOnly?: boolean;
};

const navItems: NavItem[] = [
  { path: '/portfolio', label: 'All CRMs', icon: 'layout-grid', navKey: 'nav-portfolio', adminOnly: true, mainOnly: true },
  { path: '/', label: 'Dashboard', icon: 'layout-dashboard', navKey: 'nav-pipeline' },
  { path: '/customers', labelKey: 'leadPlural', label: 'Leads', icon: 'users', navKey: 'nav-database' },
  { path: '/clients', labelKey: 'recordPlural', label: 'Clients', icon: 'building-2', navKey: 'nav-clients' },
  { path: '/analytics', label: 'Analytics', icon: 'bar-chart-3', navKey: 'nav-analytics', reportOnly: true },
  { path: '/reports', label: 'Reports', icon: 'file-text', navKey: 'nav-reports', reportOnly: true },
  { path: '/work', label: 'Work Center', icon: 'list-todo', navKey: 'nav-task-center' },
  { path: '/tasks', label: 'Follow-ups', icon: 'list-checks', navKey: 'nav-tasks' },
  { path: '/campaigns', label: 'Ads', icon: 'megaphone', navKey: 'nav-campaigns' },
  { path: '/companies', label: 'CRMs', icon: 'folder-kanban', navKey: 'nav-companies' },
  { path: '/team', label: 'Team', icon: 'user-check', navKey: 'nav-team', adminOnly: true },
  { path: '/mail', label: 'Mail', icon: 'mail', navKey: 'nav-mail' },
  { path: '/settings', label: 'Settings', icon: 'settings', navKey: 'nav-settings', adminOnly: true },
  { path: '/audit', label: 'Activity', icon: 'activity', navKey: 'nav-audit', adminOnly: true },
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

export default function Sidebar({ user, activeCompany, companies, workTypes, crmTerms, isOpen, onToggle, onSwitchCompany, currentPath }: SidebarProps) {
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

  const isWorkActive = resolvedPath.startsWith('/work');
  const isManager = ['admin', 'manager'].includes(user.role);

  const hiddenSet = useMemoSet(user.sidebarHiddenItems || []);

  const visibleNavItems = navItems.filter(item => {
    if (item.adminOnly && !isManager) return false;
    if (item.mainOnly && !(user.role === 'admin' && activeCompany?.isMain)) return false;
    if (item.reportOnly && !isManager) return false;
    if (hiddenSet.has(item.navKey)) return false;
    return true;
  });

  const visibleWorkTypes = workTypes.filter(wt => !hiddenSet.has(`nav-work-${wt.key}`));

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
    <aside className={`sidebar ${isOpen ? '' : 'collapsed'}`} id="appSidebar">
      <div className="sidebar-logo" ref={switcherRef}>
        <details className="crm-switcher" open={switcherOpen ? true : undefined}>
          <summary
            className="crm-switcher-summary"
            aria-label="Switch CRM workspace"
            onClick={(e) => {
              e.preventDefault();
              setSwitcherOpen(!switcherOpen);
            }}
          >
            <span className="crm-current-avatar">
              {activeCompany ? initials(activeCompany.name) : '+'}
            </span>
            <span className="brand-text">
              <strong>{activeCompany ? activeCompany.name : 'Choose CRM'}</strong>
              <small>CRM Workspace</small>
            </span>
            <Icon name="chevrons-up-down" className="crm-switcher-chevron" size={16} />
          </summary>

          {switcherOpen && (
            <div className="crm-switcher-popover">
              <header className="crm-switcher-head">
                <span>Workspaces</span>
              </header>
              <div className="crm-switcher-list">
                {companies.length === 0 && (
                  <div className="crm-switcher-empty">No workspaces</div>
                )}
                {companies.map(company => {
                  const selected = activeCompany && String(activeCompany._id) === String(company._id);
                  return (
                    <button
                      key={company._id}
                      type="button"
                      className={`crm-workspace-item ${selected ? 'active' : ''}`}
                      onClick={async () => {
                        await onSwitchCompany(company._id);
                        setSwitcherOpen(false);
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
                })}
              </div>
              {isManager && (
                <Link to="/companies" className="crm-new-workspace-btn" onClick={() => setSwitcherOpen(false)}>
                  <Icon name="plus" size={16} />
                  <span>New Workspace</span>
                </Link>
              )}
            </div>
          )}
        </details>

        <button className="sidebar-toggle-btn desktop-only-toggle" onClick={onToggle} aria-label="Toggle Sidebar" title="Collapse sidebar">
          <Icon name="panel-left-close" size={isOpen ? 16 : 18} />
        </button>
      </div>

      <nav className="sidebar-nav" ref={navContainerRef} onDragOver={onNavDragOver}>
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
              <span>{item.labelKey && crmTerms[item.labelKey] ? crmTerms[item.labelKey] : item.label}</span>
            </Link>
          );
        })}

        {visibleWorkTypes.map(wt => {
          const moduleIcons: Record<string, string> = {
            '✅': 'square-check-big', '🎬': 'clapperboard', '🎨': 'palette',
            '🌐': 'globe', '✍️': 'pen-line', '📋': 'clipboard-list',
            check_square: 'square-check-big', video: 'clapperboard',
            'file-text': 'pen-line', clipboard: 'clipboard-list',
            graphic_post: 'image', design: 'palette', task: 'square-check-big',
          };
          const iconName = moduleIcons[wt.icon || ''] || moduleIcons[wt.key] || wt.icon || 'clipboard-list';
          return (
            <Link
              key={wt._id}
              to={`/work/${wt.key}`}
              data-nav-id={`nav-work-${wt.key}`}
              draggable
              className={`nav-item nav-item-sub ${isWorkActive && resolvedPath.includes(wt.key) ? 'active' : ''}`}
              style={{ '--module-color': wt.color } as React.CSSProperties}
              onDragStart={onNavDragStart(`nav-work-${wt.key}`)}
              onDragEnd={onNavDragEnd}
            >
              <Icon name={iconName} size={18} className="nav-item-module-icon" />
              <span>{wt.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
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
          workTypes={visibleWorkTypes}
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
  workTypes: WorkType[];
  crmTerms: CrmTerms;
}

function SidebarPrefsDrawer({ hidden, onToggle, onSave, onCancel, saving, navItems, workTypes, crmTerms }: PrefsDrawerProps) {
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
          {workTypes.map(wt => {
            const key = `nav-work-${wt.key}`;
            return (
              <label key={key} className="sidebar-preference-row">
                <span className="sidebar-preference-icon">
                  <Icon name="clipboard-list" size={16} />
                </span>
                <span>
                  <strong>{wt.name}</strong>
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
