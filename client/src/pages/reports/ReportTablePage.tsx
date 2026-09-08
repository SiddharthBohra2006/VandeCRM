import { useState, useEffect } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { reportsApi, Report } from '../../api/reports';
import DatePicker from '../../components/DatePicker';
import CustomSelect from '../../components/CustomSelect';
import Icon from '../../components/Icons';

function formatCell(column: string, value: any) {
  if (value === null || value === undefined || value === '') return '—';

  const colLower = column.toLowerCase();

  // Currency / Revenue
  if (typeof value === 'number' && /value|revenue|amount|budget|price|fee/i.test(colLower)) {
    return `₹${value.toLocaleString('en-IN')}`;
  }

  // URL / Link (SOP Link, Reference Link, etc.)
  if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) {
    return (
      <a
        href={value.trim()}
        target="_blank"
        rel="noopener noreferrer"
        className="report-link-pill"
        title={value}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          borderRadius: 6,
          background: 'rgba(59, 130, 246, 0.1)',
          color: '#3b82f6',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          fontSize: '0.74rem',
          fontWeight: 650,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        <Icon name="external-link" size={11} />
        <span>Open link</span>
      </a>
    );
  }

  // Status
  if (/status/i.test(colLower) && typeof value === 'string') {
    const valLower = value.toLowerCase();
    const isClosed = /won|paid|completed|done|delivered|closed|approved/i.test(valLower);
    const isOverdue = /overdue|rejected|lost/i.test(valLower);
    const isPending = /pending|review|in progress|working/i.test(valLower);

    let color = '#3b82f6';
    if (isClosed) color = '#10b981';
    else if (isOverdue) color = '#ef4444';
    else if (isPending) color = '#f59e0b';

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '3px 9px',
          borderRadius: 9999,
          fontSize: '0.74rem',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          background: `color-mix(in srgb, ${color} 12%, var(--panel, #ffffff))`,
          color,
          border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
        <span>{value}</span>
      </span>
    );
  }

  // Priority
  if (/priority/i.test(colLower) && typeof value === 'string') {
    const pLower = value.toLowerCase();
    return (
      <span className={`work-priority-badge ${pLower}`}>
        <Icon name={pLower === 'low' ? 'chevron-down' : 'chevron-up'} size={13} />
        <span style={{ textTransform: 'capitalize' }}>{value}</span>
      </span>
    );
  }

  // Date
  if (/date|deadline|created|updated/i.test(colLower) && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{value.slice(0, 10)}</span>;
  }

  return String(value);
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

  if (loading && !report) return <div className="loading" style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>Loading report...</div>;
  if (error) return <div className="page-container"><div className="auth-error" style={{ margin: '2rem 0' }}>{error}</div></div>;

  const filters = report?.filters;
  const isWorkModules = key === 'work-modules';
  const showsAgent = key === 'agent-performance' || key === 'follow-up-compliance' || key === 'stale-leads';
  const showsCampaign = key === 'agent-performance' || key === 'source-attribution';
  const showsStaleDays = key === 'stale-leads';
  const cols = report?.columns || [];

  return (
    <div className="page-container report-page" style={{ padding: '1.5rem 2rem', maxWidth: 1600, margin: '0 auto' }}>
      {/* 1. Header & Actions */}
      <section className="follow-ups-header" style={{ marginBottom: '1.5rem' }}>
        <div className="follow-ups-title-cluster">
          <div className="follow-ups-header-icon" style={{ background: 'rgba(59, 130, 246, 0.15)', borderColor: 'rgba(59, 130, 246, 0.3)', color: '#3b82f6' }}>
            <Icon name="file-text" size={22} />
          </div>
          <div>
            <div className="follow-ups-eyebrow" style={{ color: '#3b82f6' }}>REPORTS</div>
            <h1 className="follow-ups-title">{report?.title || 'Report'}</h1>
            <p className="follow-ups-subtitle">{report?.rows.length || 0} rows found for the selected filters.</p>
          </div>
        </div>

        <div className="follow-ups-header-actions">
          <Link className="btn-followup-secondary" to="/reports">
            <Icon name="arrow-left" size={14} />
            <span>All Reports</span>
          </Link>
          <button
            type="button"
            className="btn-followup-secondary"
            onClick={() => handleExport('csv')}
            disabled={exporting === 'csv'}
          >
            <Icon name="download" size={14} />
            <span>{exporting === 'csv' ? 'Exporting...' : 'Export CSV'}</span>
          </button>
          <button
            type="button"
            className="btn-add-followup"
            style={{ background: '#2563eb !important', borderColor: '#2563eb !important' }}
            onClick={() => handleExport('pdf')}
            disabled={exporting === 'pdf'}
          >
            <Icon name="file-text" size={14} />
            <span>{exporting === 'pdf' ? 'Exporting...' : 'Export PDF'}</span>
          </button>
        </div>
      </section>

      {/* 2. Filters Card */}
      <section className="follow-ups-filters-card" style={{ marginBottom: '1.25rem' }}>
        <div className="follow-ups-filters-group">
          {/* Client Company Filter */}
          <div className="follow-ups-filter-select">
            <CustomSelect
              value={searchParams.get('clientCompany') || ''}
              onChange={val => setFilter('clientCompany', val)}
              options={[
                { value: '', label: 'All client companies' },
                ...(filters?.companies || []).map(c => ({ value: c._id, label: c.name }))
              ]}
              variant="compact"
              style={{ minWidth: 160 }}
            />
          </div>

          {/* Module Filter */}
          {isWorkModules && (
            <div className="follow-ups-filter-select">
              <CustomSelect
                value={searchParams.get('module') || report?.selectedWorkType?.key || ''}
                onChange={val => setFilter('module', val)}
                options={(filters?.workTypes || []).map(wt => ({ value: wt.key, label: wt.name }))}
                variant="compact"
                style={{ minWidth: 130 }}
              />
            </div>
          )}

          {/* Agent Filter */}
          {showsAgent && (
            <div className="follow-ups-filter-select">
              <CustomSelect
                value={searchParams.get('agent') || ''}
                onChange={val => setFilter('agent', val)}
                options={[
                  { value: '', label: 'All agents' },
                  ...(filters?.agents || []).map(a => ({ value: a._id, label: a.name }))
                ]}
                variant="compact"
                style={{ minWidth: 130 }}
              />
            </div>
          )}

          {/* Campaign Filter */}
          {showsCampaign && (
            <div className="follow-ups-filter-select">
              <CustomSelect
                value={searchParams.get('campaign') || ''}
                onChange={val => setFilter('campaign', val)}
                options={[
                  { value: '', label: 'All campaigns' },
                  ...(filters?.campaigns || []).map(c => ({ value: c._id, label: c.name }))
                ]}
                variant="compact"
                style={{ minWidth: 140 }}
              />
            </div>
          )}

          {/* Stale Days Filter */}
          {showsStaleDays && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 600 }}>Stale after:</span>
              <input
                type="number"
                min={1}
                className="follow-ups-reschedule-input"
                style={{ width: 70, height: 32 }}
                value={searchParams.get('staleDays') || report?.staleDays || 14}
                onChange={e => setFilter('staleDays', e.target.value)}
              />
              <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>days</span>
            </div>
          )}

          {/* Date Pickers */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 140 }}>
              <DatePicker
                aria-label="Start date"
                placeholder="Start date"
                value={searchParams.get('dateFrom') || ''}
                onChange={val => setFilter('dateFrom', val)}
              />
            </div>
            <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>→</span>
            <div style={{ width: 140 }}>
              <DatePicker
                aria-label="End date"
                placeholder="End date"
                value={searchParams.get('dateTo') || ''}
                onChange={val => setFilter('dateTo', val)}
              />
            </div>
          </div>
        </div>

        {/* Reset Button */}
        <button
          type="button"
          className="btn-followup-secondary"
          style={{ height: 32, padding: '0 12px' }}
          onClick={() => navigate(`/reports/${key}`)}
        >
          <Icon name="rotate-ccw" size={13} />
          <span>Reset</span>
        </button>
      </section>

      {/* 3. Table Card */}
      <section className="follow-ups-table-card" style={{ overflowX: 'auto' }}>
        <table className="follow-ups-table" style={{ width: '100%', minWidth: 750 }}>
          <thead>
            <tr>
              {cols.map(col => (
                <th
                  key={col}
                  style={{
                    padding: '12px 14px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    color: 'var(--muted)',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    minWidth: /title|name/i.test(col) ? 220 : /link|url/i.test(col) ? 120 : undefined,
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(report?.rows || []).length === 0 ? (
              <tr>
                <td
                  colSpan={cols.length || 1}
                  style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--muted)' }}
                >
                  <Icon name="file-text" size={32} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.5 }} />
                  <strong>No rows match this report</strong>
                  <p style={{ margin: '4px 0 0', fontSize: '0.78rem' }}>Try changing the date range or workspace filter.</p>
                </td>
              </tr>
            ) : (
              (report?.rows || []).map((row, i) => (
                <tr key={i}>
                  {cols.map(col => {
                    const isTitle = /title|name/i.test(col);
                    return (
                      <td
                        key={col}
                        style={{
                          padding: '12px 14px',
                          fontSize: '0.82rem',
                          fontWeight: isTitle ? 650 : 500,
                          minWidth: isTitle ? 220 : undefined,
                        }}
                      >
                        {formatCell(col, row[col])}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
