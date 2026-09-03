import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { workApi, WorkType, WorkItem, WorkSubtask } from '../../api/work';
import { useAuth } from '../../contexts/AuthContext';

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

  // Subtask form
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newSubtaskAssignee, setNewSubtaskAssignee] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);

  // Edit form state
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

      setEditForm({
        title: res.data.title || '',
        status: res.data.status || '',
        priority: res.data.priority || 'medium',
        deadline: res.data.deadline ? new Date(res.data.deadline).toISOString().slice(0, 10) : '',
        startDate: res.data.startDate ? new Date(res.data.startDate).toISOString().slice(0, 10) : '',
        assignedTo: res.data.assignedTo?._id || '',
        customer: (res.data.customer as any)?._id || '',
        notes: res.data.notes || '',
        customFields: res.data.customFields || {},
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
      await workApi.createSubtask(type, id, {
        title: newSubtaskTitle.trim(),
        assignedTo: newSubtaskAssignee ? ({ _id: newSubtaskAssignee } as any) : null,
      });
      setNewSubtaskTitle('');
      setNewSubtaskAssignee('');
      setSuccess('Subtask added.');
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
      await workApi.updateStatus(type, id, newStatus);
      setItem(prev => (prev ? { ...prev, status: newStatus } : null));
      setSuccess(`Status updated to ${newStatus}.`);
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!type || !id) return;
    try {
      setSavingEdit(true);
      setError('');
      const res = await workApi.update(type, id, editForm);
      setItem(res.data);
      setIsEditing(false);
      setSuccess('Work item updated successfully.');
      await loadWorkItem(type, id);
    } catch (err: any) {
      setError(err.message || 'Failed to save changes');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete() {
    if (!type || !id || !window.confirm('Delete this work item?')) return;
    try {
      await workApi.delete(type, id);
      navigate(`/work/${type}`);
    } catch (err: any) {
      setError(err.message || 'Failed to delete work item');
    }
  }

  if (loading && !item) {
    return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading details...</div>;
  }

  if (!item) {
    return (
      <div className="page-container" style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Item not found</h2>
        <Link to={`/work/${type}`} className="btn primary" style={{ marginTop: '1rem' }}>
          Back to {type}
        </Link>
      </div>
    );
  }

  const completedSubtasks = subtasks.filter(s => s.status === 'completed' || s.status === 'done').length;
  const progressPercent = subtasks.length ? Math.round((completedSubtasks / subtasks.length) * 100) : 0;

  return (
    <div className="page-container">
      {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="notice success" style={{ marginBottom: '1rem' }}>{success}</div>}

      {/* Header */}
      <section className="page-head" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <p className="eyebrow">
            <Link to="/work" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Task Center</Link> /{' '}
            <Link to={`/work/${type}`} style={{ color: 'var(--muted)', textDecoration: 'none' }}>{workType?.name || type}</Link>
          </p>
          <h1 style={{ margin: '0.2rem 0' }}>{item.title}</h1>
          <p className="page-subtitle">
            Owner: <strong>{item.assignedTo?.name || 'Unassigned'}</strong> · Priority: <strong style={{ textTransform: 'capitalize' }}>{item.priority}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select
            value={item.status}
            onChange={e => handleStatusChange(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: '6px' }}
          >
            {(workType?.statuses || []).map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>

          <button
            type="button"
            className="btn small outline"
            onClick={() => setIsEditing(!isEditing)}
          >
            {isEditing ? 'Cancel Edit' : 'Edit'}
          </button>

          <button
            type="button"
            className="btn small danger"
            onClick={handleDelete}
          >
            Delete
          </button>
        </div>
      </section>

      {/* Edit Form */}
      {isEditing && (
        <form
          onSubmit={handleSaveEdit}
          style={{
            marginBottom: '1.5rem',
            padding: '1.5rem',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            background: 'var(--panel)',
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: '1.1rem', marginBottom: '1rem' }}>Edit Task</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Title
              <input
                required
                value={editForm.title}
                onChange={e => setEditForm({ ...editForm, title: e.target.value })}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Owner
              <select
                value={editForm.assignedTo}
                onChange={e => setEditForm({ ...editForm, assignedTo: e.target.value || null })}
              >
                <option value="">Unassigned</option>
                {users.map(u => (
                  <option key={u._id} value={u._id}>{u.name}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Linked Client
              <select
                value={editForm.customer}
                onChange={e => setEditForm({ ...editForm, customer: e.target.value || null })}
              >
                <option value="">No client linked</option>
                {customers.map(c => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Deadline
              <input
                type="date"
                value={editForm.deadline}
                onChange={e => setEditForm({ ...editForm, deadline: e.target.value })}
              />
            </label>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)', marginBottom: '1rem' }}>
            Notes
            <textarea
              rows={3}
              value={editForm.notes}
              onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
            />
          </label>

          <button className="btn primary" type="submit" disabled={savingEdit}>
            {savingEdit ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      )}

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Brief & Notes */}
        <article className="profile-panel" style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Task Brief</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem', fontSize: '0.85rem' }}>
            <div><strong>Title:</strong> {item.title}</div>
            <div><strong>Client / Lead:</strong> {item.customer ? (item.customer as any).name : 'Internal project'}</div>
            <div><strong>Deadline:</strong> {item.deadline ? new Date(item.deadline).toLocaleDateString() : 'No deadline'}</div>
            <div><strong>Delivered:</strong> {item.deliveredAt ? new Date(item.deliveredAt).toLocaleDateString() : 'In progress'}</div>
            {item.notes && (
              <div>
                <strong>Notes & Brief:</strong>
                <p style={{ margin: '4px 0 0', background: 'var(--bg-soft, rgba(255,255,255,0.03))', padding: '0.75rem', borderRadius: '6px', whiteSpace: 'pre-wrap' }}>
                  {item.notes}
                </p>
              </div>
            )}
          </div>
        </article>

        {/* Subtasks Panel */}
        <article className="profile-panel" style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Subtasks</h2>
            {subtasks.length > 0 && (
              <span className="pill" style={{ borderColor: 'var(--teal)' }}>
                {completedSubtasks}/{subtasks.length} done ({progressPercent}%)
              </span>
            )}
          </div>

          {/* Add Subtask Form */}
          <form onSubmit={handleAddSubtask} style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', marginBottom: '1rem' }}>
            <input
              placeholder="New subtask title..."
              value={newSubtaskTitle}
              onChange={e => setNewSubtaskTitle(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn small primary" type="submit" disabled={addingSubtask}>
              + Add
            </button>
          </form>

          {/* Subtask List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {subtasks.length === 0 ? (
              <p className="empty" style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No subtasks created yet.</p>
            ) : (
              subtasks.map((sub, idx) => (
                <div
                  key={sub._id || idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: 'var(--bg-soft, rgba(255,255,255,0.02))',
                  }}
                >
                  <span style={{ fontSize: '0.85rem' }}>{sub.title}</span>
                  <span className="stage-badge" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
                    {sub.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </article>
      </div>

      {/* Audit Log */}
      {auditLog.length > 0 && (
        <section className="profile-panel" style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.1rem', marginBottom: '1rem' }}>Activity & Audit Log</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {auditLog.map(log => (
              <div key={log._id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', fontSize: '0.85rem' }}>
                <strong>{log.user?.name || 'System'}:</strong> <span>{log.message}</span>
                <small style={{ display: 'block', color: 'var(--muted)', fontSize: '0.72rem' }}>
                  {new Date(log.createdAt).toLocaleString()}
                </small>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
