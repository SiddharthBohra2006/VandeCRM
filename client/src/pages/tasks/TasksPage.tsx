import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { tasksApi, TaskStats, TaskActivity } from '../../api/tasks';
import { Customer } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

const AVATAR_PALETTES = [
  { bg: '#eff6ff', color: '#2563eb' },
  { bg: '#ecfdf5', color: '#059669' },
  { bg: '#faf5ff', color: '#7c3aed' },
  { bg: '#f0fdfa', color: '#0d9488' },
  { bg: '#fdf2f8', color: '#db2777' },
  { bg: '#fff7ed', color: '#ea580c' },
  { bg: '#fffbeb', color: '#d97706' },
];

function getAvatarColor(str: string) {
  let hash = 0;
  for (let i = 0; i < (str || '').length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

function initialsOf(name: string) {
  return (name || 'L').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'L';
}

function normalizePhone(phone?: string) {
  if (!phone) return '';
  return phone.replace(/[^0-9+]/g, '');
}

function toDatetimeLocal(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export default function TasksPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tasks, setTasks] = useState<Customer[]>([]);
  const [completedTasks, setCompletedTasks] = useState<TaskActivity[]>([]);
  const [stats, setStats] = useState<TaskStats>({ due: 0, today: 0, upcoming: 0, all: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Row edit state
  const [rescheduleData, setRescheduleData] = useState<Record<string, { nextFollowUpAt: string; comment: string }>>({});
  const [completeNotes, setCompleteNotes] = useState<Record<string, string>>({});

  const currentView = searchParams.get('view') || 'due';

  useEffect(() => {
    loadTasks();
  }, [searchParams]);

  async function loadTasks() {
    try {
      setLoading(true);
      setError('');
      const res = await tasksApi.list({ view: currentView });
      setTasks(res.tasks || []);
      setCompletedTasks(res.completedTasks || []);
      setStats(res.stats || { due: 0, today: 0, upcoming: 0, all: 0 });

      // Initialize reschedule state for rows
      const initResched: Record<string, { nextFollowUpAt: string; comment: string }> = {};
      res.tasks.forEach(t => {
        initResched[t._id] = {
          nextFollowUpAt: toDatetimeLocal(t.nextFollowUpAt),
          comment: '',
        };
      });
      setRescheduleData(initResched);
    } catch (err: any) {
      setError(err.message || 'Failed to load follow-up tasks');
    } finally {
      setLoading(false);
    }
  }

  function handleTabClick(view: string) {
    const updated = new URLSearchParams(searchParams);
    updated.set('view', view);
    setSearchParams(updated);
  }

  async function handleComplete(taskId: string) {
    try {
      const comment = completeNotes[taskId] || '';
      await tasksApi.complete(taskId, comment);
      setSuccess('Follow-up completed.');
      await loadTasks();
    } catch (err: any) {
      setError(err.message || 'Failed to complete follow-up');
    }
  }

  async function handleReschedule(taskId: string) {
    try {
      const row = rescheduleData[taskId];
      if (!row || !row.nextFollowUpAt) {
        setError('Please choose a valid follow-up date and time.');
        return;
      }
      await tasksApi.reschedule(taskId, row.nextFollowUpAt, row.comment);
      setSuccess('Follow-up rescheduled.');
      await loadTasks();
    } catch (err: any) {
      setError(err.message || 'Failed to reschedule follow-up');
    }
  }

  if (loading && tasks.length === 0) {
    return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading follow-up tasks...</div>;
  }

  return (
    <div className="page-container">
      {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="notice success" style={{ marginBottom: '1rem' }}>{success}</div>}

      {/* Breadcrumb / Head */}
      <section className="page-head" style={{ marginBottom: '1.5rem' }}>
        <div>
          <p className="eyebrow">Work Queue</p>
          <h1 style={{ margin: '0.2rem 0' }}>Lead follow-ups</h1>
          <p className="page-subtitle">The shared follow-up queue for this business. Every entry is connected to one lead and its timeline.</p>
        </div>
      </section>

      {/* Stats Grid */}
      <section className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="metric danger" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Due Now</span>
          <strong style={{ fontSize: '1.25rem', color: 'var(--red)' }}>{stats.due}</strong>
        </div>
        <div className="metric warn" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Today</span>
          <strong style={{ fontSize: '1.25rem', color: 'var(--gold)' }}>{stats.today}</strong>
        </div>
        <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Upcoming</span>
          <strong style={{ fontSize: '1.25rem' }}>{stats.upcoming}</strong>
        </div>
        <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Total Scheduled</span>
          <strong style={{ fontSize: '1.25rem' }}>{stats.all}</strong>
        </div>
      </section>

      {/* Quick View Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem', flexWrap: 'wrap' }}>
        {[
          { id: 'due', label: 'Due Now' },
          { id: 'today', label: 'Today' },
          { id: 'upcoming', label: 'Upcoming' },
          { id: 'all', label: 'All Scheduled' },
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            className="btn small"
            onClick={() => handleTabClick(tab.id)}
            style={{
              background: currentView === tab.id ? 'var(--gold-dim, rgba(245, 158, 11, 0.15))' : 'var(--panel)',
              borderColor: currentView === tab.id ? 'var(--gold)' : 'var(--border)',
              color: 'var(--text)',
              fontWeight: 800,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tasks Table */}
      <section className="table-card" style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', marginBottom: '2rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Lead</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Due</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Stage</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Client / Campaign</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Follow-up Owner</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Reschedule</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}></th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}>
                  No follow-ups in this view.
                </td>
              </tr>
            ) : (
              tasks.map(task => {
                const avatarColor = getAvatarColor(task.name);
                const cleanPhone = normalizePhone(task.phone);
                const isOverdue = task.nextFollowUpAt && new Date(task.nextFollowUpAt) < new Date();
                const row = rescheduleData[task._id] || { nextFollowUpAt: '', comment: '' };

                return (
                  <tr key={task._id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: '50%',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.72rem',
                            flexShrink: 0,
                            background: avatarColor.bg,
                            color: avatarColor.color,
                          }}
                        >
                          {initialsOf(task.name)}
                        </span>
                        <div>
                          <Link to={`/customers/${task._id}`} style={{ fontWeight: 800, color: 'var(--text)', textDecoration: 'none' }}>
                            {task.name}
                          </Link>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '2px', flexWrap: 'wrap' }}>
                            {cleanPhone && (
                              <>
                                <a
                                  href={`https://wa.me/${cleanPhone}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn small"
                                  style={{ padding: '2px 6px', fontSize: '0.7rem', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)' }}
                                  title="Open WhatsApp chat"
                                >
                                  💬 WA
                                </a>
                                <a
                                  href={`tel:${cleanPhone}`}
                                  className="btn small"
                                  style={{ padding: '2px 6px', fontSize: '0.7rem', color: 'var(--teal)', borderColor: 'rgba(20, 184, 166, 0.3)' }}
                                  title="Call phone"
                                >
                                  📞 Call
                                </a>
                              </>
                            )}
                            <span style={{ color: 'var(--muted)', fontSize: '0.74rem' }}>
                              {task.phone || task.email || task.source || '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <strong style={{ color: isOverdue ? 'var(--red)' : 'var(--text)', fontSize: '0.85rem' }}>
                        {task.nextFollowUpAt ? new Date(task.nextFollowUpAt).toLocaleString() : 'Not set'}
                      </strong>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                      {task.stage?.name || 'No stage'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <strong style={{ fontSize: '0.85rem' }}>{(task.clientCompany as any)?.name || 'Direct Lead'}</strong>
                      <span style={{ display: 'block', color: 'var(--muted)', fontSize: '0.74rem' }}>
                        {(task.campaign as any)?.name || 'No campaign'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                      {task.assignedTo?.name || 'Unassigned'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                        <input
                          type="datetime-local"
                          value={row.nextFollowUpAt}
                          onChange={e =>
                            setRescheduleData({
                              ...rescheduleData,
                              [task._id]: { ...row, nextFollowUpAt: e.target.value },
                            })
                          }
                          style={{ minWidth: '170px', padding: '4px 6px', fontSize: '0.75rem' }}
                        />
                        <input
                          type="text"
                          placeholder="Comment"
                          value={row.comment}
                          onChange={e =>
                            setRescheduleData({
                              ...rescheduleData,
                              [task._id]: { ...row, comment: e.target.value },
                            })
                          }
                          style={{ maxWidth: '120px', padding: '4px 6px', fontSize: '0.75rem' }}
                        />
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => handleReschedule(task._id)}
                        >
                          Set
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <input
                          type="text"
                          placeholder="Note"
                          value={completeNotes[task._id] || ''}
                          onChange={e => setCompleteNotes({ ...completeNotes, [task._id]: e.target.value })}
                          style={{ maxWidth: '120px', padding: '4px 6px', fontSize: '0.75rem' }}
                        />
                        <button
                          type="button"
                          className="btn small primary"
                          onClick={() => handleComplete(task._id)}
                        >
                          Complete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      {/* Recently Completed History */}
      <section className="table-card" style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', padding: '1.5rem' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <p className="eyebrow">History</p>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Recently completed</h2>
          </div>
          <span className="pill">{completedTasks.length}</span>
        </header>

        {completedTasks.length === 0 ? (
          <p className="empty" style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No completed follow-ups yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {completedTasks.map(task => (
              <div
                key={task._id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  background: 'var(--bg-soft, rgba(255,255,255,0.02))',
                }}
              >
                <div>
                  <strong>{task.customer ? task.customer.name : 'Deleted lead'}</strong>
                  {task.comment && <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text)' }}>{task.comment}</p>}
                  {task.nextFollowUpAt && (
                    <small style={{ display: 'block', color: 'var(--muted)', fontSize: '0.72rem' }}>
                      Was due {new Date(task.nextFollowUpAt).toLocaleString()}
                    </small>
                  )}
                </div>
                <small style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
                  {task.user ? task.user.name : 'System'} · {new Date(task.createdAt).toLocaleString()}
                </small>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
