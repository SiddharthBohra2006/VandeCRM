import { useState, useEffect } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { reportsApi, Report } from '../../api/reports';

function formatCell(column: string, value: any) {
  if (typeof value === 'number' && /value|revenue/i.test(column)) {
    return `Rs. ${value.toLocaleString('en-IN')}`;
  }
  return value ?? '';
}

export default function ReportTablePage() {
  const { reportKey } = useParams<{ reportKey: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');

  const key = reportKey || '';

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      const params: Record<string, string> = {};
      searchParams.forEach((value, name) => { params[name] = value; });
      try {
        const res = await reportsApi.report(key, params);
        if (active) { setReport(res.report); }
      } catch (err: any) {
        if (active) setError(err.message || 'Failed to load report');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [key, searchParams.toString()]);

  function currentParams(): Record<string, string> {
    const params: Record<string, string> = {};
    searchParams.forEach((value, name) => { params[name] = value; });
    return params;
  }

  function setFilter(name: string, value: string) {
    const p = new URLSearchParams(searchParams);
    if (value) p.set(name, value); else p.delete(name);
    navigate(`/reports/${key}?${p.toString()}`);
  }

  async function handleExport(kind: 'csv' | 'pdf') {
    setExporting(kind);
    try {
      if (kind === 'csv') await reportsApi.exportCsv(key, currentParams());
      else await reportsApi.exportPdf(key, currentParams());
    } catch (err: any) {
      setError(err.message || `Export failed`);
    } finally {
      setExporting('');
    }
  }

  if (loading && !report) return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading report...</div>;
  if (error) return <div className="page-container"><div className="auth-error">{error}</div></div>;

  const filters = report?.filters;
  const isWorkModules = key === 'work-modules';
  const showsAgent = key === 'agent-performance' || key === 'follow-up-compliance' || key === 'stale-leads';
  const showsCampaign = key === 'agent-performance' || key === 'source-attribution';
  const showsStaleDays = key === 'stale-leads';
  const cols = report?.columns || [];

  const selectStyle: React.CSSProperties = { height: 38, lineHeight: '36px', border: '1px solid var(--border)', borderRadius: 8, fontSize: '.82rem', fontWeight: 700, color: 'var(--text)', background: 'var(--panel)', padding: '0 10px' };

  return (
    <div className="page-container">
      <section className="page-head">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>{report?.title}</h1>
          <p className="page-subtitle">{report?.rows.length || 0} rows for the selected filters.</p>
        </div>
        <div className="actions table-actions">
          <Link className="btn secondary outline" to="/reports">All Reports</Link>
          <button className="btn secondary outline" onClick={() => handleExport('csv')} disabled={exporting === 'csv'}>{exporting === 'csv' ? 'Exporting...' : 'Export CSV'}</button>
          <button className="btn primary" onClick={() => handleExport('pdf')} disabled={exporting === 'pdf'}>{exporting === 'pdf' ? 'Exporting...' : 'Export PDF'}</button>
        </div>
      </section>

      <form className="filter-bar" onSubmit={e => e.preventDefault()} style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <select style={selectStyle} value={searchParams.get('clientCompany') || ''} onChange={e => setFilter('clientCompany', e.target.value)}>
          <option value="">All client companies</option>
          {(filters?.companies || []).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>

        {isWorkModules && (
          <select style={selectStyle} value={searchParams.get('module') || report?.selectedWorkType?.key || ''} onChange={e => setFilter('module', e.target.value)}>
            {(filters?.workTypes || []).map(wt => <option key={wt.key} value={wt.key}>{wt.name}</option>)}
          </select>
        )}

        {showsAgent && (
          <select style={selectStyle} value={searchParams.get('agent') || ''} onChange={e => setFilter('agent', e.target.value)}>
            <option value="">All agents</option>
            {(filters?.agents || []).map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
          </select>
        )}

        {showsCampaign && (
          <select style={selectStyle} value={searchParams.get('campaign') || ''} onChange={e => setFilter('campaign', e.target.value)}>
            <option value="">All campaigns</option>
            {(filters?.campaigns || []).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        )}

        {showsStaleDays && (
          <input type="number" min={1} style={{ ...selectStyle, width: 80 }} value={searchParams.get('staleDays') || report?.staleDays || 14} onChange={e => setFilter('staleDays', e.target.value)} />
        )}

        <label className="date-field"><span>Start date</span><input type="date" aria-label="Start date" value={searchParams.get('dateFrom') || ''} onChange={e => setFilter('dateFrom', e.target.value)} /></label>
        <label className="date-field"><span>End date</span><input type="date" aria-label="End date" value={searchParams.get('dateTo') || ''} onChange={e => setFilter('dateTo', e.target.value)} /></label>
        <a className="btn" href={`/reports/${key}`} onClick={e => { e.preventDefault(); navigate(`/reports/${key}`); }}>Reset</a>
      </form>

      <section className="table-card">
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {cols.map(col => <th key={col} style={{ padding: '.75rem 1rem', fontSize: '.78rem', color: 'var(--muted)' }}>{col}</th>)}
            </tr>
          </thead>
          <tbody>
            {(report?.rows || []).length === 0 && (
              <tr><td colSpan={cols.length || 1} className="empty" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted)' }}>No rows matched this report.</td></tr>
            )}
            {(report?.rows || []).map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                {cols.map(col => <td key={col} style={{ padding: '.75rem 1rem', fontSize: '.85rem' }}>{formatCell(col, row[col])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
