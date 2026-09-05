import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { workApi, WorkType, WorkItem } from '../../api/work';
import { useAuth } from '../../contexts/AuthContext';
import DatePicker from '../../components/DatePicker';

export default function WorkCenterPage() {
  const { user, activeCompany } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [users, setUsers] = useState<{ _id: string; name: string; email?: string }[]>([]);
  const [counts, setCounts] = useState({ open: 0, completed: 0, overdue: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [bulk, setBulk] = useState({ type: '', titles: '', assignedTo: '', deadline: '', priority: 'medium' });
  const [saving, setSaving] = useState(false);

  const currentView = searchParams.get('view') || 'open';
  const currentOwner = searchParams.get('owner') || 'all';
  const currentModule = searchParams.get('module') || '';

  useEffect(() => {
    loadWorkCenter();
  }, [searchParams]);

  async function loadWorkCenter() {
    try {
      setLoading(true);
      setError('');
      const res = await workApi.getCenter();
      setWorkTypes(res.workTypes || []);
      setUsers(res.users || []);
      setCounts(res.counts || { open: 0, completed: 0, overdue: 0, total: 0 });

      let filteredItems = res.items || [];

      // Filter by view
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setHours(24, 0, 0, 0);

      const checkClosed = (item: WorkItem) => {
        const wt = item.workType || res.workTypes?.find(t => t._id === item.module || t.key === item.workType?.key);
        const statusObj = wt?.statuses?.find(s => s.key === item.status);
        if (statusObj?.isTerminalWon || statusObj?.isTerminalLost) return true;
        return ['completed', 'delivered', 'done', 'won', 'lost', 'cancelled'].includes(String(item.status || '').toLowerCase());
      };

      if (currentView === 'today') {
        filteredItems = filteredItems.filter(item => !checkClosed(item) && item.deadline && new Date(item.deadline) < tomorrow);
      } else if (currentView === 'overdue') {
        filteredItems = filteredItems.filter(item => !checkClosed(item) && item.deadline && new Date(item.deadline) < now);
      } else if (currentView === 'completed') {
        filteredItems = filteredItems.filter(item => checkClosed(item));
      } else if (currentView === 'open') {
        filteredItems = filteredItems.filter(item => !checkClosed(item));
      }

      // Filter by owner
      if (currentOwner === 'me' && user) {
        filteredItems = filteredItems.filter(item => {
          const isAssigned = item.assignedTo && String(item.assignedTo._id || item.assignedTo) === String(user._id);
          const isSecondary = item.secondaryAssignee && String(item.secondaryAssignee._id || item.secondaryAssignee) === String(user._id);
          const isCollab = (item.collaborators || []).some(c => String(c._id || c) === String(user._id));
          return isAssigned || isSecondary || isCollab;
        });
      }

      // Filter by module
      if (currentModule) {
        filteredItems = filteredItems.filter(item => {
          return item.workType?.key === currentModule || item.workType?._id === currentModule;
        });
      }

      setItems(filteredItems);
    } catch (err: any) {
      setError(err.message || 'Failed to load task center');
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

  async function assign(item: WorkItem, toUser: string) {
    const type = item.workType?.key;
    if (!type || String(item.assignedTo?._id || '') === toUser) return;
    try { toUser ? await workApi.delegate(type, item._id, { toUser }) : await workApi.update(type, item._id, { assignedTo: null }); await loadWorkCenter(); }
    catch (err: any) { setError(err.message || 'Could not assign task'); }
  }

  async function createBulk(e: React.FormEvent) {
    e.preventDefault();
    if (!bulk.type || !bulk.titles.trim() || !bulk.assignedTo) return;
    try {
      setSaving(true);
      await workApi.bulkCreate(bulk.type, bulk);
      setBulk({ type: '', titles: '', assignedTo: '', deadline: '', priority: 'medium' });
      setShowBulk(false);
      await loadWorkCenter();
    } catch (err: any) { setError(err.message || 'Could not create tasks'); }
    finally { setSaving(false); }
  }

  const chain = (item: WorkItem) => {
    const names = (item.workflowHistory || []).map(event => event.toUser?.name).filter(Boolean);
    return [...new Set(names)].join(' → ');
  };

  if (loading && items.length === 0) {
    return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading work center...</div>;
  }

  return (
    <div className="page-container">
      {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      <section className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Task Center</h1>
          <p className="page-subtitle">Tasks and deliverables across your accessible work areas.</p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <Link to="/work/threads" className="btn small">💬 Team Chat</Link>
          <button className="btn small" onClick={() => setShowBulk(true)}>+ Add multiple tasks</button>
          <Link to="/follow-ups" className="btn small outline">Lead Follow-ups</Link>
        </div>
      </section>

      {showBulk && <form onSubmit={createBulk} className="table-card" style={{ padding: '1rem', marginBottom: '1rem', display: 'grid', gap: '.75rem' }}>
        <strong>Create many tasks</strong>
        <select required value={bulk.type} onChange={e => setBulk({ ...bulk, type: e.target.value })}><option value="">Choose work area</option>{workTypes.map(type => <option key={type._id} value={type.key}>{type.name}</option>)}</select>
        <textarea required rows={6} value={bulk.titles} onChange={e => setBulk({ ...bulk, titles: e.target.value })} placeholder="One task per line" />
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <select required value={bulk.assignedTo} onChange={e => setBulk({ ...bulk, assignedTo: e.target.value })}><option value="">Assign all to…</option>{users.map(member => <option key={member._id} value={member._id}>{member.name}</option>)}</select>
          <select value={bulk.priority} onChange={e => setBulk({ ...bulk, priority: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
          <DatePicker
            placeholder="Deadline"
            value={bulk.deadline}
            onChange={val => setBulk({ ...bulk, deadline: val })}
          />
          <button className="btn small" disabled={saving}>{saving ? 'Creating…' : 'Create tasks'}</button>
          <button type="button" className="btn small outline" onClick={() => setShowBulk(false)}>Cancel</button>
        </div>
      </form>}

      {/* Work Areas Navigation */}
      <nav className="work-center-nav" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {workTypes.map(type => (
          <Link
            key={type._id}
            to={`/work/${type.key}`}
            className="btn small"
            style={{
              background: 'var(--panel)',
              border: `1px solid ${type.color || 'var(--border)'}`,
              color: 'var(--text)',
              textDecoration: 'none',
              fontWeight: 700,
            }}
          >
            + {type.name}
          </Link>
        ))}
      </nav>

      {/* Filter Bar */}
      <div className="filter-bar" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 700 }}>
          Queue:
          <select
            value={currentView}
            onChange={e => handleFilterChange('view', e.target.value)}
          >
            <option value="open">Open</option>
            <option value="today">Due today or earlier</option>
            <option value="overdue">Overdue</option>
            <option value="completed">Closed</option>
            <option value="all">All</option>
            <option value="team">Team workload</option>
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 700 }}>
          Assignment:
          <select
            value={currentOwner}
            onChange={e => handleFilterChange('owner', e.target.value)}
          >
            <option value="all">All accessible work</option>
            <option value="me">Assigned to me</option>
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 700 }}>
          Work Area:
          <select
            value={currentModule}
            onChange={e => handleFilterChange('module', e.target.value)}
          >
            <option value="">All areas</option>
            {workTypes.map(t => (
              <option key={t._id} value={t.key}>{t.name}</option>
            ))}
          </select>
        </label>

        {(currentView !== 'open' || currentOwner !== 'all' || currentModule) && (
          <button
            type="button"
            className="btn small"
            onClick={() => setSearchParams(new URLSearchParams())}
          >
            Reset
          </button>
        )}
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '1rem' }}>
        {counts.open} open · {counts.overdue} overdue · {counts.completed} closed
      </p>

      {currentView === 'team' && users.length > 0 && (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          {[...users, { _id: '', name: 'Unassigned' }].map(member => {
            const tasks = items.filter(item => String(item.assignedTo?._id || '') === member._id);
            return <article key={member._id} className="table-card" onDragOver={e => e.preventDefault()} onDrop={e => { const raw = e.dataTransfer.getData('application/json'); if (raw) assign(JSON.parse(raw), member._id); }} style={{ padding: '1rem', minHeight: 180 }}>
              <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.75rem' }}><strong>{member.name}</strong><span className="pill">{tasks.length} tasks</span></header>
              {tasks.length === 0 && <small style={{ color: 'var(--muted)' }}>Drop a task here to assign it.</small>}
              {tasks.map(item => <div key={item._id} draggable onDragStart={e => e.dataTransfer.setData('application/json', JSON.stringify(item))} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '.65rem', marginBottom: '.5rem', cursor: 'grab' }}>
                <Link to={`/work/${item.workType?.key || 'task'}/${item._id}`} style={{ color: 'var(--text)', fontWeight: 700, textDecoration: 'none' }}>{item.title}</Link>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '.35rem', fontSize: '.72rem', color: 'var(--muted)' }}><span>{item.workType?.name}</span><span>{item.status}</span></div>
                {chain(item) && <div title="Forwarding history" style={{ marginTop: '.35rem', fontSize: '.7rem', color: 'var(--muted)' }}>{chain(item)}</div>}
              </div>)}
            </article>;
          })}
        </section>
      )}

      {/* Work Items Table */}
      {currentView !== 'team' &&
      <section className="table-card" style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Work</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Area</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Owner</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Status</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Priority</th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Due</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}>
                  No work matches these filters. Open a work area above to create a task.
                </td>
              </tr>
            ) : (
              items.map(item => {
                const workTypeKey = item.workType?.key || 'task';
                const statusObj = item.workType?.statuses?.find(s => s.key === item.status);

                return (
                  <tr key={item._id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Link
                        to={`/work/${workTypeKey}/${item._id}`}
                        style={{ fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}
                      >
                        {item.title}
                      </Link>
                      {item.customer && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '2px' }}>
                          {(item.customer as any).name}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                      <span
                        className="pill"
                        style={{ borderColor: item.workType?.color || 'var(--border)' }}
                      >
                        {item.workType?.name || workTypeKey}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                      <select aria-label={`Assign ${item.title}`} value={item.assignedTo?._id || ''} onChange={e => assign(item, e.target.value)}>
                        <option value="">Unassigned</option>{users.map(member => <option key={member._id} value={member._id}>{member.name}</option>)}
                      </select>
                      {chain(item) && <div title="Forwarding history" style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 3 }}>{chain(item)}</div>}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span
                        className="stage-badge"
                        style={{
                          backgroundColor: 'var(--surface)',
                          border: '1px solid var(--border)',
                          color: 'var(--text)',
                          fontSize: '0.65rem',
                          padding: '2px 6px',
                        }}
                      >
                        {statusObj?.label || item.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                      <span style={{ textTransform: 'capitalize' }}>{item.priority}</span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                      {item.deadline ? new Date(item.deadline).toLocaleDateString() : 'No deadline'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>}
    </div>
  );
}
