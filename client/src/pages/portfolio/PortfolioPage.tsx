import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { portfolioApi, PortfolioResponse } from '../../api/portfolio';

function formatIn(value: number) {
  return Number(value || 0).toLocaleString('en-IN');
}

function initials(name: string) {
  return name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function PortfolioPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const detail = searchParams.get('detail') || '';
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await portfolioApi.list(detail ? { detail } : {});
        if (active) setData(res);
      } catch (err: any) {
        if (active) setError(err.message || 'Failed to load portfolio');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [detail]);

  const detailTitle = detail === 'leads'
    ? 'Records'
    : detail === 'work'
      ? 'Open work'
      : data?.workLibrary.find(item => String(item._id) === detail)?.name || 'Work items';

  if (loading && !data) return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading portfolio...</div>;

  if (error) return <div className="page-container"><div className="auth-error">{error}</div></div>;

  const kpis = [
    { href: '/portfolio?detail=leads', active: detail === 'leads', label: 'Total records', value: data?.totals.leads || 0, sub: 'Across all workspaces', numeric: true },
    { href: '/portfolio', active: detail === '', label: 'Pipeline value', value: data?.totals.value || 0, sub: 'Combined record value', currency: true },
    { href: '/portfolio?detail=work', active: detail === 'work', label: 'Open work', value: data?.totals.openWork || 0, sub: 'Needs team attention', numeric: true },
    { href: '/portfolio', active: false, label: 'Active CRMs', value: data?.totals.crms || 0, sub: 'Connected workspaces', numeric: true },
  ];

  return (
    <div className="page-container">
      <section className="page-head portfolio-head">
        <div>
          <p className="eyebrow">Organization overview</p>
          <h1>All CRMs</h1>
          <p className="page-subtitle">One clean view of every CRM, with source labels on every record.</p>
        </div>
        <div className="actions">
          <span className="portfolio-main-label">Main: <strong>{data?.mainCompanyName}</strong></span>
          <Link className="btn" to="/companies">Manage CRMs</Link>
        </div>
      </section>

      <section className="portfolio-kpis">
        {kpis.map(kpi => (
          <Link
            key={kpi.label}
            to={kpi.href}
            className={`portfolio-kpi ${kpi.active ? 'active' : ''}`}
          >
            <span>{kpi.label}</span>
            <strong>{kpi.currency ? `₹${formatIn(kpi.value)}` : formatIn(kpi.value)}</strong>
            <small>{kpi.sub}</small>
          </Link>
        ))}
      </section>

      {data && data.workLibrary.length > 0 && (
        <nav className="portfolio-work-nav" aria-label="Combined work">
          <span>Work library</span>
          {data.workLibrary.map(item => (
            <Link
              key={String(item._id)}
              className={detail === String(item._id) ? 'active' : ''}
              to={`/portfolio?detail=${item._id}`}
            >
              <span>{item.name} · {item.company}</span>
              <strong>{item.count}</strong>
            </Link>
          ))}
        </nav>
      )}

      <div className="portfolio-section-title">
        <div>
          <p className="eyebrow">Workspaces</p>
          <h2>CRM performance</h2>
        </div>
        <span>{data?.totals.crms || 0} active</span>
      </div>

      <section className="portfolio-grid">
        {data?.perCrm.map(item => (
          <article key={item.company._id} className={`portfolio-crm ${item.company.isMain ? 'main' : ''}`}>
            <header>
              <div className="portfolio-crm-identity">
                <span className="portfolio-crm-avatar">{initials(item.company.name)}</span>
                <div>
                  <span>{item.company.isMain ? 'MAIN CRM' : (item.company.businessType || 'service').toUpperCase()}</span>
                  <h2>{item.company.name}</h2>
                </div>
              </div>
            </header>
            <dl>
              <div><dt>Records</dt><dd>{formatIn(item.leads)}</dd></div>
              <div><dt>Pipeline</dt><dd>₹{formatIn(item.value)}</dd></div>
              <div><dt>Open work</dt><dd>{formatIn(item.openWork)}</dd></div>
              <div><dt>Modules</dt><dd>{item.moduleCounts.length}</dd></div>
            </dl>
            <footer>
              <span>{item.company.category || 'Uncategorized business'}</span>
              <Link to={`/companies/${item.company._id}`}>Settings →</Link>
            </footer>
          </article>
        ))}
      </section>

      {detail && (
        <section className="business-panel portfolio-detail">
          <div className="panel-title-row">
            <div>
              <p className="eyebrow">Drill-down</p>
              <h2>{detailTitle}</h2>
            </div>
            <Link className="btn small" to="/portfolio">Close</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>CRM</th><th>Name</th><th>Status / Stage</th><th>Value / Deadline</th>
                </tr>
              </thead>
              <tbody>
                {detail === 'leads' && (data?.detailLeads || []).map(item => (
                  <tr key={item._id}>
                    <td><span className="crm-source">{item.clientCompany?.name || 'Unassigned'}</span></td>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.stage?.name || 'No stage'}</td>
                    <td>₹{formatIn(item.value || 0)}</td>
                  </tr>
                ))}
                {(data?.visibleWork || []).map(item => (
                  <tr key={item._id}>
                    <td><span className="crm-source">{item.clientCompany?.name || 'Unassigned'}</span></td>
                    <td><strong>{item.title}</strong><small>{item.workType?.name || ''}</small></td>
                    <td>{(item.status || '').replaceAll('_', ' ')}</td>
                    <td>{item.deadline ? new Date(item.deadline).toLocaleDateString('en-IN') : 'No deadline'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {detail === '' && (data?.visibleWork || []).length > 0 && (
        <section className="business-panel portfolio-detail">
          <div className="panel-title-row">
            <div><p className="eyebrow">Combined</p><h2>Open work</h2></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>CRM</th><th>Name</th><th>Status</th><th>Deadline</th></tr></thead>
              <tbody>
                {(data?.visibleWork || []).map(item => (
                  <tr key={item._id}>
                    <td><span className="crm-source">{item.clientCompany?.name || 'Unassigned'}</span></td>
                    <td><strong>{item.title}</strong></td>
                    <td>{(item.status || '').replaceAll('_', ' ')}</td>
                    <td>{item.deadline ? new Date(item.deadline).toLocaleDateString('en-IN') : 'No deadline'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
