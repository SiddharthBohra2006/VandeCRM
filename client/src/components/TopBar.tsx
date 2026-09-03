import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { User, Company } from '../api/auth';
import { notificationsApi, NotificationItem } from '../api/notifications';

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
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await notificationsApi.getFeed();
      setUnreadCount(res.count);
      setNotifications(res.data || []);
    } catch {
      // Ignore background notification fetch errors
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  async function handleDismiss(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await notificationsApi.markAsRead(id);
      setNotifications(prev => prev.filter(n => n._id !== id));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      // Handle error
    }
  }

  async function handleMarkAllRead() {
    try {
      await notificationsApi.markAllAsRead();
      setNotifications([]);
      setUnreadCount(0);
    } catch {
      // Handle error
    }
  }

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

      <div className="topbar-actions topbar-right">
        {/* Notifications Bell */}
        <div className="notifications-bell-container">
          <button
            type="button"
            className={`bell-btn ${unreadCount > 0 ? 'has-unread' : ''}`}
            aria-label="Notifications"
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowCompanyDropdown(false);
              setShowUserMenu(false);
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && <span className="bell-badge">{unreadCount}</span>}
          </button>

          {showNotifications && (
            <div className="notification-dropdown" style={{ display: 'block' }}>
              <div className="notification-header">
                <span>Notifications</span>
                {unreadCount > 0 && (
                  <button type="button" className="mark-all-read-btn" onClick={handleMarkAllRead}>
                    Mark all read
                  </button>
                )}
              </div>
              <div className="notification-list">
                {notifications.length === 0 ? (
                  <div className="notification-empty">No unread notifications</div>
                ) : (
                  notifications.map(n => (
                    <div key={n._id} className="notification-item">
                      <div className="notification-item-content">
                        <strong>{n.title}</strong>
                        <p>{n.message}</p>
                        <small>{new Date(n.createdAt).toLocaleDateString()}</small>
                      </div>
                      <div className="notification-item-actions">
                        {n.link && (
                          <a
                            href={n.link}
                            className="notification-action-link"
                            onClick={() => setShowNotifications(false)}
                          >
                            Open
                          </a>
                        )}
                        <button
                          type="button"
                          className="notification-dismiss-btn"
                          title="Dismiss"
                          onClick={(e) => handleDismiss(n._id, e)}
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Company Switcher */}
        {companies.length > 1 && (
          <div className="dropdown">
            <button
              type="button"
              className="dropdown-trigger"
              onClick={() => {
                setShowCompanyDropdown(!showCompanyDropdown);
                setShowNotifications(false);
                setShowUserMenu(false);
              }}
            >
              {activeCompany?.name || 'Select workspace'}
            </button>
            {showCompanyDropdown && (
              <div className="dropdown-menu">
                {companies.map(company => (
                  <button
                    type="button"
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
          <button
            type="button"
            className="dropdown-trigger user-menu-trigger"
            onClick={() => {
              setShowUserMenu(!showUserMenu);
              setShowNotifications(false);
              setShowCompanyDropdown(false);
            }}
          >
            <span className="user-avatar">{user.name.charAt(0).toUpperCase()}</span>
            <span className="user-name">{user.name}</span>
          </button>
          {showUserMenu && (
            <div className="dropdown-menu">
              <div className="dropdown-item disabled">{user.email}</div>
              <div className="dropdown-item disabled">Role: {user.role}</div>
              <button type="button" className="dropdown-item" onClick={logout}>Sign out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
