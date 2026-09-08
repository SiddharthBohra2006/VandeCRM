import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { campaignsApi, Campaign, CampaignInput } from '../../api/campaigns';
import { Company } from '../../api/companies';
import { useAuth } from '../../contexts/AuthContext';
import DatePicker from '../../components/DatePicker';

export default function CampaignsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [platformOptions, setPlatformOptions] = useState<string[]>([]);
  const [statusOptions, setStatusOptions] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New campaign drawer state
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCampaign, setNewCampaign] = useState<CampaignInput>({
    name: '',
    clientCompany: '',
    platform: 'Meta Ads',
    status: 'active',
    budget: 0,
    spent: 0,
    startDate: '',
    endDate: '',
    assignedManager: '',
    objective: '',
    leadsCount: 0,
    qualifiedLeadsCount: 0,
    salesCount: 0,
    revenue: 0,
    landingPageLink: '',
    creativeLink: '',
    notes: '',
  });

  const currentStatus = searchParams.get('status') || '';
  const currentCompany = searchParams.get('clientCompany') || '';
  const currentDateFrom = searchParams.get('dateFrom') || '';
  const currentDateTo = searchParams.get('dateTo') || '';

  useEffect(() => {
    loadCampaigns();
  }, [searchParams]);

  async function loadCampaigns() {
    try {
      setLoading(true);
      setError('');
      const params: Record<string, string> = {};
      if (currentStatus) params.status = currentStatus;
      if (currentCompany) params.clientCompany = currentCompany;
      if (currentDateFrom) params.dateFrom = currentDateFrom;
      if (currentDateTo) params.dateTo = currentDateTo;

      const res = await campaignsApi.list(params);
      setCampaigns(res.data || []);
      setCompanies(res.companies || []);
      setUsers(res.users || []);
      setPlatformOptions(res.platformOptions || []);
      setStatusOptions(res.statusOptions || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }

  function handleFilterChange(key: string, value: string) {
    const updated = new URLSearchParams(searchParams);
    if (value) {
      updated.set(key, value);
    } else {
      updated.delete(key);
    }
    setSearchParams(updated);
  }

  async function handleCreateCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!newCampaign.name.trim() || !newCampaign.clientCompany) return;
    try {
      setCreating(true);
      setError('');
      await campaignsApi.create(newCampaign);
      setSuccess(`Campaign "${newCampaign.name}" launched successfully.`);
      setShowCreate(false);
      setNewCampaign({
        name: '',
        clientCompany: '',
        platform: 'Meta Ads',
        status: 'active',
        budget: 0,
        spent: 0,
        startDate: '',
        endDate: '',
        assignedManager: '',
        objective: '',
        leadsCount: 0,
        qualifiedLeadsCount: 0,
        salesCount: 0,
        revenue: 0,
        landingPageLink: '',
        creativeLink: '',
        notes: '',
      });
      await loadCampaigns();
    } catch (err: any) {
      setError(err.message || 'Failed to launch campaign');
    } finally {
      setCreating(false);
    }
  }

  const totalBudget = campaigns.reduce((sum, c) => sum + (c.budget || 0), 0);
  const totalSpent = campaigns.reduce((sum, c) => sum + (c.spent || 0), 0);
  const totalLeads = campaigns.reduce((sum, c) => sum + (c.actualLeadsCount || c.leadsCount || 0), 0);
  const totalWonRevenue = campaigns.reduce((sum, c) => sum + (c.metrics?.wonRevenue || 0), 0);
  const activeCount = campaigns.filter(c => c.status === 'active').length;

  const canCreate = user?.role === 'admin' || user?.role === 'manager';

  if (loading && campaigns.length === 0) {
    return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading campaigns...</div>;
  }

  return (
    <div className="page-container experience-page campaigns-page">
      {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="notice success" style={{ marginBottom: '1rem' }}>{success}</div>}

      <section className="page-head">
        <div>
          <p className="eyebrow">Digital Marketing</p>
          <h1>Ad Campaigns</h1>
          <p className="page-subtitle">Track campaign spend, lead volume, status, and client attribution from one workspace.</p>
        </div>
        {canCreate && (
          <button
            type="button"
            className="btn primary"
            onClick={() => setShowCreate(!showCreate)}
          >
            {showCreate ? 'Cancel' : 'New Ad Campaign'}
          </button>
        )}
      </section>

      {/* Top Metrics Cards */}
      <section className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Campaigns</span>
          <strong style={{ fontSize: '1.25rem' }}>{campaigns.length}</strong>
        </div>
        <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Active</span>
          <strong style={{ fontSize: '1.25rem' }}>{activeCount}</strong>
        </div>
        <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Total Budget</span>
          <strong style={{ fontSize: '1.25rem' }}>₹{totalBudget.toLocaleString('en-IN')}</strong>
        </div>
        <div className="metric warn" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Total Spent</span>
          <strong style={{ fontSize: '1.25rem', color: 'var(--gold)' }}>₹{totalSpent.toLocaleString('en-IN')}</strong>
        </div>
        <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Linked Leads</span>
          <strong style={{ fontSize: '1.25rem' }}>{totalLeads}</strong>
        </div>
        <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Won Revenue</span>
          <strong style={{ fontSize: '1.25rem', color: 'var(--teal)' }}>₹{totalWonRevenue.toLocaleString('en-IN')}</strong>
        </div>
        <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Avg CPL</span>
          <strong style={{ fontSize: '1.25rem' }}>₹{totalLeads ? Math.round(totalSpent / totalLeads).toLocaleString('en-IN') : 0}</strong>
        </div>
      </section>

      {/* Create Campaign Drawer */}
      {showCreate && (
        <form
          onSubmit={handleCreateCampaign}
          style={{
            marginBottom: '1.5rem',
            padding: '1.5rem',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            background: 'var(--panel)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Launch Ad Campaign</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Campaign Name *
              <input
                required
                placeholder="e.g. AI Bootcamp Meta Ad"
                value={newCampaign.name}
                onChange={e => setNewCampaign({ ...newCampaign, name: e.target.value })}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Company *
              <select
                required
                value={newCampaign.clientCompany}
                onChange={e => setNewCampaign({ ...newCampaign, clientCompany: e.target.value })}
              >
                <option value="">Select Company</option>
                {companies.map(comp => (
                  <option key={comp._id} value={comp._id}>{comp.name}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Platform
              <select
                value={newCampaign.platform}
                onChange={e => setNewCampaign({ ...newCampaign, platform: e.target.value })}
              >
                {platformOptions.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Status
              <select
                value={newCampaign.status}
                onChange={e => setNewCampaign({ ...newCampaign, status: e.target.value })}
              >
                {statusOptions.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Budget (INR)
              <input
                type="number"
                min="0"
                value={newCampaign.budget}
                onChange={e => setNewCampaign({ ...newCampaign, budget: Number(e.target.value) || 0 })}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Initial Spent (INR)
              <input
                type="number"
                min="0"
                value={newCampaign.spent}
                onChange={e => setNewCampaign({ ...newCampaign, spent: Number(e.target.value) || 0 })}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Start Date
              <DatePicker
                value={newCampaign.startDate || ''}
                onChange={val => setNewCampaign({ ...newCampaign, startDate: val })}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Assigned Manager
              <select
                value={newCampaign.assignedManager || ''}
                onChange={e => setNewCampaign({ ...newCampaign, assignedManager: e.target.value || null })}
              >
                <option value="">No manager</option>
                {users.map(u => (
                  <option key={u._id} value={u._id}>{u.name}</option>
                ))}
              </select>
            </label>
          </div>

          <button className="btn primary" type="submit" disabled={creating}>
            {creating ? 'Launching...' : 'Launch Campaign'}
          </button>
        </form>
      )}

      {/* Filter Bar */}
      <div className="filter-bar" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <select
          value={currentStatus}
          onChange={e => handleFilterChange('status', e.target.value)}
          style={{ minWidth: '160px' }}
        >
          <option value="">All statuses</option>
          {statusOptions.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={currentCompany}
          onChange={e => handleFilterChange('clientCompany', e.target.value)}
          style={{ minWidth: '180px' }}
        >
          <option value="">All client companies</option>
          {companies.map(c => (
            <option key={c._id} value={c._id}>{c.name}</option>
          ))}
        </select>

        <label className="compact-date-field">
          <span>From</span>
          <DatePicker
            placeholder="Start date"
            value={currentDateFrom}
            onChange={val => handleFilterChange('dateFrom', val)}
            style={{ minWidth: '140px' }}
          />
        </label>
        <label className="compact-date-field">
          <span>To</span>
          <DatePicker
            placeholder="End date"
            value={currentDateTo}
            onChange={val => handleFilterChange('dateTo', val)}
            style={{ minWidth: '140px' }}
          />
        </label>

        {(currentStatus || currentCompany || currentDateFrom || currentDateTo) && (
          <button
            type="button"
            className="btn small"
            onClick={() => setSearchParams(new URLSearchParams())}
          >
            Reset
          </button>
        )}
      </div>

      {/* Table Card */}
      <section className="table-card" style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Campaign</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Company</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Platform</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Status</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Budget</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Spent</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Linked Leads</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>CPL</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>ROI</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}>
                  No campaigns match this view.
                </td>
              </tr>
            ) : (
              campaigns.map(camp => {
                const companyName = typeof camp.clientCompany === 'object' && camp.clientCompany !== null
                  ? (camp.clientCompany as any).name
                  : 'N/A';
                const leads = camp.actualLeadsCount || camp.leadsCount || 0;
                const cpl = leads ? Math.round(camp.spent / leads) : 0;
                const roi = camp.metrics?.roi ? Math.round(camp.metrics.roi) : 0;

                return (
                  <tr key={camp._id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Link to={`/campaigns/${camp._id}`} style={{ fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}>
                        {camp.name}
                      </Link>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{companyName}</td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{camp.platform}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span
                        className="stage-badge"
                        style={{
                          backgroundColor: camp.status === 'active' ? 'var(--green, #16a34a)' : camp.status === 'paused' ? 'var(--gold, #b58d00)' : 'var(--muted, #64748b)',
                          color: '#fff',
                          fontSize: '0.65rem',
                          padding: '2px 6px',
                        }}
                      >
                        {camp.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>₹{(camp.budget || 0).toLocaleString('en-IN')}</td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>₹{(camp.spent || 0).toLocaleString('en-IN')}</td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{leads}</td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>₹{cpl.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{roi}%</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <Link to={`/campaigns/${camp._id}`} className="btn small outline">
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
