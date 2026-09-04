import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { analyticsApi, AnalyticsResponse } from '../../api/analytics';
import { useAuth } from '../../contexts/AuthContext';

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
  const { crmTerms } = useAuth();
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

  if (loading && !data) return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading analytics...</div>;
  if (error) return <div className="page-container"><div className="auth-error">{error}</div></div>;

  const recordPlural = crmTerms.recordPlural || 'Records';
  const recordSingular = crmTerms.recordSingular || 'Record';
  const pipelineName = crmTerms.pipelineName || 'Pipeline';
  const stats = data?.stats || { totalLeads: 0, wonCount: 0, lostCount: 0, activeCount: 0, winRate: 0, totalValue: 0, wonValue: 0 };

  // Ingestion trend SVG rendering (parity with analytics.ejs)
  const trend = data?.ingestionTrend || [];
  const maxVal = Math.max(...trend.map(d => d.count), 2);
  const graphH = 120;
  const graphW = 540;
  const points = trend.map((d, idx) => {
    const x = (idx * (graphW / 6)).toFixed(1);
    const y = (135 - (d.count / maxVal) * graphH).toFixed(1);
    return { x, y, dateStr: d.dateStr, count: d.count };
  });
  const pathLine = 'M ' + points.map(p => `${p.x} ${p.y}`).join(' L ');
  const pathArea = pathLine + ` L ${graphW} 140 L 0 140 Z`;

  const winRateNum = Number(stats.winRate) || 0;
  const dashOffset = CIRCUMFERENCE - (winRateNum / 100) * CIRCUMFERENCE;
  const revPct = stats.totalValue > 0 ? Math.round((stats.wonValue / stats.totalValue) * 100) : 0;
  const activePct = stats.totalLeads > 0 ? Math.round((stats.activeCount / stats.totalLeads) * 100) : 0;
  const maxStageVal = Math.max(...(data?.stageSummary || []).map(s => s.value), 1);

  const selectCtrl: React.CSSProperties = { height: 40, lineHeight: '38px', border: '1px solid var(--border)', borderRadius: 8, fontSize: '.82rem', fontWeight: 700, color: 'var(--text)', background: 'var(--panel)', padding: '0 12px', cursor: 'pointer' };

  function handleFilter(key: string, value: string) {
    const p = new URLSearchParams(searchParams);
    if (value) p.set(key, value); else p.delete(key);
    navigate(`/analytics?${p.toString()}`);
  }

  return (
    <div className="analytics-page" style={{ background: '#F8F9FB', minHeight: '100%' }}>
      <div className="page-content-inner">
        <section className="analytics-page-head">
          <div>
            <h1>Vande Digital Insights</h1>
            <p>Monitor your marketing performance and pipeline health.</p>
          </div>
        </section>

        <div className="analytics-toolbar">
          <select style={selectCtrl} value={filters.clientCompany} onChange={e => handleFilter('clientCompany', e.target.value)}>
            <option value="">All Client Companies</option>
            {(data?.companies || []).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          <select style={selectCtrl} value={filters.campaign} onChange={e => handleFilter('campaign', e.target.value)}>
            <option value="">All Campaigns</option>
            {(data?.campaigns || []).map(c => <option key={c._id} value={c._id}>{c.name} ({c.platform})</option>)}
          </select>
          <input type="date" style={{ ...selectCtrl, width: 160 }} aria-label="Start date" value={filters.dateFrom} onChange={e => handleFilter('dateFrom', e.target.value)} />
          <input type="date" style={{ ...selectCtrl, width: 160 }} aria-label="End date" value={filters.dateTo} onChange={e => handleFilter('dateTo', e.target.value)} />
          <a className="btn" href="/analytics" style={{ height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }} onClick={e => e.preventDefault()}>
            {resetIcon()}
            Reset
          </a>
        </div>

        <section className="analytics-kpi-grid">
          <div className="analytics-kpi-card">
            <div className="analytics-kpi-card-header">
              <div className="analytics-kpi-card-icon" style={{ background: 'rgba(59,130,246,.1)', color: '#3b82f6' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-3-3.87" /><path d="M9 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              </div>
              <div className="analytics-kpi-card-title-block"><small>Total Ingestion</small><em>All captured {recordPlural.toLowerCase()}</em></div>
              <strong className="analytics-kpi-card-value">{stats.totalLeads}</strong>
            </div>
            <div className="analytics-kpi-card-bar" style={{ background: 'var(--gold)' }} />
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-card-header">
              <div className="analytics-kpi-card-icon" style={{ background: 'rgba(20,184,166,.1)', color: '#14b8a6' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
              </div>
              <div className="analytics-kpi-card-title-block"><small>Active {pipelineName}</small><em>Open opportunities</em></div>
              <strong className="analytics-kpi-card-value">{stats.activeCount}</strong>
            </div>
            <div className="analytics-kpi-card-bar" style={{ background: 'var(--teal)' }} />
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-card-header">
              <div className="analytics-kpi-card-icon" style={{ background: 'rgba(34,197,94,.1)', color: '#22c55e' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34" /><path d="M12 2a6 6 0 0 0-6 6v1a6 6 0 0 0 12 0V8a6 6 0 0 0 6-6z" /></svg>
              </div>
              <div className="analytics-kpi-card-title-block"><small>Won Deals</small><em>Won conversions</em></div>
              <strong className="analytics-kpi-card-value">{stats.wonCount}</strong>
            </div>
            <div className="analytics-kpi-card-bar" style={{ background: 'var(--green)' }} />
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-card-header">
              <div className="analytics-kpi-card-icon" style={{ background: 'rgba(239,68,68,.1)', color: '#ef4444' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
              </div>
              <div className="analytics-kpi-card-title-block"><small>Lost Deals</small><em>Lost opportunities</em></div>
              <strong className="analytics-kpi-card-value">{stats.lostCount}</strong>
            </div>
            <div className="analytics-kpi-card-footer">
              <span />
              <span style={{ fontSize: '.68rem', fontWeight: 800, color: 'var(--muted)', letterSpacing: '.05em' }}>CLOSED LOST</span>
            </div>
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-card-header">
              <div className="analytics-kpi-card-icon" style={{ background: 'rgba(139,92,246,.1)', color: '#8b5cf6' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
              </div>
              <div className="analytics-kpi-card-title-block"><small>Win Velocity</small><em>{recordPlural} win ratio</em></div>
              <strong className="analytics-kpi-card-value">{stats.winRate}%</strong>
            </div>
            <div className="analytics-kpi-card-footer">
              <span />
              <span style={{ fontSize: '.65rem', fontWeight: 800, color: 'var(--green)', background: 'rgba(34,197,94,.1)', padding: '2px 6px', borderRadius: 4 }}>ACTIVE</span>
            </div>
          </div>
        </section>

        <div className="analytics-grid-two-col">
          <article className="analytics-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div className="analytics-card-header">
                <div>
                  <h2 className="analytics-card-title">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6, color: 'var(--gold)' }}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
                    Client intake trend
                  </h2>
                  <p className="analytics-card-subtitle">Track active marketing capture volume daily.</p>
                </div>
                <span style={{ fontSize: '.65rem', fontWeight: 800, color: 'var(--muted)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase' }}>{filters.dateFrom || filters.dateTo ? 'Selected Range' : 'Last 7 Days'}</span>
              </div>
            </div>
            <div style={{ position: 'relative', width: '100%', height: 160, minHeight: 160, marginTop: 12 }}>
              {points.length > 0 && (
                <svg viewBox="0 0 540 160" width="100%" height="100%" style={{ overflow: 'visible' }}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[0, 1, 2, 3].map(i => {
                    const gridY = 15 + (i * (graphH / 3));
                    return <line key={i} x1="0" y1={gridY} x2={graphW} y2={gridY} style={{ stroke: '#e5e7eb', strokeWidth: 1, strokeDasharray: '4 4' }} />;
                  })}
                  <path d={pathArea} fill="url(#areaGrad)" />
                  <path d={pathLine} fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  {points.map((p, idx) => (
                    <g key={idx}>
                      <circle cx={p.x} cy={p.y} r="4.5" fill="#ffffff" stroke="var(--gold)" strokeWidth="2.5" />
                      <text x={p.x} y={Number(p.y) - 8} fontSize="8.5" fontWeight="900" fill="var(--text)" textAnchor="middle">{p.count}</text>
                      <text x={p.x} y="155" fontSize="8.5" fontWeight="700" fill="var(--muted)" textAnchor="middle">{p.dateStr}</text>
                    </g>
                  ))}
                </svg>
              )}
            </div>
          </article>

          <article className="analytics-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div className="analytics-card-header">
                <div>
                  <h2 className="analytics-card-title">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6, color: '#8b5cf6' }}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
                    Conversion Performance
                  </h2>
                  <p className="analytics-card-subtitle">Realized revenue metrics and conversion funnel throughput.</p>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
              <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', background: 'var(--panel)', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ position: 'relative', width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="72" height="72" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f3f4f6" strokeWidth="8" />
                    <circle cx="50" cy="50" r="40" fill="transparent" stroke="var(--green)" strokeWidth="8" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={dashOffset} strokeLinecap="round" />
                  </svg>
                  <div style={{ position: 'absolute', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                    <strong style={{ fontSize: '.95rem', color: 'var(--text)' }}>{stats.winRate}%</strong>
                    <span style={{ fontSize: '.55rem', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.02em' }}>Win</span>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '.8rem', color: 'var(--text)', marginBottom: 2 }}>Overall Closure Speed</strong>
                  <span style={{ fontSize: '.7rem', color: 'var(--sub)', lineHeight: 1.4 }}>{stats.wonCount} of {stats.totalLeads} {recordPlural.toLowerCase()} converted successfully.</span>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.76rem', marginBottom: '.35rem' }}>
                  <span style={{ color: 'var(--muted)', fontWeight: 700 }}>Revenue Realized</span>
                  <strong style={{ color: 'var(--green)', fontWeight: 800 }}>Rs. {formatIn(stats.wonValue)}</strong>
                </div>
                <div style={{ height: 6, background: '#f3f4f6', border: '1px solid var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${revPct}%`, background: 'var(--green)', borderRadius: 99 }} />
                </div>
                <span style={{ fontSize: '.68rem', color: 'var(--muted)', display: 'block', marginTop: '.25rem' }}>{revPct}% of total pipeline value (Rs. {formatIn(stats.totalValue)}) won</span>
              </div>

              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '.76rem', borderBottom: '1px solid #f3f4f6', paddingBottom: 4 }}>
                    <span style={{ color: 'var(--muted)' }}>1. Ingestion</span>
                    <span style={{ fontWeight: 750 }}>{stats.totalLeads} {recordPlural.toLowerCase()} (100%)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '.76rem', borderBottom: '1px solid #f3f4f6', paddingBottom: 4 }}>
                    <span style={{ color: 'var(--muted)' }}>2. Active pipeline</span>
                    <span style={{ fontWeight: 750, color: 'var(--gold)' }}>{stats.activeCount} {recordPlural.toLowerCase()} ({activePct}%)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '.76rem' }}>
                    <span style={{ color: 'var(--muted)' }}>3. Converted</span>
                    <span style={{ fontWeight: 750, color: 'var(--green)' }}>{stats.wonCount} won ({stats.winRate}%)</span>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>

        <div className="analytics-row-full">
          <article className="analytics-card">
            <div className="analytics-card-header" style={{ marginBottom: 14 }}>
              <div>
                <h2 className="analytics-card-title">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6, color: 'var(--text)' }}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
                  Sales Stages Allocation Breakdown
                </h2>
                <p className="analytics-card-subtitle">Value and {recordSingular.toLowerCase()} distribution across {pipelineName.toLowerCase()} stages.</p>
              </div>
            </div>
            <div className="stages-grid">
              {(data?.stageSummary || []).map(s => {
                const pct = Math.round((s.value / maxStageVal) * 100);
                return (
                  <div key={s.name} className="stage-mini-card">
                    <div className="stage-mini-card-top">
                      <span className="stage-mini-card-name"><span className="stage-mini-card-dot" style={{ background: s.color }} />{s.name}</span>
                      <span className="stage-mini-card-count">{s.count} {recordPlural.toLowerCase()}</span>
                    </div>
                    <div className="stage-mini-card-bottom">
                      <span className="stage-mini-card-label">Cumulative Value ({pct}%)</span>
                      <strong className="stage-mini-card-value">Rs. {formatIn(s.value)}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="analytics-card">
            <div className="analytics-card-header" style={{ marginBottom: 14 }}>
              <div>
                <h2 className="analytics-card-title">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6, color: '#f43f5e' }}><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                  Campaign Attribution &amp; Performance ROI
                </h2>
                <p className="analytics-card-subtitle">Track advertising cost conversions and {recordSingular.toLowerCase()}-source profitability.</p>
              </div>
            </div>
            <div className="analytics-table-card">
              <table>
                <thead>
                  <tr>
                    <th>Campaign</th><th>Platform</th><th style={{ textAlign: 'center' }}>{recordPlural} captured</th><th>{pipelineName} value</th><th>Revenue Realized</th><th>Spent Budget</th><th>Campaign ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.campaignSummary || []).length === 0 && (
                    <tr><td colSpan={7} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)' }}>No campaigns logged yet.</td></tr>
                  )}
                  {(data?.campaignSummary || []).map(cam => {
                    const pill = platformPill(cam.platform);
                    const roi = cam.budget > 0 ? cam.wonValue / cam.budget : null;
                    return (
                      <tr key={cam.name}>
                        <td style={{ fontWeight: 800, color: 'var(--text)' }}>{cam.name}</td>
                        <td><span className="pill" style={{ background: pill.bg, color: pill.color, border: `1px solid ${pill.bd}` }}>{pill.text}</span></td>
                        <td style={{ textAlign: 'center', fontWeight: 800 }}>{cam.leadsCount}</td>
                        <td style={{ color: 'var(--gold)', fontWeight: 750 }}>Rs. {formatIn(cam.pipelineValue)}</td>
                        <td style={{ color: 'var(--green)', fontWeight: 800 }}>Rs. {formatIn(cam.wonValue)}</td>
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

          <article className="analytics-card">
            <div className="analytics-card-header" style={{ marginBottom: 14 }}>
              <div>
                <h2 className="analytics-card-title">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6, color: 'var(--muted)' }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                  Client Accounts Breakdown
                </h2>
                <p className="analytics-card-subtitle">Analyze customer allocation and account pipeline valuation shares.</p>
              </div>
            </div>
            <div className="analytics-table-card">
              <table>
                <thead>
                  <tr>
                    <th>Client Brand</th><th style={{ textAlign: 'center' }}>Total {recordPlural}</th><th>Account Pipeline Share</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.companySummary || []).length === 0 && (
                    <tr><td colSpan={4} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)' }}>No client companies logged yet.</td></tr>
                  )}
                  {(data?.companySummary || []).map(com => (
                    <tr key={com.name}>
                      <td style={{ fontWeight: 800, color: 'var(--text)' }}>{com.name}</td>
                      <td style={{ textAlign: 'center', fontWeight: 800 }}>{com.leadsCount}</td>
                      <td style={{ color: 'var(--gold)', fontWeight: 750 }}>Rs. {formatIn(com.pipelineValue)}</td>
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
