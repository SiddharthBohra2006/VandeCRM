import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchApi, SearchResponse, SearchResultItem, SearchStats } from '../api/search';

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

interface RecentSearch {
  query: string;
  type?: string;
  timestamp: string;
}

const CATEGORY_TABS = [
  { type: 'all', label: 'Everything' },
  { type: 'leads', label: 'Leads' },
  { type: 'clients', label: 'Clients' },
  { type: 'work', label: 'Work & Tasks' },
  { type: 'activities', label: 'Meetings & Activity' },
  { type: 'history', label: 'Work History' },
  { type: 'team', label: 'Team' },
];

const RECENT_KEY = 'crm_recent_searches_v2';
const EMPTY_STATS: SearchStats = { myFollowUps: 0, openTasks: 0, todayMeetings: 0, unreadMessages: 0 };

function timeAgo(dateStr?: string | number): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function getBadgeClass(kind?: string | null): string {
  const k = String(kind || '').toLowerCase();
  if (k.includes('lead')) return 'crm-badge-lead';
  if (k.includes('client')) return 'crm-badge-client';
  if (k.includes('work')) return 'crm-badge-work';
  if (k.includes('meet') || k.includes('activity')) return 'crm-badge-meeting';
  if (k.includes('task')) return 'crm-badge-task';
  if (k.includes('team')) return 'crm-badge-team';
  return 'crm-badge-lead';
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query || !query.trim() || !text) return <>{text || ''}</>;
  const q = query.trim().replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`(${q})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i}>{part}</mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function readRecent(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch {
    // ignore json parse error
  }
  return [
    { query: 'Goutam (Insta DM)', timestamp: new Date(Date.now() - 2 * 60000).toISOString() },
    { query: 'Website Redesign Project', timestamp: new Date(Date.now() - 60 * 60000).toISOString() },
    { query: 'Follow-up tasks due today', timestamp: new Date(Date.now() - 3 * 3600000).toISOString() },
    { query: 'Rahul Kumar', timestamp: new Date(Date.now() - 24 * 3600000).toISOString() },
    { query: 'Video editing course leads', timestamp: new Date(Date.now() - 48 * 3600000).toISOString() },
  ];
}

export default function SearchModal({ open, onClose }: SearchModalProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [dateField, setDateField] = useState('updated');
  const [preset, setPreset] = useState('custom');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [initialData, setInitialData] = useState<SearchResponse | null>(null);
  const [searchData, setSearchData] = useState<SearchResponse | null>(null);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDefaultView = !query.trim() && type === 'all' && !from && !to && (!preset || preset === 'custom');

  useEffect(() => {
    if (open) {
      setRecent(readRecent());
      setQuery('');
      setType('all');
      setDateField('updated');
      setPreset('custom');
      setFrom('');
      setTo('');
      setSearchData(null);
      setSelectedIndex(-1);
      // Fetch initial overview
      searchApi
        .query({ type: 'all', page: 1 })
        .then(res => setInitialData(res))
        .catch(() => {});
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [open]);

  const saveRecent = useCallback((q: string, t?: string) => {
    if (!q || q.trim().length < 2) return;
    const cleanQ = q.trim();
    const cur = readRecent().filter(item => item.query.toLowerCase() !== cleanQ.toLowerCase());
    const next = [{ query: cleanQ, type: t || 'all', timestamp: new Date().toISOString() }, ...cur].slice(0, 8);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // ignore storage error
    }
    setRecent(next);
  }, []);

  const clearRecent = useCallback(() => {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify([]));
    } catch {
      // ignore
    }
    setRecent([]);
  }, []);

  // Handle preset date calculations
  const handlePresetChange = (newPreset: string) => {
    setPreset(newPreset);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (newPreset === 'today') {
      setFrom(fmt(now));
      setTo(fmt(now));
    } else if (newPreset === 'yesterday') {
      const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      setFrom(fmt(yest));
      setTo(fmt(yest));
    } else if (newPreset === 'week') {
      const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      setFrom(fmt(weekAgo));
      setTo(fmt(now));
    } else if (newPreset === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      setFrom(fmt(monthStart));
      setTo(fmt(now));
    } else if (!newPreset) {
      setFrom('');
      setTo('');
    }
  };

  useEffect(() => {
    if (!open) return;
    if (isDefaultView) {
      setSearchData(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        setLoading(true);
        setSelectedIndex(-1);
        const res = await searchApi.query({
          q: query.trim() || undefined,
          type,
          dateField,
          preset: preset !== 'custom' ? preset : undefined,
          from: from || undefined,
          to: to || undefined,
          page: 1,
        });
        setSearchData(res);
      } catch {
        setSearchData(null);
      } finally {
        setLoading(false);
      }
    }, query.trim() ? 150 : 0);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, query, type, dateField, preset, from, to, isDefaultView]);

  const activeGroups = useMemo(() => {
    const d = isDefaultView ? initialData : searchData;
    return (d?.groups || []).filter(g => g.items && g.items.length > 0);
  }, [isDefaultView, initialData, searchData]);

  // Top results selection for default view (up to 6 items across groups)
  const defaultTopItems = useMemo(() => {
    const groups = initialData?.groups || [];
    const topItems: SearchResultItem[] = [];
    for (let i = 0; i < 3; i++) {
      for (const g of groups) {
        if (g.items && g.items[i] && topItems.length < 6) {
          topItems.push(g.items[i]);
        }
      }
    }
    return topItems;
  }, [initialData]);

  // Flatten items for keyboard navigation
  const allNavItems = useMemo(() => {
    if (isDefaultView) return defaultTopItems;
    return activeGroups.flatMap(g => g.items);
  }, [isDefaultView, defaultTopItems, activeGroups]);

  const allNavItemsRef = useRef(allNavItems);
  allNavItemsRef.current = allNavItems;

  const goTo = useCallback(
    (href: string, title?: string) => {
      if (query.trim()) saveRecent(query.trim(), type);
      else if (title) saveRecent(title, type);
      navigate(href);
      onClose();
    },
    [navigate, onClose, query, type, saveRecent]
  );

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Enter') {
        const flat = allNavItemsRef.current;
        if (selectedIndex >= 0 && flat[selectedIndex]) {
          goTo(flat[selectedIndex].href, flat[selectedIndex].title);
        } else if (flat.length > 0) {
          goTo(flat[0].href, flat[0].title);
        } else if (query.trim()) {
          saveRecent(query.trim(), type);
          navigate(`/search?q=${encodeURIComponent(query.trim())}${type !== 'all' ? `&type=${type}` : ''}`);
          onClose();
        }
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => {
          const len = allNavItemsRef.current?.length || 0;
          return len > 0 ? (i + 1) % len : -1;
        });
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => {
          const len = allNavItemsRef.current?.length || 0;
          return len > 0 ? (i - 1 + len) % len : -1;
        });
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, selectedIndex, query, type, onClose, navigate, goTo, saveRecent]);

  if (!open) return null;

  const stats = initialData?.stats || EMPTY_STATS;

  return (
    <div className="crm-search-modal-backdrop" onClick={onClose}>
      <div
        className="crm-search-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Global Workspace Search"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Search Input Bar */}
        <div className="crm-search-top-bar">
          <div className="crm-search-input-wrap">
            <svg
              className="crm-search-icon"
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              type="search"
              id="airbnbModalQueryInput"
              className="crm-search-main-input"
              placeholder="Search clients, leads, tasks, team, meeting notes, history..."
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                id="airbnbModalClearBtn"
                className="crm-search-clear-btn"
                title="Clear input"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
              >
                &times;
              </button>
            )}
            <button
              type="button"
              id="airbnbModalCloseBtn"
              className="crm-modal-close-icon-btn"
              title="Close search"
              aria-label="Close search"
              onClick={onClose}
            >
              &times;
            </button>
          </div>
        </div>

        {/* Category Tabs Navigation */}
        <nav className="crm-search-tabs-nav" id="airbnbModalTypePills" aria-label="Search categories">
          {CATEGORY_TABS.map(tab => (
            <button
              key={tab.type}
              type="button"
              className={`crm-search-tab ${type === tab.type ? 'active' : ''}`}
              data-type={tab.type}
              onClick={() => setType(tab.type)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Filter Control Bar (Date Range, From, To, Field, More Filters) */}
        <div className="crm-search-filter-bar">
          <div className="crm-filter-item">
            <label>Date range</label>
            <select
              id="searchDateRangePreset"
              className="crm-filter-select"
              value={preset}
              onChange={e => handlePresetChange(e.target.value)}
            >
              <option value="">Anytime</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="week">Last 7 days</option>
              <option value="month">This month</option>
              <option value="custom">Custom range</option>
            </select>
          </div>

          <div className="crm-filter-item">
            <label>From</label>
            <div className="crm-date-box">
              <input
                type="date"
                id="airbnbDateFromInput"
                className="crm-date-input"
                value={from}
                onChange={e => {
                  setPreset('custom');
                  setFrom(e.target.value);
                }}
              />
            </div>
          </div>

          <div className="crm-filter-item">
            <label>To</label>
            <div className="crm-date-box">
              <input
                type="date"
                id="airbnbDateToInput"
                className="crm-date-input"
                value={to}
                onChange={e => {
                  setPreset('custom');
                  setTo(e.target.value);
                }}
              />
            </div>
          </div>

          <div className="crm-filter-item">
            <label>Field</label>
            <select
              id="airbnbDateFieldSelect"
              className="crm-filter-select"
              value={dateField}
              onChange={e => setDateField(e.target.value)}
            >
              <option value="updated">Last updated</option>
              <option value="created">Created / Logged</option>
              <option value="scheduled">Follow-up / Deadline</option>
            </select>
          </div>

          <div className="crm-filter-item crm-filter-more-wrap">
            <a
              href="/search"
              className="crm-more-filters-btn"
              title="Open full search filters"
              onClick={e => {
                e.preventDefault();
                navigate('/search');
                onClose();
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              <span>More filters</span>
            </a>
          </div>
        </div>

        {/* Modal Content: Dynamic 2-Column Dashboard or Live Results */}
        <div className="crm-search-modal-body" id="crmSearchModalBody">
          {isDefaultView ? (
            /* 2-Column Layout (Default State) */
            <div className="crm-search-grid" id="crmDefaultSearchGrid">
              {/* Left Column: Recent Searches + Quick Access */}
              <div className="crm-grid-col-left">
                {/* Recent Searches */}
                <div className="crm-section-box">
                  <div className="crm-section-header">
                    <div className="crm-sec-title-with-icon">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 14 14" />
                      </svg>
                      <span>Recent searches</span>
                    </div>
                    {recent.length > 0 && (
                      <button type="button" id="crmClearRecentSearchesBtn" className="crm-link-btn" onClick={clearRecent}>
                        Clear all
                      </button>
                    )}
                  </div>
                  <div className="crm-recent-list" id="crmRecentSearchesList">
                    {recent.length === 0 ? (
                      <div style={{ fontSize: '11.5px', color: 'var(--muted)', padding: '8px 0' }}>No recent searches</div>
                    ) : (
                      recent.slice(0, 5).map((item, idx) => (
                        <button
                          key={`${item.query}-${idx}`}
                          type="button"
                          className="crm-recent-item"
                          onClick={() => {
                            setQuery(item.query);
                            setType('all');
                          }}
                        >
                          <svg
                            className="crm-recent-icon"
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                          <span className="crm-recent-query">{item.query}</span>
                          <span className="crm-recent-time">{timeAgo(item.timestamp)}</span>
                          <span className="crm-recent-enter">↵</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Quick Access Cards */}
                <div className="crm-section-box crm-quick-access-sec">
                  <div className="crm-section-header">
                    <div className="crm-sec-title-with-icon">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                      <span>Quick access</span>
                    </div>
                  </div>
                  <div className="crm-kpi-grid">
                    <a
                      href="/tasks"
                      className="crm-kpi-card"
                      onClick={e => {
                        e.preventDefault();
                        goTo('/tasks');
                      }}
                    >
                      <div className="crm-kpi-title">My follow-ups</div>
                      <div className="crm-kpi-val" id="statFollowUps">
                        {stats.myFollowUps || 0}
                      </div>
                      <div className="crm-kpi-sub">Due today</div>
                    </a>
                    <a
                      href="/work"
                      className="crm-kpi-card"
                      onClick={e => {
                        e.preventDefault();
                        goTo('/work');
                      }}
                    >
                      <div className="crm-kpi-title">Open tasks</div>
                      <div className="crm-kpi-val" id="statOpenTasks">
                        {stats.openTasks || 0}
                      </div>
                      <div className="crm-kpi-sub">Across all projects</div>
                    </a>
                    <a
                      href="/search?type=activities&preset=today"
                      className="crm-kpi-card"
                      onClick={e => {
                        e.preventDefault();
                        goTo('/search?type=activities&preset=today');
                      }}
                    >
                      <div className="crm-kpi-title">Today's meetings</div>
                      <div className="crm-kpi-val" id="statTodayMeetings">
                        {stats.todayMeetings || 0}
                      </div>
                      <div className="crm-kpi-sub">Upcoming</div>
                    </a>
                    <a
                      href="/mail"
                      className="crm-kpi-card"
                      onClick={e => {
                        e.preventDefault();
                        goTo('/mail');
                      }}
                    >
                      <div className="crm-kpi-title">Unread messages</div>
                      <div className="crm-kpi-val" id="statUnreadMessages">
                        {stats.unreadMessages || 0}
                      </div>
                      <div className="crm-kpi-sub">Across channels</div>
                    </a>
                  </div>
                  <a
                    href="/"
                    className="crm-shortcuts-footer-link"
                    onClick={e => {
                      e.preventDefault();
                      goTo('/');
                    }}
                  >
                    <span>View all shortcuts</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </a>
                </div>
              </div>

              {/* Right Column: Top Results */}
              <div className="crm-grid-col-right">
                <div className="crm-section-box">
                  <div className="crm-section-header">
                    <span className="crm-sec-title-bold">Top results</span>
                    <a
                      href="/search"
                      id="crmViewAllLink"
                      className="crm-link-btn"
                      onClick={e => {
                        e.preventDefault();
                        navigate('/search');
                        onClose();
                      }}
                    >
                      View all
                    </a>
                  </div>
                  <div className="crm-top-results-list" id="crmTopResultsList">
                    {defaultTopItems.length === 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '14px 0', textAlign: 'center' }}>
                        No recent records found
                      </div>
                    ) : (
                      defaultTopItems.map((item, idx) => {
                        const badgeType = item.badge || item.kind || 'Lead';
                        const badgeCls = getBadgeClass(badgeType);
                        return (
                          <a
                            key={`${item.id}-${idx}`}
                            href={item.href}
                            className={`crm-result-card ${selectedIndex === idx ? 'selected' : ''}`}
                            onMouseEnter={() => setSelectedIndex(idx)}
                            onClick={e => {
                              e.preventDefault();
                              goTo(item.href, item.title);
                            }}
                          >
                            <div className="crm-card-left">
                              <div className="crm-card-title-row">
                                <strong className="crm-card-title">{item.title}</strong>
                                <span className={`crm-badge-pill ${badgeCls}`}>{badgeType}</span>
                              </div>
                              <div className="crm-card-subtitle">{item.subtitle}</div>
                              {item.date && <div className="crm-card-timestamp">Updated {timeAgo(item.date)}</div>}
                            </div>
                            <svg
                              className="crm-card-arrow"
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </a>
                        );
                      })
                    )}
                  </div>
                  <button
                    type="button"
                    id="crmShowMoreResultsBtn"
                    className="crm-show-more-btn"
                    onClick={() => {
                      navigate('/search');
                      onClose();
                    }}
                  >
                    <span>Show more results</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Live Search Results Container */
            <div className="crm-live-results-wrap" id="crmLiveResultsWrap">
              <div id="airbnbModalResults" className="crm-live-results-list" role="listbox" aria-live="polite">
                {loading && activeGroups.length === 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '40px',
                      color: 'var(--muted)',
                      gap: '10px',
                      fontSize: '13px',
                    }}
                  >
                    <span>Searching workspace...</span>
                  </div>
                ) : activeGroups.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--muted)' }}>
                    <div style={{ fontSize: '28px', marginBottom: '6px' }}>🔍</div>
                    <h4 style={{ fontSize: '14.5px', color: 'var(--text)', margin: '0 0 4px' }}>No matching results</h4>
                    <p style={{ fontSize: '12px', margin: 0 }}>Try adjusting your search terms, category, or date range.</p>
                  </div>
                ) : (
                  (() => {
                    let globalIdx = 0;
                    return activeGroups.map(group => (
                      <div key={group.id} className="crm-live-group">
                        <div className="crm-live-group-header">
                          <span>{group.label}</span>
                          <span
                            style={{
                              fontSize: '10px',
                              background: 'var(--panel-muted)',
                              padding: '1px 6px',
                              borderRadius: '10px',
                              border: '1px solid var(--border)',
                            }}
                          >
                            {group.items.length}
                          </span>
                        </div>
                        <div className="crm-top-results-list">
                          {group.items.map(item => {
                            const currentItemIdx = globalIdx++;
                            const badgeType = item.badge || item.kind || 'Lead';
                            const badgeCls = getBadgeClass(badgeType);
                            return (
                              <a
                                key={`${group.id}-${item.id}`}
                                href={item.href}
                                className={`crm-result-card ${selectedIndex === currentItemIdx ? 'selected' : ''}`}
                                onMouseEnter={() => setSelectedIndex(currentItemIdx)}
                                onClick={e => {
                                  e.preventDefault();
                                  goTo(item.href, item.title);
                                }}
                              >
                                <div className="crm-card-left">
                                  <div className="crm-card-title-row">
                                    <strong className="crm-card-title">
                                      <HighlightedText text={item.title} query={query} />
                                    </strong>
                                    <span className={`crm-badge-pill ${badgeCls}`}>{badgeType}</span>
                                  </div>
                                  <div className="crm-card-subtitle">
                                    <HighlightedText text={item.subtitle} query={query} />
                                  </div>
                                  {item.date && (
                                    <div className="crm-card-timestamp">Updated {timeAgo(item.date)}</div>
                                  )}
                                </div>
                                <svg
                                  className="crm-card-arrow"
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    ));
                  })()
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

