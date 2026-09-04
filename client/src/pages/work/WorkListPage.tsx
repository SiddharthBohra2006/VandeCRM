import { useState, useEffect, useMemo, Fragment } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { workApi, WorkType, WorkItem, WorkTypeField } from '../../api/work';
import { useAuth } from '../../contexts/AuthContext';
import { parseCsv } from '../../utils/importCsv';

type ViewMode = 'list' | 'board' | 'calendar' | 'overview';

const CORE_FIELDS: WorkTypeField[] = [
  { key: 'title', label: 'Title', type: 'text' },
  { key: 'status', label: 'Status', type: 'status' },
  { key: 'priority', label: 'Priority', type: 'text' },
  { key: 'deadline', label: 'Deadline', type: 'date' },
  { key: 'startDate', label: 'Start date', type: 'date' },
  { key: 'deliveredAt', label: 'Delivered date', type: 'date' },
  { key: 'assignedTo', label: 'Owner', type: 'user-picker' },
  { key: 'secondaryAssignee', label: 'Secondary assignee', type: 'user-picker' },
  { key: 'collaborators', label: 'Collaborators', type: 'user-picker' },
  { key: 'customer', label: 'Business', type: 'customer-picker' },
  { key: 'notes', label: 'Notes', type: 'text' },
];

export default function WorkListPage() {
  const { type = 'task' } = useParams<{ type: string }>();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

const [workType, setWorkType] = useState<WorkType | null>(null);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({
    title: '',
    status: '',
    priority: 'medium',
    deadline: '',
    startDate: '',
    assignedTo: '',
    customer: '',
    notes: '',
    customFields: {},
  });

  const [showImport, setShowImport] = useState(false);
  const [importCsvText, setImportCsvText] = useState('');
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importPreviewRows, setImportPreviewRows] = useState<string[][]>([]);
  const [importing, setImporting] = useState(false);

  const currentStatus = searchParams.get('status') || '';
  const currentPriority = searchParams.get('priority') || '';
  const searchQuery = searchParams.get('q') || '';
  const view = (searchParams.get('view') || '') as ViewMode;
  const month = searchParams.get('month') || '';

  const enabledViews = workType?.presentation?.enabledViews || ['list', 'board', 'calendar'];
  const defaultView = workType?.presentation?.defaultView || 'list';
  const activeView: ViewMode = enabledViews.includes(view) ? view : (defaultView as ViewMode);
  const calendarField = workType?.presentation?.calendarField || 'deadline';
  const listColumns = workType?.presentation?.listColumns || ['title', 'assignedTo', 'status', 'deadline'];
  const boardFields = workType?.presentation?.boardFields || ['assignedTo', 'priority', 'deadline'];

  const fieldMap = useMemo(() => {
    const map = new Map<string, WorkTypeField>();
    [...CORE_FIELDS, ...(workType?.fields?.map(f => ({ ...f, key: `custom:${f.key}` })) || [])].forEach(f => map.set(f.key, f));
    const labels = workType?.presentation?.fieldLabels || {};
    map.forEach((f, k) => { if (labels[k]) map.set(k, { ...f, label: labels[k] }); });
    return map;
  }, [workType]);

useEffect(() => {
    loadWorkList();
  }, [type, searchParams, page]);

  async function loadWorkList() {
    try {
      setLoading(true);
      setError('');
      const params: Record<string, string> = { pageSize: '100', page: String(page) };
      if (currentStatus) params.status = currentStatus;
      if (currentPriority) params.priority = currentPriority;
      if (searchQuery) params.q = searchQuery;
      if (month && activeView === 'calendar') params.month = month;
      const configuredFilters = workType?.presentation?.filterFields || [];
      if (configuredFilters.includes('assignedTo') && searchParams.get('assignedTo')) params.assignedTo = searchParams.get('assignedTo') || '';
      searchParams.forEach((value, key) => {
        if (key.startsWith('cf_') && value) params[key] = value;
      });

      const res = await workApi.list(type, params);
      setWorkType(res.workType);
      setItems(page === 1 ? (res.data || []) : prev => [...prev, ...(res.data || [])]);
      setUsers(res.users || []);
      setCustomers(res.customers || []);
      setTotalResults(res.pagination?.totalResults ?? (res.data || []).length);

      if (!form.status && res.workType?.statuses?.length) {
        setForm(prev => ({ ...prev, status: res.workType.statuses[0].key }));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load work items');
    } finally {
      setLoading(false);
    }
  }

function setParam(key: string, value: string) {
    const updated = new URLSearchParams(searchParams);
    if (value) updated.set(key, value); else updated.delete(key);
    setPage(1);
    setSearchParams(updated);
  }

  function viewHref(next: string) {
    const updated = new URLSearchParams(searchParams);
    updated.set('view', next);
    if (next !== 'calendar') updated.delete('month');
    return `?${updated.toString()}`;
  }

  function monthHref(dir: number) {
    const [y, m] = (month || new Date().toISOString().slice(0, 7)).split('-').map(Number);
    const target = new Date(y, m - 1 + dir, 1);
    return `?view=calendar&month=${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
  }

  const statusLabels = useMemo(() => Object.fromEntries((workType?.statuses || []).map(s => [s.key, s.label])), [workType]);
  const userNames = useMemo(() => Object.fromEntries(users.map(u => [String(u._id), u.name])), [users]);

  const statusColor = (key: string) => workType?.statuses?.find(s => s.key === key)?.color || '#64748b';
  const customerLabel = (c: any) => c?.company || c?.name || '';

  function rawValue(item: WorkItem, key: string): any {
    if (key.startsWith('custom:')) return item.customFields?.[key.slice(7)];
    return (item as any)[key];
  }

  function displayValue(item: WorkItem, key: string): string {
    const value = rawValue(item, key);
    const fieldType = fieldMap.get(key)?.type;
    if (key === 'status') return statusLabels[value] || value || '—';
    if (key === 'priority') return value === 'high' ? 'Important' : value === 'medium' ? 'Normal' : value || '—';
    if (key === 'customer') return customerLabel(item.customer) || '—';
    if (Array.isArray(value)) return value.map((entry: any) => entry?.name || entry).filter(Boolean).join(', ') || '—';
    if (value?.name) return value.name;
    if (fieldType === 'user-picker') return userNames[String(value)] || '—';
    if (fieldType === 'customer-picker') return customerLabel(value) || '—';
    if (fieldType === 'company-picker' || fieldType === 'module-picker') return '—';
    if (fieldType === 'date' || fieldType === 'datetime') return value ? new Date(value).toLocaleDateString('en-IN') : '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return value ?? '—';
  }

  const calendarValue = (item: WorkItem) => rawValue(item, calendarField);

  const visibleItemIds = useMemo(() => new Set(items.map(item => String(item._id))), [items]);
  const listItems = useMemo(
    () => items.filter(item => !item.parentRecord || !visibleItemIds.has(String((item.parentRecord as any)?._id || item.parentRecord))),
    [items, visibleItemIds]
  );
  const subtasksByParent = useMemo(() => {
    const map = new Map<string, WorkItem[]>();
    items.forEach(item => {
      const pid = String((item.parentRecord as any)?._id || item.parentRecord);
      if (pid) map.set(pid, [...(map.get(pid) || []), item]);
    });
    return map;
  }, [items]);

  async function handleQuickStatusChange(itemId: string, newStatus: string) {
    try {
      await workApi.updateStatus(type, itemId, newStatus);
      setItems(prev => prev.map(item => (item._id === itemId ? { ...item, status: newStatus } : item)));
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    try {
      setCreating(true);
      setError('');
      await workApi.create(type, form);
      setSuccess(`Work item "${form.title}" created.`);
      setShowCreate(false);
      setForm({
        title: '',
        status: workType?.statuses[0]?.key || '',
        priority: 'medium',
        deadline: '',
        startDate: '',
        assignedTo: '',
        customer: '',
        notes: '',
        customFields: {},
      });
      await loadWorkList();
    } catch (err: any) {
      setError(err.message || 'Failed to create work item');
    } finally {
      setCreating(false);
    }
  }

function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      setImportCsvText(text);
      try {
        const parsed = parseCsv(text);
        if (parsed.length > 0) {
          setImportHeaders(parsed[0]);
          setImportPreviewRows(parsed.slice(1, 6));
        }
      } catch {
        setImportHeaders(['title', 'status', 'assignedTo', 'priority', 'deadline', 'notes']);
        setImportPreviewRows([]);
      }
    };
    reader.readAsText(file);
  }

  async function handleConfirmImport(e: React.FormEvent) {
    e.preventDefault();
    if (!type || !importCsvText) return;
    try {
      setImporting(true);
      setError('');
      const res = await workApi.importCsv(type, { csvText: importCsvText });
      setSuccess(`Imported ${res.created} records (skipped ${res.skipped}).`);
      setShowImport(false);
      setImportCsvText('');
      setImportHeaders([]);
      setImportPreviewRows([]);
      await loadWorkList();
    } catch (err: any) {
      setError(err.message || 'Failed to import CSV');
    } finally {
      setImporting(false);
    }
  }

  async function handleStatusDrag(itemId: string, newStatus: string) {
    if (!itemId || !newStatus) return;
    await handleQuickStatusChange(itemId, newStatus);
  }

  function onDragStart(e: React.DragEvent, item: WorkItem) {
    (e.currentTarget as HTMLElement).classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item._id);
  }

  function onDragEnd(e: React.DragEvent) {
    (e.currentTarget as HTMLElement).classList.remove('is-dragging');
  }

  function onDrop(e: React.DragEvent, status: string) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const col = (e.currentTarget as HTMLElement);
    col.classList.remove('is-drop-target');
    if (id) void handleStatusDrag(id, status);
  }

  if (loading && items.length === 0) {
    return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading {type}...</div>;
  }

  const totalItems = items.length;

  return (
    <div className="page-container">
      {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="notice success" style={{ marginBottom: '1rem' }}>{success}</div>}

      {/* Header */}
      <section className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <p className="eyebrow">
            <Link to="/work" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Task Center</Link> / {workType?.name || type}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ margin: '0 0 0.2rem', fontSize: '1.45rem', fontWeight: 800, letterSpacing: '-0.02em' }}>{workType?.name || type}</h1>
            <span className="page-count-badge" style={{ background: 'var(--hover)', color: 'var(--muted)', fontSize: '0.72rem', fontWeight: 600, padding: '3px 8px', borderRadius: '999px' }}>{totalItems} {totalItems === 1 ? 'record' : 'records'}</span>
          </div>
          <p className="page-subtitle" style={{ margin: '0', color: 'var(--muted)', fontSize: '0.8rem' }}>Track and deliver {workType?.name?.toLowerCase()} deliverables.</p>
        </div>

        <div className="view-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {enabledViews.includes('overview') && (
            <Link to={viewHref('overview')} className="btn small">Overview</Link>
          )}
          {enabledViews.length > 1 && (
            <div className="view-switcher" aria-label="View">
              {enabledViews.includes('list') && (
                <Link to={viewHref('list')} className={activeView === 'list' ? 'active' : ''} title="List view" aria-label="List view">
                  <svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
                </Link>
              )}
              {enabledViews.includes('board') && (
                <Link to={viewHref('board')} className={activeView === 'board' ? 'active' : ''} title="Board view" aria-label="Board view">
                  <svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" /><rect x="14" y="4" width="6" height="6" /><rect x="4" y="14" width="6" height="6" /><rect x="14" y="14" width="6" height="6" /></svg>
                </Link>
              )}
              {enabledViews.includes('calendar') && (
                <Link to={viewHref('calendar')} className={activeView === 'calendar' ? 'active' : ''} title="Calendar view" aria-label="Calendar view">
                  <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
                </Link>
              )}
            </div>
          )}
          <button
            type="button"
            className="btn small"
            onClick={() => setShowImport(true)}
            style={{ fontWeight: 600 }}
          >
            Import CSV
          </button>
          <button type="button" className="btn primary" onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? 'Cancel' : `+ Add ${type}`}
          </button>
        </div>
      </section>

      {/* Create Drawer */}
      {showCreate && (
        <form onSubmit={handleCreate} style={{
          marginBottom: '1.5rem', padding: '1.5rem', border: '1px solid var(--border)',
          borderRadius: '12px', background: 'var(--panel)', boxShadow: 'var(--shadow-soft)',
        }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>New {workType?.name || 'Item'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Title *
              <input required placeholder="e.g. June Instagram Video Edit" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Linked Client / Lead
              <select value={form.customer} onChange={e => setForm({ ...form, customer: e.target.value || null })}>
                <option value="">No client linked</option>
                {customers.map(c => <option key={c._id} value={c._id}>{c.name} {c.company ? `(${c.company})` : ''}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Status
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {(workType?.statuses || []).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Priority
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select>
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Owner
              <select value={form.assignedTo} onChange={e => setForm({ ...form, assignedTo: e.target.value || null })}>
                <option value="">Unassigned</option>
                {users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Deadline
              <input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} />
            </label>
          </div>
          {(workType?.fields || []).length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
              {(workType?.fields || []).map(field => (
                <label key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  {field.label} {field.required ? '*' : ''}
                  {field.type === 'select' ? (
                    <select value={form.customFields?.[field.key] || ''} onChange={e => setForm({ ...form, customFields: { ...form.customFields, [field.key]: e.target.value } })}>
                      <option value="">Select...</option>
                      {(field.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : field.type === 'checkbox' ? (
                    <input type="checkbox" checked={!!form.customFields?.[field.key]} onChange={e => setForm({ ...form, customFields: { ...form.customFields, [field.key]: e.target.checked } })} />
                  ) : (
                    <input type={field.type === 'number' || field.type === 'currency' ? 'number' : field.type === 'date' ? 'date' : 'text'} value={form.customFields?.[field.key] || ''} onChange={e => setForm({ ...form, customFields: { ...form.customFields, [field.key]: e.target.value } })} />
                  )}
                </label>
              ))}
            </div>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)', marginBottom: '1rem' }}>
            Notes & Brief
            <textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </label>
          <button className="btn primary" type="submit" disabled={creating}>{creating ? 'Creating...' : 'Create Item'}</button>
        </form>
      )}

{/* Filter Bar (list/board views) */}
      {activeView !== 'overview' && (
        <div className="work-filters" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
          {(workType?.presentation?.filterFields || ['status', 'assignedTo', 'priority']).map(filterKey => {
            if (filterKey === 'status') {
              return (
                <select key={filterKey} value={currentStatus} onChange={e => handleFilterChange('status', e.target.value)} style={{ minWidth: '150px' }}>
                  <option value="">All statuses</option>
                  {(workType?.statuses || []).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              );
            }
            if (filterKey === 'priority') {
              return (
                <select key={filterKey} value={currentPriority} onChange={e => handleFilterChange('priority', e.target.value)} style={{ minWidth: '130px' }}>
                  <option value="">All priorities</option>
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                </select>
              );
            }
            if (filterKey === 'assignedTo' || filterKey === 'secondaryAssignee') {
              return (
                <select key={filterKey} value={searchParams.get(filterKey === 'assignedTo' ? 'assignedTo' : 'secondaryAssignee') || ''} onChange={e => handleFilterChange(filterKey === 'assignedTo' ? 'assignedTo' : 'secondaryAssignee', e.target.value)} style={{ minWidth: '150px' }}>
                  <option value="">All {filterKey === 'assignedTo' ? 'owners' : 'secondary assignees'}</option>
                  {users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                </select>
              );
            }
            if (filterKey.startsWith('custom:')) {
              const customField = workType?.fields?.find(f => `custom:${f.key}` === filterKey);
              if (!customField) return null;
              const qp = `cf_${customField.key}`;
              const current = searchParams.get(qp) || '';
              if (customField.type === 'select' || customField.type === 'status') {
                const options = Array.isArray(customField.options) ? customField.options : [];
                return (
                  <select key={filterKey} value={current} onChange={e => handleFilterChange(qp, e.target.value)} style={{ minWidth: '150px' }}>
                    <option value="">All {customField.label}</option>
                    {options.map((opt: any) => <option key={String(opt)} value={String(opt)}>{String(opt)}</option>)}
                  </select>
                );
              }
              if (customField.type === 'checkbox') {
                return (
                  <select key={filterKey} value={current} onChange={e => handleFilterChange(qp, e.target.value)} style={{ minWidth: '130px' }}>
                    <option value="">All {customField.label}</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                );
              }
              return (
                <input
                  key={filterKey}
                  type={customField.type === 'number' ? 'number' : 'text'}
                  placeholder={customField.label}
                  value={current}
                  onChange={e => handleFilterChange(qp, e.target.value)}
                  style={{ minWidth: '150px', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--panel)', color: 'var(--text)', fontSize: '0.8rem' }}
                />
              );
            }
            return null;
          })}
          {(currentStatus || currentPriority || searchParams.get('assignedTo') || searchParams.get('secondaryAssignee') || [...searchParams.keys()].some(k => k.startsWith('cf_'))) && (
            <button type="button" className="btn small" onClick={() => { setPage(1); setSearchParams(new URLSearchParams({ view: activeView })); }}>Reset Filters</button>
          )}
        </div>
      )}

      {/* Overview View */}
      {activeView === 'overview' && renderOverview()}

      {/* Board View */}
      {activeView === 'board' && (
        items.length === 0 ? (
          <section className="work-board-empty empty-state">
            <h2>No records yet</h2>
            <p>Create the first {workType?.name?.toLowerCase()} to begin tracking work here.</p>
          </section>
        ) : (
          <section className="work-board" style={{ '--work-columns': (workType?.statuses || []).length } as React.CSSProperties}>
            {(workType?.statuses || []).map(status => {
              const statusItems = items.filter(item => item.status === status.key);
              return (
                <div
                  className="work-column"
                  data-status={status.key}
                  key={status.key}
                  style={{ '--status-color': status.color || '#64748b' } as React.CSSProperties}
                  onDragOver={e => { if (document.querySelector('.work-card.is-dragging')) { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add('is-drop-target'); } }}
                  onDragLeave={e => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) (e.currentTarget as HTMLElement).classList.remove('is-drop-target'); }}
                  onDrop={e => onDrop(e, status.key)}
                >
                  <header>
                    <strong>{statusLabels[status.key]}</strong>
                    <span>{statusItems.length}</span>
                  </header>
                  {statusItems.length === 0 && <div className="work-column-empty">No tasks</div>}
                  {statusItems.map(item => (
                    <article
                      className="work-card"
                      key={item._id}
                      draggable
                      data-id={item._id}
                      onDragStart={e => onDragStart(e, item)}
                      onDragEnd={onDragEnd}
                    >
                      <a className="work-card-title" href={`/work/${type}/${item._id}`}>{item.title}</a>
                      {item.customer && <span className="work-card-client">{customerLabel(item.customer)}</span>}
                      <div className="work-card-details">
                        {boardFields.filter(key => key !== 'title' && key !== 'status').map(key => (
                          <span className={`work-card-field work-card-field-${key.replace(':', '-')}`} key={key}>
                            <small>{fieldMap.get(key)?.label || key}</small>
                            <b>{displayValue(item, key)}</b>
                          </span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              );
            })}
          </section>
        )
      )}

      {/* Calendar View */}
      {activeView === 'calendar' && renderCalendar()}

      {/* List View */}
      {activeView === 'list' && (
        <section className="table-card" style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {listColumns.map(key => <th key={key} style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>{fieldMap.get(key)?.label || key}</th>)}
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={listColumns.length + 1} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}>Nothing here yet. Add the first record.</td></tr>
              ) : listItems.map(item => {
                const subtasks = subtasksByParent.get(String(item._id)) || [];
                const completedSubtasks = subtasks.filter(sub => workType?.statuses?.find(s => s.key === sub.status)?.isTerminalWon).length;
                return (
                  <Fragment key={item._id}>
                    <tr className="work-summary-row" style={{ borderBottom: '1px solid var(--border)' }}>
                      {listColumns.map(key => (
                        <td key={key} style={{ padding: '0.75rem 1rem' }}>
                          {key === 'title' ? (
                            <>
                              <Link to={`/work/${type}/${item._id}`} className="work-title-link">{item.title}</Link>
                              {item.customer && (
                                <span className="muted-small" style={{ display: 'block', marginTop: '0.15rem' }}>
                                  Client: <b>{customerLabel(item.customer)}</b>
                                </span>
                              )}
                            </>
                          ) : key === 'status' ? (
                            <select value={item.status} onChange={e => handleQuickStatusChange(item._id, e.target.value)} style={{ padding: '2px 6px', fontSize: '0.75rem', borderRadius: '4px' }}>
                              {(workType?.statuses || []).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                            </select>
                          ) : (
                            <span className="pre-wrap-val">{displayValue(item, key)}</span>
                          )}
                        </td>
                      ))}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <div className="work-links">
                          <Link to={`/work/${type}/${item._id}`} className="btn small outline">Open</Link>
                        </div>
                      </td>
                    </tr>
                    {subtasks.length > 0 && (
                      <tr className="subtask-tree-row">
                        <td colSpan={listColumns.length + 1}>
                          <details>
                            <summary>
                              <span><i data-lucide="list-tree" /><b>{completedSubtasks}/{subtasks.length} subtasks completed</b></span>
                              <small>Expand</small>
                            </summary>
                            <div className="subtask-tree-list">
                              {subtasks.map(subtask => {
                                const subStatus = workType?.statuses?.find(s => s.key === subtask.status);
                                return (
                                  <Link to={`/work/${type}/${subtask._id}`} key={subtask._id}>
                                    <span className={`subtask-tree-state ${subStatus?.isTerminalWon ? 'done' : ''}`}>{subStatus?.isTerminalWon ? '✓' : '○'}</span>
                                    <strong>{subtask.title}</strong>
                                    <small>{subtask.assignedTo?.name || 'Unassigned'}</small>
                                    <em>{subStatus?.label || subtask.status}</em>
                                    <time>{subtask.deadline ? new Date(subtask.deadline).toLocaleDateString('en-IN') : 'No deadline'}</time>
                                  </Link>
                                );
                              })}
                            </div>
                          </details>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
</table>
        </section>
      )}

      {/* Pagination / Load more */}
      {(activeView === 'list' || activeView === 'board') && totalResults > 0 && (
        <div className="work-pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '0.75rem' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
            Showing {Math.min(items.length, totalResults)} of {totalResults} records
          </span>
          {items.length < totalResults && (
            <button
              type="button"
              className="btn small"
              onClick={() => setPage(page + 1)}
              disabled={loading}
              style={{ fontWeight: 600 }}
            >
              {loading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}
      {/* Import CSV Modal */}
      {showImport && (
        <div className="simple-dialog work-form-dialog" style={{ position: 'fixed', inset: 0, margin: 'auto', zIndex: 60, boxShadow: '0 24px 70px rgba(0,0,0,.35)', maxHeight: '85vh', overflowY: 'auto' }}>
          <form onSubmit={handleConfirmImport} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Import {workType?.name || type} CSV</h2>
              <button className="modal-close" type="button" onClick={() => setShowImport(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--muted)' }}>&times;</button>
            </div>
            <p className="page-subtitle" style={{ margin: 0, color: 'var(--muted)', fontSize: '0.82rem' }}>
              Use headers: <code>title</code>, <code>status</code>, <code>assignedTo</code>, <code>priority</code>, <code>deadline</code>, <code>notes</code>, plus each custom-field key.
            </p>
            
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              style={{ border: '1px dashed var(--border)', padding: '1rem', borderRadius: '8px', background: 'var(--panel-muted)' }}
            />

            {importHeaders.length > 0 && (
              <div style={{ marginTop: '0.5rem', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ padding: '0.5rem 0.75rem', background: 'var(--panel-muted)', borderBottom: '1px solid var(--border)', fontSize: '0.78rem', fontWeight: 800 }}>
                  CSV Preview ({importPreviewRows.length} sample row{importPreviewRows.length === 1 ? '' : 's'})
                </div>
                <div style={{ overflowX: 'auto', maxHeight: '200px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--panel-muted)', borderBottom: '1px solid var(--border)' }}>
                        {importHeaders.map((h, i) => (
                          <th key={i} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importPreviewRows.map((r, ri) => (
                        <tr key={ri} style={{ borderBottom: '1px solid var(--border)' }}>
                          {importHeaders.map((_, ci) => (
                            <td key={ci} style={{ padding: '6px 10px' }}>{r[ci] || '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button className="btn" type="button" onClick={() => setShowImport(false)}>Cancel</button>
              <button className="btn primary" type="submit" disabled={!importCsvText || importing}>
                {importing ? 'Importing…' : 'Confirm Import'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );

  function handleFilterChange(key: string, value: string) {
    setParam(key, value);
  }

  function renderCalendar() {
    const selectedMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
    const [calendarYear, calendarMonth] = selectedMonth.split('-').map(Number);
    const firstDay = (new Date(calendarYear, calendarMonth - 1, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(calendarYear, calendarMonth, 0).getDate();
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthTitle = new Date(calendarYear, calendarMonth - 1).toLocaleString('en', { month: 'long', year: 'numeric' });

    return (
      <section className="work-calendar">
        <header>
          <h2>{monthTitle}</h2>
          <nav aria-label="Calendar month navigation">
            <Link to={monthHref(-1)}>← Previous</Link>
            <Link to="?view=calendar" className={selectedMonth === currentMonth ? 'calendar-current' : ''}>Current month</Link>
            <Link to={monthHref(1)}>Next →</Link>
          </nav>
        </header>
        <div className="calendar-grid calendar-weekdays"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
        <div className="calendar-grid">
          {Array.from({ length: firstDay }).map((_, i) => <div className="calendar-day blank" key={`b${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayItems = items.filter(item => {
              const value = calendarValue(item);
              if (!value) return false;
              const date = new Date(value);
              return !Number.isNaN(date.getTime()) && date.getFullYear() === calendarYear && date.getMonth() === calendarMonth - 1 && date.getDate() === day;
            });
            const isToday = new Date().toDateString() === new Date(calendarYear, calendarMonth - 1, day).toDateString();
            return (
              <div className={`calendar-day ${isToday ? 'today' : ''}`} key={day}>
                <div className="calendar-day-head"><strong>{day}</strong>{dayItems.length > 0 && <small>{dayItems.length}</small>}</div>
                {dayItems.length > 0 ? (
                  <div className="calendar-day-summary" id={dayItems[0]._id}>
                    <b>{dayItems.length} {dayItems.length === 1 ? 'item' : 'items'}</b>
                    <span title={dayItems[0].title}>{dayItems[0].title}</span>
                    <em>{statusLabels[dayItems[0].status] || dayItems[0].status}</em>
                  </div>
                ) : (
                  <div className="calendar-day-empty">No items</div>
                )}
              </div>
            );
          })}
</div>
      </section>
    );
  }

  function renderOverview() {
    const overviewGroups = (workType?.presentation?.overviewGroupFields || []).filter(key => fieldMap.has(key));
    const overviewSteps = (workType?.presentation?.overviewProgressFields || []).filter(key => fieldMap.has(key));
    const completeValue = String(workType?.presentation?.overviewCompleteValue || 'Done').toLowerCase();

    const pendingCount = items.filter(i => /pending|not.?started|todo/i.test(i.status) || /pending|not.?started|todo/i.test(statusLabels[i.status])).length;
    const startedCount = items.filter(i => /started|queued|assigned/i.test(i.status) || /started|queued|assigned/i.test(statusLabels[i.status])).length;
    const inProgressCount = items.filter(i => /progress|active|working/i.test(i.status) || /progress|active|working/i.test(statusLabels[i.status])).length;
    const reviewCount = items.filter(i => /review|qa|testing/i.test(i.status) || /review|qa|testing/i.test(statusLabels[i.status])).length;
    const revisionCount = items.filter(i => /revision|change|blocked|rejected/i.test(i.status) || /revision|change|blocked|rejected/i.test(statusLabels[i.status])).length;
    const completedCount = items.filter(i => workType?.statuses?.find(s => s.key === i.status)?.isTerminalWon || /done|completed|delivered|approved|won/i.test(i.status)).length;

    const groupKey = overviewGroups[0] || 'customer';

    const grouped = new Map<string, WorkItem[]>();
    items.forEach(item => {
      const gVal = displayValue(item, groupKey) || 'Unassigned';
      if (!grouped.has(gVal)) grouped.set(gVal, []);
      grouped.get(gVal)!.push(item);
    });

    return (
      <section className="work-overview" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
          <div className="stat-card" style={{ padding: '12px', textAlign: 'left' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600 }}>Total records</span>
            <strong style={{ fontSize: '1.4rem', display: 'block', color: 'var(--text)' }}>{items.length}</strong>
            <small style={{ color: 'var(--muted)', fontSize: '0.68rem' }}>All records</small>
          </div>
          <div className="stat-card" style={{ padding: '12px', textAlign: 'left' }}>
            <span style={{ fontSize: '0.72rem', color: '#d97706', fontWeight: 600 }}>Pending</span>
            <strong style={{ fontSize: '1.4rem', display: 'block', color: 'var(--text)' }}>{pendingCount}</strong>
            <small style={{ color: 'var(--muted)', fontSize: '0.68rem' }}>Not started</small>
          </div>
          <div className="stat-card" style={{ padding: '12px', textAlign: 'left' }}>
            <span style={{ fontSize: '0.72rem', color: '#7c3aed', fontWeight: 600 }}>Started</span>
            <strong style={{ fontSize: '1.4rem', display: 'block', color: 'var(--text)' }}>{startedCount}</strong>
            <small style={{ color: 'var(--muted)', fontSize: '0.68rem' }}>Queued / Assigned</small>
          </div>
          <div className="stat-card" style={{ padding: '12px', textAlign: 'left' }}>
            <span style={{ fontSize: '0.72rem', color: '#0284c7', fontWeight: 600 }}>In Progress</span>
            <strong style={{ fontSize: '1.4rem', display: 'block', color: 'var(--text)' }}>{inProgressCount}</strong>
            <small style={{ color: 'var(--muted)', fontSize: '0.68rem' }}>Active work</small>
          </div>
          <div className="stat-card" style={{ padding: '12px', textAlign: 'left' }}>
            <span style={{ fontSize: '0.72rem', color: '#ea580c', fontWeight: 600 }}>Review / Revision</span>
            <strong style={{ fontSize: '1.4rem', display: 'block', color: 'var(--text)' }}>{reviewCount + revisionCount}</strong>
            <small style={{ color: 'var(--muted)', fontSize: '0.68rem' }}>QA & feedback</small>
          </div>
          <div className="stat-card" style={{ padding: '12px', textAlign: 'left' }}>
            <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600 }}>Completed</span>
            <strong style={{ fontSize: '1.4rem', display: 'block', color: 'var(--text)' }}>{completedCount}</strong>
            <small style={{ color: 'var(--muted)', fontSize: '0.68rem' }}>Delivered / Done</small>
          </div>
        </div>

        <section className="table-card" style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>{fieldMap.get(groupKey)?.label || 'Group / Client'}</th>
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Items</th>
                {overviewSteps.map(step => (
                  <th key={step} style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>{fieldMap.get(step)?.label || step}</th>
                ))}
                <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Progress</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={overviewSteps.length + 3} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}>No records to display in overview.</td></tr>
              ) : Array.from(grouped.entries()).map(([groupName, groupItems]) => {
                const totalInGroup = groupItems.length;
                const completedInGroup = groupItems.filter(i => workType?.statuses?.find(s => s.key === i.status)?.isTerminalWon || /done|completed|delivered/i.test(i.status)).length;
                const pct = totalInGroup > 0 ? Math.round((completedInGroup / totalInGroup) * 100) : 0;
                return (
                  <tr key={groupName} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>
                      {groupName}
                      <small style={{ display: 'block', color: 'var(--muted)', fontWeight: 400 }}>{totalInGroup} item{totalInGroup === 1 ? '' : 's'}</small>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {groupItems.map(gi => (
                          <Link key={gi._id} to={`/work/${type}/${gi._id}`} style={{ fontSize: '0.82rem', color: 'var(--gold)' }}>{gi.title}</Link>
                        ))}
                      </div>
                    </td>
                    {overviewSteps.map(step => (
                      <td key={step} style={{ padding: '0.75rem 1rem', fontSize: '0.82rem' }}>
                        {groupItems.map(gi => {
                          const val = displayValue(gi, step);
                          const isDone = String(val).toLowerCase() === completeValue || /done|completed|yes|approved/i.test(String(val));
                          return (
                            <div key={gi._id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ color: isDone ? '#059669' : '#d97706', fontSize: '0.75rem' }}>{isDone ? '✓' : '○'}</span>
                              <span>{val}</span>
                            </div>
                          );
                        })}
                      </td>
                    ))}
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, background: 'var(--border)', height: 6, borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
                          <div style={{ width: `${pct}%`, background: 'var(--gold)', height: '100%' }} />
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </section>
    );
  }
}

