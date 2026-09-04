import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  clientDashboardApi,
  ClientCampaignReport,
  ClientPortalCompany,
  ClientWorkItem,
  ClientPortalCustomer,
  ClientDashboardMetrics,
} from '../../api/clientDashboard';

export default function ClientDashboardPage() {
  const { user, activeCompany, crmTerms } = useAuth();

  const recordPlural = crmTerms?.recordPlural || 'Records';
  const recordSingular = crmTerms?.recordSingular || 'Record';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [company, setCompany] = useState<ClientPortalCompany | null>(null);
  const [companies, setCompanies] = useState<{ _id: string; name: string }[]>([]);
  const [campaigns, setCampaigns] = useState<ClientCampaignReport[]>([]);
  const [customers, setCustomers] = useState<ClientPortalCustomer[]>([]);
  const [clientWork, setClientWork] = useState<ClientWorkItem[]>([]);
  const [metrics, setMetrics] = useState<ClientDashboardMetrics | null>(null);
  const [filters, setFilters] = useState<{ company: string; dateFrom: string; dateTo: string }>({
    company: '',
    dateFrom: '',
    dateTo: '',
  });
  const [monthInput, setMonthInput] = useState(() => new Date().toISOString().slice(0, 7));

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard(params?: { company?: string; dateFrom?: string; dateTo?: string }) {
    try {
      setLoading(true);
      setError('');
      const res = await clientDashboardApi.get(params || {});
      setCompany(res.company);
      setCompanies(res.companies);
      setCampaigns(res.campaigns);
      setCustomers(res.customers);
      setClientWork(res.clientWork);
      setMetrics(res.metrics);
      setFilters({
        company: res.filters.company,
        dateFrom: res.filters.dateFrom || '',
        dateTo: res.filters.dateTo || '',
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load client dashboard');
    } finally {
      setLoading(false);
    }
  }

  function handleCompanySwitch(companyId: string) {
    loadDashboard({ company: companyId, dateFrom: filters.dateFrom, dateTo: filters.dateTo });
  }

  function handleDateFilter(e: React.FormEvent) {
    e.preventDefault();
    loadDashboard({ company: filters.company, dateFrom: filters.dateFrom, dateTo: filters.dateTo });
  }

  function handleResetDates() {
    loadDashboard({ company: filters.company });
  }

  async function handleExportCsv() {
    if (!company) return;
    try {
      await clientDashboardApi.exportCsv({
        company: company._id,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      });
    } catch (err: any) {
      setError(err.message || 'CSV export failed');
    }
  }

  async function handleExportPdf() {
    if (!company) return;
    try {
      await clientDashboardApi.exportPdf({
        company: company._id,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      });
    } catch (err: any) {
      setError(err.message || 'PDF export failed');
    }
  }

  async function handleDownloadMonthly(e: React.FormEvent) {
    e.preventDefault();
    if (!company) return;
    try {
      await clientDashboardApi.exportPdf({
        company: company._id,
        month: monthInput,
      });
    } catch (err: any) {
      setError(err.message || 'Monthly package download failed');
    }
  }

  if (loading && !company) {
    return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading client portal...</div>;
  }

  return (
    <div className="page-container">
      <section className="page-head">
        <div>
          <p className="eyebrow">Client Portal</p>
          <h1 style={{ margin: '0.2rem 0' }}>{company ? company.name : 'Client'} Reporting Dashboard</h1>
        </div>
        <div className="actions" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {company && (
            <>
              <button className="btn" onClick={handleExportCsv}>Export CSV</button>
              <button className="btn primary" onClick={handleExportPdf}>Export PDF Package</button>
            </>
          )}
          {companies.length > 1 && (
            <select
              className="client-dashboard-company-filter"
              value={filters.company}
              onChange={e => handleCompanySwitch(e.target.value)}
            >
              {companies.map(item => (
                <option key={item._id} value={item._id}>{item.name}</option>
              ))}
            </select>
          )}
        </div>
      </section>

      {company && (
        <>
          <form className="filter-bar client-dashboard-filter-bar" onSubmit={handleDateFilter} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input type="hidden" name="company" value={company._id} />
            <input
              type="date"
              value={filters.dateFrom}
              onChange={e => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
            />
            <input
              type="date"
              value={filters.dateTo}
              onChange={e => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
            />
            <button type="submit" className="btn">Apply</button>
            <button type="button" className="btn" onClick={handleResetDates}>Reset Dates</button>
          </form>
          <form className="filter-bar client-dashboard-filter-bar" onSubmit={handleDownloadMonthly} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input type="hidden" name="company" value={company._id} />
            <input
              className="client-dashboard-month-input"
              type="month"
              value={monthInput}
              onChange={e => setMonthInput(e.target.value)}
            />
            <button className="btn primary" type="submit">Download Monthly Package</button>
          </form>
        </>
      )}

      {error && <div className="auth-error client-dashboard-error">{error}</div>}

      {company && metrics ? (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <p>Total {recordPlural}</p>
              <strong>{metrics.totalLeads}</strong>
              <span>All-time ingested profiles</span>
            </div>
            <div className="stat-card">
              <p>Active Pipeline</p>
              <strong>{metrics.activeCount}</strong>
              <span>Open {recordPlural.toLowerCase()} in progress</span>
            </div>
            <div className="stat-card">
              <p>Conversion Rate</p>
              <strong>{metrics.winRate}%</strong>
              <span>Won {recordPlural.toLowerCase()} over total {recordPlural.toLowerCase()}</span>
            </div>
            <div className="stat-card">
              <p>Won Revenue</p>
              <strong>Rs. {metrics.wonValue.toLocaleString('en-IN')}</strong>
              <span>Accumulated converted value</span>
            </div>
            <div className="stat-card">
              <p>Ad Spend</p>
              <strong>Rs. {metrics.spend.toLocaleString('en-IN')}</strong>
              <span>Tracked campaign spend</span>
            </div>
            <div className="stat-card">
              <p>Cost per {recordSingular}</p>
              <strong>Rs. {Math.round(metrics.costPerLead).toLocaleString('en-IN')}</strong>
              <span>Spend divided by {recordPlural.toLowerCase()}</span>
            </div>
          </div>

          <div className="client-dashboard-grid">
            <div className="profile-panel">
              <div className="section-title-row">
                <div>
                  <h2>Marketing Campaigns</h2>
                  <p>Spend and {recordSingular.toLowerCase()} volume visible to this workspace.</p>
                </div>
              </div>
              <div className="table-card embedded-table">
                <table className="client-dashboard-compact-table">
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th>Platform</th>
                      <th>Status</th>
                      <th>Spent</th>
                      <th>CPL</th>
                      <th>Ingested {recordPlural}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.length > 0 ? (
                      campaigns.map(c => (
                        <tr key={c._id}>
                          <td><strong>{c.name}</strong></td>
                          <td>{c.platform}</td>
                          <td>
                            <span className="pill" style={{ '--pill': c.status === 'active' ? 'var(--green)' : 'var(--muted)' } as React.CSSProperties}>
                              {c.status.toUpperCase()}
                            </span>
                          </td>
                          <td>Rs. {c.spent.toLocaleString('en-IN')}</td>
                          <td>Rs. {Math.round(c.reportMetrics.costPerLead).toLocaleString('en-IN')}</td>
                          <td className="table-cell-strong">{c.reportMetrics.totalLeads}</td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={6} className="table-empty-state">No campaign details linked.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="profile-panel">
              <div className="section-title-row">
                <div>
                  <h2>Account Setup</h2>
                  <p>Read-only client company configuration.</p>
                </div>
              </div>
              <div className="client-config-list">
                <div>
                  <label>Website</label>
                  {company.website ? (
                    <a href={company.website} target="_blank" rel="noreferrer">{company.website}</a>
                  ) : (
                    <span>N/A</span>
                  )}
                </div>
                <div>
                  <label>Meta Pixel ID</label>
                  <span>{(company as any).metaPixelId || 'Not set'}</span>
                </div>
                <div>
                  <label>GA4 Measurement ID</label>
                  <span>{(company as any).ga4MeasurementId || 'Not set'}</span>
                </div>
              </div>
            </div>
          </div>

          {clientWork.length > 0 && (
            <section className="client-work-section">
              <div className="section-title-row">
                <div>
                  <h2>Work progress</h2>
                  <p>Parent-level delivery progress. Internal assignments and notes remain private.</p>
                </div>
              </div>
              <div className="client-work-grid">
                {clientWork.map((task, idx) => (
                  <article key={idx}>
                    <header>
                      <strong>{task.title}</strong>
                      <span>{task.status}</span>
                    </header>
                    {task.progress != null ? (
                      <>
                        <div className="client-work-progress">
                          <span style={{ width: `${task.progress}%` }} />
                        </div>
                        <p><b>{task.progress}%</b><small>{task.completed} of {task.total} steps completed</small></p>
                      </>
                    ) : (
                      <p><small>Progress follows the parent task status.</small></p>
                    )}
                    <footer>{task.deadline ? `Due ${new Date(task.deadline).toLocaleDateString('en-IN')}` : 'No deadline published'}</footer>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="section-title-row">
              <div>
                <h2>Recent {recordPlural}</h2>
                <p>Latest {recordSingular.toLowerCase()} profiles in this workspace.</p>
              </div>
            </div>
            <div className="table-card">
              <table className="client-dashboard-records-table">
                <thead>
                  <tr>
                    <th>Date Ingested</th>
                    <th>{recordSingular} name</th>
                    <th>{recordSingular} source</th>
                    <th>Campaign Attribution</th>
                    <th>Current Stage Status</th>
                    <th>Estimated Deal Value</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.length > 0 ? (
                    customers.slice(0, 15).map(lead => (
                      <tr key={lead._id}>
                        <td className="table-cell-muted">{lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('en-IN') : ''}</td>
                        <td><strong>{lead.name}</strong></td>
                        <td>{lead.source || ''}</td>
                        <td>{lead.campaign ? (lead.campaign.name || 'Linked Campaign') : 'Organic / Direct'}</td>
                        <td>
                          <span className="pill" style={{ '--pill': lead.stage ? lead.stage.color : 'var(--muted)' } as React.CSSProperties}>
                            {lead.stage ? lead.stage.name : 'Intake'}
                          </span>
                        </td>
                        <td className="table-cell-value">Rs. {(lead.value || 0).toLocaleString('en-IN')}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={6} className="table-empty-state">No {recordPlural.toLowerCase()} logged in this workspace yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : !error && !company ? (
        <p className="client-dashboard-empty">No workspace matches your account profile. Please contact the administrator.</p>
      ) : null}
    </div>
  );
}