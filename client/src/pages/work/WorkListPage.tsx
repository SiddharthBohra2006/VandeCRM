import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { workApi, WorkType, WorkItem } from '../../api/work';
import { useAuth } from '../../contexts/AuthContext';

export default function WorkListPage() {
  const { type = 'task' } = useParams<{ type: string }>();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [workType, setWorkType] = useState<WorkType | null>(null);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Create form state
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

  const currentStatus = searchParams.get('status') || '';
  const currentPriority = searchParams.get('priority') || '';
  const searchQuery = searchParams.get('q') || '';

  useEffect(() => {
    loadWorkList();
  }, [type, searchParams]);

  async function loadWorkList() {
    try {
      setLoading(true);
      setError('');
      const params: Record<string, string> = {};
      if (currentStatus) params.status = currentStatus;
      if (currentPriority) params.priority = currentPriority;
      if (searchQuery) params.q = searchQuery;

      const res = await workApi.list(type, params);
      setWorkType(res.workType);
      setItems(res.data || []);
      setUsers(res.users || []);
      setCustomers(res.customers || []);

      if (!form.status && res.workType?.statuses?.length) {
        setForm(prev => ({ ...prev, status: res.workType.statuses[0].key }));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load work items');
    } finally {
      setLoading(false);
    }
  }

  function handleFilterChange(key: string, value: string) {
    const updated = new URLSearchParams(searchParams);
    if (value) {
      updated.set(key, value);
    } else {
      updated.delete(key);
    }
    setSearchParams(updated);
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

  async function handleQuickStatusChange(itemId: string, newStatus: string) {
    try {
      await workApi.updateStatus(type, itemId, newStatus);
      setItems(prev => prev.map(item => (item._id === itemId ? { ...item, status: newStatus } : item)));
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
    }
  }

  if (loading && items.length === 0) {
    return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading {type}...</div>;
  }

  return (
    <div className="page-container">
      {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="notice success" style={{ marginBottom: '1rem' }}>{success}</div>}

      {/* Header */}
      <section className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <p className="eyebrow">
            <Link to="/work" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Task Center</Link> / {workType?.name || type}
          </p>
          <h1 style={{ margin: '0.2rem 0' }}>{workType?.name || type}</h1>
          <p className="page-subtitle">Track and deliver {workType?.name.toLowerCase()} deliverables.</p>
        </div>

        <button
          type="button"
          className="btn primary"
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate ? 'Cancel' : `+ New ${workType?.name || 'Task'}`}
        </button>
      </section>

      {/* Create Drawer */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          style={{
            marginBottom: '1.5rem',
            padding: '1.5rem',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            background: 'var(--panel)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>New {workType?.name || 'Item'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Title *
              <input
                required
                placeholder="e.g. June Instagram Video Edit"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Linked Client / Lead
              <select
                value={form.customer}
                onChange={e => setForm({ ...form, customer: e.target.value || null })}
              >
                <option value="">No client linked</option>
                {customers.map(c => (
                  <option key={c._id} value={c._id}>{c.name} {c.company ? `(${c.company})` : ''}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Status
              <select
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value })}
              >
                {(workType?.statuses || []).map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Priority
              <select
                value={form.priority}
                onChange={e => setForm({ ...form, priority: e.target.value })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Owner
              <select
                value={form.assignedTo}
                onChange={e => setForm({ ...form, assignedTo: e.target.value || null })}
              >
                <option value="">Unassigned</option>
                {users.map(u => (
                  <option key={u._id} value={u._id}>{u.name}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Deadline
              <input
                type="date"
                value={form.deadline}
                onChange={e => setForm({ ...form, deadline: e.target.value })}
              />
            </label>
          </div>

          {/* Custom Fields */}
          {workType?.fields && workType.fields.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
              {workType.fields.map(field => (
                <label key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  {field.label} {field.required ? '*' : ''}
                  {field.type === 'select' ? (
                    <select
                      value={form.customFields?.[field.key] || ''}
                      onChange={e =>
                        setForm({
                          ...form,
                          customFields: { ...form.customFields, [field.key]: e.target.value },
                        })
                      }
                    >
                      <option value="">Select...</option>
                      {(field.options || []).map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : field.type === 'checkbox' ? (
                    <input
                      type="checkbox"
                      checked={!!form.customFields?.[field.key]}
                      onChange={e =>
                        setForm({
                          ...form,
                          customFields: { ...form.customFields, [field.key]: e.target.checked },
                        })
                      }
                    />
                  ) : (
                    <input
                      type={field.type === 'number' || field.type === 'currency' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                      value={form.customFields?.[field.key] || ''}
                      onChange={e =>
                        setForm({
                          ...form,
                          customFields: { ...form.customFields, [field.key]: e.target.value },
                        })
                      }
                    />
                  )}
                </label>
              ))}
            </div>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)', marginBottom: '1rem' }}>
            Notes & Brief
            <textarea
              rows={3}
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
            />
          </label>

          <button className="btn primary" type="submit" disabled={creating}>
            {creating ? 'Creating...' : 'Create Item'}
          </button>
        </form>
      )}

      {/* Filter Bar */}
      <div className="filter-bar" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <select
          value={currentStatus}
          onChange={e => handleFilterChange('status', e.target.value)}
          style={{ minWidth: '150px' }}
        >
          <option value="">All statuses</option>
          {(workType?.statuses || []).map(s => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>

        <select
          value={currentPriority}
          onChange={e => handleFilterChange('priority', e.target.value)}
          style={{ minWidth: '130px' }}
        >
          <option value="">All priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>

        {(currentStatus || currentPriority) && (
          <button
            type="button"
            className="btn small"
            onClick={() => setSearchParams(new URLSearchParams())}
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Table */}
      <section className="table-card" style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Title</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Client / Lead</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Owner</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Status</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Priority</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Deadline</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}>
                  No items in this work area.
                </td>
              </tr>
            ) : (
              items.map(item => (
                <tr key={item._id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <Link
                      to={`/work/${type}/${item._id}`}
                      style={{ fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}
                    >
                      {item.title}
                    </Link>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                    {item.customer ? (item.customer as any).name : '—'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                    {item.assignedTo?.name || 'Unassigned'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <select
                      value={item.status}
                      onChange={e => handleQuickStatusChange(item._id, e.target.value)}
                      style={{ padding: '2px 6px', fontSize: '0.75rem', borderRadius: '4px' }}
                    >
                      {(workType?.statuses || []).map(s => (
                        <option key={s.key} value={s.key}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                    <span style={{ textTransform: 'capitalize' }}>{item.priority}</span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                    {item.deadline ? new Date(item.deadline).toLocaleDateString() : 'No deadline'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    <Link to={`/work/${type}/${item._id}`} className="btn small outline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
