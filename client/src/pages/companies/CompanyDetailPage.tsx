import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { companiesApi, Company, CompanyMetrics, AssignedUser } from '../../api/companies';
import { Customer, Stage } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, switchCompany, activeCompany } = useAuth();

  const [company, setCompany] = useState<Company | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<CompanyMetrics | null>(null);
  const [users, setUsers] = useState<AssignedUser[]>([]);

  const [activeTab, setActiveTab] = useState<'overview' | 'settings'>('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Settings form state
  const [formData, setFormData] = useState({
    name: '',
    website: '',
    businessType: 'service',
    category: '',
    contactPerson: '',
    phone: '',
    email: '',
    instagram: '',
    location: '',
    status: 'active',
    healthStatus: 'healthy',
    monthlyPackage: 0,
    monthlyVideoTarget: 0,
    monthlyDesignTarget: 0,
    monthlyContentTarget: 0,
    monthlyLeadTarget: 0,
    sopDocumentLink: '',
    googleDriveFolderLink: '',
    notes: '',
    metaPixelId: '',
    ga4MeasurementId: '',
    accountOwner: '',
    assignedUsers: [] as string[],
  });

  useEffect(() => {
    if (id) {
      loadCompanyDetails(id);
    }
  }, [id]);

  async function loadCompanyDetails(companyId: string) {
    try {
      setLoading(true);
      setError('');
      const res = await companiesApi.get(companyId);
      setCompany(res.data);
      setCustomers(res.customers || []);
      setStages(res.stages || []);
      setCampaigns(res.campaigns || []);
      setActivities(res.activities || []);
      setMetrics(res.metrics || null);
      setUsers(res.users || []);

      setFormData({
        name: res.data.name || '',
        website: res.data.website || '',
        businessType: res.data.businessType || 'service',
        category: res.data.category || '',
        contactPerson: res.data.contactPerson || '',
        phone: res.data.phone || '',
        email: res.data.email || '',
        instagram: res.data.instagram || '',
        location: res.data.location || '',
        status: res.data.status || 'active',
        healthStatus: res.data.healthStatus || 'healthy',
        monthlyPackage: res.data.monthlyPackage || 0,
        monthlyVideoTarget: res.data.monthlyVideoTarget || 0,
        monthlyDesignTarget: res.data.monthlyDesignTarget || 0,
        monthlyContentTarget: res.data.monthlyContentTarget || 0,
        monthlyLeadTarget: res.data.monthlyLeadTarget || 0,
        sopDocumentLink: res.data.sopDocumentLink || '',
        googleDriveFolderLink: res.data.googleDriveFolderLink || '',
        notes: res.data.notes || '',
        metaPixelId: res.data.metaPixelId || '',
        ga4MeasurementId: res.data.ga4MeasurementId || '',
        accountOwner: res.data.accountOwner?._id || '',
        assignedUsers: (res.data.assignedUsers || []).map((u: any) => u._id || u),
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load company details');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    try {
      setSaving(true);
      setError('');
      const res = await companiesApi.update(id, formData);
      setCompany(res.data);
      setSuccess('Company settings updated successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to update company');
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerateApiKey() {
    if (!id || !window.confirm('Regenerate inbound API key? The old key will stop working.')) return;
    try {
      const res = await companiesApi.regenerateApiKey(id);
      setCompany(prev => (prev ? { ...prev, apiKey: res.apiKey } : null));
      setSuccess('Inbound API key regenerated.');
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate API key');
    }
  }

  if (loading) {
    return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading company details...</div>;
  }

  if (!company) {
    return (
      <div className="page-container" style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Company not found</h2>
        <Link to="/companies" className="btn primary" style={{ marginTop: '1rem' }}>
          Back to Workspaces
        </Link>
      </div>
    );
  }

  const isCurrentActive = activeCompany?._id === company._id;

  return (
    <div className="page-container">
      {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="notice success" style={{ marginBottom: '1rem' }}>{success}</div>}

      {/* Breadcrumbs */}
      <div className="breadcrumbs" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted)' }}>
        <Link to="/companies" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
          CRM Workspaces
        </Link>
        <span>/</span>
        <span style={{ color: 'var(--text)' }}>{company.name}</span>
      </div>

      {/* Header */}
      <section className="page-head" style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '12px',
              background: 'var(--teal, #0f766e)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.4rem',
            }}
          >
            {company.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{company.name}</h1>
              <span className="stage-badge" style={{ backgroundColor: company.status === 'active' ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)', color: '#fff', fontSize: '0.62rem', padding: '2px 6px' }}>
                {company.status.toUpperCase()}
              </span>
              <span className="stage-badge" style={{ backgroundColor: company.healthStatus === 'at-risk' ? 'var(--red, #dc2626)' : company.healthStatus === 'watch' ? 'var(--gold, #b58d00)' : 'var(--green, #16a34a)', color: '#fff', fontSize: '0.62rem', padding: '2px 6px' }}>
                {(company.healthStatus || 'healthy').toUpperCase()}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
              {company.website ? (
                <a href={company.website} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>
                  {company.website}
                </a>
              ) : (
                'No website URL configured'
              )}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {!isCurrentActive && (
            <button
              type="button"
              className="btn primary"
              onClick={() => switchCompany(company._id)}
            >
              Switch to this CRM
            </button>
          )}
          <Link to="/customers" className="btn outline">
            View Leads
          </Link>
        </div>
      </section>

      {/* Tabs */}
      <nav className="team-tabs" style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)' }}>
        <button
          type="button"
          className={`btn small ${activeTab === 'overview' ? 'primary' : 'outline'}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          className={`btn small ${activeTab === 'settings' ? 'primary' : 'outline'}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings & API
        </button>
      </nav>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div>
          {/* Metrics Grid */}
          {metrics && (
            <section className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Total Leads</span>
                <strong style={{ fontSize: '1.25rem' }}>{metrics.totalLeads}</strong>
              </div>
              <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Win Rate</span>
                <strong style={{ fontSize: '1.25rem' }}>{metrics.conversionRate || 0}%</strong>
              </div>
              <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Pipeline Value</span>
                <strong style={{ fontSize: '1.25rem', color: 'var(--teal)' }}>₹{metrics.pipelineValue.toLocaleString('en-IN')}</strong>
              </div>
              <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Won Revenue</span>
                <strong style={{ fontSize: '1.25rem', color: 'var(--gold)' }}>₹{metrics.wonRevenue.toLocaleString('en-IN')}</strong>
              </div>
              <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Active Campaigns</span>
                <strong style={{ fontSize: '1.25rem' }}>{metrics.activeCampaigns}</strong>
              </div>
            </section>
          )}

          {/* Quick Info & Recent Activity */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
            <article className="profile-panel" style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)' }}>
              <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Workspace Profile</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '1rem', fontSize: '0.85rem' }}>
                <div><strong>Category:</strong> {company.category || 'N/A'}</div>
                <div><strong>Contact:</strong> {company.contactPerson || 'N/A'} {company.phone ? `(${company.phone})` : ''}</div>
                <div><strong>Email:</strong> {company.email || 'N/A'}</div>
                <div><strong>Location:</strong> {company.location || 'N/A'}</div>
                <div><strong>Monthly Package:</strong> ₹{(company.monthlyPackage || 0).toLocaleString('en-IN')}</div>
                <div><strong>Monthly Targets:</strong> {company.monthlyLeadTarget || 0} leads · {company.monthlyVideoTarget || 0} videos · {company.monthlyDesignTarget || 0} designs</div>
                <div>
                  <strong>Collaborators:</strong>{' '}
                  {company.assignedUsers && company.assignedUsers.length > 0
                    ? company.assignedUsers.map(u => u.name).join(', ')
                    : 'All team members / unassigned'}
                </div>
              </div>
            </article>

            <article className="profile-panel" style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)' }}>
              <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Recent Activities</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem', maxHeight: '300px', overflowY: 'auto' }}>
                {activities.length === 0 ? (
                  <p className="empty" style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No recent activities</p>
                ) : (
                  activities.slice(0, 8).map(act => (
                    <div key={act._id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                      <strong style={{ fontSize: '0.85rem' }}>{act.user?.name || 'System'}:</strong> <span style={{ fontSize: '0.85rem' }}>{act.note || act.type}</span>
                      <small style={{ display: 'block', color: 'var(--muted)', fontSize: '0.72rem' }}>
                        {new Date(act.createdAt).toLocaleString()}
                      </small>
                    </div>
                  ))
                )}
              </div>
            </article>
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} style={{ maxWidth: '800px' }}>
          <article className="profile-panel" style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', marginBottom: '1.5rem' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.1rem', marginBottom: '1rem' }}>Company Details</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Company Name *
                <input
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Website
                <input
                  type="url"
                  value={formData.website}
                  onChange={e => setFormData({ ...formData, website: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Contact Person
                <input
                  value={formData.contactPerson}
                  onChange={e => setFormData({ ...formData, contactPerson: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Phone Number
                <input
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Status
                <select
                  value={formData.status}
                  onChange={e => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="active">Active</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Health Status
                <select
                  value={formData.healthStatus}
                  onChange={e => setFormData({ ...formData, healthStatus: e.target.value })}
                >
                  <option value="healthy">Healthy</option>
                  <option value="watch">Watch</option>
                  <option value="at-risk">At Risk</option>
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Account Owner
                <select
                  value={formData.accountOwner}
                  onChange={e => setFormData({ ...formData, accountOwner: e.target.value })}
                >
                  <option value="">Unassigned</option>
                  {users.map(u => (
                    <option key={u._id} value={u._id}>{u.name} ({u.role || 'agent'})</option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)', marginBottom: '0.5rem' }}>
                Assigned Team Collaborators
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {users.map(u => {
                  const isAssigned = formData.assignedUsers.includes(u._id);
                  return (
                    <button
                      key={u._id}
                      type="button"
                      className={`btn small ${isAssigned ? 'primary' : 'outline'}`}
                      onClick={() => {
                        const next = isAssigned
                          ? formData.assignedUsers.filter(uid => uid !== u._id)
                          : [...formData.assignedUsers, u._id];
                        setFormData({ ...formData, assignedUsers: next });
                      }}
                    >
                      {isAssigned ? '✓ ' : '+ '} {u.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </article>

          {/* Inbound API & Tracking */}
          <article className="profile-panel" style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', marginBottom: '1.5rem' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.1rem', marginBottom: '1rem' }}>Tracking & Inbound API</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Meta Pixel ID
                <input
                  placeholder="e.g. 123456789012345"
                  value={formData.metaPixelId}
                  onChange={e => setFormData({ ...formData, metaPixelId: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                GA4 Measurement ID
                <input
                  placeholder="e.g. G-XXXXXXXXXX"
                  value={formData.ga4MeasurementId}
                  onChange={e => setFormData({ ...formData, ga4MeasurementId: e.target.value })}
                />
              </label>
            </div>

            <div style={{ background: 'var(--bg-soft, rgba(255,255,255,0.03))', padding: '1rem', borderRadius: '8px' }}>
              <strong style={{ fontSize: '0.85rem' }}>Inbound API Key:</strong>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                <code style={{ background: 'var(--surface)', padding: '0.4rem 0.6rem', borderRadius: '4px', flex: 1, fontSize: '0.85rem' }}>
                  {company.apiKey || 'No API key generated'}
                </code>
                <button
                  type="button"
                  className="btn small outline"
                  onClick={handleRegenerateApiKey}
                >
                  Regenerate
                </button>
              </div>
            </div>
          </article>

          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Company Settings'}
          </button>
        </form>
      )}
    </div>
  );
}
