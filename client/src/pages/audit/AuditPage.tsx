import { useState, useEffect } from 'react';
import { auditApi, AuditLogEntry, AuditResponse } from '../../api/audit';

export default function AuditPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAuditLogs();
  }, [actionFilter, entityFilter, userFilter]);

  async function loadAuditLogs() {
    try {
      setLoading(true);
      setError('');
      const res = await auditApi.get({
        action: actionFilter || undefined,
        entityType: entityFilter || undefined,
        user: userFilter || undefined,
      });
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }

  function handleResetFilters() {
    setActionFilter('');
    setEntityFilter('');
    setUserFilter('');
  }

  return (
    <div className="page-container">
      {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      <section className="page-head" style={{ marginBottom: '1.5rem' }}>
        <div>
          <p className="eyebrow">Admin</p>
          <h1 style={{ margin: '0.2rem 0' }}>Audit Trail</h1>
          <p className="page-subtitle">Review important CRM actions across users, leads, companies, campaigns, imports, and settings.</p>
        </div>
      </section>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.25rem' }}>
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: '6px', background: 'var(--panel)', color: 'var(--text)', fontSize: '0.82rem', minWidth: '160px' }}
        >
          <option value="">All actions</option>
          {data?.actions.map(act => (
            <option key={act} value={act}>{act}</option>
          ))}
        </select>

        <select
          value={entityFilter}
          onChange={e => setEntityFilter(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: '6px', background: 'var(--panel)', color: 'var(--text)', fontSize: '0.82rem', minWidth: '160px' }}
        >
          <option value="">All entity types</option>
          {data?.entityTypes.map(ent => (
            <option key={ent} value={ent}>{ent}</option>
          ))}
        </select>

        <select
          value={userFilter}
          onChange={e => setUserFilter(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: '6px', background: 'var(--panel)', color: 'var(--text)', fontSize: '0.82rem', minWidth: '180px' }}
        >
          <option value="">All users</option>
          {data?.users.map(u => (
            <option key={u._id} value={u._id}>{u.name} ({u.role})</option>
          ))}
        </select>

        <button
          type="button"
          className="btn small outline"
          onClick={handleResetFilters}
        >
          Reset Filters
        </button>
      </div>

      {/* Logs Table */}
      <section className="table-card" style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)', background: 'var(--bg-soft, rgba(255,255,255,0.01))' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Time</th>
                <th style={{ padding: '0.75rem 1rem' }}>User</th>
                <th style={{ padding: '0.75rem 1rem' }}>Action</th>
                <th style={{ padding: '0.75rem 1rem' }}>Entity</th>
                <th style={{ padding: '0.75rem 1rem' }}>Message</th>
                <th style={{ padding: '0.75rem 1rem' }}>IP</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>
                    Loading audit trail...
                  </td>
                </tr>
              ) : data?.logs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>
                    No audit logs match this view.
                  </td>
                </tr>
              ) : (
                data?.logs.map(log => (
                  <tr key={log._id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                      {new Date(log.createdAt).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                      {log.user ? log.user.name : 'System / API'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span
                        className="stage-badge"
                        style={{ backgroundColor: 'var(--teal)', fontSize: '0.65rem' }}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <strong>{log.entityType}</strong>
                      {log.entityName && (
                        <span style={{ display: 'block', color: 'var(--muted)', fontSize: '0.74rem' }}>
                          {log.entityName}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {log.message || 'No message'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', color: 'var(--muted)' }}>
                      {log.ipAddress || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
