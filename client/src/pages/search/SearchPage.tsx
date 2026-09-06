import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { searchApi, SearchResponse } from '../../api/search';
import DatePicker from '../../components/DatePicker';

const CATEGORIES = [
  { id: 'all',        label: 'Everything' },
  { id: 'leads',      label: 'Leads' },
  { id: 'clients',    label: 'Clients' },
  { id: 'work',       label: 'Work' },
  { id: 'activities', label: 'Activity & Meetings' },
  { id: 'history',    label: 'Work History' },
  { id: 'team',       label: 'Team' },
  { id: 'campaigns',  label: 'Campaigns' },
  { id: 'workspaces', label: 'Workspaces' },
];

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [q,         setQ]         = useState(searchParams.get('q') || '');
  const [type,      setType]      = useState(searchParams.get('type') || 'all');
  const [dateField, setDateField] = useState(searchParams.get('dateField') || 'updated');
  const [from,      setFrom]      = useState(searchParams.get('from') || '');
  const [to,        setTo]        = useState(searchParams.get('to') || '');
  const [module,    setModule]    = useState(searchParams.get('module') || '');

  const [data,    setData]    = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    setQ(searchParams.get('q') || '');
    setType(searchParams.get('type') || 'all');
    setDateField(searchParams.get('dateField') || 'updated');
    setFrom(searchParams.get('from') || '');
    setTo(searchParams.get('to') || '');
    setModule(searchParams.get('module') || '');
    runSearch();
  }, [searchParams]);

  async function runSearch() {
    try {
      setLoading(true);
      setError('');
      const res = await searchApi.query({
        q:         searchParams.get('q') || undefined,
        type:      searchParams.get('type') || 'all',
        dateField: searchParams.get('dateField') || 'updated',
        from:      searchParams.get('from') || undefined,
        to:        searchParams.get('to') || undefined,
        module:    searchParams.get('module') || undefined,
        page:      Number(searchParams.get('page')) || 1,
      });
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const sp = new URLSearchParams();
    if (q)                        sp.set('q', q);
    if (type && type !== 'all')   sp.set('type', type);
    if (dateField !== 'updated')  sp.set('dateField', dateField);
    if (from)                     sp.set('from', from);
    if (to)                       sp.set('to', to);
    if (module)                   sp.set('module', module);
    sp.set('page', '1');
    setSearchParams(sp);
  }

  function filterType(t: string) {
    const sp = new URLSearchParams(searchParams);
    t === 'all' ? sp.delete('type') : sp.set('type', t);
    sp.set('page', '1');
    setType(t);
    setSearchParams(sp);
  }

  function clear() {
    setQ(''); setType('all'); setDateField('updated');
    setFrom(''); setTo(''); setModule('');
    setSearchParams(new URLSearchParams());
  }

  const total = data?.groups.reduce((s, g) => s + g.items.length, 0) ?? 0;

  return (
    <div className="sp-wrap">
      {error && <div className="auth-error sp-error">{error}</div>}

      {/* Hero */}
      <header className="sp-hero">
        <span className="sp-eyebrow">YOUR WORKSPACE, ONE SEARCH</span>
        <h1 className="sp-title">What are you looking for?</h1>
        <p className="sp-sub">Find a person, a project, or the moment something happened.</p>
      </header>

      {/* KPI strip */}
      {data?.stats && (
        <div className="sp-kpi-row">
          <div className="sp-kpi">
            <span className="sp-kpi-label">Due Follow-ups</span>
            <strong className="sp-kpi-val" style={{ color: 'var(--gold)' }}>{data.stats.myFollowUps}</strong>
          </div>
          <div className="sp-kpi">
            <span className="sp-kpi-label">Open Deliverables</span>
            <strong className="sp-kpi-val" style={{ color: 'var(--teal)' }}>{data.stats.openTasks}</strong>
          </div>
          <div className="sp-kpi">
            <span className="sp-kpi-label">Today Activities</span>
            <strong className="sp-kpi-val">{data.stats.todayMeetings}</strong>
          </div>
          <div className="sp-kpi">
            <span className="sp-kpi-label">Unread Alerts</span>
            <strong className="sp-kpi-val sp-kpi-alert">{data.stats.unreadMessages}</strong>
          </div>
        </div>
      )}

      {/* Search Console */}
      <form className="sp-console" onSubmit={submit}>
        {/* Main search bar */}
        <div className="sp-bar">
          <div className="sp-bar-input-wrap">
            <svg className="sp-bar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="sp-bar-input"
              type="search"
              placeholder="Name, email, task, meeting notes, phone..."
              value={q}
              onChange={e => setQ(e.target.value)}
              autoFocus
            />
          </div>
          <button className="btn primary sp-bar-btn" type="submit" disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
          </button>
        </div>

        {/* Filter row */}
        <div className="sp-filters">
          <label className="sp-filter-label">
            Look in
            <select className="sp-select" value={module} onChange={e => setModule(e.target.value)}>
              <option value="">Every work module</option>
              {data?.modules.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>

          <label className="sp-filter-label">
            Date refers to
            <select className="sp-select" value={dateField} onChange={e => setDateField(e.target.value)}>
              <option value="updated">Last updated</option>
              <option value="created">Created / Activity</option>
              <option value="scheduled">Due / Scheduled</option>
            </select>
          </label>

          <label className="sp-filter-label">
            From
            <DatePicker placeholder="From" value={from} onChange={setFrom} />
          </label>

          <label className="sp-filter-label">
            To
            <DatePicker placeholder="To" value={to} onChange={setTo} />
          </label>

          <button type="button" className="btn small sp-clear-btn" onClick={clear}>Clear</button>
        </div>

        {/* Category tabs */}
        <nav className="sp-cats">
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              type="button"
              className={`sp-cat-btn${type === c.id ? ' active' : ''}`}
              onClick={() => filterType(c.id)}
            >
              {c.label}
            </button>
          ))}
        </nav>
      </form>

      {/* Results */}
      <div className="sp-results-head">
        <h2 className="sp-results-title">Results</h2>
        <span className="sp-results-count">{total} result{total === 1 ? '' : 's'} on this page</span>
      </div>

      <div className="sp-results">
        {data?.warnings.map((w, i) => (
          <div key={i} className="notice danger">{w}</div>
        ))}

        {!data?.groups.some(g => g.items.length) ? (
          <div className="sp-empty">
            <h3>{q || from || to ? 'No matches found' : 'Start with what you know'}</h3>
            <p>Search a name, keyword, phone, or select a category above.</p>
          </div>
        ) : (
          data?.groups.filter(g => g.items.length > 0).map(group => (
            <section key={group.id} className="sp-group">
              <header className="sp-group-head">
                <h3 className="sp-group-label">{group.label}</h3>
                <span className="sp-group-count">{group.items.length}{group.hasMore ? '+' : ''}</span>
              </header>
              <div className="sp-group-items">
                {group.items.map(item => (
                  <Link key={item.id} to={item.href} className="sp-item">
                    <div className="sp-item-left">
                      <span className="sp-item-icon">{item.kind.slice(0, 1).toUpperCase()}</span>
                      <div className="sp-item-text">
                        <strong className="sp-item-title">{item.title}</strong>
                        <span className="sp-item-sub">{item.subtitle}</span>
                      </div>
                    </div>
                    <div className="sp-item-right">
                      {item.badge && <span className="stage-badge sp-badge">{item.badge}</span>}
                      {item.date && <span className="sp-item-date">{new Date(item.date).toLocaleDateString('en-IN')}</span>}
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sp-item-arrow" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
