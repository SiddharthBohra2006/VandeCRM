import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { User, Company } from '../api/auth';
import { notificationsApi, NotificationItem } from '../api/notifications';
import SearchModal from './SearchModal';

interface TopBarProps {
  user: User;
  activeCompany: Company | null;
  companies: Company[];
  onSwitchCompany: (companyId: string) => Promise<void>;
}

const THEME_PRESETS = [
  { name: 'Classic Dark', description: 'Midnight slate', type: 'dark', gold: '#ffcc00', teal: '#00bcd4', bg: '#090d16', surface: '#121b2d', text: '#f8fafc' },
  { name: 'OLED Black', description: 'Pure black', type: 'dark', gold: '#ffcc00', teal: '#a855f7', bg: '#000000', surface: '#0e0e11', text: '#eeeeee' },
  { name: 'Cozy Cream', description: 'Warm light', type: 'light', gold: '#d97706', teal: '#0f766e', bg: '#fcfaf7', surface: '#ffffff', text: '#1c1917' },
  { name: 'Crystal Light', description: 'Cool light', type: 'light', gold: '#b58d00', teal: '#2563eb', bg: '#f1f5f9', surface: '#ffffff', text: '#0f172a' },
];

function applyThemePreset(preset: typeof THEME_PRESETS[number]) {
  const root = document.documentElement;
  root.setAttribute('data-theme', preset.type);
  root.classList.toggle('dark-theme', preset.type === 'dark');
  const s = root.style;
  s.setProperty('--gold', preset.gold);
  s.setProperty('--teal', preset.teal);
  s.setProperty('--bg', preset.bg);
  s.setProperty('--panel', preset.surface);
  s.setProperty('--panel-2', preset.surface);
  s.setProperty('--text', preset.text);
  s.setProperty('--bg-soft', `color-mix(in srgb, ${preset.bg} 92%, ${preset.text})`);
  s.setProperty('--panel-muted', `color-mix(in srgb, ${preset.surface} 95%, ${preset.text})`);
  s.setProperty('--input', `color-mix(in srgb, ${preset.surface} 96%, ${preset.text})`);
  s.setProperty('--border', `color-mix(in srgb, ${preset.surface} 88%, ${preset.text})`);
  s.setProperty('--muted', `color-mix(in srgb, ${preset.surface} 45%, ${preset.text})`);
  s.setProperty('--sub', `color-mix(in srgb, ${preset.surface} 30%, ${preset.text})`);
  s.setProperty('--hover', `color-mix(in srgb, ${preset.surface} 94%, ${preset.text})`);
  localStorage.setItem('theme-name', preset.name);
  localStorage.setItem('theme-preset', JSON.stringify(preset));
}

function LiveClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  // IST = UTC + 5:30
  const ist = new Date(time.getTime() + (5.5 * 60 * 60 * 1000) - (time.getTimezoneOffset() * 60 * 1000));
  return (
    <span className="live-clock topbar-live-clock">
      {ist.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
    </span>
  );
}

export default function TopBar({ user, activeCompany, companies, onSwitchCompany }: TopBarProps) {
  const { logout } = useAuth();
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activeTheme, setActiveTheme] = useState(() => {
    return localStorage.getItem('theme-name') || 'Classic Dark';
  });

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
        onClick={() => document.querySelector('.sidebar')?.classList.toggle('mobile-open')}
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
        <span className="topbar-search-placeholder">Search clients, leads, tasks, team, meeting notes, history...</span>
      </div>

      <div className="topbar-actions">
        {/* Theme picker — matches EJS theme picker with 4 presets */}
        <div className="theme-picker">
          <button
            type="button"
            className="theme-toggle-btn"
            aria-label="Toggle Theme"
            onClick={(e) => {
              e.stopPropagation();
              setShowThemePicker(!showThemePicker);
              setShowNotifications(false);
              setShowCompanyDropdown(false);
              setShowUserMenu(false);
            }}
          >
            <svg className="theme-palette-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h5a4 4 0 0 0 4-4c0-3.3-4-6-9-6Z" />
              <circle cx="7.5" cy="10.5" r=".75" fill="currentColor" stroke="none" />
              <circle cx="10" cy="7" r=".75" fill="currentColor" stroke="none" />
              <circle cx="14" cy="7" r=".75" fill="currentColor" stroke="none" />
            </svg>
            <span className="theme-toggle-label">Theme</span>
          </button>
          {showThemePicker && (
            <div className="theme-picker-menu">
              {THEME_PRESETS.map(preset => (
                <button
                  key={preset.name}
                  type="button"
                  title={`${preset.name} — ${preset.description}`}
                  className={activeTheme === preset.name ? 'active' : ''}
                  onClick={(e) => {
                    e.stopPropagation();
                    applyThemePreset(preset);
                    setActiveTheme(preset.name);
                    setShowThemePicker(false);
                  }}
                >
                  <span style={{ '--theme-bg': preset.bg, '--theme-accent': preset.teal, width: 22, height: 22, display: 'block', border: '1px solid var(--border)', borderRadius: 6, background: `linear-gradient(135deg, ${preset.bg} 55%, ${preset.teal} 56%)` } as React.CSSProperties} />
                  <span>{preset.name}</span>
                </button>
              ))}
              {['admin', 'manager'].includes(user.role) && (
                <a href="/settings" onClick={(e) => { e.stopPropagation(); setShowThemePicker(false); }}>Custom colors</a>
              )}
            </div>
          )}
        </div>

        {/* Notifications Bell */}
        <div className="notifications-bell-container">
          <button
            type="button"
            className={`bell-btn ${unreadCount > 0 ? 'has-unread' : ''}`}
            aria-label="Notifications"
            onClick={(e) => {
              e.stopPropagation();
              setShowNotifications(!showNotifications);
              setShowCompanyDropdown(false);
              setShowUserMenu(false);
              setShowThemePicker(false);
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                        <small>{new Date(n.createdAt).toLocaleString('en-IN')}</small>
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