import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon, Palette, Check, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { User, Company } from '../api/auth';
import { notificationsApi, NotificationItem } from '../api/notifications';
import SearchModal from './SearchModal';

interface TopBarProps {
  user: User;
  activeCompany: Company | null;
  companies: Company[];
  onSwitchCompany: (companyId: string) => Promise<void>;
  onToggleMobile?: () => void;
}

import { THEME_PRESETS, applyThemePreset, changeThemeWithAnimation } from '../theme';

function LiveClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="live-clock topbar-live-clock">
      {time.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
    </span>
  );
}

export default function TopBar({ user, activeCompany, companies, onSwitchCompany, onToggleMobile }: TopBarProps) {
  const { logout } = useAuth();
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activeTheme, setActiveTheme] = useState(() => {
    return localStorage.getItem('theme-name') || 'Midnight Slate';
  });

  useEffect(() => {
    const handleThemeEvent = (e: Event) => {
      const customEvt = e as CustomEvent;
      if (customEvt.detail?.name) {
        setActiveTheme(customEvt.detail.name);
      } else {
        setActiveTheme(localStorage.getItem('theme-name') || 'Midnight Slate');
      }
    };
    window.addEventListener('crm-theme-changed', handleThemeEvent);
    window.addEventListener('storage', handleThemeEvent);
    return () => {
      window.removeEventListener('crm-theme-changed', handleThemeEvent);
      window.removeEventListener('storage', handleThemeEvent);
    };
  }, []);

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
    const saved = THEME_PRESETS.find(p => p.name === activeTheme) || THEME_PRESETS[0];
    applyThemePreset(saved);
  }, [activeTheme]);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  // Close all dropdowns when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('.theme-picker') && !target.closest('.notifications-bell-container') && !target.closest('.dropdown')) {
        setShowThemePicker(false);
        setShowNotifications(false);
        setShowCompanyDropdown(false);
        setShowUserMenu(false);
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Open global search on Cmd/Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowSearch(true);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

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

  return (
    <>
    <header className="topbar">
      {/* Mobile hamburger — toggles sidebar via CSS media queries (matches EJS) */}
      <button
        className="mobile-menu-btn"
        type="button"
        aria-label="Toggle Mobile Menu"
        onClick={onToggleMobile}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Live IST clock — matches EJS #liveClock */}
      <div className="topbar-title-section topbar-clock-section">
        <LiveClock />
      </div>

      {/* Search bar — opens the global search spotlight modal (Cmd/Ctrl+K) */}
      <div
        className="topbar-search-bar"
        role="button"
        tabIndex={0}
        aria-label="Search your workspace"
        title="Search workspace (Ctrl+K)"
        onClick={() => setShowSearch(true)}
        onKeyDown={(e) => { if (e.key === 'Enter') setShowSearch(true); }}
      >
        <svg className="topbar-search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span className="topbar-search-placeholder">Search clients, leads, follow-ups, team, meeting notes, history...</span>
      </div>

      <div className="topbar-actions">
        {/* Minimal Theme Capsule — Option 1 from design */}
        <div className="topbar-minimal-theme-pill" role="radiogroup" aria-label="Theme Color Switcher">
          <div className="theme-dots-row">
            {THEME_PRESETS.map(preset => {
              const isActive = activeTheme === preset.name;
              return (
                <button
                  key={preset.name}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  className={`theme-dot-btn ${isActive ? 'active' : ''}`}
                  title={`${preset.name} (${preset.description}) — Click to apply`}
                  onClick={(e) => {
                    e.stopPropagation();
                    changeThemeWithAnimation(preset, e);
                    setActiveTheme(preset.name);
                  }}
                >
                  <span
                    className="theme-dot-swatch"
                    style={{
                      background: preset.dotBg,
                      borderColor: preset.dotBorder,
                    }}
                  />
                </button>
              );
            })}
          </div>

          <span className="theme-pill-divider" />

          {/* Quick Light / Dark Mode Toggle Button */}
          <button
            type="button"
            className="theme-quick-mode-btn"
            title={`Toggle Light / Dark mode (currently ${THEME_PRESETS.find(p => p.name === activeTheme)?.type || 'dark'})`}
            onClick={(e) => {
              e.stopPropagation();
              const currentType = THEME_PRESETS.find(p => p.name === activeTheme)?.type || 'dark';
              const nextPreset = currentType === 'dark'
                ? THEME_PRESETS.find(p => p.type === 'light') || THEME_PRESETS[2]
                : THEME_PRESETS.find(p => p.type === 'dark') || THEME_PRESETS[0];
              changeThemeWithAnimation(nextPreset, e);
              setActiveTheme(nextPreset.name);
            }}
          >
            {THEME_PRESETS.find(p => p.name === activeTheme)?.type === 'dark' ? (
              <Moon size={14} className="theme-quick-icon dark" />
            ) : (
              <Sun size={14} className="theme-quick-icon light" />
            )}
          </button>
        </div>

        {/* Notifications Bell & Luxury Dropdown */}
        <div className="notifications-bell-container">
          <button
            type="button"
            className={`bell-btn luxury-bell-btn ${unreadCount > 0 ? 'has-unread' : ''}`}
            aria-label="Notifications"
            onClick={(e) => {
              e.stopPropagation();
              setShowNotifications(!showNotifications);
              setShowCompanyDropdown(false);
              setShowUserMenu(false);
              setShowThemePicker(false);
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && <span className="bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </button>

          {showNotifications && (
            <div className="notification-dropdown luxury-notification-dropdown" style={{ display: 'block' }}>
              <div className="notification-header">
                <div className="notif-header-title">
                  <span>Notifications</span>
                  {unreadCount > 0 && <span className="notif-count-pill">{unreadCount} new</span>}
                </div>
                {unreadCount > 0 && (
                  <button type="button" className="mark-all-read-btn" onClick={handleMarkAllRead}>
                    Mark all read
                  </button>
                )}
              </div>
              <div className="notification-list">
                {notifications.length === 0 ? (
                  <div className="notification-empty">
                    <div className="empty-notif-icon">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    </div>
                    <strong>All caught up!</strong>
                    <p>No new unread notifications</p>
                  </div>
                ) : (
                  notifications.map(n => (
                    <div key={n._id} className="notification-item luxury-notif-item">
                      <div className="notif-avatar-col">
                        <div className="notif-icon-circle">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                          </svg>
                        </div>
                      </div>
                      <div className="notification-item-content">
                        <div className="notif-item-top">
                          <strong>{n.title}</strong>
                          <small>{(() => {
                            const d = new Date(n.createdAt);
                            const min = Math.floor((Date.now() - d.getTime()) / 60000);
                            if (min < 1) return 'Just now';
                            if (min < 60) return `${min}m ago`;
                            if (min < 1440) return `${Math.floor(min / 60)}h ago`;
                            return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                          })()}</small>
                        </div>
                        <p>{n.message}</p>
                        {n.link && (
                          <a
                            href={n.link}
                            className="notification-action-link"
                            onClick={() => setShowNotifications(false)}
                          >
                            <span>Open details</span>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                          </a>
                        )}
                      </div>
                      <button
                        type="button"
                        className="notification-dismiss-btn"
                        title="Dismiss"
                        onClick={(e) => handleDismiss(n._id, e)}
                      >
                        &times;
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User card — matches EJS .topbar-user layout (always visible, not a dropdown) */}
        <div className="topbar-user" title={user.email}>
          <span>{user.name ? user.name.charAt(0).toUpperCase() : 'U'}</span>
          <div>
            <strong>{user.name || 'User'}</strong>
            <small>{user.email}</small>
          </div>
        </div>
      </div>
    </header>
    <SearchModal open={showSearch} onClose={() => setShowSearch(false)} />
    </>
  );
}