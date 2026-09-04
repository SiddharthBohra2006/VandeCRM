import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { clientsApi, ClientsListResponse } from '../../api/clients';

export default function ClientsPage() {
  const { crmTerms } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<ClientsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, [searchParams.toString()]);

  async function loadData() {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      searchParams.forEach((value, key) => { params[key] = value; });
      const result = await clientsApi.list(params);
      setData(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  }

  function handleFilterChange(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    setSearchParams(params);
  }

  if (loading && !data) return <div className="loading">Loading {crmTerms.recordPlural}...</div>;
  if (error && !data) return <div className="alert alert-error">{error}</div>;
  if (!data) return null;

  const { data: clients, stages, labels, campaigns, users, pagination, clientStats } = data;
  const view = searchParams.get('view') || 'all';

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{crmTerms.recordPlural} <span style={{ fontSize: '0.75rem', background: '#ffedd5', color: '#ea580c', padding: '2px 8px', borderRadius: 999, fontWeight: 800 }}>{clientStats.totalClients}</span></h1>
        <Link to="/customers/new?scope=client" className="btn btn-primary">+ Add {crmTerms.recordSingular.toLowerCase()}</Link>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {/* KPI Cards */}
      <div className="stats-bar" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', display: 'grid' }}>
        <a className="stat-card" href="#/customers?view=new" style={{ display: 'block', textDecoration: 'none' }} onClick={e => { e.preventDefault(); handleFilterChange('view', 'new'); }}>
          <span className="stat-value">{clientStats.newClients}</span>
          <span className="stat-label">New {crmTerms.recordPlural.toLowerCase()}</span>
        </a>
        <a className="stat-card" href="#/customers" style={{ display: 'block', textDecoration: 'none' }} onClick={e => { e.preventDefault(); handleFilterChange('view', ''); }}>
          <span className="stat-value">{clientStats.totalClients}</span>
          <span className="stat-label">Total {crmTerms.recordPlural.toLowerCase()}</span>
        </a>
        <a className="stat-card" href="#/customers?view=high-value" style={{ display: 'block', textDecoration: 'none' }} onClick={e => { e.preventDefault(); handleFilterChange('view', 'high-value'); }}>
          <span className="stat-value">₹{clientStats.totalValue.toLocaleString('en-IN')}</span>
          <span className="stat-label">Portfolio value</span>
        </a>
        <a className="stat-card" href="#/customers?view=high-priority" style={{ display: 'block', textDecoration: 'none' }} onClick={e => { e.preventDefault(); handleFilterChange('view', 'high-priority'); }}>
          <span className="stat-value">{clientStats.highPriorityCount || 0}</span>
          <span className="stat-label">High priority</span>
        </a>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <input
          type="text"
          placeholder={`Search ${crmTerms.recordPlural.toLowerCase()}...`}
          defaultValue={searchParams.get('q') || ''}
          onKeyDown={e => {
            if (e.key === 'Enter') handleFilterChange('q', (e.target as HTMLInputElement).value);
          }}
        />
        <select value={searchParams.get('stage') || ''} onChange={e => handleFilterChange('stage', e.target.value)}>
          <option value="">All client statuses</option>
          {stages.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
        <select value={searchParams.get('label') || ''} onChange={e => handleFilterChange('label', e.target.value)}>
          <option value="">All Labels</option>
          {labels.map(label => <option key={label._id} value={label._id}>{label.name}</option>)}
        </select>
        <select value={searchParams.get('campaign') || ''} onChange={e => handleFilterChange('campaign', e.target.value)}>
          <option value="">All Campaigns</option>
          {campaigns.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
        <select value={searchParams.get('sortBy') || 'recent'} onChange={e => handleFilterChange('sortBy', e.target.value)}>
          <option value="recent">Recently Updated</option>
          <option value="old">Oldest</option>
          <option value="highest-value">Highest Value</option>
          <option value="lowest-value">Lowest Value</option>
          <option value="name">Name A-Z</option>
        </select>
        <input type="date" aria-label="Won from" value={searchParams.get('dateFrom') || ''} onChange={e => handleFilterChange('dateFrom', e.target.value)} />
        <input type="date" aria-label="Won to" value={searchParams.get('dateTo') || ''} onChange={e => handleFilterChange('dateTo', e.target.value)} />
      </div>

      <nav className="view-tabs" aria-label="Client views">
        {[['all', 'All'], ['new', 'Recently won'], ['assigned', 'Assigned to me'], ['high-value', 'High value'], ['high-priority', 'High priority']].map(([key, label]) => (
          <button key={key} className={(view === key) ? 'active' : ''} onClick={() => handleFilterChange('view', key === 'all' ? '' : key)}>{label}</button>
        ))}
      </nav>

      {/* Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Stage</th>
              <th>Value</th>
              <th>Assigned To</th>
              <th>Won</th>
            </tr>
          </thead>
          <tbody>
            {clients.map(client => (
              <tr key={client._id}>
                <td><Link to={`/customers/${client._id}?from=clients`}>{client.name}</Link></td>
                <td>{client.email}</td>
                <td>{client.phone}</td>
                <td>
                  <span className="stage-badge" style={{ backgroundColor: client.stage?.color || '#64748b' }}>
                    {client.stage?.name || 'No stage'}
                  </span>
                </td>
                <td>₹{client.value?.toLocaleString('en-IN') || 0}</td>
                <td>{client.assignedTo?.name || 'Unassigned'}</td>
                <td>{new Date(client.createdAt).toLocaleDateString('en-IN')}</td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr><td colSpan={7} className="empty-state">No {crmTerms.recordPlural.toLowerCase()} found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="pagination">
          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(page => (
            <button
              key={page}
              className={`pagination-btn ${page === pagination.page ? 'active' : ''}`}
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                params.set('page', String(page));
                setSearchParams(params);
              }}
            >
              {page}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
