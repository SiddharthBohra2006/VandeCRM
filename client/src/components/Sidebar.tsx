import { Link } from 'react-router-dom';
import { User, Company, WorkType, CrmTerms } from '../api/auth';

interface SidebarProps {
  user: User;
  activeCompany: Company | null;
  workTypes: WorkType[];
  crmTerms: CrmTerms;
  isOpen: boolean;
  onToggle: () => void;
  currentPath: string;
}

const navItems = [
  { path: '/', label: 'Dashboard', icon: 'layout-dashboard' },
  { path: '/customers', labelKey: 'leadPlural', icon: 'users' },
  { path: '/clients', labelKey: 'recordPlural', icon: 'briefcase' },
  { path: '/campaigns', label: 'Campaigns', icon: 'megaphone' },
  { path: '/work', label: 'Work Center', icon: 'clipboard-list' },
  { path: '/tasks', label: 'Follow-ups', icon: 'check-square' },
  { path: '/companies', label: 'Workspaces', icon: 'building-2' },
  { path: '/team', label: 'Team', icon: 'users-round' },
  { path: '/mail', label: 'Mail', icon: 'mail' },
  { path: '/integrations', label: 'Integrations', icon: 'plug' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
  { path: '/audit', label: 'Audit Log', icon: 'scroll-text' },
];

export default function Sidebar({ user, activeCompany, workTypes, crmTerms, isOpen, onToggle, currentPath }: SidebarProps) {
  function getLabel(item: typeof navItems[0]): string {
    if ('labelKey' in item && item.labelKey) {
      return crmTerms[item.labelKey as keyof CrmTerms] || item.label || '';
    }
    return item.label || '';
  }

  const isWorkActive = currentPath.startsWith('/work');

  return (
    <aside className={`sidebar ${isOpen ? 'open' : 'collapsed'}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">Vande Agency CRM</div>
        <button className="sidebar-toggle" onClick={onToggle}>
          {isOpen ? '◀' : '▶'}
        </button>
      </div>

      {activeCompany && (
        <div className="sidebar-company">
          <span className="company-name">{activeCompany.name}</span>
        </div>
      )}

      <nav className="sidebar-nav">
        {navItems.map(item => {
          // Skip specialist-only items
          if (item.path === '/team' && !['admin', 'manager'].includes(user.role)) return null;
          if (item.path === '/audit' && !['admin', 'manager'].includes(user.role)) return null;

          const isActive = item.path === '/'
            ? currentPath === '/'
            : currentPath.startsWith(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="nav-icon" data-lucide={item.icon} />
              {isOpen && <span className="nav-label">{getLabel(item)}</span>}
            </Link>
          );
        })}

        {/* Work type sub-items */}
        {isOpen && workTypes.map(wt => (
          <Link
            key={wt._id}
            to={`/work/${wt.key}`}
            className={`nav-item nav-item-sub ${isWorkActive && currentPath.includes(wt.key) ? 'active' : ''}`}
          >
            <span className="nav-icon" data-lucide={wt.icon} />
            <span className="nav-label">{wt.name}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
