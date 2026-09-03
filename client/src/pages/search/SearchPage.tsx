import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { searchApi, SearchResponse, SearchGroup } from '../../api/search';

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [q, setQ] = useState(searchParams.get('q') || '');
  const [type, setType] = useState(searchParams.get('type') || 'all');
  const [dateField, setDateField] = useState(searchParams.get('dateField') || 'updated');
  const [from, setFrom] = useState(searchParams.get('from') || '');
  const [to, setTo] = useState(searchParams.get('to') || '');
  const [module, setModule] = useState(searchParams.get('module') || '');
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);

  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    executeSearch();
  }, [searchParams]);

  async function executeSearch() {
    try {
      setLoading(true);
      setError('');
      const res = await searchApi.query({
        q: searchParams.get('q') || undefined,
        type: searchParams.get('type') || 'all',
        dateField: searchParams.get('dateField') || 'updated',
        from: searchParams.get('from') || undefined,
        to: searchParams.get('to') || undefined,
        module: searchParams.get('module') || undefined,
        page: Number(searchParams.get('page')) || 1,
      });
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (type && type !== 'all') sp.set('type', type);
    if (dateField && dateField !== 'updated') sp.set('dateField', dateField);
    if (from) sp.set('from', from);
    if (to) sp.set('to', to);
    if (module) sp.set('module', module);
    sp.set('page', '1');
    setSearchParams(sp);
  }

  function handleTypeFilter(newType: string) {
    setType(newType);
    const sp = new URLSearchParams(searchParams);
    if (newType === 'all') sp.delete('type');
    else sp.set('type', newType);
    sp.set('page', '1');
    setSearchParams(sp);
  }

  function handleClear() {
    setQ('');
    setType('all');
    setDateField('updated');
    setFrom('');
    setTo('');
    setModule('');
    setSearchParams(new URLSearchParams());
  }

  const totalResults = data?.groups.reduce((sum, g) => sum + g.items.length, 0) || 0;

  return (
    <div className="page-container" style={{ maxWidth: '960px', margin: '0 auto' }}>
      {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      <header style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
        <span className="eyebrow" style={{ letterSpacing: '0.08em', fontSize: '0.75rem' }}>YOUR WORKSPACE, ONE SEARCH</span>
        <h1 style={{ margin: '0.25rem 0 0.5rem', fontSize: '1.75rem' }}>What are you looking for?</h1>
        <p className="page-subtitle" style={{ margin: 0 }}>Find a person, a project, or the moment something happened.</p>
      </header>

      {/* KPI Stats Overview */}
      {data?.stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div style={{ padding: '0.85rem', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '8px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase' }}>Due Follow-ups</span>
            <strong style={{ display: 'block', fontSize: '1.3rem', color: 'var(--gold)' }}>{data.stats.myFollowUps}</strong>
          </div>
          <div style={{ padding: '0.85rem', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '8px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase' }}>Open Deliverables</span>
            <strong style={{ display: 'block', fontSize: '1.3rem', color: 'var(--teal)' }}>{data.stats.openTasks}</strong>
          </div>
          <div style={{ padding: '0.85rem', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '8px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase' }}>Today Activities</span>
            <strong style={{ display: 'block', fontSize: '1.3rem', color: 'var(--text)' }}>{data.stats.todayMeetings}</strong>
          </div>
          <div style={{ padding: '0.85rem', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '8px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase' }}>Unread Alerts</span>
            <strong style={{ display: 'block', fontSize: '1.3rem', color: 'var(--red)' }}>{data.stats.unreadMessages}</strong>
          </div>
        </div>
      )}

      {/* Search Console */}
      <form
        onSubmit={handleSearchSubmit}
        style={{
          border: '1px solid var(--border)',
          borderRadius: '12px',
          background: 'var(--panel)',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="search"
            placeholder="Name, email, task, meeting notes, phone..."
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ flex: 1, padding: '10px 14px', fontSize: '0.95rem', borderRadius: '8px' }}
          />
          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? 'Searching...' : 'Search ↗'}
          </button>
        </div>

        {/* Filter Row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', fontSize: '0.8rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--muted)' }}>
            Look in:
            <select value={module} onChange={e => setModule(e.target.value)} style={{ padding: '4px 8px', borderRadius: '4px' }}>
              <option value="">Every work module</option>
              {data?.modules.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--muted)' }}>
            Date refers to:
            <select value={dateField} onChange={e => setDateField(e.target.value)} style={{ padding: '4px 8px', borderRadius: '4px' }}>
              <option value="updated">Last updated</option>
              <option value="created">Created / Activity</option>
              <option value="scheduled">Due / Scheduled</option>
            </select>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--muted)' }}>
            From:
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ padding: '4px 8px', borderRadius: '4px' }} />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--muted)' }}>
            To:
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ padding: '4px 8px', borderRadius: '4px' }} />
          </label>

          <button type="button" className="btn small" onClick={handleClear}>
            Clear
          </button>
        </div>

        {/* Type Category Navigation */}
        <nav style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
          {[
            { id: 'all', label: 'Everything' },
            { id: 'leads', label: 'Leads' },
            { id: 'clients', label: 'Clients' },
            { id: 'work', label: 'Work' },
            { id: 'activities', label: 'Activity & Meetings' },
            { id: 'history', label: 'Work History' },
            { id: 'team', label: 'Team' },
            { id: 'campaigns', label: 'Campaigns' },
            { id: 'workspaces', label: 'Workspaces' },
          ].map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleTypeFilter(cat.id)}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 700,
                border: 'none',
                background: type === cat.id ? 'var(--gold-dim, rgba(245, 158, 11, 0.2))' : 'transparent',
                color: type === cat.id ? 'var(--gold)' : 'var(--muted)',
                cursor: 'pointer',
              }}
            >
              {cat.label}
            </button>
          ))}
        </nav>
      </form>

      {/* Results Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Results</h2>
        <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
          {totalResults} result{totalResults === 1 ? '' : 's'} on this page
        </span>
      </div>

      {/* Results Feed */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {data?.warnings.map((w, idx) => (
          <div key={idx} className="notice danger">{w}</div>
        ))}

        {!data?.groups.some(g => g.items.length) ? (
          <div style={{ textAlign: 'center', padding: '3rem 1.5rem', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '12px' }}>
            <h3 style={{ margin: '0 0 0.5rem' }}>
              {q || from || to ? 'No matches found' : 'Start with what you know'}
            </h3>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>
              Search a name, keyword, phone, or select a category above.
            </p>
          </div>
        ) : (
          data?.groups.filter(g => g.items.length > 0).map(group => (
            <section key={group.id} style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', overflow: 'hidden' }}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg-soft, rgba(255,255,255,0.01))', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>{group.label}</h3>
                <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>
                  {group.items.length}{group.hasMore ? '+' : ''}
                </span>
              </header>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {group.items.map(item => (
                  <Link
                    key={item.id}
                    to={item.href}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.85rem 1rem',
                      borderBottom: '1px solid var(--border)',
                      textDecoration: 'none',
                      color: 'inherit',
                      gap: '1rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                      <span
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '6px',
                          background: 'var(--bg-soft, rgba(255,255,255,0.04))',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          flexShrink: 0,
                        }}
                      >
                        {item.kind.slice(0, 1).toUpperCase()}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: 'block', fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.title}
                        </strong>
                        <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.subtitle}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                      {item.badge && (
                        <span className="stage-badge" style={{ fontSize: '0.65rem' }}>
                          {item.badge}
                        </span>
                      )}
                      {item.date && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                          {new Date(item.date).toLocaleDateString('en-IN')}
                        </span>
                      )}
                      <span style={{ color: 'var(--muted)' }}>↗</span>
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
