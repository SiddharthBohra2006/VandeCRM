import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { campaignsApi, Campaign, CampaignMetrics } from '../../api/campaigns';
import { Company } from '../../api/companies';
import { Customer } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import DatePicker from '../../components/DatePicker';

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [platformOptions, setPlatformOptions] = useState<string[]>([]);
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Date filters (URL-backed for reload/share parity with EJS)
  const [searchParams, setSearchParams] = useSearchParams();
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';

  // Edit form state
  const [formData, setFormData] = useState({
    name: '',
    clientCompany: '',
    platform: 'Meta Ads',
    status: 'active',
    budget: 0,
    spent: 0,
    leadsCount: 0,
    clicksCount: 0,
    conversionsCount: 0,
    metaCampaignId: '',
    googleCampaignId: '',
    startDate: '',
    endDate: '',
    assignedManager: '',
    objective: '',
    qualifiedLeadsCount: 0,
    salesCount: 0,
    revenue: 0,
    landingPageLink: '',
    creativeLink: '',
    notes: '',
  });

  useEffect(() => {
    if (id) loadCampaign(id);
  }, [id, dateFrom, dateTo]);

  async function loadCampaign(campaignId: string) {
    try {
      setLoading(true);
      setError('');
      const params: Record<string, string> = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const res = await campaignsApi.get(campaignId, params);
      setCampaign(res.data);
      setCustomers(res.customers || []);
      setCompanies(res.companies || []);
      setUsers(res.users || []);
      setPlatformOptions(res.platformOptions || []);
      setStatusOptions(res.statusOptions || []);
      setMetrics(res.data.metrics || null);

      const compId = typeof res.data.clientCompany === 'object' && res.data.clientCompany !== null
        ? (res.data.clientCompany as any)._id
        : res.data.clientCompany || '';

      setFormData({
        name: res.data.name || '',
        clientCompany: compId,
        platform: res.data.platform || 'Meta Ads',
        status: res.data.status || 'active',
        budget: res.data.budget || 0,
        spent: res.data.spent || 0,
        leadsCount: res.data.leadsCount || 0,
        clicksCount: res.data.clicksCount || 0,
        conversionsCount: res.data.conversionsCount || 0,
        metaCampaignId: res.data.metaCampaignId || '',
        googleCampaignId: res.data.googleCampaignId || '',
        startDate: res.data.startDate ? new Date(res.data.startDate).toISOString().slice(0, 10) : '',
        endDate: res.data.endDate ? new Date(res.data.endDate).toISOString().slice(0, 10) : '',
        assignedManager: res.data.assignedManager?._id || '',
        objective: res.data.objective || '',
        qualifiedLeadsCount: res.data.qualifiedLeadsCount || 0,
        salesCount: res.data.salesCount || 0,
        revenue: res.data.revenue || 0,
        landingPageLink: res.data.landingPageLink || '',
        creativeLink: res.data.creativeLink || '',
        notes: res.data.notes || '',
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load campaign');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    try {
      setSaving(true);
      setError('');
      await campaignsApi.update(id, formData);
      await loadCampaign(id);
      setSuccess('Campaign updated successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to update campaign');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    if (!id || !campaign) return;
    const newStatus = campaign.status === 'archived' ? 'active' : 'archived';
    try {
      await campaignsApi.updateStatus(id, newStatus);
      await loadCampaign(id);
      setSuccess(`Campaign ${newStatus === 'archived' ? 'archived' : 'restored'}.`);
    } catch (err: any) {
      setError(err.message || 'Failed to change status');
    }
  }

  async function executeDelete() {
    if (!id) return;
    try {
      setDeleting(true);
      setError('');
      await campaignsApi.delete(id);
      navigate('/campaigns');
    } catch (err: any) {
      setError(err.message || 'Failed to delete campaign');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  if (loading && !campaign) {
    return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading campaign...</div>;
  }

  if (!campaign) {
    return (
      <div className="page-container" style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Campaign not found</h2>
        <Link to="/campaigns" className="btn primary" style={{ marginTop: '1rem' }}>
          Back to Campaigns
        </Link>
      </div>
    );
  }

  const companyName = typeof campaign.clientCompany === 'object' && campaign.clientCompany !== null
    ? (campaign.clientCompany as any).name
    : 'Unknown company';

  const canEdit = user?.role === 'admin' || user?.role === 'manager';

  return (
    <div className="page-container">
      {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="notice success" style={{ marginBottom: '1rem' }}>{success}</div>}

      {/* Header */}
      <section className="page-head" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <p className="eyebrow">
            <Link to="/campaigns" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Ad Campaigns</Link> / {campaign.name}
          </p>
          <h1 style={{ margin: '0.2rem 0' }}>{campaign.name}</h1>
          <p className="page-subtitle">{companyName} · {campaign.platform}</p>
        </div>

        {canEdit && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className={`btn small ${campaign.status === 'archived' ? 'primary' : 'outline'}`}
              onClick={handleToggleStatus}
            >
              {campaign.status === 'archived' ? 'Restore' : 'Archive'}
            </button>
            <button
              type="button"
              className="btn small danger"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete
            </button>
          </div>
        )}
      </section>

      {/* Date Filter Bar */}
      <div className="filter-bar" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.5rem' }}>
        <DatePicker
          placeholder="From date"
          value={dateFrom}
          onChange={val => {
            const updated = new URLSearchParams(searchParams);
            if (val) updated.set('dateFrom', val);
            else updated.delete('dateFrom');
            setSearchParams(updated);
          }}
          style={{ maxWidth: '160px' }}
        />
        <DatePicker
          placeholder="To date"
          value={dateTo}
          onChange={val => {
            const updated = new URLSearchParams(searchParams);
            if (val) updated.set('dateTo', val);
            else updated.delete('dateTo');
            setSearchParams(updated);
          }}
          style={{ maxWidth: '160px' }}
        />
        {(dateFrom || dateTo) && (
          <button
            type="button"
            className="btn small"
            onClick={() => setSearchParams(new URLSearchParams())}
          >
            Reset Dates
          </button>
        )}
      </div>

      {/* Metrics Grid */}
      {metrics && (
        <section className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Total Leads</span>
            <strong style={{ fontSize: '1.25rem' }}>{metrics.totalLeads}</strong>
          </div>
          <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Won Deals</span>
            <strong style={{ fontSize: '1.25rem', color: 'var(--teal)' }}>{metrics.wonLeads || 0}</strong>
          </div>
          <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Pipeline Value</span>
            <strong style={{ fontSize: '1.25rem' }}>₹{metrics.pipelineValue.toLocaleString('en-IN')}</strong>
          </div>
          <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Cost Per Lead</span>
            <strong style={{ fontSize: '1.25rem', color: 'var(--gold)' }}>₹{Math.round(metrics.costPerLead || 0).toLocaleString('en-IN')}</strong>
          </div>
          <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>ROI</span>
            <strong style={{ fontSize: '1.25rem' }}>{Math.round(metrics.roi || 0)}%</strong>
          </div>
          <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Lead Conversion</span>
            <strong style={{ fontSize: '1.25rem' }}>{(metrics.conversionRate || 0).toFixed(1)}%</strong>
          </div>
        </section>
      )}

      {/* Edit Form and Snapshot Grid */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Edit Form */}
        {canEdit && (
          <article className="profile-panel" style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.1rem', marginBottom: '1rem' }}>Edit Campaign</h2>
            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Campaign Name
                <input
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Company
                <select
                  required
                  value={formData.clientCompany}
                  onChange={e => setFormData({ ...formData, clientCompany: e.target.value })}
                >
                  {companies.map(c => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Platform
                  <select
                    value={formData.platform}
                    onChange={e => setFormData({ ...formData, platform: e.target.value })}
                  >
                    {platformOptions.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Status
                  <select
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                  >
                    {statusOptions.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Budget (INR)
                  <input
                    type="number"
                    min="0"
                    value={formData.budget}
                    onChange={e => setFormData({ ...formData, budget: Number(e.target.value) || 0 })}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Spent (INR)
                  <input
                    type="number"
                    min="0"
                    value={formData.spent}
                    onChange={e => setFormData({ ...formData, spent: Number(e.target.value) || 0 })}
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Meta Campaign ID
                  <input
                    value={formData.metaCampaignId}
                    onChange={e => setFormData({ ...formData, metaCampaignId: e.target.value })}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Google Campaign ID
                  <input
                    value={formData.googleCampaignId}
                    onChange={e => setFormData({ ...formData, googleCampaignId: e.target.value })}
                  />
                </label>
              </div>

              <button type="submit" className="btn primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Campaign'}
              </button>
            </form>
          </article>
        )}

        {/* Snapshot Panel */}
        <article className="profile-panel" style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.1rem', marginBottom: '1rem' }}>Performance Snapshot</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.85rem' }}>
            <div><strong>Status:</strong> {campaign.status.toUpperCase()}</div>
            <div><strong>Budget:</strong> ₹{(campaign.budget || 0).toLocaleString('en-IN')}</div>
            <div><strong>Spent:</strong> ₹{(campaign.spent || 0).toLocaleString('en-IN')}</div>
            <div><strong>Clicks / Sessions:</strong> {(campaign.clicksCount || 0).toLocaleString('en-IN')}</div>
            <div><strong>Conversions:</strong> {(campaign.conversionsCount || 0).toLocaleString('en-IN')}</div>
            <div><strong>Start Date:</strong> {campaign.startDate ? new Date(campaign.startDate).toLocaleDateString() : 'N/A'}</div>
            <div><strong>End Date:</strong> {campaign.endDate ? new Date(campaign.endDate).toLocaleDateString() : 'N/A'}</div>
            {campaign.objective && <div><strong>Objective:</strong> {campaign.objective}</div>}
            {campaign.notes && <div><strong>Notes:</strong> {campaign.notes}</div>}
          </div>
        </article>
      </section>

      {/* Linked Leads Table */}
      <section className="table-card" style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', overflowX: 'auto' }}>
        <h2 style={{ padding: '1rem 1rem 0.5rem', margin: 0, fontSize: '1.1rem' }}>Linked Leads ({customers.length})</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Lead</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Stage</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Assigned To</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Value</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
                  No leads are linked to this campaign yet.
                </td>
              </tr>
            ) : (
              customers.map(cust => (
                <tr key={cust._id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <Link to={`/customers/${cust._id}`} style={{ fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}>
                      {cust.name}
                    </Link>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span
                      className="stage-badge"
                      style={{
                        backgroundColor: cust.stage?.color || 'var(--muted)',
                        color: '#fff',
                        fontSize: '0.65rem',
                        padding: '2px 6px',
                      }}
                    >
                      {cust.stage?.name || 'No stage'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{cust.assignedTo?.name || 'Unassigned'}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>₹{(cust.value || 0).toLocaleString('en-IN')}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
                    {new Date(cust.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Campaign"
        message="Delete this campaign? Only campaigns without linked leads can be deleted."
        confirmText="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={executeDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
