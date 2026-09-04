import { useState } from 'react';
import { Link } from 'react-router-dom';
import { User, Company, WorkType, CrmTerms } from '../api/auth';
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
  labelKey?: keyof CrmTerms;
  adminOnly?: boolean;
  managerOnly?: boolean;
  mainOnly?: boolean;
  reportOnly?: boolean;
};

const navItems: NavItem[] = [
  { path: '/portfolio', label: 'All CRMs', icon: 'layout-grid', adminOnly: true, mainOnly: true },
  { path: '/', label: 'Dashboard', icon: 'layout-dashboard' },
  { path: '/customers', labelKey: 'leadPlural', label: 'Leads', icon: 'users' },
  { path: '/clients', labelKey: 'recordPlural', label: 'Clients', icon: 'building-2' },
  { path: '/analytics', label: 'Analytics', icon: 'bar-chart-3', reportOnly: true },
  { path: '/reports', label: 'Reports', icon: 'file-text', reportOnly: true },
  { path: '/work', label: 'Work Center', icon: 'list-todo' },
  { path: '/tasks', label: 'Follow-ups', icon: 'list-checks' },
  { path: '/campaigns', label: 'Ads', icon: 'megaphone' },
  { path: '/companies', label: 'CRMs', icon: 'folder-kanban' },
  { path: '/team', label: 'Team', icon: 'user-check', adminOnly: true },
  { path: '/mail', label: 'Mail', icon: 'mail' },
  { path: '/settings', label: 'Settings', icon: 'settings', adminOnly: true },
  { path: '/audit', label: 'Activity', icon: 'activity', adminOnly: true },
];

function initials(name: string) {
  return name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

export default function Sidebar({ user, activeCompany, companies, workTypes, crmTerms, isOpen, onToggle, onSwitchCompany, currentPath }: SidebarProps) {
  const { logout } = useAuth();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  function getLabel(item: NavItem): string {
    if (item.labelKey && crmTerms[item.labelKey as keyof CrmTerms]) {
      return crmTerms[item.labelKey as keyof CrmTerms];
    }
    return item.label;
  }

  const isWorkActive = currentPath.startsWith('/work');
  const isManager = ['admin', 'manager'].includes(user.role);

  const visibleItems = navItems.filter(item => {
    if (item.adminOnly && !isManager) return false;
    if (item.mainOnly && !(user.role === 'admin' && activeCompany?.isMain)) return false;
    if (item.reportOnly && !isManager) return false;
    return true;
  });

  return (
    <aside className={`sidebar ${isOpen ? '' : 'collapsed'}`} id="appSidebar">
      {/* sidebar-logo: must use this class for app.css to apply height/padding/collapse rules */}
      <div className="sidebar-logo">
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

      <nav className="sidebar-nav">
        {visibleItems.map(item => {
          const isActive = item.path === '/'
            ? currentPath === '/'
            : currentPath.startsWith(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon name={item.icon} size={18} />
              <span>{getLabel(item)}</span>
            </Link>
          );
        })}

        {workTypes.map(wt => {
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
              className={`nav-item nav-item-sub ${isWorkActive && currentPath.includes(wt.key) ? 'active' : ''}`}
              style={{ '--module-color': wt.color } as React.CSSProperties}
            >
              <Icon name={iconName} size={18} className="nav-item-module-icon" />
              <span>{wt.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* sidebar-footer: user card + tool buttons — matches EJS exactly */}
      <div className="sidebar-footer">
        <div className="sidebar-footer-tools">
          <button className="sidebar-tool-btn" type="button" title="Customize sidebar">
            <Icon name="sliders-horizontal" size={16} />
            <span>Customize</span>
          </button>
          <button className="sidebar-tool-btn" type="button" title="Reset sidebar order">
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
    </aside>
  );
}