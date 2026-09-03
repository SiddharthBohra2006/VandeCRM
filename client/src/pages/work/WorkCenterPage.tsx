import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { workApi, WorkType, WorkItem } from '../../api/work';
import { useAuth } from '../../contexts/AuthContext';

export default function WorkCenterPage() {
  const { user, activeCompany } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [counts, setCounts] = useState({ open: 0, completed: 0, overdue: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      setCounts(res.counts || { open: 0, completed: 0, overdue: 0, total: 0 });

      let filteredItems = res.items || [];

      // Filter by view
      const now = new Date();
      if (currentView === 'today') {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        filteredItems = filteredItems.filter(item => {
          if (!item.deadline) return false;
          const d = new Date(item.deadline);
          return d >= startOfDay && d <= endOfDay;
        });
      } else if (currentView === 'overdue') {
        filteredItems = filteredItems.filter(item => {
          return item.status !== 'completed' && item.status !== 'delivered' && item.deadline && new Date(item.deadline) < now;
        });
      } else if (currentView === 'completed') {
        filteredItems = filteredItems.filter(item => item.status === 'completed' || item.status === 'delivered');
      } else if (currentView === 'open') {
        filteredItems = filteredItems.filter(item => item.status !== 'completed' && item.status !== 'delivered');
      }

      // Filter by owner
      if (currentOwner === 'me' && user) {
        filteredItems = filteredItems.filter(item => {
          const isAssigned = item.assignedTo && String(item.assignedTo._id) === String(user._id);
          const isCollab = (item.collaborators || []).some(c => String(c._id) === String(user._id));
          return isAssigned || isCollab;
        });
      }

      // Filter by module
      if (currentModule) {
        filteredItems = filteredItems.filter(item => {
          return item.workType?.key === currentModule;
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
        <Link to="/tasks" className="btn small outline">
          Lead Follow-ups
        </Link>
      </section>

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

      {/* Work Items Table */}
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
                      {item.assignedTo?.name || 'Unassigned'}
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
      </section>
    </div>
  );
}
