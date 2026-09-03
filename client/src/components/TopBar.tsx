import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { User, Company } from '../api/auth';

interface TopBarProps {
  user: User;
  activeCompany: Company | null;
  companies: Company[];
  onSwitchCompany: (companyId: string) => Promise<void>;
}

export default function TopBar({ user, activeCompany, companies, onSwitchCompany }: TopBarProps) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <form className="topbar-search" onSubmit={handleSearch}>
          <input
            type="text"
            placeholder="Search leads, clients, work..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </form>
      </div>

      <div className="topbar-right">
        {/* Company Switcher */}
        {companies.length > 1 && (
          <div className="dropdown">
            <button className="dropdown-trigger" onClick={() => setShowCompanyDropdown(!showCompanyDropdown)}>
              {activeCompany?.name || 'Select workspace'}
            </button>
            {showCompanyDropdown && (
              <div className="dropdown-menu">
                {companies.map(company => (
                  <button
                    key={company._id}
                    className={`dropdown-item ${company._id === activeCompany?._id ? 'active' : ''}`}
                    onClick={async () => {
                      await onSwitchCompany(company._id);
                      setShowCompanyDropdown(false);
                    }}
                  >
                    {company.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* User Menu */}
        <div className="dropdown">
          <button className="dropdown-trigger user-menu-trigger" onClick={() => setShowUserMenu(!showUserMenu)}>
            <span className="user-avatar">{user.name.charAt(0).toUpperCase()}</span>
            <span className="user-name">{user.name}</span>
          </button>
          {showUserMenu && (
            <div className="dropdown-menu">
              <div className="dropdown-item disabled">{user.email}</div>
              <div className="dropdown-item disabled">Role: {user.role}</div>
              <button className="dropdown-item" onClick={logout}>Sign out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
