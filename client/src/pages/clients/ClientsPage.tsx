import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { clientsApi, ClientsListResponse } from '../../api/clients';
import { customersApi, downloadCustomersCsv } from '../../api/customers';
import ConfirmDialog from '../../components/ConfirmDialog';
import CustomizeColumnsModal, { ColumnDefinition } from '../../components/CustomizeColumnsModal';

const CLIENT_COLUMNS: ColumnDefinition[] = [
  { key: 'name', label: 'Client', icon: 'user', defaultVisible: true },
  { key: 'phone', label: 'Phone', icon: 'phone', defaultVisible: true },
  { key: 'email', label: 'Email', icon: 'mail', defaultVisible: true },
  { key: 'company', label: 'Company / Business', icon: 'building-2', defaultVisible: true },
  { key: 'source', label: 'Source', icon: 'compass', defaultVisible: true },
  { key: 'stage', label: 'Client status', icon: 'git-commit-horizontal', defaultVisible: true },
  { key: 'priority', label: 'Priority', icon: 'flag', defaultVisible: true },
  { key: 'value', label: 'Value', icon: 'indian-rupee', defaultVisible: true },
  { key: 'followup', label: 'Next follow-up', icon: 'calendar', defaultVisible: true },
  { key: 'lastActivity', label: 'Last activity', icon: 'clock', defaultVisible: true },
  { key: 'labels', label: 'Labels', icon: 'tags', defaultVisible: true },
  { key: 'utmSource', label: 'UTM Source', icon: 'target', defaultVisible: false },
  { key: 'utmMedium', label: 'UTM Medium', icon: 'share-2', defaultVisible: false },
  { key: 'utmCampaign', label: 'UTM Campaign', icon: 'megaphone', defaultVisible: false },
  { key: 'actions', label: 'Actions', icon: 'more-horizontal', defaultVisible: true },
];

const AVATAR_PALETTES = [
  { bg: '#eff6ff', color: '#2563eb' },
  { bg: '#ecfdf5', color: '#059669' },
  { bg: '#faf5ff', color: '#7c3aed' },
  { bg: '#f0fdfa', color: '#0d9488' },
  { bg: '#fdf2f8', color: '#db2777' },
  { bg: '#fff7ed', color: '#ea580c' },
  { bg: '#fffbeb', color: '#d97706' }
];

function getAvatarColor(str: string) {
  let hash = 0;
  for (let i = 0; i < (str || '').length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

function initialsOf(name: string) {
  return (name || 'C').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'C';
}

function formatRelativeTime(dateStr?: string | Date) {
  if (!dateStr) return { time: '—', label: '' };
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return { time: `${Math.max(1, mins)}m ago`, label: '' };
  const hours = Math.floor(mins / 60);
  if (hours < 24) return { time: `${hours}h ago`, label: '' };
  const days = Math.floor(hours / 24);
  if (days < 30) return { time: `${days}d ago`, label: '' };
  return { time: new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), label: '' };
}

export default function ClientsPage() {
  const { crmTerms, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<ClientsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState('');
  const [bulkValue, setBulkValue] = useState('');
  const [applyingBulk, setApplyingBulk] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  // Column visibility & order
  const [showColumnsModal, setShowColumnsModal] = useState(false);
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('crm_client_cols_order');
      return stored ? JSON.parse(stored) : CLIENT_COLUMNS.map(c => c.key);
    } catch {
      return CLIENT_COLUMNS.map(c => c.key);
    }
  });
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('crm_client_cols_visible');
      return stored ? JSON.parse(stored) : {
        name: true,
        phone: true,
        email: true,
        company: true,
        source: true,
        stage: true,
        priority: true,
        value: true,
        followup: true,
        lastActivity: true,
        labels: true,
        utmSource: false,
        utmMedium: false,
        utmCampaign: false,
        actions: true,
      };
    } catch {
      return {
        name: true,
        phone: true,
        email: true,
        company: true,
        source: true,
        stage: true,
        priority: true,
        value: true,
        followup: true,
        lastActivity: true,
        labels: true,
        utmSource: false,
        utmMedium: false,
        utmCampaign: false,
        actions: true,
      };
    }
  });

  const isManager = user && ['admin', 'manager'].includes(user.role);

  useEffect(() => {
    loadData();
  }, [searchParams.toString()]);

  async function loadData() {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      searchParams.forEach((value, key) => { params[key] = value; });
      const result = await clientsApi.list(params);
      setData(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  }

  function handleFilterChange(key: string, value: string) {
    setSelectedIds(new Set());
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    setSearchParams(params);
  }

  function clearAdvancedFilters() {
    setSelectedIds(new Set());
    const params = new URLSearchParams(searchParams);
    params.delete('label');
    params.delete('campaign');
    params.delete('sortBy');
    params.delete('dateFrom');
    params.delete('dateTo');
    params.delete('page');
    setSearchParams(params);
  }

  const [savingView, setSavingView] = useState(false);
  const [viewBeingSaved, setViewBeingSaved] = useState(false);

  function savedViewFilters() {
    const params = new URLSearchParams();
    for (const key of ['q', 'stage', 'label', 'campaign', 'view', 'dateFrom', 'dateTo', 'sortBy']) {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    }
    return Object.fromEntries(params);
  }

  async function saveCurrentView() {
    if (savingView) return;
    if (!viewBeingSaved) {
      setViewBeingSaved(true);
      return;
    }
    const input = document.querySelector<HTMLInputElement>('.saved-view-name-input');
    const name = (input?.value || '').trim();
    if (!name) return;
    try {
      setSavingView(true);
      setError('');
      await customersApi.saveView(name, savedViewFilters());
      setViewBeingSaved(false);
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save view');
    } finally {
      setSavingView(false);
    }
  }

  function applySavedView(view: { _id: string; name: string; filters: Record<string, string> }) {
    setSelectedIds(new Set());
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(view.filters || {})) {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    }
    params.delete('page');
    setSearchParams(params);
  }

  async function deleteSavedView(id: string) {
    try {
      setError('');
      await customersApi.deleteView(id);
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete view');
    }
  }

  async function handleBulkAction(confirmed = false) {
    if (!bulkAction || !selectedIds.size) return;
    if (bulkAction === 'delete' && !confirmed) { setConfirmBulkDelete(true); return; }
    try {
      setApplyingBulk(true);
      setError('');
      await customersApi.bulk({
        selectedIds: [...selectedIds],
        action: bulkAction,
        value: bulkValue,
      });
      setSelectedIds(new Set());
      setBulkAction('');
      setBulkValue('');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Bulk action failed');
    } finally {
      setApplyingBulk(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (!data) return;
    if (selectedIds.size === data.data.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.data.map(c => c._id)));
    }
  }

  async function handleExport() {
    try {
      setError('');
      await downloadCustomersCsv({
        scope: 'clients',
        dateFrom: searchParams.get('dateFrom') || '',
        dateTo: searchParams.get('dateTo') || '',
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Export failed');
    }
  }

  if (loading && !data) return <div className="loading" style={{ padding: '2rem 2rem' }}>Loading {crmTerms.recordPlural}...</div>;
  if (error && !data) return <div className="alert alert-error" style={{ margin: '2rem' }}>{error}</div>;
  if (!data) return null;

  const { data: clients, stages, labels, campaigns, pagination, clientStats, users } = data;
  const currentView = searchParams.get('view') || 'all';

  const advancedFilterCount = [
    searchParams.get('label'),
    searchParams.get('campaign'),
    searchParams.get('dateFrom'),
    searchParams.get('dateTo'),
    searchParams.get('sortBy') && searchParams.get('sortBy') !== 'recent' ? searchParams.get('sortBy') : null
  ].filter(Boolean).length;

  return (
    <div className="clients-page" style={{ paddingBottom: '3rem' }}>
      {/* 1. Page Head */}
      <section className="leads-page-head">
        <div className="leads-page-title-group">
          <h1>
            {crmTerms.recordPlural}
            <span className="lead-count-badge">{clientStats.totalClients}</span>
          </h1>
          <p className="leads-page-subtitle">Your won clients, with their complete relationship and work history.</p>
        </div>
        <div className="customer-actions">
          <button className="btn secondary outline" type="button" onClick={handleExport}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>
            Export
          </button>
          {isManager && (
            <Link className="btn secondary outline" to="/customers/import?scope=client">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>
              Import clients
            </Link>
          )}
          <Link to="/customers/new?scope=client" className="btn primary btn-add-primary">
            + Add client
          </Link>
        </div>
      </section>

      {error && <div className="notice danger" style={{ margin: '0 32px 16px 32px' }}>{error}</div>}

      {/* 2. 4-Column KPI Grid */}
      <section className="lead-kpi-grid" aria-label="Clients overview">
        {/* Card 1: New clients */}
        <a className="lead-kpi-card" href="#/clients?view=new" onClick={e => { e.preventDefault(); handleFilterChange('view', 'new'); }}>
          <div className="lead-kpi-icon-wrap" style={{ background: '#eff6ff', color: '#3b82f6' }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>
          </div>
          <div className="lead-kpi-body">
            <div className="lead-kpi-text-stack">
              <span className="lead-kpi-heading">New {crmTerms.recordPlural.toLowerCase()}</span>
              <span className="lead-kpi-subtext">Won in last 7 days</span>
            </div>
            <div className="lead-kpi-num-stack">
              <span className="lead-kpi-number">{clientStats.newClients}</span>
              <span className="lead-kpi-trend trend-up">↑ {clientStats.newClients}</span>
            </div>
          </div>
        </a>

        {/* Card 2: Total clients */}
        <a className="lead-kpi-card" href="#/clients?view=all" onClick={e => { e.preventDefault(); handleFilterChange('view', 'all'); }}>
          <div className="lead-kpi-icon-wrap" style={{ background: '#ecfdf5', color: '#10b981' }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>
          </div>
          <div className="lead-kpi-body">
            <div className="lead-kpi-text-stack">
              <span className="lead-kpi-heading">Total {crmTerms.recordPlural.toLowerCase()}</span>
              <span className="lead-kpi-subtext">Active relationships</span>
            </div>
            <div className="lead-kpi-num-stack">
              <span className="lead-kpi-number">{clientStats.totalClients}</span>
            </div>
          </div>
        </a>

        {/* Card 3: Portfolio value */}
        <a className="lead-kpi-card" href="#/clients?view=high-value" onClick={e => { e.preventDefault(); handleFilterChange('view', 'high-value'); }}>
          <div className="lead-kpi-icon-wrap" style={{ background: '#fff7ed', color: '#ea580c' }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div className="lead-kpi-body">
            <div className="lead-kpi-text-stack">
              <span className="lead-kpi-heading">Portfolio value</span>
              <span className="lead-kpi-subtext">Converted client value</span>
            </div>
            <div className="lead-kpi-num-stack">
              <span className="lead-kpi-number" style={{ fontSize: '1.15rem' }}>Rs. {(clientStats.totalValue || 0).toLocaleString('en-IN')}</span>
            </div>
          </div>
        </a>

        {/* Card 4: High priority clients */}
        <a className="lead-kpi-card" href="#/clients?view=high-priority" onClick={e => { e.preventDefault(); handleFilterChange('view', 'high-priority'); }}>
          <div className="lead-kpi-icon-wrap" style={{ background: '#faf5ff', color: '#7c3aed' }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
          </div>
          <div className="lead-kpi-body">
            <div className="lead-kpi-text-stack">
              <span className="lead-kpi-heading">High priority</span>
              <span className="lead-kpi-subtext">VIP accounts</span>
            </div>
            <div className="lead-kpi-num-stack">
              <span className="lead-kpi-number">{clientStats.highPriorityCount || 0}</span>
            </div>
          </div>
        </a>
      </section>

      {/* 3. View Tabs Bar */}
      <nav className="lead-view-tabs" aria-label="Client views">
        {[
          ['all', 'All'],
          ['new', 'Recently won'],
          ['assigned', 'Assigned to me'],
          ['high-value', 'High value'],
          ['high-priority', 'High priority']
        ].map(([viewKey, label]) => (
          <a
            key={viewKey}
            className={(currentView === viewKey || (!searchParams.get('view') && viewKey === 'all')) ? 'active' : ''}
            href={`#/clients?view=${viewKey}`}
            onClick={e => {
              e.preventDefault();
              handleFilterChange('view', viewKey === 'all' ? '' : viewKey);
            }}
          >
            {label}
          </a>
        ))}
      </nav>

      {/* Saved Views */}
      {data && data.savedViews && data.savedViews.length > 0 && (
        <div className="saved-views-row" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem', marginTop: '0.5rem' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Saved views</span>
          {data.savedViews.map((view: { _id: string; name: string; filters: Record<string, string> }) => (
            <span className="saved-view-chip" key={view._id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: 'var(--panel-muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '0.2rem 0.5rem 0.2rem 0.75rem', fontSize: '0.75rem' }}>
              <button type="button" onClick={() => applySavedView(view)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontWeight: 600 }}>{view.name}</button>
              <button type="button" aria-label={`Delete saved view ${view.name}`} onClick={() => void deleteSavedView(view._id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1 }}>&times;</button>
            </span>
          ))}
        </div>
      )}

      {/* 4. Filters Toolbar */}
      <form className="filter-bar leads-toolbar" onSubmit={e => e.preventDefault()}>
        <div className="leads-toolbar-left">
          <input
            name="q"
            defaultValue={searchParams.get('q') || ''}
            placeholder="Search name, company, email, phone..."
            onKeyDown={e => {
              if (e.key === 'Enter') handleFilterChange('q', (e.target as HTMLInputElement).value);
            }}
          />

          <select value={searchParams.get('stage') || ''} onChange={e => handleFilterChange('stage', e.target.value)}>
            <option value="">All client statuses</option>
            {stages.map(stage => (
              <option key={stage._id} value={stage._id}>{stage.name}</option>
            ))}
          </select>

          <button className="btn secondary outline" type="button" onClick={() => setShowColumnsModal(true)}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Columns
          </button>

          <details className="advanced-filters">
            <summary className="btn secondary outline" style={{ listStyle: 'none' }}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              More filters <span style={{ fontSize: '0.7rem', color: '#ea580c', fontWeight: 800 }}>›</span>
              {advancedFilterCount > 0 && (
                <span style={{ background: '#ea580c', color: 'white', borderRadius: '50%', width: 15, height: 15, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', fontWeight: 800 }}>
                  {advancedFilterCount}
                </span>
              )}
            </summary>
            <div className="advanced-filter-popover">
              <header>
                <strong>Filter {crmTerms.recordPlural.toLowerCase()}</strong>
                <small>Narrow this workspace</small>
              </header>
              <div className="advanced-filter-fields">
                <select value={searchParams.get('label') || ''} onChange={e => handleFilterChange('label', e.target.value)}>
                  <option value="">All labels</option>
                  {labels.map(l => (
                    <option key={l._id} value={l._id}>{l.name}</option>
                  ))}
                </select>
                <select value={searchParams.get('campaign') || ''} onChange={e => handleFilterChange('campaign', e.target.value)}>
                  <option value="">All Campaigns</option>
                  {campaigns.map(c => (
                    <option key={c._id} value={c._id}>{c.name} ({c.platform})</option>
                  ))}
                </select>
                <select value={searchParams.get('sortBy') || 'recent'} onChange={e => handleFilterChange('sortBy', e.target.value)}>
                  <option value="recent">Recently Updated</option>
                  <option value="old">Oldest {crmTerms.recordPlural.toLowerCase()}</option>
                  <option value="highest-value">Highest Value</option>
                  <option value="lowest-value">Lowest Value</option>
                  <option value="name">{crmTerms.recordSingular} name</option>
                </select>
                <input
                  type="date"
                  aria-label="From date"
                  value={searchParams.get('dateFrom') || ''}
                  onChange={e => handleFilterChange('dateFrom', e.target.value)}
                />
                <input
                  type="date"
                  aria-label="To date"
                  value={searchParams.get('dateTo') || ''}
                  onChange={e => handleFilterChange('dateTo', e.target.value)}
                />
              </div>
              <footer>
                <a href="#clear" onClick={e => { e.preventDefault(); clearAdvancedFilters(); }}>Clear</a>
              </footer>
            </div>
          </details>
        </div>

        <div className="leads-toolbar-right">
          {viewBeingSaved && (
            <input
              type="text"
              className="saved-view-name-input"
              placeholder="Name this view"
              autoFocus
              style={{ width: 130, padding: '0.4rem 0.6rem', fontSize: '0.78rem', background: 'var(--input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8 }}
              onKeyDown={e => { if (e.key === 'Enter') void saveCurrentView(); if (e.key === 'Escape') setViewBeingSaved(false); }}
            />
          )}
          <button className="btn secondary outline" type="button" disabled={savingView} onClick={() => void saveCurrentView()} title="Save the current filters and columns as a reusable view">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            {viewBeingSaved ? 'Save view' : 'Save current view'}
          </button>
          <div className="view-toggle-group">
            <Link to="/clients" className="view-toggle-btn active" title="List view">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </Link>
            <Link to="/pipeline" className="view-toggle-btn" title="Kanban view">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></svg>
            </Link>
          </div>

          {isManager && (
            <Link className="btn secondary outline" to="/customers/duplicates">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Duplicates
            </Link>
          )}
        </div>
      </form>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="bulk-actions" style={{ margin: '0 32px 14px 32px' }}>
          <strong>{selectedIds.size} selected</strong>
          <select value={bulkAction} onChange={event => { setBulkAction(event.target.value); setBulkValue(''); }}>
            <option value="">Choose action</option>
            <option value="stage">Change status</option>
            <option value="transfer">Transfer</option>
            <option value="priority">Set priority</option>
            <option value="value">Set value</option>
            <option value="source">Set source</option>
            <option value="delete">Delete</option>
          </select>
          {bulkAction === 'stage' && (
            <select aria-label="New status" value={bulkValue} onChange={event => setBulkValue(event.target.value)}>
              <option value="">Choose status</option>
              {stages.filter(s => s.isActive).map(s => <option value={s._id} key={s._id}>{s.name}</option>)}
            </select>
          )}
          {bulkAction === 'transfer' && (
            <select aria-label="New owner" value={bulkValue} onChange={event => setBulkValue(event.target.value)}>
              <option value="">Unassigned</option>
              {users.map(u => <option value={u._id} key={u._id}>{u.name}</option>)}
            </select>
          )}
          {bulkAction === 'priority' && (
            <select aria-label="New priority" value={bulkValue} onChange={event => setBulkValue(event.target.value)}>
              <option value="">Choose priority</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          )}
          {['value', 'source'].includes(bulkAction) && (
            <input
              aria-label={`New ${bulkAction}`}
              placeholder={bulkAction === 'value' ? 'New deal value' : 'New source'}
              type={bulkAction === 'value' ? 'number' : 'text'}
              value={bulkValue}
              onChange={event => setBulkValue(event.target.value)}
            />
          )}
          <button
            className="btn small primary"
            type="button"
            disabled={!bulkAction || applyingBulk}
            onClick={() => void handleBulkAction()}
          >
            {applyingBulk ? 'Applying…' : 'Apply'}
          </button>
          <button
            className="btn small"
            type="button"
            onClick={() => { setSelectedIds(new Set()); setBulkAction(''); setBulkValue(''); }}
          >
            Clear selection
          </button>
        </div>
      )}

      {/* 5. Subheader Showing X-Y of Z */}
      <div className="leads-table-top-bar">
        <div className="leads-table-pagination-summary">
          <span>
            Showing {clients.length ? ((pagination.page - 1) * pagination.pageSize) + 1 : 0}-{Math.min(pagination.page * pagination.pageSize, pagination.totalResults)} of {pagination.totalResults} results
          </span>
          <div className="leads-quick-page-arrows">
            {pagination.page > 1 ? (
              <a
                href={`#/clients?page=${pagination.page - 1}`}
                onClick={e => {
                  e.preventDefault();
                  const params = new URLSearchParams(searchParams);
                  params.set('page', String(pagination.page - 1));
                  setSearchParams(params);
                }}
                aria-label="Previous page"
              >
                ‹
              </a>
            ) : (
              <span className="disabled">‹</span>
            )}
            {pagination.page < pagination.totalPages ? (
              <a
                href={`#/clients?page=${pagination.page + 1}`}
                onClick={e => {
                  e.preventDefault();
                  const params = new URLSearchParams(searchParams);
                  params.set('page', String(pagination.page + 1));
                  setSearchParams(params);
                }}
                aria-label="Next page"
              >
                ›
              </a>
            ) : (
              <span className="disabled">›</span>
            )}
          </div>
        </div>
      </div>

      {/* 6. Clients Table Card */}
      <section className="table-card leads-table-card" tabIndex={0} aria-label="Records table; use left and right arrow keys to scroll">
        <table className="data-table">
          <thead>
            <tr>
              {isManager && (
                <th className="select-col" style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size === clients.length && clients.length > 0}
                    onChange={selectAll}
                    disabled={clients.length === 0}
                    aria-label="Select all clients"
                  />
                </th>
              )}
              {visibleColumns.name && <th>CLIENT</th>}
              {visibleColumns.phone && <th>PHONE</th>}
              {visibleColumns.email && <th>EMAIL</th>}
              {visibleColumns.company && <th>COMPANY / BUSINESS</th>}
              {visibleColumns.source && <th>SOURCE</th>}
              {visibleColumns.stage && <th>CLIENT STATUS</th>}
              {visibleColumns.priority && <th>PRIORITY</th>}
              {visibleColumns.value && <th>VALUE</th>}
              {visibleColumns.followup && <th>NEXT FOLLOW-UP</th>}
              {visibleColumns.lastActivity && <th>LAST ACTIVITY</th>}
              {visibleColumns.labels && <th>LABELS</th>}
              {visibleColumns.actions && <th style={{ width: 36, textAlign: 'center' }}></th>}
            </tr>
          </thead>
          <tbody>
            {clients.map(client => {
              const pal = getAvatarColor(client.name);
              const initials = initialsOf(client.name);
              const cleanPhone = (client.phone || '').replace(/\D/g, '');
              const priority = (client.priority || 'medium').toLowerCase();
              const relActivity = formatRelativeTime(client.updatedAt);
              const companyName = client.company || (client.clientCompany as { name?: string })?.name || 'Direct Account';

              return (
                <tr key={client._id}>
                  {isManager && (
                    <td className="select-col">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(client._id)}
                        onChange={() => toggleSelect(client._id)}
                        aria-label={`Select ${client.name}`}
                      />
                    </td>
                  )}

                  {/* Column: Client Name */}
                  {visibleColumns.name && (
                    <td>
                      <div className="lead-name-cell" style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                        <span className="lead-avatar-pill" style={{ background: pal.bg, color: pal.color }} aria-hidden="true">
                          {initials}
                        </span>
                        <div className="lead-name-text-stack">
                          <Link to={`/customers/${client._id}?from=clients`} className="lead-name-link">
                            {client.name}
                          </Link>
                        </div>
                      </div>
                    </td>
                  )}

                  {/* Column: Phone */}
                  {visibleColumns.phone && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {client.phone ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <a href={`tel:${client.phone}`} style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 500, fontSize: '0.78rem' }}>
                            {client.phone}
                          </a>
                          {cleanPhone && (
                            <a
                              href={`https://wa.me/${cleanPhone}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Message on WhatsApp"
                              style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center', fontSize: '0.72rem', fontWeight: 700, textDecoration: 'none' }}
                            >
                              WA
                            </a>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--muted, #94a3b8)', fontSize: '0.76rem' }}>—</span>
                      )}
                    </td>
                  )}

                  {/* Column: Email */}
                  {visibleColumns.email && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {client.email ? (
                        <a href={`mailto:${client.email}`} style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: '0.76rem' }}>
                          {client.email}
                        </a>
                      ) : (
                        <span style={{ color: 'var(--muted, #94a3b8)', fontSize: '0.76rem' }}>—</span>
                      )}
                    </td>
                  )}

                  {/* Column: Company / Business */}
                  {visibleColumns.company && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.78rem' }}>
                        {companyName}
                      </span>
                    </td>
                  )}

                  {/* Column: Source */}
                  {visibleColumns.source && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ color: 'var(--muted)', fontSize: '0.74rem' }}>
                        {client.source || (client.campaign && client.campaign.platform) || 'Direct'}
                      </span>
                    </td>
                  )}

                  {/* Column: Status */}
                  {visibleColumns.stage && (
                    <td>
                      <span
                        className="stage-badge"
                        style={{
                          backgroundColor: client.stage?.color || '#059669',
                          color: '#fff',
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                        }}
                      >
                        {client.stage?.name || 'Won'}
                      </span>
                    </td>
                  )}

                  {/* Column: Priority */}
                  {visibleColumns.priority && (
                    <td>
                      <span className={`priority-badge priority-${priority}`}>
                        {priority.charAt(0).toUpperCase() + priority.slice(1)}
                      </span>
                    </td>
                  )}

                  {/* Column: Value */}
                  {visibleColumns.value && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span className="lead-value-text">Rs. {(client.value || 0).toLocaleString('en-IN')}</span>
                    </td>
                  )}

                  {/* Column: Next Follow-up */}
                  {visibleColumns.followup && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {client.nextFollowUpAt ? (
                        <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.74rem' }}>
                          {new Date(client.nextFollowUpAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}, {new Date(client.nextFollowUpAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted, #94a3b8)', fontSize: '0.74rem' }}>—</span>
                      )}
                    </td>
                  )}

                  {/* Column: Last Activity */}
                  {visibleColumns.lastActivity && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.74rem' }}>
                        {relActivity.time}
                      </span>
                    </td>
                  )}

                  {/* Column: Labels */}
                  {visibleColumns.labels && (
                    <td>
                      <div className="label-row" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {(client.labels || []).map(lbl => (
                          <span
                            key={lbl._id}
                            className="pill"
                            style={{
                              backgroundColor: `${lbl.color}18`,
                              color: lbl.color,
                              fontSize: '0.64rem',
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontWeight: 700
                            }}
                          >
                            {lbl.name}
                          </span>
                        ))}
                      </div>
                    </td>
                  )}

                  {/* Column: Actions */}
                  {visibleColumns.actions && (
                    <td style={{ textAlign: 'center' }}>
                      <Link className="lead-action-menu-btn" to={`/customers/${client._id}?from=clients`} title="View details">
                        ⋮
                      </Link>
                    </td>
                  )}
                </tr>
              );
            })}

            {clients.length === 0 && (
              <tr>
                <td colSpan={13} className="empty-state" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                  No {crmTerms.recordPlural.toLowerCase()} found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* 7. Bottom Pagination Footer */}
      {pagination.totalPages > 1 && (
        <div className="leads-table-footer">
          <span className="leads-total-count">
            Page {pagination.page} of {pagination.totalPages} ({pagination.totalResults} total {crmTerms.recordPlural.toLowerCase()})
          </span>
          <div className="leads-pagination-nav">
            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                className={`page-btn page-num ${page === pagination.page ? 'active' : ''}`}
                onClick={() => {
                  const params = new URLSearchParams(searchParams);
                  params.set('page', String(page));
                  setSearchParams(params);
                }}
              >
                {page}
              </button>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmBulkDelete}
        title="Delete selected clients"
        message={`Delete ${selectedIds.size} selected clients? This cannot be undone.`}
        confirmText="Delete clients"
        loading={applyingBulk}
        onCancel={() => setConfirmBulkDelete(false)}
        onConfirm={() => { setConfirmBulkDelete(false); void handleBulkAction(true); }}
      />

      {/* Columns Customization Modal */}
      <CustomizeColumnsModal
        isOpen={showColumnsModal}
        onClose={() => setShowColumnsModal(false)}
        columns={CLIENT_COLUMNS}
        columnOrder={columnOrder}
        visibleColumns={visibleColumns}
        onSave={(newOrder, newVisible) => {
          setColumnOrder(newOrder);
          setVisibleColumns(newVisible);
          localStorage.setItem('crm_client_cols_order', JSON.stringify(newOrder));
          localStorage.setItem('crm_client_cols_visible', JSON.stringify(newVisible));
        }}
        entityName={crmTerms.recordPlural.toLowerCase()}
      />
    </div>
  );
}
