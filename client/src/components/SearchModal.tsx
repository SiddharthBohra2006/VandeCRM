import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchApi, SearchResponse, SearchGroup, SearchStats } from '../api/search';

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

interface RecentSearch {
  q: string;
  type: string;
  ts: number;
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

const RECENT_KEY = 'vandecrm.recentSearches';
const EMPTY_STATS: SearchStats = { myFollowUps: 0, openTasks: 0, todayMeetings: 0, unreadMessages: 0 };

const modalStyles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 9999,
    background: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '60px 16px 30px',
  },
  modal: {
    width: 'min(820px, 96vw)',
    maxHeight: '82vh',
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: '14px',
    boxShadow: '0 24px 70px rgba(0, 0, 0, 0.35)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  topBar: {
    padding: '14px 18px',
    borderBottom: '1px solid var(--border)',
  },
  inputWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    padding: '9px 12px',
    background: 'var(--bg-soft)',
  },
  input: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--text)',
    fontSize: '0.95rem',
  },
  tabs: {
    display: 'flex',
    gap: '2px',
    padding: '8px 12px 0',
    borderBottom: '1px solid var(--border)',
    overflowX: 'auto' as const,
    scrollbarWidth: 'none' as const,
  },
  tab: {
    flexShrink: 0,
    padding: '8px 12px',
    fontSize: '0.8rem',
    fontWeight: 700,
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    color: 'var(--muted)',
    borderBottom: '2px solid transparent',
    whiteSpace: 'nowrap' as const,
  },
  filters: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '12px',
    alignItems: 'end',
    padding: '12px 18px',
    borderBottom: '1px solid var(--border)',
  },
  body: {
    overflowY: 'auto' as const,
    padding: '18px',
    minHeight: '220px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)',
    gap: '20px',
  },
};

function readRecent(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as RecentSearch[]) : [];
  } catch {
    return [];
  }
}

function nowLabel(ts: number) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function recentHref(r: RecentSearch) {
  const sp = new URLSearchParams();
  if (r.q) sp.set('q', r.q);
  if (r.type && r.type !== 'all') sp.set('type', r.type);
  const query = sp.toString();
  return `/search${query ? `?${query}` : ''}`;
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
  const [data, setData] = useState<SearchResponse | null>(null);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setRecent(readRecent());
      setQuery('');
      setType('all');
      setDateField('updated');
      setPreset('custom');
      setFrom('');
      setTo('');
      setData(null);
      setSelectedIndex(-1);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Enter') {
        const flat = allItemsRef.current;
        if (selectedIndex >= 0 && flat[selectedIndex]) {
          goTo(flat[selectedIndex].item.href, flat[selectedIndex].item.title);
        } else if (query.trim()) {
          saveRecent(query.trim(), type);
          navigate(`/search?q=${encodeURIComponent(query.trim())}${type !== 'all' ? `&type=${type}` : ''}`);
          onClose();
        }
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, (allItemsRef.current?.length || 1) - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data, selectedIndex, query, type, onClose, navigate]);

  const allItems = useMemo(
    () => (data?.groups || []).flatMap(g => g.items.map(item => ({ item, group: g }))),
    [data]
  );
  const allItemsRef = useRef(allItems);
  allItemsRef.current = allItems;

  const saveRecent = useCallback((q: string, t: string) => {
    const next = [{ q, type: t, ts: Date.now() }, ...readRecent().filter(r => !(r.q === q && r.type === t))].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    setRecent(next);
  }, []);

  const clearRecent = useCallback(() => {
    localStorage.removeItem(RECENT_KEY);
    setRecent([]);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(runSearch, query.trim() ? 220 : 0);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, type, dateField, preset, from, to, open]);

  async function runSearch() {
    if (!open) { setData(null); setSelectedIndex(-1); return; }
    try {
      setLoading(true);
      setSelectedIndex(-1);
      const res = await searchApi.query({
        q: query.trim() || undefined,
        type,
        dateField,
        preset,
        from: from || undefined,
        to: to || undefined,
        page: 1,
      });
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  function goTo(href: string, label: string) {
    if (query.trim()) saveRecent(label, type);
    navigate(href);
    onClose();
  }

  if (!open) return null;

  const isSearching = query.trim().length > 0;
  const stats = data?.stats || EMPTY_STATS;

  const kpiCards = [
    { href: '/tasks', title: 'My follow-ups', val: stats.myFollowUps, sub: 'Due today' },
    { href: '/work', title: 'Open tasks', val: stats.openTasks, sub: 'Across all projects' },
    { href: '/search?type=activities&preset=today', title: "Today's meetings", val: stats.todayMeetings, sub: 'Upcoming' },
    { href: '/mail', title: 'Unread messages', val: stats.unreadMessages, sub: 'Across channels' },
  ];

  return (
    <div style={modalStyles.backdrop} onClick={onClose}>
      <div style={modalStyles.modal} role="dialog" aria-modal="true" aria-label="Global Workspace Search" onClick={e => e.stopPropagation()}>
        {/* Top search input */}
        <div style={modalStyles.topBar}>
          <div style={modalStyles.inputWrap}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input
              ref={inputRef}
              type="search"
              style={modalStyles.input}
              placeholder="Search clients, leads, tasks, team, meeting notes, history..."
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {query && (
              <button type="button" title="Clear input" aria-label="Clear search" style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }} onClick={() => { setQuery(''); setData(null); inputRef.current?.focus(); }}>&times;</button>
            )}
            <button type="button" title="Close search" aria-label="Close search" style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }} onClick={onClose}>&times;</button>
          </div>
        </div>

        {/* Category tabs */}
        <nav style={modalStyles.tabs}>
          {CATEGORY_TABS.map(tab => (
            <button key={tab.type} type="button" style={{ ...modalStyles.tab, color: type === tab.type ? 'var(--gold)' : 'var(--muted)', borderBottomColor: type === tab.type ? 'var(--gold)' : 'transparent' }} onClick={() => setType(tab.type)}>
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Filters */}
        <div style={modalStyles.filters}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            Date range
            <select value={preset} onChange={e => setPreset(e.target.value)} style={filterSelectStyle}>
              <option value="">Anytime</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="week">Last 7 days</option>
              <option value="month">This month</option>
              <option value="custom">Custom range</option>
            </select>
          </label>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            From
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={filterInputStyle} />
          </label>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            To
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={filterInputStyle} />
          </label>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            Field
            <select value={dateField} onChange={e => setDateField(e.target.value)} style={filterSelectStyle}>
              <option value="updated">Last updated</option>
              <option value="created">Created / Logged</option>
              <option value="scheduled">Follow-up / Deadline</option>
            </select>
          </label>
          <button type="button" className="btn small" style={{ marginLeft: 'auto' }} onClick={() => { navigate('/search'); onClose(); }}>
            More filters
          </button>
        </div>

        {/* Body */}
        <div style={modalStyles.body}>
          {isSearching ? (
            loading && allItems.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>Searching...</div>
            ) : allItems.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {allItems.map(({ item, group }, idx) => (
                  <a
                    key={`${group.id}-${item.id}`}
                    href={item.href}
                    onClick={e => { e.preventDefault(); goTo(item.href, item.title); }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '10px 14px',
                      border: `1px solid ${idx === selectedIndex ? 'var(--gold)' : 'var(--border)'}`,
                      borderRadius: 10,
                      background: idx === selectedIndex ? 'var(--hover)' : 'var(--bg)',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <strong style={{ fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text)' }}>{item.title}</strong>
                        {item.badge && <span className="stage-badge" style={{ fontSize: '0.62rem' }}>{item.badge}</span>}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.subtitle}</span>
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)', flexShrink: 0 }}>{item.date || group.label} ↗</span>
                  </a>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
                <h3 style={{ margin: '0 0 0.4rem', fontSize: '1rem' }}>No results found</h3>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>
                  No {type === 'all' ? '' : type + ' '}records matched{query ? ` "${query}"` : ''}. Try fewer keywords.
                </p>
              </div>
            )
          ) : (
            <div style={modalStyles.grid}>
              {/* Left: recent + quick access */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <section>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>Recent searches</span>
                    {recent.length > 0 && (
                      <button type="button" className="btn small" onClick={clearRecent}>Clear all</button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {recent.length === 0 ? (
                      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)', padding: '4px 0' }}>No recent searches yet.</p>
                    ) : (
                      recent.map((r, i) => (
                        <a
                          key={`${r.q}-${r.type}-${i}`}
                          href={recentHref(r)}
                          onClick={e => { e.preventDefault(); navigate(recentHref(r)); onClose(); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, fontSize: '0.8rem', color: 'var(--text)', textDecoration: 'none' }}
                        >
                          <span style={{ color: 'var(--muted)' }}>🕘</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{r.q}</span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--muted)', flexShrink: 0 }}>{nowLabel(r.ts)}</span>
                          <span style={{ color: 'var(--muted)', fontSize: '0.75rem', flexShrink: 0 }}>↵</span>
                        </a>
                      ))
                    )}
                  </div>
                </section>

                <section style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  <div style={{ marginBottom: 10 }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>Quick access</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 12 }}>
                    {kpiCards.map(card => (
                      <a
                        key={card.title}
                        href={card.href}
                        onClick={e => { e.preventDefault(); navigate(card.href); onClose(); }}
                        style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--bg)', textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}
                      >
                        <span style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 600 }}>{card.title}</span>
                        <span style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--gold)', lineHeight: 1.1 }}>{card.val}</span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{card.sub}</span>
                      </a>
                    ))}
                  </div>
                </section>
              </div>

              {/* Right: top results */}
              <section>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>Top results</span>
                  <button type="button" className="btn small" onClick={() => { navigate('/search'); onClose(); }}>View all</button>
                </div>
                {allItems.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {allItems.slice(0, 6).map(({ item, group }) => (
                      <a
                        key={`${group.id}-${item.id}`}
                        href={item.href}
                        onClick={e => { e.preventDefault(); goTo(item.href, item.title); }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', textDecoration: 'none', color: 'inherit' }}
                      >
                        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <strong style={{ fontSize: '0.86rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text)' }}>{item.title}</strong>
                            {item.badge && <span className="stage-badge" style={{ fontSize: '0.62rem' }}>{item.badge}</span>}
                          </span>
                          <span style={{ fontSize: '0.74rem', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.subtitle}</span>
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--muted)', flexShrink: 0 }}>{item.date || group.label} ↗</span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>Start typing to search your workspace.</p>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const fieldBase = {
  fontSize: '0.8rem',
  color: 'var(--text)',
  background: 'var(--bg-soft)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '7px 10px',
  outline: 'none',
};
const filterSelectStyle = { ...fieldBase, minWidth: 130 };
const filterInputStyle = { ...fieldBase, minWidth: 130 };
