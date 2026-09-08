import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { analyticsApi, AnalyticsResponse } from '../../api/analytics';
import { useAuth } from '../../contexts/AuthContext';
import CustomSelect from '../../components/CustomSelect';
import DatePicker from '../../components/DatePicker';

const CIRCUMFERENCE = 2 * Math.PI * 40;

function formatIn(value: number) {
  return Number(value || 0).toLocaleString('en-IN');
}

function roiPill(roi: number) {
  if (roi >= 2.0) return { label: `${roi.toFixed(1)}x ROI (High)`, color: 'var(--green)', bg: 'rgba(34,197,94,.1)', bd: 'rgba(34,197,94,.2)' };
  if (roi >= 1.0) return { label: `${roi.toFixed(1)}x ROI (Good)`, color: '#f97316', bg: 'rgba(249,115,22,.1)', bd: 'rgba(249,115,22,.2)' };
  return { label: `${roi.toFixed(1)}x ROI (Low)`, color: 'var(--red)', bg: 'rgba(239,68,68,.1)', bd: 'rgba(239,68,68,.2)' };
}

function platformPill(platform: string) {
  if (platform === 'Meta Ads') return { text: 'Meta Ads', color: '#1877f2', bg: 'rgba(24,119,242,.1)', bd: 'rgba(24,119,242,.2)' };
  if (platform === 'Google Ads') return { text: 'Google Ads', color: '#34a853', bg: 'rgba(52,168,83,.1)', bd: 'rgba(52,168,83,.2)' };
  return { text: platform, color: 'var(--gold)', bg: 'rgba(181,141,0,.1)', bd: 'rgba(181,141,0,.2)' };
}

function resetIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '4px' }}>
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
    </svg>
  );
}

export default function AnalyticsPage() {
  const { crmTerms, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const filters = {
    clientCompany: searchParams.get('clientCompany') || '',
    campaign: searchParams.get('campaign') || '',
    dateFrom: searchParams.get('dateFrom') || '',
    dateTo: searchParams.get('dateTo') || '',
  };

  const hasActiveFilters = Boolean(filters.clientCompany || filters.campaign || filters.dateFrom || filters.dateTo);
  let activeFilterCount = 0;
  if (filters.clientCompany) activeFilterCount++;
  if (filters.campaign) activeFilterCount++;
  if (filters.dateFrom) activeFilterCount++;
  if (filters.dateTo) activeFilterCount++;

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      const params: Record<string, string> = {};
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      try {
        const res = await analyticsApi.list(params);
        if (active) setData(res);
      } catch (err: any) {
        if (active) setError(err.message || 'Failed to load analytics');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [searchParams.toString()]);

  if (loading && !data) return <div className="loading" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted)' }}>Loading analytics workspace...</div>;
  if (error) return <div className="page-container"><div className="auth-error">{error}</div></div>;

  const recordPlural = crmTerms.recordPlural || 'Records';
  const recordSingular = crmTerms.recordSingular || 'Record';
  const pipelineName = crmTerms.pipelineName || 'Pipeline';
  const stats = data?.stats || { totalLeads: 0, wonCount: 0, lostCount: 0, activeCount: 0, winRate: 0, totalValue: 0, wonValue: 0 };

  // Ingestion trend SVG rendering
  const trend = data?.ingestionTrend || [];
  const maxVal = Math.max(...trend.map(d => d.count), 5);
  const padX = 28;
  const graphW = 560;
  const availW = graphW - padX * 2;
  const numSteps = Math.max(trend.length - 1, 1);
  const chartTopY = 24;
  const chartBottomY = 120;
  const chartHeight = chartBottomY - chartTopY;

  const points = trend.map((d, idx) => {
    const x = Number((padX + idx * (availW / numSteps)).toFixed(1));
    const y = Number((chartBottomY - (d.count / maxVal) * chartHeight).toFixed(1));
    return { x, y, dateStr: d.dateStr, count: d.count };
  });
  const pathLine = points.length > 0 ? 'M ' + points.map(p => `${p.x} ${p.y}`).join(' L ') : '';
  const pathArea = points.length > 0 ? pathLine + ` L ${points[points.length - 1].x} ${chartBottomY} L ${points[0].x} ${chartBottomY} Z` : '';

  const winRateNum = Number(stats.winRate) || 0;
  const dashOffset = CIRCUMFERENCE - (winRateNum / 100) * CIRCUMFERENCE;
  const revPct = stats.totalValue > 0 ? Math.round((stats.wonValue / stats.totalValue) * 100) : 0;
  const activePct = stats.totalLeads > 0 ? Math.round((stats.activeCount / stats.totalLeads) * 100) : 0;
  const maxStageVal = Math.max(...(data?.stageSummary || []).map(s => s.value), 1);

  function handleFilter(key: string, value: string) {
    const p = new URLSearchParams(searchParams);
    if (value) p.set(key, value); else p.delete(key);
    navigate(`/analytics?${p.toString()}`);
  }

  return (
    <div className="analytics-page">
      <div className="analytics-container">
        {/* 1. Header */}
        <header className="analytics-header">
          <div className="analytics-header-title-group">
            <h1 className="analytics-title">
              {[user?.organization?.name, user?.organization?.analyticsHeading || 'Digital Insights'].filter(Boolean).join(' ')}
            </h1>
            <p className="analytics-subtitle">Monitor your marketing performance and pipeline health.</p>
          </div>
        </header>

        {/* 2. Filter Toolbar */}
        <div className="analytics-toolbar">
          <div className="analytics-toolbar-control">
            <CustomSelect
              value={filters.clientCompany}
              onChange={val => handleFilter('clientCompany', val)}
              placeholder="All Client Companies"
              options={[
                { value: '', label: 'All Client Companies' },
                ...(data?.companies || []).map(c => ({ value: c._id, label: c.name }))
              ]}
            />
          </div>

          <div className="analytics-toolbar-control">
            <CustomSelect
              value={filters.campaign}
              onChange={val => handleFilter('campaign', val)}
              placeholder="All Campaigns"
              options={[
                { value: '', label: 'All Campaigns' },
                ...(data?.campaigns || []).map(c => ({ value: c._id, label: `${c.name} (${c.platform})` }))
              ]}
            />
          </div>

          <div className="analytics-toolbar-control analytics-date-picker-wrap">
            <DatePicker
              aria-label="Start date"
              placeholder="Start date"
              value={filters.dateFrom}
              onChange={val => handleFilter('dateFrom', val)}
            />
          </div>

          <div className="analytics-toolbar-control analytics-date-picker-wrap">
            <DatePicker
              aria-label="End date"
              placeholder="End date"
              value={filters.dateTo}
              onChange={val => handleFilter('dateTo', val)}
            />
          </div>

          <div className="analytics-toolbar-actions">
            {hasActiveFilters ? (
              <button
                type="button"
                className="analytics-reset-btn has-filters"
                onClick={() => navigate('/analytics')}
                title="Clear all active filters"
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
                <span>Clear ({activeFilterCount})</span>
              </button>
            ) : (
              <button
                type="button"
                className="analytics-reset-btn"
                onClick={() => navigate('/analytics')}
                title="Reset filters"
              >
                {resetIcon()}
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* 3. KPI Summary Strip */}
        <section className="analytics-kpi-strip">
          <div className="analytics-kpi-item">
            <span className="kpi-label">Total Ingestion</span>
            <div className="kpi-value-row">
              <strong className="kpi-value">{stats.totalLeads}</strong>
            </div>
            <span className="kpi-meta">All captured {recordPlural.toLowerCase()}</span>
          </div>

          <div className="analytics-kpi-item">
            <span className="kpi-label">Active {pipelineName}</span>
            <div className="kpi-value-row">
              <strong className="kpi-value">{stats.activeCount}</strong>
            </div>
            <span className="kpi-meta">Open opportunities ({activePct}%)</span>
          </div>

          <div className="analytics-kpi-item">
            <span className="kpi-label">Won Deals</span>
            <div className="kpi-value-row">
              <strong className="kpi-value kpi-won">{stats.wonCount}</strong>
            </div>
            <span className="kpi-meta">Won conversions</span>
          </div>

          <div className="analytics-kpi-item">
            <span className="kpi-label">Lost Deals</span>
            <div className="kpi-value-row">
              <strong className="kpi-value kpi-lost">{stats.lostCount}</strong>
            </div>
            <span className="kpi-meta">Closed lost</span>
          </div>

          <div className="analytics-kpi-item">
            <span className="kpi-label">Win Rate</span>
            <div className="kpi-value-row">
              <strong className="kpi-value">{stats.winRate}%</strong>
            </div>
            <span className="kpi-meta">{recordPlural} conversion ratio</span>
          </div>
        </section>

        {/* 4. Analytics Content Area (60/40 Grid) */}
        <div className="analytics-grid-two-col">
          {/* LEFT: Client Intake Trend */}
          <article className="analytics-panel">
            <div className="analytics-panel-header">
              <div>
                <h2 className="analytics-panel-title">Client intake trend</h2>
                <p className="analytics-panel-subtitle">Track active marketing capture volume daily.</p>
              </div>
              <span className="analytics-range-badge">
                {filters.dateFrom || filters.dateTo ? 'Selected Range' : 'Last 7 Days'}
              </span>
            </div>
            <div className="analytics-chart-container">
              {points.length > 0 ? (
                <svg viewBox="0 0 560 150" width="100%" height="100%" style={{ overflow: 'visible' }}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="var(--gold)" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  {[0, 1, 2, 3].map(i => {
                    const gridY = chartTopY + (i * (chartHeight / 3));
                    return <line key={i} x1={padX} y1={gridY} x2={graphW - padX} y2={gridY} style={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '4 4' }} />;
                  })}
                  {pathArea && <path d={pathArea} fill="url(#areaGrad)" />}
                  {pathLine && <path d={pathLine} fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
                  {points.map((p, idx) => (
                    <g key={idx}>
                      <circle cx={p.x} cy={p.y} r="4.5" fill="var(--panel)" stroke="var(--gold)" strokeWidth="2.5" />
                      <text x={p.x} y={p.y <= chartTopY + 10 ? p.y + 14 : p.y - 8} fontSize="10" fontWeight="750" fill="var(--text)" textAnchor="middle">{p.count}</text>
                      <text x={p.x} y="142" fontSize="9.5" fontWeight="600" fill="var(--muted)" textAnchor="middle">{p.dateStr}</text>
                    </g>
                  ))}
                </svg>
              ) : (
                <div className="analytics-chart-empty">No ingestion data recorded for this period.</div>
              )}
            </div>
          </article>

          {/* RIGHT: Conversion Performance */}
          <article className="analytics-panel">
            <div className="analytics-panel-header">
              <div>
                <h2 className="analytics-panel-title">Conversion Performance</h2>
                <p className="analytics-panel-subtitle">Realized revenue and conversion efficiency</p>
              </div>
            </div>

            <div className="analytics-performance-body">
              {/* Win rate hero row */}
              <div className="conversion-hero-row">
                <div className="conversion-gauge-wrap">
                  <svg width="58" height="58" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="50" cy="50" r="40" fill="transparent" stroke="var(--hover)" strokeWidth="10" />
                    <circle cx="50" cy="50" r="40" fill="transparent" stroke="var(--green)" strokeWidth="10" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={dashOffset} strokeLinecap="round" />
                  </svg>
                  <div className="conversion-gauge-text">
                    <strong>{stats.winRate}%</strong>
                  </div>
                </div>
                <div className="conversion-hero-text">
                  <div className="conversion-hero-title">{stats.winRate}% Win rate</div>
                  <div className="conversion-hero-sub">{stats.wonCount} of {stats.totalLeads} {recordPlural.toLowerCase()} converted</div>
                </div>
              </div>

              {/* Revenue Realized */}
              <div className="conversion-revenue-block">
                <div className="conversion-metric-row">
                  <span className="conversion-metric-label">Revenue realized</span>
                  <strong className="conversion-metric-value">Rs. {formatIn(stats.wonValue)}</strong>
                </div>
                <div className="conversion-progress-track">
                  <div className="conversion-progress-bar" style={{ width: `${Math.min(revPct, 100)}%` }} />
                </div>
                <div className="conversion-progress-hint">
                  {revPct}% of total pipeline (Rs. {formatIn(stats.totalValue)}) won
                </div>
              </div>

              {/* Funnel throughput list */}
              <div className="conversion-funnel-list">
                <div className="conversion-funnel-row">
                  <span className="funnel-label">Total Ingestion</span>
                  <span className="funnel-val">{stats.totalLeads} {recordPlural.toLowerCase()}</span>
                </div>
                <div className="conversion-funnel-row">
                  <span className="funnel-label">Active pipeline</span>
                  <span className="funnel-val">{stats.activeCount} ({activePct}%)</span>
                </div>
                <div className="conversion-funnel-row">
                  <span className="funnel-label">Won deals</span>
                  <span className="funnel-val funnel-won">{stats.wonCount}</span>
                </div>
                <div className="conversion-funnel-row">
                  <span className="funnel-label">Lost deals</span>
                  <span className="funnel-val funnel-lost">{stats.lostCount}</span>
                </div>
              </div>
            </div>
          </article>
        </div>

        {/* 5. Lower Breakdown Sections */}
        <div className="analytics-row-full">
          {/* Sales Stages Allocation */}
          <article className="analytics-panel">
            <div className="analytics-panel-header">
              <div>
                <h2 className="analytics-panel-title">Sales Stages Allocation Breakdown</h2>
                <p className="analytics-panel-subtitle">Value and {recordSingular.toLowerCase()} distribution across {pipelineName.toLowerCase()} stages.</p>
              </div>
            </div>
            <div className="stages-grid">
              {(data?.stageSummary || []).map(s => {
                const pct = Math.round((s.value / maxStageVal) * 100);
                return (
                  <div key={s.name} className="stage-mini-card">
                    <div className="stage-mini-card-top">
                      <span className="stage-mini-card-name">
                        <span className="stage-mini-card-dot" style={{ background: s.color }} />
                        {s.name}
                      </span>
                      <span className="stage-mini-card-count">{s.count} {recordPlural.toLowerCase()}</span>
                    </div>
                    <div className="stage-mini-card-bottom">
                      <span className="stage-mini-card-label">Cumulative ({pct}%)</span>
                      <strong className="stage-mini-card-value">Rs. {formatIn(s.value)}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          {/* Campaign Attribution */}
          <article className="analytics-panel">
            <div className="analytics-panel-header">
              <div>
                <h2 className="analytics-panel-title">Campaign Attribution &amp; Performance ROI</h2>
                <p className="analytics-panel-subtitle">Track advertising cost conversions and {recordSingular.toLowerCase()}-source profitability.</p>
              </div>
            </div>
            <div className="analytics-table-card">
              <table>
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Platform</th>
                    <th style={{ textAlign: 'center' }}>{recordPlural} captured</th>
                    <th>{pipelineName} value</th>
                    <th>Revenue Realized</th>
                    <th>Spent Budget</th>
                    <th>Campaign ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.campaignSummary || []).length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)' }}>
                        No campaigns logged yet.
                      </td>
                    </tr>
                  )}
                  {(data?.campaignSummary || []).map(cam => {
                    const pill = platformPill(cam.platform);
                    const roi = cam.budget > 0 ? cam.wonValue / cam.budget : null;
                    return (
                      <tr key={cam.name}>
                        <td style={{ fontWeight: 700, color: 'var(--text)' }}>{cam.name}</td>
                        <td><span className="pill" style={{ background: pill.bg, color: pill.color, border: `1px solid ${pill.bd}` }}>{pill.text}</span></td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{cam.leadsCount}</td>
                        <td style={{ color: 'var(--gold)', fontWeight: 700 }}>Rs. {formatIn(cam.pipelineValue)}</td>
                        <td style={{ color: 'var(--green)', fontWeight: 750 }}>Rs. {formatIn(cam.wonValue)}</td>
                        <td style={{ color: 'var(--muted)' }}>Rs. {formatIn(cam.budget)}</td>
                        <td>
                          {roi !== null ? (() => { const p = roiPill(roi); return <span className="pill" style={{ background: p.bg, color: p.color, border: `1px solid ${p.bd}` }}>{p.label}</span>; })()
                            : <span style={{ color: 'var(--muted)', fontSize: '.74rem' }}>Organic (No Budget)</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>

          {/* Client Accounts Breakdown */}
          <article className="analytics-panel">
            <div className="analytics-panel-header">
              <div>
                <h2 className="analytics-panel-title">Client Accounts Breakdown</h2>
                <p className="analytics-panel-subtitle">Analyze customer allocation and account pipeline valuation shares.</p>
              </div>
            </div>
            <div className="analytics-table-card">
              <table>
                <thead>
                  <tr>
                    <th>Client Brand</th>
                    <th style={{ textAlign: 'center' }}>Total {recordPlural}</th>
                    <th>Account Pipeline Share</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.companySummary || []).length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)' }}>
                        No client companies logged yet.
                      </td>
                    </tr>
                  )}
                  {(data?.companySummary || []).map(com => (
                    <tr key={com.name}>
                      <td style={{ fontWeight: 700, color: 'var(--text)' }}>{com.name}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{com.leadsCount}</td>
                      <td style={{ color: 'var(--gold)', fontWeight: 700 }}>Rs. {formatIn(com.pipelineValue)}</td>
                      <td><span className="pill" style={{ background: 'rgba(34,197,94,.1)', color: 'var(--green)', border: '1px solid rgba(34,197,94,.2)' }}>{com.status.toUpperCase()}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
