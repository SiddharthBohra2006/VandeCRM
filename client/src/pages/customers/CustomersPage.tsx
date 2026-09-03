import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { customersApi, CustomersListResponse } from '../../api/customers';

export default function CustomersPage() {
  const { crmTerms } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<CustomersListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, [searchParams.toString()]);

  async function loadData() {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      searchParams.forEach((value, key) => { params[key] = value; });
      const result = await customersApi.list(params);
      setData(result);
    } catch (err: any) {
      setError(err.message);
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

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (!data) return;
    if (selectedIds.size === data.data.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.data.map(c => c._id)));
    }
  }

  if (loading && !data) return <div className="loading">Loading {crmTerms.leadPlural}...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return null;

  const { data: customers, stages, labels, campaigns, users, pagination, leadStats } = data;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{crmTerms.leadPlural}</h1>
        <Link to="/customers/new" className="btn btn-primary">+ New {crmTerms.leadSingular}</Link>
      </div>

      {/* Stats Bar */}
      <div className="stats-bar">
        <div className="stat-card">
          <span className="stat-value">{leadStats.totalLeads}</span>
          <span className="stat-label">Total</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{leadStats.newLeads}</span>
          <span className="stat-label">New (7d)</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{leadStats.qualifiedLeads}</span>
          <span className="stat-label">Qualified</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{leadStats.hotLeads}</span>
          <span className="stat-label">Hot</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{leadStats.overdueLeads}</span>
          <span className="stat-label">Overdue</span>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <input
          type="text"
          placeholder={`Search ${crmTerms.leadPlural.toLowerCase()}...`}
          defaultValue={searchParams.get('q') || ''}
          onKeyDown={e => {
            if (e.key === 'Enter') handleFilterChange('q', (e.target as HTMLInputElement).value);
          }}
        />
        <select value={searchParams.get('stage') || ''} onChange={e => handleFilterChange('stage', e.target.value)}>
          <option value="">All Stages</option>
          {stages.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
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
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={selectedIds.size === customers.length && customers.length > 0} onChange={selectAll} /></th>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Stage</th>
              <th>Value</th>
              <th>Assigned To</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {customers.map(customer => (
              <tr key={customer._id}>
                <td><input type="checkbox" checked={selectedIds.has(customer._id)} onChange={() => toggleSelect(customer._id)} /></td>
                <td><Link to={`/customers/${customer._id}`}>{customer.name}</Link></td>
                <td>{customer.email}</td>
                <td>{customer.phone}</td>
                <td>
                  <span className="stage-badge" style={{ backgroundColor: customer.stage?.color || '#64748b' }}>
                    {customer.stage?.name || 'No stage'}
                  </span>
                </td>
                <td>₹{customer.value?.toLocaleString('en-IN') || 0}</td>
                <td>{customer.assignedTo?.name || 'Unassigned'}</td>
                <td>{new Date(customer.createdAt).toLocaleDateString('en-IN')}</td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr><td colSpan={8} className="empty-state">No {crmTerms.leadPlural.toLowerCase()} found.</td></tr>
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
