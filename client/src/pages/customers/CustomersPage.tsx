import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { customersApi, downloadCustomersCsv, CustomersListResponse, ImportPreviewRow } from '../../api/customers';

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
  const csvInputRef = useRef<HTMLInputElement>(null);

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

  async function runBulkAction() {
    if (!bulkAction || selectedIds.size === 0) return;
    if (bulkAction === 'delete' && !confirm(`Delete ${selectedIds.size} selected lead(s)?`)) return;
    try {
      setWorking(true);
      setError('');
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

  function handleCsvFile(file: File | undefined | null) {
    if (!file) {
      setCsvFileName('');
      setCsvText('');
      setCsvStatus('Choose a CSV to preview its database impact.');
      return;
    }
    if (!/\.(csv)$/i.test(file.name)) {
      setCsvStatus('Invalid file type. Please select a CSV file.');
      return;
    }
    setCsvFileName(file.name);
    setCsvStatus(`Reading ${Math.max(1, Math.round(file.size / 1024))} KB file...`);
    const reader = new FileReader();
    reader.onload = event => {
      const content = String(event.target?.result || '');
      setCsvText(content);
      const lineCount = content.split(/\r?\n/).filter(l => l.trim()).length;
      setCsvStatus(`${Math.max(0, lineCount - 1)} rows ready to preview.`);
    };
    reader.readAsText(file);
  }

  async function handlePreviewImport() {
    if (!csvText.trim()) {
      setCsvStatus('Please select or paste a CSV file before previewing.');
      return;
    }
    try {
      setPreviewing(true);
      setError('');
      const result = await customersApi.importPreview({ csvData: csvText, csvFileName });
      setPreviewRows(result.preview.rows);
      setPreviewCounts({
        totalRows: result.preview.totalRows,
        createCount: result.preview.createCount,
        updateCount: result.preview.updateCount,
        skipCount: result.preview.skipCount,
      });
      setShowCsvModal(false);
      setShowPreviewModal(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import preview failed');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleConfirmImport() {
    try {
      setWorking(true);
      setError('');
      const result = await customersApi.import({ csvData: csvText, csvFileName });
      setImportResult({ imported: result.imported, updated: result.updated, skipped: result.skipped });
      setShowPreviewModal(false);
      setPreviewRows([]);
      setCsvText('');
      setCsvFileName('');
      setCsvStatus('Choose a CSV to preview its database impact.');
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import failed');
      setShowPreviewModal(false);
    } finally {
      setWorking(false);
    }
  }

  if (loading && !data) return <div className="loading">Loading {crmTerms.leadPlural}...</div>;
  if (error && !data) return <div className="alert alert-error">{error}</div>;
  if (!data) return null;

  const { data: customers, stages, labels, campaigns, users, pagination, leadStats } = data;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{crmTerms.leadPlural} <span style={{ fontSize: '0.75rem', background: '#ffedd5', color: '#ea580c', padding: '2px 8px', borderRadius: 999, fontWeight: 800 }}>{leadStats.totalLeads}</span></h1>
        <div className="header-actions">
          {isManager && (
            <Link to="/customers/duplicates" className="btn btn-secondary">
              Duplicates
            </Link>
          )}
          {isManager && <button className="btn btn-secondary" onClick={() => setShowCsvModal(true)}>Import</button>}
          <button className="btn btn-secondary" onClick={handleExport}>Export</button>
          <Link to="/customers/new" className="btn btn-primary">+ New {crmTerms.leadSingular}</Link>
        </div>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {importResult && (
        <div className="import-result">
          <div className="import-result-title">
            <span className="import-result-mark">✓</span>
            <span>
              <strong>Import complete</strong>
              <small>{importResult.imported + importResult.updated + importResult.skipped} CSV rows processed and saved to the lead database.</small>
            </span>
          </div>
          <dl>
            <div><dt>Created</dt><dd>{importResult.imported}</dd></div>
            <div><dt>Updated</dt><dd>{importResult.updated}</dd></div>
            <div><dt>Skipped</dt><dd>{importResult.skipped}</dd></div>
          </dl>
        </div>
      )}

      {/* Stats Bar */}
      <div className="stats-bar">
        <div className="stat-card">
          <span className="stat-value">{leadStats.totalLeads}</span>
          <span className="stat-label">Total</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{leadStats.newLeads}</span>
          <span className="stat-label">New (7d)</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{leadStats.qualifiedLeads}</span>
          <span className="stat-label">Qualified</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{leadStats.hotLeads}</span>
          <span className="stat-label">Hot</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{leadStats.overdueLeads}</span>
          <span className="stat-label">Overdue</span>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <input
          type="text"
          placeholder={`Search ${crmTerms.leadPlural.toLowerCase()}...`}
          defaultValue={searchParams.get('q') || ''}
          onKeyDown={e => {
            if (e.key === 'Enter') handleFilterChange('q', (e.target as HTMLInputElement).value);
          }}
        />
        <select value={searchParams.get('stage') || ''} onChange={e => handleFilterChange('stage', e.target.value)}>
          <option value="">All Stages</option>
          {stages.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
        <select value={searchParams.get('label') || ''} onChange={e => handleFilterChange('label', e.target.value)}>
          <option value="">All Labels</option>
          {labels.map(label => <option key={label._id} value={label._id}>{label.name}</option>)}
        </select>
        <select value={searchParams.get('campaign') || ''} onChange={e => handleFilterChange('campaign', e.target.value)}>
          <option value="">All Campaigns</option>
          {campaigns.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
        <select value={searchParams.get('sortBy') || 'recent'} onChange={e => handleFilterChange('sortBy', e.target.value)}>
          <option value="recent">Recently Updated</option>
          <option value="old">Oldest</option>
          <option value="highest-value">Highest Value</option>
          <option value="lowest-value">Lowest Value</option>
          <option value="name">Name A-Z</option>
        </select>
        <input type="date" aria-label="Created from" value={searchParams.get('dateFrom') || ''} onChange={e => handleFilterChange('dateFrom', e.target.value)} />
        <input type="date" aria-label="Created to" value={searchParams.get('dateTo') || ''} onChange={e => handleFilterChange('dateTo', e.target.value)} />
      </div>

      <nav className="view-tabs" aria-label="Lead views">
        {[['all', 'All'], ['new', 'New'], ['assigned', 'Assigned to me'], ['qualified', 'Qualified'], ['recent', 'Recently updated'], ['potential', 'High Potential'], ['overdue', 'Overdue']].map(([view, label]) => (
          <button key={view} className={(searchParams.get('view') || 'all') === view ? 'active' : ''} onClick={() => handleFilterChange('view', view === 'all' ? '' : view)}>{label}</button>
        ))}
      </nav>

      {selectedIds.size > 0 && <div className="bulk-actions">
        <strong>{selectedIds.size} selected</strong>
        <select value={bulkAction} onChange={event => { setBulkAction(event.target.value); setBulkValue(''); }}>
          <option value="">Choose action</option><option value="stage">Change stage</option><option value="transfer">Transfer</option><option value="priority">Set priority</option><option value="value">Set value</option><option value="source">Set source</option><option value="delete">Delete</option>
        </select>
        {bulkAction === 'stage' && <select aria-label="New stage" value={bulkValue} onChange={event => setBulkValue(event.target.value)}><option value="">Choose stage</option>{stages.filter(stage => stage.isActive).map(stage => <option value={stage._id} key={stage._id}>{stage.name}</option>)}</select>}
        {bulkAction === 'transfer' && <select aria-label="New owner" value={bulkValue} onChange={event => setBulkValue(event.target.value)}><option value="">Unassigned</option>{users.map(user => <option value={user._id} key={user._id}>{user.name}</option>)}</select>}
        {bulkAction === 'priority' && <select aria-label="New priority" value={bulkValue} onChange={event => setBulkValue(event.target.value)}><option value="">Choose priority</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>}
        {['value', 'source'].includes(bulkAction) && <input aria-label={`New ${bulkAction}`} type={bulkAction === 'value' ? 'number' : 'text'} min={bulkAction === 'value' ? 0 : undefined} value={bulkValue} onChange={event => setBulkValue(event.target.value)} />}
        <button className="btn primary" disabled={working || (bulkAction !== 'delete' && !bulkValue && bulkAction !== 'transfer')} onClick={() => void runBulkAction()}>{working ? 'Applying…' : 'Apply'}</button>
      </div>}

      {/* Table */}
      <div className="leads-table-top-bar">
        <div className="leads-table-pagination-summary">
          <span>
            Showing {customers.length ? ((pagination.page - 1) * pagination.pageSize) + 1 : 0}-{Math.min(pagination.page * pagination.pageSize, pagination.totalResults)} of {pagination.totalResults} results
          </span>
          <div className="leads-quick-page-arrows">
            <button
              type="button"
              aria-label="Previous page"
              disabled={pagination.page <= 1}
              onClick={() => { const params = new URLSearchParams(searchParams); params.set('page', String(Math.max(1, pagination.page - 1))); setSearchParams(params); }}
            >‹</button>
            <button
              type="button"
              aria-label="Next page"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => { const params = new URLSearchParams(searchParams); params.set('page', String(Math.min(pagination.totalPages, pagination.page + 1))); setSearchParams(params); }}
            >›</button>
          </div>
        </div>
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={selectedIds.size === customers.length && customers.length > 0} onChange={selectAll} /></th>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Stage</th>
              <th>Priority</th>
              <th>Value</th>
              <th>Assigned To</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {customers.map(customer => {
              const pal = getAvatarColor(customer.name);
              const cleanPhone = (customer.phone || '').replace(/\D/g, '');
              const priority = (customer.priority || 'medium').toLowerCase();
              return (
                <tr key={customer._id}>
                  <td><input type="checkbox" checked={selectedIds.has(customer._id)} onChange={() => toggleSelect(customer._id)} /></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
                      <span className="lead-avatar-pill" style={{ background: pal.bg, color: pal.color, width: 28, height: 28, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 750, fontSize: '0.7rem' }}>
                        {initialsOf(customer.name)}
                      </span>
                      <div>
                        <Link to={`/customers/${customer._id}`} style={{ fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}>
                          {customer.name}
                        </Link>
                        {customer.company ? <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{customer.company}</div> : null}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                      {customer.phone ? (
                        <>
                          <a href={`tel:${customer.phone}`} style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 500, fontSize: '0.78rem' }}>
                            {customer.phone}
                          </a>
                          {cleanPhone && (
                            <a
                              href={`https://wa.me/${cleanPhone}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Message on WhatsApp"
                              style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center', fontSize: '0.72rem', fontWeight: 700 }}
                            >
                              WA
                            </a>
                          )}
                        </>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: '0.76rem' }}>—</span>
                      )}
                    </div>
                  </td>
                  <td>
                    {customer.email ? (
                      <a href={`mailto:${customer.email}`} style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: '0.76rem' }}>
                        {customer.email}
                      </a>
                    ) : (
                      <span style={{ color: 'var(--muted)', fontSize: '0.76rem' }}>—</span>
                    )}
                  </td>
                  <td>
                    <select
                      className="lead-stage-pill-select"
                      value={customer.stage?._id || ''}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'var(--panel)',
                        color: customer.stage?.color || 'var(--text)',
                        fontWeight: 700,
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                      }}
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
                      {stages.map(s => (
                        <option key={s._id} value={s._id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        textTransform: 'capitalize',
                        background: priority === 'high' ? '#fee2e2' : priority === 'low' ? '#f0fdf4' : '#fef3c7',
                        color: priority === 'high' ? '#dc2626' : priority === 'low' ? '#16a34a' : '#d97706',
                      }}
                    >
                      {priority}
                    </span>
                  </td>
                  <td>₹{(customer.value || 0).toLocaleString('en-IN')}</td>
                  <td>{customer.assignedTo?.name || 'Unassigned'}</td>
                </tr>
              );
            })}
            {customers.length === 0 && (
              <tr><td colSpan={9} className="empty-state">No {crmTerms.leadPlural.toLowerCase()} found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="pagination">
          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(page => (
            <button
              key={page}
              className={`pagination-btn ${page === pagination.page ? 'active' : ''}`}
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
      )}

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
                <label className="csv-drop-zone">
                  <p>Drop CSV here or click to browse</p>
                  <input ref={csvInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => handleCsvFile(e.target.files?.[0])} />
                  <span>{csvFileName || 'No file selected'}</span>
                </label>
                <p className="csv-file-status">{csvStatus}</p>
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
    </div>
  );
}
