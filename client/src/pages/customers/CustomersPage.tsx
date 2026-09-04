import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { customersApi, downloadCustomersCsv, downloadImportTemplate, CustomersListResponse, ImportPreviewRow } from '../../api/customers';
import ConfirmDialog from '../../components/ConfirmDialog';
import CustomizeColumnsModal, { ColumnDefinition } from '../../components/CustomizeColumnsModal';
import { SCHEMA_OPTIONS, parseCsvRow, suggestTarget } from '../../utils/importCsv';

const CUSTOMER_COLUMNS: ColumnDefinition[] = [
  { key: 'name', label: 'Lead', icon: 'user', defaultVisible: true },
  { key: 'phone', label: 'Phone', icon: 'phone', defaultVisible: true },
  { key: 'email', label: 'Email', icon: 'mail', defaultVisible: true },
  { key: 'course', label: 'Course / Business', icon: 'briefcase', defaultVisible: true },
  { key: 'source', label: 'Source', icon: 'compass', defaultVisible: true },
  { key: 'stage', label: 'Stage', icon: 'git-commit-horizontal', defaultVisible: true },
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
  return (name || 'L').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'L';
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

const PRIORITY_MOD = { high: 'High', medium: 'Medium', low: 'Low' } as const;

export default function CustomersPage() {
  const { crmTerms, user, activeCompany } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<CustomersListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState('');
  const [bulkValue, setBulkValue] = useState('');
  const [working, setWorking] = useState(false);

  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvFileName, setCsvFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [csvStatus, setCsvStatus] = useState('Choose a CSV to preview its database impact.');
  const [previewing, setPreviewing] = useState(false);
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [previewCounts, setPreviewCounts] = useState({ totalRows: 0, createCount: 0, updateCount: 0, skipCount: 0 });
  const [importResult, setImportResult] = useState<{ imported: number; updated: number; skipped: number } | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [duplicateRule, setDuplicateRule] = useState<'update' | 'skip' | 'create'>('update');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvMappings, setCsvMappings] = useState<Record<string, string>>({});
  const [defaultStageId, setDefaultStageId] = useState('');
  const [defaultAssignedToId, setDefaultAssignedToId] = useState('');
  const [defaultClientCompanyId, setDefaultClientCompanyId] = useState('');
  const [defaultNextFollowUpAt, setDefaultNextFollowUpAt] = useState('');
  const [defaultFollowUpComment, setDefaultFollowUpComment] = useState('');
  const [importStages, setImportStages] = useState<{ _id: string; name: string; isDefault?: boolean }[]>([]);
  const [importUsers, setImportUsers] = useState<{ _id: string; name: string }[]>([]);
  const [importCompanies, setImportCompanies] = useState<{ _id: string; name: string }[]>([]);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Column visibility & order
  const [showColumnsModal, setShowColumnsModal] = useState(false);
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('crm_customer_cols_order');
      return stored ? JSON.parse(stored) : CUSTOMER_COLUMNS.map(c => c.key);
    } catch {
      return CUSTOMER_COLUMNS.map(c => c.key);
    }
  });
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('crm_customer_cols_visible');
      return stored ? JSON.parse(stored) : {
        name: true,
        phone: true,
        email: true,
        course: true,
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
        course: true,
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
      const result = await customersApi.list(params);
      setData(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }

  function handleBulkApply() {
    if (!bulkAction || selectedIds.size === 0) return;
    if (bulkAction === 'delete') {
      setShowBulkDeleteConfirm(true);
      return;
    }
    void executeBulkAction();
  }

  async function executeBulkAction() {
    try {
      setWorking(true);
      setError('');
      setShowBulkDeleteConfirm(false);
      const payload: { action: string; selectedIds: string[]; [key: string]: unknown } = {
        action: bulkAction,
        selectedIds: [...selectedIds]
      };
      if (bulkAction === 'stage') payload.stageId = bulkValue;
      else if (bulkAction === 'transfer') payload.assignedTo = bulkValue;
      else payload[bulkAction] = bulkValue;
      await customersApi.bulk(payload);
      setSelectedIds(new Set());
      setBulkAction('');
      setBulkValue('');
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Bulk update failed');
    } finally {
      setWorking(false);
    }
  }

  function handleFilterChange(key: string, value: string) {
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
        scope: 'leads',
        dateFrom: searchParams.get('dateFrom') || '',
        dateTo: searchParams.get('dateTo') || '',
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Export failed');
    }
  }

  async function openCsvModal() {
    setShowCsvModal(true);
    try {
      const res = await customersApi.list({ pageSize: '1' });
      if (res.stages) setImportStages(res.stages);
      if (res.users) setImportUsers(res.users);
      if (res.companies) setImportCompanies(res.companies);
    } catch { /* defaults remain empty */ }
  }

  function handleCsvFile(file: File | undefined | null) {
    if (!file) {
      setCsvFileName('');
      setCsvText('');
      setCsvHeaders([]);
      setCsvMappings({});
      setCsvStatus('Choose a CSV to preview its database impact.');
      return;
    }
    if (!/\.csv$/i.test(file.name)) {
      setCsvFileName(file.name);
      setCsvText('');
      setCsvHeaders([]);
      setCsvMappings({});
      setCsvStatus('Excel files (.xlsx/.xls) are not supported on this screen yet. Export the sheet as CSV (File → Save As → CSV UTF-8) and upload that file instead.');
      return;
    }
    setCsvFileName(file.name);
    setCsvStatus(`Reading ${file.name}...`);
    const reader = new FileReader();
    reader.onload = e => {
      const text = String(e.target?.result || '');
      setCsvText(text);
      const lines = text.split(/\r?\n/);
      const headers = parseCsvRow(lines[0] || '').filter(header => header.trim());
      setCsvHeaders(headers);
      const initialMappings: Record<string, string> = {};
      headers.forEach(header => { initialMappings[header] = suggestTarget(header); });
      setCsvMappings(initialMappings);
      setCsvStatus(`Loaded ${file.name} (${Math.max(0, lines.length - 1)} rows). Review mappings and click Preview.`);
    };
    reader.onerror = () => {
      setCsvStatus('Failed to read CSV file.');
    };
    reader.readAsText(file);
  }

  async function handlePreviewImport() {
    if (!csvText.trim()) return;
    try {
      setPreviewing(true);
      setError('');
      const result = await customersApi.importPreview({
        csvData: csvText,
        csvFileName,
        duplicateRule,
        mappings: csvMappings,
        defaultStageId,
        defaultAssignedToId,
        defaultClientCompanyId,
        defaultNextFollowUpAt,
        defaultFollowUpComment,
      });
      setPreviewRows(result.preview.rows);
      setPreviewCounts({
        totalRows: result.preview.totalRows,
        createCount: result.preview.createCount,
        updateCount: result.preview.updateCount,
        skipCount: result.preview.skipCount,
      });
      setShowPreviewModal(true);
      setShowCsvModal(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleConfirmImport() {
    if (!csvText.trim()) return;
    try {
      setWorking(true);
      setError('');
      const result = await customersApi.import({
        csvData: csvText,
        csvFileName,
        duplicateRule,
        mappings: csvMappings,
        defaultStageId,
        defaultAssignedToId,
        defaultClientCompanyId,
        defaultNextFollowUpAt,
        defaultFollowUpComment,
      });
      setImportResult({
        imported: result.imported,
        updated: result.updated,
        skipped: result.skipped,
      });
      setShowPreviewModal(false);
      setCsvText('');
      setCsvFileName('');
      setCsvHeaders([]);
      setCsvMappings({});
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import failed');
      setShowPreviewModal(false);
    } finally {
      setWorking(false);
    }
  }

  if (loading && !data) return <div className="loading" style={{ padding: '2rem 2rem' }}>Loading {crmTerms.leadPlural}...</div>;
  if (error && !data) return <div className="alert alert-error" style={{ margin: '2rem' }}>{error}</div>;
  if (!data) return null;

  const { data: customers, stages, labels, campaigns, users, pagination, leadStats } = data;
  const currentView = searchParams.get('view') || 'all';

  const advancedFilterCount = [
    searchParams.get('label'),
    searchParams.get('campaign'),
    searchParams.get('dateFrom'),
    searchParams.get('dateTo'),
    searchParams.get('sortBy') && searchParams.get('sortBy') !== 'recent' ? searchParams.get('sortBy') : null
  ].filter(Boolean).length;

  return (
    <div className="customers-page" style={{ paddingBottom: '3rem' }}>
      {/* 1. Page Head */}
      <section className="leads-page-head">
        <div className="leads-page-title-group">
          <h1>
            {crmTerms.leadPlural}
            <span className="lead-count-badge">{leadStats.totalLeads}</span>
          </h1>
          <p className="leads-page-subtitle">Track every enquiry from first contact to conversion.</p>
        </div>
        <div className="customer-actions">
          {isManager && (
            <button className="btn secondary outline" type="button" onClick={() => void openCsvModal()}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>
              Import
            </button>
          )}
          <button className="btn secondary outline" type="button" onClick={handleExport}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>
            Export
          </button>
          <Link to="/customers/new" className="btn primary btn-add-primary">
            + Add lead
          </Link>
        </div>
      </section>

      {error && <div className="notice danger" style={{ margin: '0 32px 16px 32px' }}>{error}</div>}

      {importResult && (
        <section className="import-result" aria-live="polite" style={{ margin: '0 32px 16px 32px' }}>
          <div>
            <span className="import-result-mark" aria-hidden="true">✓</span>
            <span>
              <strong>Import complete</strong>
              <small>{importResult.imported + importResult.updated + importResult.skipped} CSV rows processed and saved to the lead database.</small>
            </span>
          </div>
          <dl>
            <div><dt>Processed</dt><dd>{importResult.imported + importResult.updated + importResult.skipped}</dd></div>
            <div><dt>Created</dt><dd>{importResult.imported}</dd></div>
            <div><dt>Updated</dt><dd>{importResult.updated}</dd></div>
            <div><dt>Skipped</dt><dd>{importResult.skipped}</dd></div>
          </dl>
        </section>
      )}

      {/* 2. 4-Column KPI Grid */}
      <section className="lead-kpi-grid" aria-label="Leads overview">
        {/* Card 1: New leads */}
        <a className="lead-kpi-card" href="#/customers?view=new" onClick={e => { e.preventDefault(); handleFilterChange('view', 'new'); }}>
          <div className="lead-kpi-icon-wrap" style={{ background: '#eff6ff', color: '#3b82f6' }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div className="lead-kpi-body">
            <div className="lead-kpi-text-stack">
              <span className="lead-kpi-heading">New leads</span>
              <span className="lead-kpi-subtext">Last 7 days</span>
            </div>
            <div className="lead-kpi-num-stack">
              <span className="lead-kpi-number">{leadStats.newLeads}</span>
              <span className="lead-kpi-trend trend-up">↑ 12%</span>
            </div>
          </div>
        </a>

        {/* Card 2: Qualified */}
        <a className="lead-kpi-card" href="#/customers?view=qualified" onClick={e => { e.preventDefault(); handleFilterChange('view', 'qualified'); }}>
          <div className="lead-kpi-icon-wrap" style={{ background: '#ecfdf5', color: '#10b981' }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
          </div>
          <div className="lead-kpi-body">
            <div className="lead-kpi-text-stack">
              <span className="lead-kpi-heading">Qualified</span>
              <span className="lead-kpi-subtext">Ready to close</span>
            </div>
            <div className="lead-kpi-num-stack">
              <span className="lead-kpi-number">{leadStats.qualifiedLeads}</span>
              <span className="lead-kpi-trend trend-up">↑ 8%</span>
            </div>
          </div>
        </a>

        {/* Card 3: HP (High Potential) */}
        <a className="lead-kpi-card" href="#/customers?view=potential" onClick={e => { e.preventDefault(); handleFilterChange('view', 'potential'); }}>
          <div className="lead-kpi-icon-wrap" style={{ background: '#fff7ed', color: '#f97316' }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </div>
          <div className="lead-kpi-body">
            <div className="lead-kpi-text-stack">
              <span className="lead-kpi-heading">HP (High Potential)</span>
              <span className="lead-kpi-subtext">Team-selected labels or HP stage</span>
            </div>
            <div className="lead-kpi-num-stack">
              <span className="lead-kpi-number">{leadStats.hotLeads}</span>
              <span className="lead-kpi-trend trend-neutral">→ 0%</span>
            </div>
          </div>
        </a>

        {/* Card 4: Follow-ups due */}
        <a className="lead-kpi-card" href="#/customers?view=followup" onClick={e => { e.preventDefault(); handleFilterChange('view', 'followup'); }}>
          <div className="lead-kpi-icon-wrap" style={{ background: '#fef2f2', color: '#ef4444' }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div className="lead-kpi-body">
            <div className="lead-kpi-text-stack">
              <span className="lead-kpi-heading">Follow-ups due</span>
              <span className="lead-kpi-subtext">Needs attention</span>
            </div>
            <div className="lead-kpi-num-stack">
              <span className="lead-kpi-number">{leadStats.overdueLeads}</span>
              <span className="lead-kpi-trend trend-neutral">→ 0%</span>
            </div>
          </div>
        </a>
      </section>

      {/* 3. View Tabs Bar */}
      <nav className="lead-view-tabs" aria-label="Lead views">
        {[
          ['all', 'All'],
          ['new', 'New'],
          ['assigned', 'Assigned to me'],
          ['qualified', 'Qualified'],
          ['followup', 'Follow-up due'],
          ['potential', 'HP (High Potential)']
        ].map(([viewKey, label]) => (
          <a
            key={viewKey}
            className={(currentView === viewKey || (!searchParams.get('view') && viewKey === 'all')) ? 'active' : ''}
            href={`#/customers?view=${viewKey}`}
            onClick={e => {
              e.preventDefault();
              handleFilterChange('view', viewKey === 'all' ? '' : viewKey);
            }}
          >
            {label}
          </a>
        ))}
      </nav>

      {/* 3b. Saved Views */}
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
            <option value="">All stages</option>
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
                <strong>Filter leads</strong>
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
                  <option value="old">Oldest leads</option>
                  <option value="highest-value">Highest Value</option>
                  <option value="lowest-value">Lowest Value</option>
                  <option value="name">Lead name</option>
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
            <Link to="/customers" className="view-toggle-btn active" title="List view">
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
            <option value="stage">Change stage</option>
            <option value="transfer">Transfer</option>
            <option value="priority">Set priority</option>
            <option value="value">Set value</option>
            <option value="source">Set source</option>
            <option value="delete">Delete</option>
          </select>
          {bulkAction === 'stage' && (
            <select aria-label="New stage" value={bulkValue} onChange={event => setBulkValue(event.target.value)}>
              <option value="">Choose stage</option>
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
              type={bulkAction === 'value' ? 'number' : 'text'}
              min={bulkAction === 'value' ? 0 : undefined}
              value={bulkValue}
              onChange={event => setBulkValue(event.target.value)}
            />
          )}
          <button
            className="btn primary"
            disabled={working || (bulkAction !== 'delete' && !bulkValue && bulkAction !== 'transfer')}
            onClick={handleBulkApply}
          >
            {working ? 'Applying…' : 'Apply'}
          </button>
        </div>
      )}

      {/* 5. Subheader Showing X-Y of Z */}
      <div className="leads-table-top-bar">
        <div className="leads-table-pagination-summary">
          <span>
            Showing {customers.length ? ((pagination.page - 1) * pagination.pageSize) + 1 : 0}-{Math.min(pagination.page * pagination.pageSize, pagination.totalResults)} of {pagination.totalResults} results
          </span>
          <div className="leads-quick-page-arrows">
            {pagination.page > 1 ? (
              <a
                href={`#/customers?page=${pagination.page - 1}`}
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
                href={`#/customers?page=${pagination.page + 1}`}
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

      {/* 6. Leads Table Card */}
      <section className="table-card leads-table-card" tabIndex={0} aria-label="Records table; use left and right arrow keys to scroll">
        <table className="data-table">
          <thead>
            <tr>
              {isManager && (
                <th className="select-col" style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size === customers.length && customers.length > 0}
                    onChange={selectAll}
                    disabled={customers.length === 0}
                    aria-label="Select all leads"
                  />
                </th>
              )}
              {visibleColumns.name && <th>LEAD</th>}
              {visibleColumns.phone && <th>PHONE</th>}
              {visibleColumns.email && <th>EMAIL</th>}
              {visibleColumns.course && <th>COURSE / BUSINESS</th>}
              {visibleColumns.source && <th>SOURCE</th>}
              {visibleColumns.stage && <th>STAGE</th>}
              {visibleColumns.priority && <th>PRIORITY</th>}
              {visibleColumns.value && <th>VALUE</th>}
              {visibleColumns.followup && <th>NEXT FOLLOW-UP</th>}
              {visibleColumns.lastActivity && <th>LAST ACTIVITY</th>}
              {visibleColumns.labels && <th>LABELS</th>}
              {visibleColumns.actions && <th style={{ width: 36, textAlign: 'center' }}></th>}
            </tr>
          </thead>
          <tbody>
            {customers.map(customer => {
              const pal = getAvatarColor(customer.name);
              const initials = initialsOf(customer.name);
              const cleanPhone = (customer.phone || '').replace(/\D/g, '');
              const priority = (customer.priority || 'medium').toLowerCase();
              const relActivity = formatRelativeTime(customer.updatedAt);
              const leadCourse = customer.campaign?.name || (customer.customData?.specialization_course as string) || '';

              // Dynamic stage pill background colors based on stage name
              const stageName = customer.stage?.name || '';
              let stageBg = '#eff6ff';
              let stageColor = '#2563eb';
              if (/proposal/i.test(stageName)) { stageBg = '#fff7ed'; stageColor = '#ea580c'; }
              else if (/qualified/i.test(stageName)) { stageBg = '#ecfdf5'; stageColor = '#059669'; }
              else if (/contacted/i.test(stageName)) { stageBg = '#faf5ff'; stageColor = '#7c3aed'; }
              else if (/follow/i.test(stageName)) { stageBg = '#ecfeff'; stageColor = '#0891b2'; }

              return (
                <tr key={customer._id}>
                  {isManager && (
                    <td className="select-col">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(customer._id)}
                        onChange={() => toggleSelect(customer._id)}
                        aria-label={`Select ${customer.name}`}
                      />
                    </td>
                  )}

                  {/* Column: Lead Name */}
                  {visibleColumns.name && (
                    <td>
                      <div className="lead-name-cell" style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                        <span className="lead-avatar-pill" style={{ background: pal.bg, color: pal.color }} aria-hidden="true">
                          {initials}
                        </span>
                        <div className="lead-name-text-stack">
                          <Link to={`/customers/${customer._id}`} className="lead-name-link">
                            {customer.name}
                          </Link>
                          {customer.company && <span className="lead-sub-text">{customer.company}</span>}
                        </div>
                      </div>
                    </td>
                  )}

                  {/* Column: Phone */}
                  {visibleColumns.phone && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {customer.phone ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <a href={`tel:${customer.phone}`} style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 500, fontSize: '0.78rem' }}>
                            {customer.phone}
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
                      {customer.email ? (
                        <a href={`mailto:${customer.email}`} style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: '0.76rem' }}>
                          {customer.email}
                        </a>
                      ) : (
                        <span style={{ color: 'var(--muted, #94a3b8)', fontSize: '0.76rem' }}>—</span>
                      )}
                    </td>
                  )}

                  {/* Column: Course / Business */}
                  {visibleColumns.course && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.78rem' }}>
                        {leadCourse || customer.company || '—'}
                      </span>
                    </td>
                  )}

                  {/* Column: Source */}
                  {visibleColumns.source && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ color: 'var(--muted)', fontSize: '0.74rem' }}>
                        {customer.source || (customer.campaign && customer.campaign.platform) || 'Direct Lead'}
                      </span>
                    </td>
                  )}

                  {/* Column: Stage */}
                  {visibleColumns.stage && (
                    <td>
                      <select
                        className="lead-stage-pill-select"
                        value={customer.stage?._id || ''}
                        style={{ backgroundColor: stageBg, color: stageColor }}
                        onChange={async e => {
                          const newStageId = e.target.value;
                          if (!newStageId) return;
                          try {
                            await customersApi.updateStage(customer._id, newStageId);
                            await loadData();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Failed to update stage');
                          }
                        }}
                      >
                        <option value="" disabled>Unassigned</option>
                        {stages.map(s => (
                          <option key={s._id} value={s._id}>{s.name}</option>
                        ))}
                      </select>
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
                      <span className="lead-value-text">Rs. {(customer.value || 0).toLocaleString('en-IN')}</span>
                    </td>
                  )}

                  {/* Column: Next Follow-up */}
                  {visibleColumns.followup && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {customer.nextFollowUpAt ? (
                        <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.74rem' }}>
                          {new Date(customer.nextFollowUpAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}, {new Date(customer.nextFollowUpAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
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
                        {(customer.labels || []).map(lbl => (
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
                      <Link className="lead-action-menu-btn" to={`/customers/${customer._id}`} title="View details">
                        ⋮
                      </Link>
                    </td>
                  )}
                </tr>
              );
            })}

            {customers.length === 0 && (
              <tr>
                <td colSpan={13} className="empty-state" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                  No {crmTerms.leadPlural.toLowerCase()} found.
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
            Page {pagination.page} of {pagination.totalPages} ({pagination.totalResults} total {crmTerms.leadPlural.toLowerCase()})
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

      {/* Columns Customization Modal */}
      <CustomizeColumnsModal
        isOpen={showColumnsModal}
        onClose={() => setShowColumnsModal(false)}
        columns={CUSTOMER_COLUMNS}
        columnOrder={columnOrder}
        visibleColumns={visibleColumns}
        onSave={(newOrder, newVisible) => {
          setColumnOrder(newOrder);
          setVisibleColumns(newVisible);
          localStorage.setItem('crm_customer_cols_order', JSON.stringify(newOrder));
          localStorage.setItem('crm_customer_cols_visible', JSON.stringify(newVisible));
        }}
        entityName={crmTerms.leadPlural.toLowerCase()}
      />

      {/* CSV Import Modal */}
      {showCsvModal && (
        <div className="csv-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowCsvModal(false); }}>
          <div className="csv-modal">
            <div className="csv-modal-header">
              <h3>CSV Database Actions</h3>
              <button className="csv-modal-close" type="button" onClick={() => setShowCsvModal(false)}>&times;</button>
            </div>
            <div className="csv-actions">
              <button className="btn btn-secondary" onClick={() => void handleExport()}>Export Leads</button>
            </div>
            {isManager && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <h4 style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--gold)', margin: '0 0 0.5rem' }}>Import Leads from CSV</h4>
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', marginBottom: '0.75rem' }}
                  type="button"
                  onClick={() => void downloadImportTemplate().catch(err => setError(err instanceof Error ? err.message : 'Template download failed'))}
                >
                  Download import template
                </button>
                <label className="csv-drop-zone">
                  <p>Drop CSV here or click to browse</p>
                  <input ref={csvInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => handleCsvFile(e.target.files?.[0])} />
                  <span>{csvFileName || 'No file selected'}</span>
                </label>
                <p className="csv-file-status">{csvStatus}</p>
                {csvHeaders.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.75rem', paddingTop: '0.75rem' }}>
                    <h4 style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text)', margin: '0 0 0.6rem' }}>Match Columns to {crmTerms.recordSingular} Fields</h4>
                    <div style={{ maxHeight: 220, overflow: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      {csvHeaders.map(header => (
                        <label key={header} style={{ display: 'grid', gap: '0.2rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--muted)', padding: '0.15rem 0' }}>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text)', fontWeight: 700 }}>{header}</span>
                          <select className="app-select" value={csvMappings[header] || header} onChange={e => setCsvMappings(prev => ({ ...prev, [header]: e.target.value }))}>
                            {SCHEMA_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                            <option value={header}>New custom field</option>
                            <option value="__ignore">Ignore column</option>
                          </select>
                        </label>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.75rem' }}>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700 }}>
                        Default pipeline stage
                        <select className="app-select" style={{ display: 'block', width: '100%', marginTop: '0.25rem' }} value={defaultStageId} onChange={e => setDefaultStageId(e.target.value)}>
                          <option value="">Default CRM Stage</option>
                          {importStages.map(stage => (
                            <option key={stage._id} value={stage._id}>{stage.name} {stage.isDefault ? '(Default)' : ''}</option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700 }}>
                        Default owner
                        <select className="app-select" style={{ display: 'block', width: '100%', marginTop: '0.25rem' }} value={defaultAssignedToId} onChange={e => setDefaultAssignedToId(e.target.value)}>
                          <option value="">Current user ({user?.name || 'Me'})</option>
                          {importUsers.map(importUser => (
                            <option key={importUser._id} value={importUser._id}>{importUser.name}</option>
                          ))}
                        </select>
                      </label>
                      {importCompanies.length > 0 && (
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700 }}>
                          Default company
                          <select className="app-select" style={{ display: 'block', width: '100%', marginTop: '0.25rem' }} value={defaultClientCompanyId} onChange={e => setDefaultClientCompanyId(e.target.value)}>
                            <option value="">{activeCompany?.name || 'Default company'}</option>
                            {importCompanies.map(company => (
                              <option key={company._id} value={company._id}>{company.name}</option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700 }}>
                        Default follow-up date & time (optional)
                        <input type="datetime-local" className="app-select" style={{ display: 'block', width: '100%', marginTop: '0.25rem' }} value={defaultNextFollowUpAt} onChange={e => setDefaultNextFollowUpAt(e.target.value)} />
                      </label>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, gridColumn: '1 / -1' }}>
                        Default follow-up comment (optional)
                        <input className="app-select" maxLength={1000} placeholder="Why and what should happen next" style={{ display: 'block', width: '100%', marginTop: '0.25rem' }} value={defaultFollowUpComment} onChange={e => setDefaultFollowUpComment(e.target.value)} />
                      </label>
                    </div>
                  </div>
                )}
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, margin: '0.75rem 0 0.25rem' }}>
                  On duplicate match
                  <select value={duplicateRule} onChange={e => setDuplicateRule(e.target.value as 'update' | 'skip' | 'create')} className="app-select" style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}>
                    <option value="update">Update existing record</option>
                    <option value="skip">Skip duplicate</option>
                    <option value="create">Create new anyway</option>
                  </select>
                </label>
                <button className="btn btn-primary" style={{ width: '100%' }} type="button" disabled={previewing || !csvText.trim()} onClick={() => void handlePreviewImport()}>
                  {previewing ? 'Previewing...' : 'Preview Import'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import Preview Modal */}
      {showPreviewModal && (
        <div className="csv-modal-overlay">
          <div className="csv-modal" style={{ maxWidth: 860 }}>
            <div className="csv-modal-header">
              <h3>Preview {crmTerms.leadSingular} Import{activeCompany ? ` into ${activeCompany.name}` : ''}</h3>
              <button className="csv-modal-close" type="button" onClick={() => setShowPreviewModal(false)}>&times;</button>
            </div>

            <div className="csv-preview-stats">
              <div className="csv-preview-stat"><span>Total rows</span><strong>{previewCounts.totalRows}</strong></div>
              <div className="csv-preview-stat create"><span>Will create</span><strong>{previewCounts.createCount}</strong></div>
              <div className="csv-preview-stat update"><span>Will update</span><strong>{previewCounts.updateCount}</strong></div>
              <div className="csv-preview-stat skip"><span>Will skip</span><strong>{previewCounts.skipCount}</strong></div>
            </div>

            <div className="table-container" style={{ maxHeight: 380, overflow: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Row</th><th>Status</th><th>{crmTerms.leadSingular}</th><th>Contact</th><th>Messages</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 50).map(row => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td><span className="stage-badge" style={{ backgroundColor: row.status === 'skip' ? 'var(--muted)' : row.status === 'update' ? 'var(--gold)' : 'var(--teal)', color: row.status !== 'update' ? '#fff' : 'var(--text)' }}>{row.status.toUpperCase()}</span></td>
                      <td><strong>{row.name}</strong></td>
                      <td>
                        <span style={{ display: 'block' }}>{row.phone || 'No phone'}</span>
                        <span style={{ display: 'block', color: 'var(--muted)', fontSize: '.75rem' }}>{row.email || 'No email'}</span>
                      </td>
                      <td>
                        {row.messages.length === 0 && <span style={{ color: 'var(--muted)' }}>Ready</span>}
                        {row.messages.map((msg, i) => <span key={i} style={{ display: 'block', color: 'var(--red)', fontWeight: 700 }}>{msg}</span>)}
                      </td>
                    </tr>
                  ))}
                  {previewRows.length === 0 && <tr><td colSpan={5} className="empty-state" style={{ textAlign: 'center', padding: '2rem' }}>No data rows were found in this CSV.</td></tr>}
                </tbody>
              </table>
            </div>
            {previewCounts.totalRows > 50 && <p style={{ color: 'var(--muted)', fontSize: '.78rem', padding: '.75rem 0 0' }}>Showing the first 50 of {previewCounts.totalRows} rows. All rows will be imported.</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.75rem', marginTop: '1.25rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowPreviewModal(false)}>Back</button>
              <button className="btn btn-primary" disabled={working || previewCounts.totalRows === 0} onClick={() => void handleConfirmImport()}>
                {working ? 'Importing...' : `Import ${previewCounts.totalRows} rows`}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showBulkDeleteConfirm}
        title="Confirm Bulk Delete"
        message={`Are you sure you want to delete ${selectedIds.size} selected ${selectedIds.size === 1 ? crmTerms.leadSingular.toLowerCase() : crmTerms.leadPlural.toLowerCase()}? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        onConfirm={executeBulkAction}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />
    </div>
  );
}
