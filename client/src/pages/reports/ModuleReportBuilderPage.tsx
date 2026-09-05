import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { reportsApi, ModuleReportBuilderResponse } from '../../api/reports';
import DatePicker from '../../components/DatePicker';

const CHART_COLORS = ['#b58d00', '#0f766e', '#2563eb', '#9333ea', '#e11d48', '#ea580c', '#0891b2', '#4f46e5'];

function formatNumber(value: any) {
  const num = Number(value);
  if (Number.isNaN(num)) return value ?? '';
  if (Number.isInteger(num)) return num.toLocaleString('en-IN');
  return num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export default function ModuleReportBuilderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<ModuleReportBuilderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [notice, setNotice] = useState('');
  const [showErrors, setShowErrors] = useState('');

  // Form state initialized from URL
  const [module, setModule] = useState(searchParams.get('module') || '');
  const [groupBy, setGroupBy] = useState(searchParams.get('groupBy') || 'status');
  const [chart, setChart] = useState(searchParams.get('chart') || 'bar');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [owner, setOwner] = useState(searchParams.get('owner') || '');
  const [filterField, setFilterField] = useState(searchParams.get('filterField') || '');
  const [filterValue, setFilterValue] = useState(searchParams.get('filterValue') || '');
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') || '');
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') || '');
  const [metrics, setMetrics] = useState<string[]>(searchParams.getAll('metrics').length ? searchParams.getAll('metrics') : ['count:*']);

  const config = { module, groupBy, chart, status, owner, filterField, filterValue, dateFrom, dateTo, metrics };

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      const params = buildParams(config);
      try {
        const res = await reportsApi.moduleBuilder(params);
        if (active) {
          setData(res);
          setModule(String(res.workType?._id || ''));
          setGroupBy(res.config.groupBy || 'status');
          setChart(res.config.chart || 'bar');
          setStatus(res.config.status || '');
          setOwner(res.config.owner || '');
          setFilterField(res.config.filterField || '');
          setFilterValue(res.config.filterValue || '');
          setDateFrom(res.config.dateFrom || '');
          setDateTo(res.config.dateTo || '');
          setMetrics(res.config.metrics || ['count:*']);
          setSaveName(res.saved?.name || '');
          setShowErrors(res.query.error || '');
          setNotice(res.query.success || '');
        }
      } catch (err: any) {
        if (active) setError(err.message || 'Failed to load module report');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [searchParams.toString(), reload]);

  function buildParams(cfg: typeof config): Record<string, string | string[]> {
    const params: Record<string, string | string[]> = {};
    if (cfg.module) params.module = cfg.module;
    if (cfg.groupBy) params.groupBy = cfg.groupBy;
    if (cfg.chart) params.chart = cfg.chart;
    if (cfg.status) params.status = cfg.status;
    if (cfg.owner) params.owner = cfg.owner;
    if (cfg.filterField) params.filterField = cfg.filterField;
    if (cfg.filterValue) params.filterValue = cfg.filterValue;
    if (cfg.dateFrom) params.dateFrom = cfg.dateFrom;
    if (cfg.dateTo) params.dateTo = cfg.dateTo;
    params.metrics = cfg.metrics;
    return params;
  }

  function toQuery(cfg: typeof config): string {
    const p = new URLSearchParams();
    if (cfg.module) p.set('module', cfg.module);
    if (cfg.groupBy) p.set('groupBy', cfg.groupBy);
    if (cfg.chart) p.set('chart', cfg.chart);
    if (cfg.status) p.set('status', cfg.status);
    if (cfg.owner) p.set('owner', cfg.owner);
    if (cfg.filterField) p.set('filterField', cfg.filterField);
    if (cfg.filterValue) p.set('filterValue', cfg.filterValue);
    if (cfg.dateFrom) p.set('dateFrom', cfg.dateFrom);
    if (cfg.dateTo) p.set('dateTo', cfg.dateTo);
    cfg.metrics.forEach(m => p.append('metrics', m));
    return p.toString();
  }

  function generateReport(e: FormEvent) {
    e.preventDefault();
    navigate(`/reports/module-builder?${toQuery(config)}`);
  }

  async function exportGrouped() {
    try {
      await reportsApi.exportModuleCsv(toQuery(config));
    } catch (err: any) { setError(err.message); }
  }

  async function exportRaw() {
    try {
      await reportsApi.exportModuleRawCsv(toQuery(config));
    } catch (err: any) { setError(err.message); }
  }

  async function saveReport(e: FormEvent) {
    e.preventDefault();
    if (!saveName.trim()) { setShowErrors('Enter a report name.'); return; }
    setSaving(true);
    try {
      const res = await reportsApi.saveModuleReport(saveName.trim(), config as any);
      setNotice('Report saved.');
      navigate(`/reports/module-builder?saved=${res.savedReport._id}`);
    } catch (err: any) {
      setShowErrors(err.message || 'Failed to save report');
    } finally {
      setSaving(false);
    }
  }

  async function deleteReport(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await reportsApi.deleteModuleReport(id);
      navigate('/reports/module-builder');
    } catch (err: any) { setShowErrors(err.message || 'Failed to delete report'); }
  }

  function metricOptions(): string[] {
    const workType = data?.workType;
    if (!workType) return ['count:*'];
    const tokens = ['count:*'];
    (data?.options.numeric || []).forEach(field => {
      const fieldKey = field.key.replace('custom:', '');
      ['sum', 'avg', 'min', 'max'].forEach(f => tokens.push(`${f}:${fieldKey}`));
    });
    return tokens;
  }

  function metricLabel(token: string): string {
    const [formula, field] = token.split(':', 2);
    if (formula === 'count') return 'COUNT of records';
    const numeric = data?.options.numeric.find(n => n.key === `custom:${field}`);
    return `${formula.toUpperCase()} of ${numeric?.label || field}`;
  }

  if (loading && !data) return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading module report builder...</div>;

  if (error) {
    return (
      <div className="page-container">
        <section className="page-head"><div><p className="eyebrow">Reports</p><h1>Custom Module Report Builder</h1><p className="page-subtitle">Group any module and calculate counts, totals, averages, minimums, or maximums from its numeric fields.</p></div><div className="actions"><Link className="btn" to="/reports">All reports</Link></div></section>
        <section className="table-card empty" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
          <strong style={{ display: 'block', fontSize: '1rem', color: 'var(--text)' }}>The module report builder could not be loaded.</strong>
          <p style={{ color: 'var(--sub)', fontSize: '.85rem', margin: '.5rem 0 1rem' }}>{error}</p>
          <div className="actions" style={{ justifyContent: 'center', gap: '.5rem' }}>
            <button className="btn primary" onClick={() => setReload(r => r + 1)}>Retry</button>
            <Link className="btn" to="/reports">All reports</Link>
          </div>
        </section>
      </div>
    );
  }

  if (!data?.workType) {
    return (
      <div className="page-container">
        <section className="page-head"><div><p className="eyebrow">Reports</p><h1>Custom Module Report Builder</h1><p className="page-subtitle">Group any module and calculate counts, totals, averages, minimums, or maximums from its numeric fields.</p></div><div className="actions"><Link className="btn" to="/reports">All reports</Link></div></section>
        <section className="table-card empty">Create a custom module before building a module report.</section>
      </div>
    );
  }

  const firstMetric = data.report.columns[1] || 'Record count';
  const maxValue = Math.max(0, ...data.report.rows.map(row => Number(row[firstMetric]) || 0));
  const groupLabel = data.options.groups.find(g => g.key === data.config.groupBy)?.label || '';
  const formulaTokens = metricOptions();

  let donutTotal = 0;
  let donutCursor = 0;
  const donutSegments: string[] = [];
  const donutRows = data.report.rows.slice(0, 8);
  donutRows.forEach((row, index) => {
    donutTotal += Math.max(0, Number(row[firstMetric]) || 0);
  });
  donutRows.forEach((row, index) => {
    const start = donutCursor;
    donutCursor += donutTotal ? Math.max(0, Number(row[firstMetric]) || 0) / donutTotal * 100 : 0;
    donutSegments.push(`${CHART_COLORS[index]} ${start}% ${donutCursor}%`);
  });

  return (
    <div className="page-container">
      <section className="page-head">
        <div><p className="eyebrow">Reports</p><h1>Custom Module Report Builder</h1><p className="page-subtitle">Group any module and calculate counts, totals, averages, minimums, or maximums from its numeric fields.</p></div>
        <div className="actions"><Link className="btn" to="/reports">All reports</Link></div>
      </section>
      {notice && <div className="notice success">{notice}</div>}
      {showErrors && <div className="notice danger">{showErrors}</div>}

      <form id="moduleReportBuilder" className="module-report-builder" onSubmit={generateReport}>
        <label>Module
          <select name="module" value={module} onChange={e => { setModule(e.target.value); navigate(`/reports/module-builder?module=${e.target.value}`); }}>
            {(data.workTypes || []).map(item => <option key={String(item._id)} value={String(item._id)}>{item.name}</option>)}
          </select>
        </label>
        <label>Group by
          <select name="groupBy" value={groupBy} onChange={e => setGroupBy(e.target.value)}>
            {data.options.groups.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </label>
        <label>Chart
          <select name="chart" value={chart} onChange={e => setChart(e.target.value)}>
            <option value="bar">Bar chart</option>
            <option value="donut">Donut chart</option>
            <option value="table">Table only</option>
          </select>
        </label>
        <label>Status
          <select name="status" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {(data.workType.statuses || []).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
        <label>Owner
          <select name="owner" value={owner} onChange={e => setOwner(e.target.value)}>
            <option value="">All owners</option>
            {(data.users || []).map(m => <option key={m._id} value={m._id}>{m.name}</option>)}
          </select>
        </label>
        <label>Filter field
          <select name="filterField" value={filterField} onChange={e => setFilterField(e.target.value)}>
            <option value="">No field filter</option>
            {data.options.groups.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </label>
        <label>Exact filter value
          <input name="filterValue" value={filterValue} onChange={e => setFilterValue(e.target.value)} placeholder="Optional exact match" />
        </label>
        <label>From
          <DatePicker
            name="dateFrom"
            value={dateFrom}
            placeholder="From date"
            onChange={val => setDateFrom(val)}
          />
        </label>
        <label>To
          <DatePicker
            name="dateTo"
            value={dateTo}
            placeholder="To date"
            onChange={val => setDateTo(val)}
          />
        </label>
        <fieldset>
          <legend>Formulas (up to four)</legend>
          <div className="module-formula-grid">
            {[0, 1, 2, 3].map(index => {
              const selected = metrics[index] || '';
              return (
                <select key={index} name="metrics" value={selected} onChange={e => { const next = [...metrics]; next[index] = e.target.value; setMetrics(next); }}>
                  <option value="">None</option>
                  {formulaTokens.map(token => <option key={token} value={token}>{metricLabel(token)}</option>)}
                </select>
              );
            })}
          </div>
        </fieldset>
        <div className="actions">
          <button className="btn primary">Generate report</button>
          <Link className="btn" to={`/reports/module-builder?module=${data.workType._id}`}>Reset</Link>
        </div>
      </form>

      <section className="module-report-summary">
        <div><span>Matching records</span><strong>{data.report.totalRecords.toLocaleString('en-IN')}</strong></div>
        <div><span>Groups</span><strong>{data.report.rows.length.toLocaleString('en-IN')}</strong></div>
        <div className="actions">
          <button className="btn" onClick={exportRaw}>Export raw records</button>
          <button className="btn primary" onClick={exportGrouped}>Export grouped CSV</button>
        </div>
      </section>

      {chart === 'bar' && data.report.rows.length > 0 && (
        <section className="module-chart">
          <h2>{firstMetric} by {groupLabel}</h2>
          <div className="module-bars">
            {data.report.rows.slice(0, 30).map((row, i) => {
              const value = Number(row[firstMetric]) || 0;
              return (
                <div key={i}>
                  <span>{row.Group}</span>
                  <i><b style={{ width: maxValue ? `${value / maxValue * 100}%` : '0%' }} /></i>
                  <strong>{formatNumber(value)}</strong>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {chart === 'donut' && data.report.rows.length > 0 && (
        <section className="module-chart module-donut-layout">
          <div className="module-donut" style={{ background: `conic-gradient(${donutSegments.join(',')})` }}>
            <span><strong>{donutTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong><small>{firstMetric}</small></span>
          </div>
          <div className="module-chart-legend">
            {donutRows.map((row, index) => (
              <div key={index}><i style={{ background: CHART_COLORS[index] }} /><span>{row.Group}</span><strong>{formatNumber(row[firstMetric])}</strong></div>
            ))}
          </div>
        </section>
      )}

      <section className="table-card">
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {data.report.columns.map(col => <th key={col} style={{ padding: '.75rem 1rem', fontSize: '.78rem', color: 'var(--muted)' }}>{col}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.report.rows.length === 0 && (
              <tr><td colSpan={data.report.columns.length} className="empty" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted)' }}>No records matched these filters.</td></tr>
            )}
            {data.report.rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                {data.report.columns.map(col => <td key={col} style={{ padding: '.75rem 1rem', fontSize: '.85rem' }}>{formatNumber(row[col])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="saved-report-panel">
        <form onSubmit={saveReport}>
          <div><strong>Save this report</strong><small>Saved reports remain private to your account.</small></div>
          <input name="name" value={saveName} onChange={(e: ChangeEvent<HTMLInputElement>) => setSaveName(e.target.value)} placeholder="Report name" required />
          <button className="btn primary" disabled={saving}>{saving ? 'Saving...' : 'Save report'}</button>
        </form>
        {data.savedReports.length > 0 && (
          <nav>
            {data.savedReports.map(item => (
              <a key={item._id} href={`/reports/module-builder?saved=${item._id}`} className={data.saved && String(data.saved._id) === String(item._id) ? 'active' : ''} onClick={e => { e.preventDefault(); navigate(`/reports/module-builder?saved=${item._id}`); }}>
                {item.name}
                <button aria-label={`Delete ${item.name}`} onClick={e => deleteReport(item._id, e)}>&times;</button>
              </a>
            ))}
          </nav>
        )}
      </section>
    </div>
  );
}
