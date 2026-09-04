import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { workApi, WorkType, WorkItem, WorkSubtask } from '../../api/work';
import { useAuth } from '../../contexts/AuthContext';
import Icon from '../../components/Icons';
import ConfirmDialog from '../../components/ConfirmDialog';

function formatDate(val?: string | Date | null): string {
  if (!val) return 'Not set';
  const d = new Date(val);
  return Number.isNaN(d.getTime())
    ? String(val)
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(val?: string | Date | null): string {
  if (!val) return '—';
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? String(val) : d.toLocaleString('en-IN');
}

const moduleIconMap: Record<string, string> = {
  '✅': 'square-check-big',
  '🎬': 'clapperboard',
  '🎨': 'palette',
  '🌐': 'globe',
  '✍️': 'pen-line',
  '📋': 'clipboard-list',
  check_square: 'square-check-big',
  'check-square': 'square-check-big',
  video: 'clapperboard',
  'file-text': 'pen-line',
  clipboard: 'clipboard-list',
  graphic_post: 'image',
  design: 'palette',
  task: 'square-check-big',
};

export default function WorkDetailPage() {
  const { type = 'task', id } = useParams<{ type: string; id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [workType, setWorkType] = useState<WorkType | null>(null);
  const [item, setItem] = useState<WorkItem | null>(null);
  const [subtasks, setSubtasks] = useState<WorkSubtask[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Subtask composer state
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newSubtaskAssignee, setNewSubtaskAssignee] = useState('');
  const [newSubtaskDeadline, setNewSubtaskDeadline] = useState('');
  const [newSubtaskPriority, setNewSubtaskPriority] = useState('medium');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (type && id) {
      loadWorkItem(type, id);
    }
  }, [type, id]);

  async function loadWorkItem(workTypeKey: string, itemId: string) {
    try {
      setLoading(true);
      setError('');
      const res = await workApi.get(workTypeKey, itemId);
      setWorkType(res.workType);
      setItem(res.data);
      setSubtasks(res.subtasks || []);
      setAuditLog(res.auditLog || []);
      setUsers(res.users || []);
      setCustomers(res.customers || []);

      const formCustom: Record<string, any> = {};
      if (res.data.customFields) {
        if (typeof res.data.customFields.get === 'function') {
          (res.workType.fields || []).forEach(f => {
            const val = (res.data.customFields as any).get(f.key);
            if (val !== undefined) formCustom[f.key] = val;
          });
        } else {
          Object.assign(formCustom, res.data.customFields);
        }
      }

      setEditForm({
        title: res.data.title || '',
        status: res.data.status || '',
        priority: res.data.priority || 'medium',
        deadline: res.data.deadline ? new Date(res.data.deadline).toISOString().slice(0, 10) : '',
        startDate: res.data.startDate ? new Date(res.data.startDate).toISOString().slice(0, 10) : '',
        deliveredAt: res.data.deliveredAt ? new Date(res.data.deliveredAt).toISOString().slice(0, 10) : '',
        assignedTo: res.data.assignedTo?._id || '',
        secondaryAssignee: res.data.secondaryAssignee?._id || '',
        collaborators: (res.data.collaborators || []).map((c: any) => c._id || c),
        customer: (res.data.customer as any)?._id || '',
        notes: res.data.notes || '',
        customFields: formCustom,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load work item');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!type || !id || !newSubtaskTitle.trim()) return;
    try {
      setAddingSubtask(true);
      setError('');
      await workApi.createSubtask(type, id, {
        title: newSubtaskTitle.trim(),
        assignedTo: newSubtaskAssignee ? ({ _id: newSubtaskAssignee } as any) : null,
        deadline: newSubtaskDeadline ? newSubtaskDeadline : null,
        priority: newSubtaskPriority,
      });
      setNewSubtaskTitle('');
      setNewSubtaskAssignee('');
      setNewSubtaskDeadline('');
      setNewSubtaskPriority('medium');
      setComposerOpen(false);
      setSuccess('Subtask created.');
      await loadWorkItem(type, id);
    } catch (err: any) {
      setError(err.message || 'Failed to add subtask');
    } finally {
      setAddingSubtask(false);
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!type || !id) return;
    try {
      setError('');
      await workApi.updateStatus(type, id, newStatus);
      setItem(prev => (prev ? { ...prev, status: newStatus } : null));
      setSuccess(`Status updated to ${newStatus}.`);
      await loadWorkItem(type, id);
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!type || !id || !editForm.title?.trim()) {
      setError('Task title is required.');
      return;
    }
    try {
      setSavingEdit(true);
      setError('');
      await workApi.update(type, id, {
        ...editForm,
        deadline: editForm.deadline || null,
        startDate: editForm.startDate || null,
        deliveredAt: editForm.deliveredAt || null,
        assignedTo: editForm.assignedTo || null,
        secondaryAssignee: editForm.secondaryAssignee || null,
        customer: editForm.customer || null,
      });
      setIsEditing(false);
      setSuccess('Task updated successfully.');
      await loadWorkItem(type, id);
    } catch (err: any) {
      setError(err.message || 'Failed to save changes');
    } finally {
      setSavingEdit(false);
    }
  }

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function executeDeleteTask() {
    if (!type || !id) return;
    try {
      setDeleting(true);
      setError('');
      await workApi.delete(type, id);
      navigate(`/work/${type}`);
    } catch (err: any) {
      setError(err.message || 'Failed to delete task');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  if (loading && !item) {
    return <div className="loading" style={{ padding: '3rem', textAlign: 'center' }}>Loading task…</div>;
  }

  if (error && !item) {
    return (
      <div className="page-container" style={{ padding: '2rem' }}>
        <div className="alert alert-error" role="alert">{error}</div>
        <Link to={`/work/${type}`} className="btn small">← Back to {type}</Link>
      </div>
    );
  }

  if (!item || !workType) {
    return (
      <div className="page-container" style={{ padding: '2rem' }}>
        <div className="empty-state">Task not found.</div>
        <Link to="/work" className="btn small">← Back to Task Center</Link>
      </div>
    );
  }

  const statusDefinition = workType.statuses?.find(s => s.key === item.status);
  const completedStatus = workType.statuses?.find(s => s.isTerminalWon);
  const activeStatus = workType.statuses?.find(s => !s.isTerminalWon && !s.isTerminalLost) || workType.statuses?.[0];
  const isComplete = Boolean(statusDefinition?.isTerminalWon);

  const customerObj = item.customer as any;
  const customerName = customerObj ? (customerObj.company || customerObj.name) : '';
  const customerId = customerObj ? customerObj._id : null;

  const rawValue = (key: string): any => {
    if (key.startsWith('custom:')) {
      const fieldKey = key.slice(7);
      if (!item.customFields) return undefined;
      if (typeof (item.customFields as any).get === 'function') {
        return (item.customFields as any).get(fieldKey);
      }
      return (item.customFields as any)[fieldKey];
    }
    return (item as any)[key];
  };

  const textValue = (val: any, field: any): string => {
    if (val == null || val === '' || (Array.isArray(val) && !val.length)) return '';
    if (Array.isArray(val)) return val.map((e: any) => e?.name || e?.title || e).filter(Boolean).join(', ');
    if (val?.name) return val.name;
    if (field?.type === 'date' || field?.type === 'datetime') return formatDate(val);
    if (field?.type === 'checkbox') return val ? 'Yes' : 'No';
    return String(val);
  };

  const displayFields = workType.fields || [];
  const links = displayFields.filter(f => f.type === 'url' && rawValue(f.key));
  const extraFields = displayFields.filter(f =>
    !['title', 'customer', 'assignedTo', 'collaborators', 'secondaryAssignee', 'relatedRecords', 'status', 'priority', 'deadline', 'startDate', 'deliveredAt', 'notes'].includes(f.key) &&
    f.type !== 'url' &&
    textValue(rawValue(f.key), f)
  );

  const completedSubtasks = subtasks.filter(subtask =>
    workType.statuses?.find(s => s.key === subtask.status)?.isTerminalWon
  ).length;
  const subtaskProgress = subtasks.length ? Math.round((completedSubtasks / subtasks.length) * 100) : 0;

  const resolvedIcon = moduleIconMap[workType.icon] || moduleIconMap[type] || workType.icon || 'clipboard-list';

  return (
    <div className="page-container">
      {/* Top Breadcrumb Navigation */}
      <nav className="work-center-nav" aria-label="Task navigation">
        <Link to="/work">Task Center</Link>
        <Link to="/tasks">Lead follow-ups</Link>
      </nav>

      {/* Breadcrumb Title Bar */}
      <nav className="task-detail-nav" aria-label="Breadcrumb">
        <div className="edit-modal-brand">
          <span className="modal-brand-icon" style={{ color: workType.color || 'var(--gold)' }}>
            <Icon name={resolvedIcon} size={22} />
          </span>
          <div>
            <span
              className="modal-badge"
              style={{
                borderColor: workType.color ? `${workType.color}40` : 'rgba(245, 158, 11, 0.3)',
                color: workType.color || '#fbbf24',
              }}
            >
              {workType.name.toUpperCase()}
            </span>
            <h1>{item.title}</h1>
          </div>
        </div>

        <div className="task-detail-actions">
          <Link className="btn small" to={`/work/${type}`}>
            ← Back to {workType.name}
          </Link>
          <button
            type="button"
            className="btn small"
            onClick={() => setIsEditing(!isEditing)}
          >
            <Icon name="pen-line" size={14} />
            <span>{isEditing ? 'Cancel edit' : 'Edit task'}</span>
          </button>
          {!isComplete && completedStatus && (
            <button
              type="button"
              className="btn small primary"
              onClick={() => handleStatusChange(completedStatus.key)}
            >
              <Icon name="check" size={14} />
              <span>Mark as complete</span>
            </button>
          )}
          {isComplete && activeStatus && (
            <button
              type="button"
              className="btn small"
              onClick={() => handleStatusChange(activeStatus.key)}
            >
              <Icon name="rotate-ccw" size={14} />
              <span>Reopen</span>
            </button>
          )}
        </div>
      </nav>

      {error && <div className="alert alert-error" role="alert" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="alert" style={{ background: 'color-mix(in srgb, var(--teal) 10%, transparent)', color: 'var(--teal)', border: '1px solid var(--teal)', marginBottom: '1rem' }}>{success}</div>}

      <main className="work-dialog-body-grid task-detail-page">
        <div className="work-dialog-main">
          {isEditing ? (
            /* EDIT FORM VIEW */
            <form onSubmit={handleSaveEdit}>
              <section className="work-card-panel edit-card-section">
                <header className="panel-section-head">
                  <span className="section-icon"><Icon name="pen-line" size={16} /></span>
                  <div>
                    <h3>Edit task</h3>
                    <small>Modify deliverables, deadlines, and assignments</small>
                  </div>
                </header>

                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', marginBottom: '4px' }}>Task title *</label>
                    <input
                      type="text"
                      required
                      value={editForm.title || ''}
                      onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)' }}
                    />
                  </div>

                  <div className="form-group">
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', marginBottom: '4px' }}>Status</label>
                    <select
                      value={editForm.status || ''}
                      onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)' }}
                    >
                      {(workType.statuses || []).map(st => (
                        <option key={st.key} value={st.key}>{st.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', marginBottom: '4px' }}>Priority</label>
                    <select
                      value={editForm.priority || 'medium'}
                      onChange={e => setEditForm({ ...editForm, priority: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)' }}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', marginBottom: '4px' }}>Owner / Assignee</label>
                    <select
                      value={editForm.assignedTo || ''}
                      onChange={e => setEditForm({ ...editForm, assignedTo: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)' }}
                    >
                      <option value="">Unassigned</option>
                      {users.map(u => (
                        <option key={u._id} value={u._id}>{u.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', marginBottom: '4px' }}>Secondary Assignee</label>
                    <select
                      value={editForm.secondaryAssignee || ''}
                      onChange={e => setEditForm({ ...editForm, secondaryAssignee: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)' }}
                    >
                      <option value="">None</option>
                      {users.map(u => (
                        <option key={u._id} value={u._id}>{u.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', marginBottom: '4px' }}>Client / Lead</label>
                    <select
                      value={editForm.customer || ''}
                      onChange={e => setEditForm({ ...editForm, customer: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)' }}
                    >
                      <option value="">None / Internal project</option>
                      {customers.map(c => (
                        <option key={c._id} value={c._id}>{c.company ? `${c.company} (${c.name})` : c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', marginBottom: '4px' }}>Start Date</label>
                    <input
                      type="date"
                      value={editForm.startDate || ''}
                      onChange={e => setEditForm({ ...editForm, startDate: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)' }}
                    />
                  </div>

                  <div className="form-group">
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', marginBottom: '4px' }}>Deadline</label>
                    <input
                      type="date"
                      value={editForm.deadline || ''}
                      onChange={e => setEditForm({ ...editForm, deadline: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)' }}
                    />
                  </div>

                  <div className="form-group">
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', marginBottom: '4px' }}>Delivered Date</label>
                    <input
                      type="date"
                      value={editForm.deliveredAt || ''}
                      onChange={e => setEditForm({ ...editForm, deliveredAt: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)' }}
                    />
                  </div>

                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', marginBottom: '4px' }}>Collaborators</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '8px', background: 'var(--panel-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      {users.map(u => {
                        const isSelected = (editForm.collaborators || []).includes(u._id);
                        return (
                          <label key={u._id} className="check-pill" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={e => {
                                const next = e.target.checked
                                  ? [...(editForm.collaborators || []), u._id]
                                  : (editForm.collaborators || []).filter((cid: string) => cid !== u._id);
                                setEditForm({ ...editForm, collaborators: next });
                              }}
                            />
                            <span>{u.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', marginBottom: '4px' }}>Notes & Deliverables</label>
                    <textarea
                      rows={5}
                      value={editForm.notes || ''}
                      onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)', resize: 'vertical' }}
                    />
                  </div>

                  {/* Custom Fields Edit */}
                  {(workType.fields || []).filter(f => !['title', 'customer', 'assignedTo', 'collaborators', 'secondaryAssignee', 'status', 'priority', 'deadline', 'startDate', 'deliveredAt', 'notes'].includes(f.key)).map(f => (
                    <div className="form-group" key={f.key}>
                      <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', marginBottom: '4px' }}>{f.label}</label>
                      <input
                        type={f.type === 'url' ? 'url' : f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                        value={editForm.customFields?.[f.key] || ''}
                        onChange={e => {
                          const nextCf = { ...(editForm.customFields || {}), [f.key]: e.target.value };
                          setEditForm({ ...editForm, customFields: nextCf });
                        }}
                        style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)' }}
                      />
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                  <button type="button" className="btn danger" onClick={() => setShowDeleteConfirm(true)}>
                    <Icon name="trash-2" size={14} /> Delete task
                  </button>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" className="btn secondary" onClick={() => setIsEditing(false)}>Cancel</button>
                    <button type="submit" className="btn primary" disabled={savingEdit}>
                      {savingEdit ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                </div>
              </section>
            </form>
          ) : (
            /* READ-ONLY VIEW */
            <>
              {/* 1. Task brief */}
              <section id="detail-sec-task" className="work-card-panel edit-card-section">
                <header className="panel-section-head">
                  <span className="section-icon"><Icon name="file-text" size={18} /></span>
                  <div>
                    <h3>Task brief</h3>
                    <small>What needs to be done and for whom</small>
                  </div>
                </header>
                <div className="edit-brief-grid">
                  <div>
                    <small style={{ color: 'var(--muted)', fontSize: '0.7rem', fontWeight: 800, display: 'block', marginBottom: '4px' }}>Task Title</small>
                    <strong style={{ fontSize: '1.05rem' }}>{item.title}</strong>
                  </div>
                  <div>
                    <small style={{ color: 'var(--muted)', fontSize: '0.7rem', fontWeight: 800, display: 'block', marginBottom: '4px' }}>Business / Client</small>
                    {customerId ? (
                      <Link to={`/customers/${customerId}`} style={{ color: 'var(--gold)', fontWeight: 850, textDecoration: 'none' }}>
                        {customerName}
                      </Link>
                    ) : (
                      <strong>{customerName || 'None / Internal project'}</strong>
                    )}
                  </div>
                  {item.notes && (
                    <div className="full-span" style={{ marginTop: '6px' }}>
                      <small style={{ color: 'var(--muted)', fontSize: '0.7rem', fontWeight: 800, display: 'block', marginBottom: '4px' }}>Notes & Deliverables</small>
                      <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.5, color: 'var(--text)', background: 'var(--panel-muted)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', whiteSpace: 'pre-wrap' }}>
                        {item.notes}
                      </p>
                    </div>
                  )}
                </div>
              </section>

              {/* 2. Assignment overview */}
              <section id="detail-sec-assign" className="work-card-panel edit-card-section">
                <header className="panel-section-head">
                  <span className="section-icon"><Icon name="users" size={18} /></span>
                  <div>
                    <h3>Assignment overview</h3>
                    <small>Who is responsible and when</small>
                  </div>
                </header>
                <div className="assignment-overview-grid">
                  <div>
                    <small style={{ color: 'var(--muted)', fontSize: '0.68rem', fontWeight: 800, display: 'block', marginBottom: '3px' }}>Owner</small>
                    <strong>{item.assignedTo?.name || 'Unassigned'}</strong>
                  </div>
                  <div>
                    <small style={{ color: 'var(--muted)', fontSize: '0.68rem', fontWeight: 800, display: 'block', marginBottom: '3px' }}>Secondary assignee</small>
                    <strong>{item.secondaryAssignee?.name || 'None'}</strong>
                  </div>
                  <div>
                    <small style={{ color: 'var(--muted)', fontSize: '0.68rem', fontWeight: 800, display: 'block', marginBottom: '3px' }}>Start date</small>
                    <strong>{formatDate(item.startDate)}</strong>
                  </div>
                  <div>
                    <small style={{ color: 'var(--muted)', fontSize: '0.68rem', fontWeight: 800, display: 'block', marginBottom: '3px' }}>Delivered date</small>
                    <strong>{formatDate(item.deliveredAt)}</strong>
                  </div>
                  {item.collaborators && item.collaborators.length > 0 && (
                    <div className="full-span">
                      <small style={{ color: 'var(--muted)', fontSize: '0.68rem', fontWeight: 800, display: 'block', marginBottom: '4px' }}>Collaborators</small>
                      <div className="collaborator-pill-grid">
                        {item.collaborators.map(person => (
                          <span className="check-pill" key={person._id} style={{ pointerEvents: 'none' }}>
                            {person.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* 3. Subtasks & Execution */}
              <section id="detail-sec-subtasks" className="work-card-panel subtasks-panel">
                <header className="panel-section-head">
                  <span className="section-icon"><Icon name="square-check-big" size={18} /></span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <h3>Subtasks & Execution</h3>
                      {subtasks.length > 0 && (
                        <span className="subtask-count-badge">
                          {completedSubtasks}/{subtasks.length} completed ({subtaskProgress}%)
                        </span>
                      )}
                    </div>
                    <small>Track deliverables and milestone subtasks</small>
                  </div>
                </header>

                {subtasks.length > 0 ? (
                  <>
                    <div className="task-progress"><span style={{ width: `${subtaskProgress}%` }} /></div>
                    <div className="premium-subtask-list">
                      {subtasks.map(st => {
                        const stDefinition = workType.statuses?.find(s => s.key === st.status);
                        const isStDone = Boolean(stDefinition?.isTerminalWon || st.status === 'completed');
                        const stId = st._id;
                        return (
                          <div
                            key={st._id || st.title}
                            className={`subtask-item-row ${isStDone ? 'is-completed' : ''}`}
                            style={{ textDecoration: 'none', cursor: 'pointer' }}
                          >
                            <span
                              className={`subtask-check-circle ${isStDone ? 'checked' : ''}`}
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (stId && type && id) {
                                  const targetStatus = isStDone ? (activeStatus?.key || 'pending') : (completedStatus?.key || 'completed');
                                  await workApi.updateStatus(type, stId, targetStatus);
                                  await loadWorkItem(type, id);
                                }
                              }}
                              title={isStDone ? 'Mark subtask pending' : 'Mark subtask done'}
                            >
                              <Icon name={isStDone ? 'check' : 'circle'} size={14} />
                            </span>
                            <div className="subtask-info">
                              <strong className="subtask-title">{st.title}</strong>
                              <div className="subtask-meta">
                                {st.assignedTo && (
                                  <span className="subtask-meta-tag">
                                    <Icon name="user-check" size={12} /> {st.assignedTo.name}
                                  </span>
                                )}
                                {st.deadline && (
                                  <span className="subtask-meta-tag">
                                    <Icon name="calendar" size={12} /> {formatDate(st.deadline)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className={`stage-badge ${isStDone ? 'done' : 'pending'}`}>
                              {stDefinition?.label || st.status}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="subtasks-empty-box">
                    <span className="empty-icon"><Icon name="list-todo" size={24} /></span>
                    <h4>No subtasks yet</h4>
                    <p>Break this task into smaller milestone subtasks to assign work and track execution.</p>
                  </div>
                )}

                {/* Subtask Composer */}
                <div className="subtask-composer-card" style={{ marginTop: '12px' }}>
                  {!composerOpen ? (
                    <button
                      type="button"
                      className="subtask-composer-trigger"
                      onClick={() => setComposerOpen(true)}
                      style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--gold)', fontWeight: 700, padding: '8px 4px' }}
                    >
                      <Icon name="plus" size={16} />
                      <span>Add subtask</span>
                    </button>
                  ) : (
                    <form onSubmit={handleAddSubtask} className="subtask-composer-form">
                      <div className="composer-row-title">
                        <label>
                          Subtask title *
                          <input
                            type="text"
                            required
                            maxLength={200}
                            placeholder="e.g. Create initial storyboard drafts"
                            value={newSubtaskTitle}
                            onChange={e => setNewSubtaskTitle(e.target.value)}
                            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)' }}
                          />
                        </label>
                      </div>
                      <div className="composer-grid-fields" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '8px' }}>
                        <label>
                          Assignee
                          <select
                            value={newSubtaskAssignee}
                            onChange={e => setNewSubtaskAssignee(e.target.value)}
                            style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)' }}
                          >
                            <option value="">Unassigned</option>
                            {users.map(u => (
                              <option key={u._id} value={u._id}>{u.name}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Deadline
                          <input
                            type="date"
                            value={newSubtaskDeadline}
                            onChange={e => setNewSubtaskDeadline(e.target.value)}
                            style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)' }}
                          />
                        </label>
                        <label>
                          Priority
                          <select
                            value={newSubtaskPriority}
                            onChange={e => setNewSubtaskPriority(e.target.value)}
                            style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)' }}
                          >
                            <option value="low">Low</option>
                            <option value="medium">Normal</option>
                            <option value="high">Important</option>
                          </select>
                        </label>
                      </div>
                      <div className="composer-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                        <button type="button" className="btn small" onClick={() => setComposerOpen(false)}>Cancel</button>
                        <button type="submit" className="btn small primary" disabled={addingSubtask}>
                          <Icon name="plus" size={14} /> {addingSubtask ? 'Adding…' : 'Create subtask'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </section>

              {/* 4. Files & Links */}
              {links.length > 0 && (
                <section id="detail-sec-links" className="work-card-panel edit-card-section">
                  <header className="panel-section-head">
                    <span className="section-icon"><Icon name="link" size={18} /></span>
                    <div>
                      <h3>Files & Links</h3>
                      <small>All references and deliverables</small>
                    </div>
                  </header>
                  <div className="task-link-grid">
                    {links.map(f => (
                      <a href={rawValue(f.key)} target="_blank" rel="noopener noreferrer" key={f.key} style={{ textDecoration: 'none' }}>
                        <Icon name="globe" size={16} />
                        <span>
                          <small>{f.label}</small>
                          <strong>Open link</strong>
                        </span>
                      </a>
                    ))}
                  </div>
                </section>
              )}

              {/* 5. Additional Information / Custom Fields */}
              {extraFields.length > 0 && (
                <section className="work-card-panel edit-card-section">
                  <header className="panel-section-head">
                    <span className="section-icon"><Icon name="settings" size={18} /></span>
                    <div>
                      <h3>Additional Information</h3>
                      <small>Custom attributes</small>
                    </div>
                  </header>
                  <div className="assignment-overview-grid">
                    {extraFields.map(f => (
                      <div key={f.key}>
                        <small style={{ color: 'var(--muted)', fontSize: '0.68rem', fontWeight: 800, display: 'block', marginBottom: '3px' }}>
                          {f.label}
                        </small>
                        <strong>{textValue(rawValue(f.key), f)}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* Right Sidebar */}
        <aside className="work-dialog-side">
          <div className="work-card-panel summary-card-panel">
            <h3>Task summary</h3>
            <div className="summary-field-row">
              <span className="summary-label">Status</span>
              <span className={`stage-badge ${isComplete ? 'done' : 'in-progress'}`} style={{ fontSize: '0.75rem', padding: '3px 10px' }}>
                {statusDefinition?.label || item.status}
              </span>
            </div>
            <div className="summary-field-row">
              <span className="summary-label">Priority</span>
              <strong style={{ fontSize: '0.78rem' }}>
                {item.priority === 'high' ? '⚑ Important' : item.priority === 'medium' ? '⚑ Normal' : '⚑ Low'}
              </strong>
            </div>
            <div className="summary-field-row">
              <span className="summary-label">Deadline</span>
              <strong style={{ fontSize: '0.78rem' }}>📅 {formatDate(item.deadline)}</strong>
            </div>
            <hr className="summary-divider" />
            <div className="summary-meta-grid">
              <div>
                <small>Created by</small>
                <strong>{item.createdBy?.name || 'Admin'}</strong>
              </div>
              <div>
                <small>Created on</small>
                <strong>{formatDateTime(item.createdAt)}</strong>
              </div>
              <div>
                <small>Last updated</small>
                <strong>{formatDateTime(item.updatedAt)}</strong>
              </div>
            </div>
          </div>

          {auditLog.length > 0 && (
            <div className="work-card-panel activity-card-panel">
              <div className="activity-panel-header">
                <h3>Activity log</h3>
                <span className="live-dot">{auditLog.length} updates</span>
              </div>
              <div className="activity-timeline-feed">
                {auditLog.slice(0, 8).map((log, idx) => (
                  <div className="timeline-feed-item" key={log._id || idx}>
                    <span className={`timeline-bullet ${idx === 0 ? 'won' : 'active'}`} />
                    <p>
                      <strong>{log.user?.name || 'System'}</strong>
                      <span>{log.message}</span>
                      <small>{formatDateTime(log.createdAt)}</small>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </main>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Task"
        message={`Delete "${item?.title}" permanently? This action cannot be undone.`}
        confirmText="Delete Task"
        variant="danger"
        loading={deleting}
        onConfirm={executeDeleteTask}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
