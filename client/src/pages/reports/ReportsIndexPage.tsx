import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { reportsApi, ReportsIndexResponse } from '../../api/reports';
import { useAuth } from '../../contexts/AuthContext';

const NAMED_REPORTS = [
  ['agent-performance', 'Agent Performance'],
  ['follow-up-compliance', 'Follow-up Compliance'],
  ['stale-leads', 'Stale Leads Report'],
  ['source-attribution', 'Source Attribution'],
  ['work-modules', 'Work Module Report'],
];

const GROUP_OPTIONS: [string, string][] = [
  ['stage', 'Stage'],
  ['agent', 'Agent'],
  ['source', 'Lead source'],
  ['campaign', 'Campaign'],
  ['company', 'Company'],
];

const METRIC_OPTIONS: [string, string][] = [
  ['leads', 'Lead count'],
  ['active', 'Active leads'],
  ['won', 'Won leads'],
  ['lost', 'Lost leads'],
  ['pipelineValue', 'Pipeline value'],
  ['wonRevenue', 'Won revenue'],
  ['winRate', 'Win rate'],
];

export default function ReportsIndexPage() {
  const { crmTerms } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<ReportsIndexResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [groupBy, setGroupBy] = useState('stage');
  const [metrics, setMetrics] = useState<string[]>(['leads', 'active', 'won', 'lost']);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    let active = true;
    reportsApi.index().then(res => { if (active) setData(res); }).catch((e: any) => { if (active) setError(e.message || 'Failed to load reports'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading && !data) return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading reports...</div>;
  if (error) return <div className="page-container"><div className="auth-error">{error}</div></div>;

  const recordSingular = crmTerms.recordSingular || 'Lead';
  const recordPlural = crmTerms.recordPlural || 'Leads';
  const pipelineName = crmTerms.pipelineName || 'Pipeline';
  const firstModuleId = data?.reportWorkTypes?.[0]?._id || '';

  const descriptions: Record<string, string> = {
    'agent-performance': `${recordSingular} volume, active ${pipelineName.toLowerCase()}, won/lost count, revenue, and win rate by team member.`,
    'follow-up-compliance': 'Missing, scheduled, and overdue follow-up visibility across the sales floor.',
    'stale-leads': `Open ${recordPlural.toLowerCase()} with no recent contact, sorted by longest stale age.`,
    'source-attribution': `${recordSingular}, won revenue, and win-rate breakdown by source and UTM fields.`,
    'work-modules': 'Export any custom module with its own statuses, assignees, dates, and custom fields.',
  };

  function toggleMetric(value: string) {
    setMetrics(prev => prev.includes(value) ? prev.filter(m => m !== value) : [...prev, value]);
  }

  function generateCustom(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams({ groupBy });
    metrics.forEach(m => params.append('metrics', m));
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    navigate(`/reports/custom?${params.toString()}`);
  }

  return (
    <div className="page-container">
      <section className="page-head">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Reporting Center</h1>
          <p className="page-subtitle">Operational reports for sales performance, follow-up quality, stale pipeline, and source attribution.</p>
        </div>
      </section>

      <section className="module-report-entry">
        <div>
          <strong>Generic module report builder</strong>
          <span>Group any custom module, apply filters, calculate COUNT/SUM/AVG/MIN/MAX formulas, visualize results, and save or export the report.</span>
        </div>
        <Link className="btn primary" to={`/reports/module-builder${firstModuleId ? `?module=${firstModuleId}` : ''}`}>Build module report</Link>
      </section>

      {data && data.savedReports.length > 0 && (
        <section className="saved-report-links">
          <h2>My saved module reports</h2>
          <div>
            {data.savedReports.map(report => (
              <Link key={report._id} to={`/reports/module-builder?saved=${report._id}`}>
                <strong>{report.name}</strong>
                <span>Open saved report</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="report-grid">
        {NAMED_REPORTS.map(item => (
          <article key={item[0]} className="metric-card report-card">
            <div>
              <span>{item[1]}</span>
              <p>{descriptions[item[0]]}</p>
            </div>
            <Link className="btn primary" to={`/reports/${item[0]}`}>Open Report</Link>
          </article>
        ))}
      </section>

      <details className="custom-report-addon">
        <summary>
          <span><strong>Need something specific?</strong><small>Build a custom report with your own grouping and metrics.</small></span>
          <b>Build custom report</b>
        </summary>
        <form className="report-builder custom-report-builder" onSubmit={generateCustom}>
          <header>
            <div><strong>Custom report</strong><span>Choose how to group the data and exactly which numbers to include.</span></div>
            <button className="btn primary" type="submit">Generate report</button>
          </header>
          <fieldset>
            <legend>Group results by</legend>
            <div className="report-choice-grid">
              {GROUP_OPTIONS.map(([value, label], index) => (
                <label key={value} className="report-choice">
                  <input type="radio" name="groupBy" value={value} checked={groupBy === value} onChange={() => setGroupBy(value)} />
                  <span><strong>{label}</strong><small>One row per {label.toLowerCase()}</small></span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Include metrics</legend>
            <div className="report-metric-grid">
              {METRIC_OPTIONS.map(([value, label], index) => (
                <label key={value} className="report-metric">
                  <input type="checkbox" name="metrics" value={value} checked={metrics.includes(value)} onChange={() => toggleMetric(value)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="report-builder-dates">
            <label className="date-field"><span>Start date</span><input type="date" aria-label="Start date" value={dateFrom} onChange={(e: ChangeEvent<HTMLInputElement>) => setDateFrom(e.target.value)} /></label>
            <label className="date-field"><span>End date</span><input type="date" aria-label="End date" value={dateTo} onChange={(e: ChangeEvent<HTMLInputElement>) => setDateTo(e.target.value)} /></label>
          </div>
        </form>
      </details>
    </div>
  );
}
