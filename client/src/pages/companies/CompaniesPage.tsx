import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { companiesApi, Company, AssignedUser } from '../../api/companies';
import { useAuth } from '../../contexts/AuthContext';

const AVATAR_COLORS = ['#0f766e', '#b58d00', '#2563eb', '#dc2626', '#16a34a', '#7c3aed'];

export default function CompaniesPage() {
  const { user, activeCompany, switchCompany } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<AssignedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New company form state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newModuleSetup, setNewModuleSetup] = useState('agency');
  const [creating, setCreating] = useState(false);

  // Access modal state
  const [accessModalCompany, setAccessModalCompany] = useState<Company | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [savingAccess, setSavingAccess] = useState(false);

  useEffect(() => {
    loadCompanies();
  }, []);

  async function loadCompanies() {
    try {
      setLoading(true);
      setError('');
      const res = await companiesApi.list();
      setCompanies(res.data || []);
      setUsers(res.users || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load workspaces');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      setCreating(true);
      setError('');
      const res = await companiesApi.create({
        name: newName.trim(),
        moduleSetup: newModuleSetup,
      });
      setSuccess(`Workspace "${res.data.name}" created successfully.`);
      setNewName('');
      setShowCreate(false);
      await loadCompanies();
    } catch (err: any) {
      setError(err.message || 'Failed to create workspace');
    } finally {
      setCreating(false);
    }
  }

  async function handleSetMain(companyId: string) {
    try {
      await companiesApi.setMain(companyId);
      setSuccess('Main workspace updated.');
      await loadCompanies();
    } catch (err: any) {
      setError(err.message || 'Failed to set main workspace');
    }
  }

  function openAccessModal(company: Company) {
    setAccessModalCompany(company);
    setSelectedUserIds((company.assignedUsers || []).map(u => u._id));
    setUserSearchQuery('');
  }

  async function handleSaveAccess(e: React.FormEvent) {
    e.preventDefault();
    if (!accessModalCompany) return;
    try {
      setSavingAccess(true);
      await companiesApi.updateCollaborators(accessModalCompany._id, selectedUserIds);
      setSuccess(`Access updated for ${accessModalCompany.name}.`);
      setAccessModalCompany(null);
      await loadCompanies();
    } catch (err: any) {
      setError(err.message || 'Failed to update access');
    } finally {
      setSavingAccess(false);
    }
  }

  function getAvatar(name: string) {
    const initials = name
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    const colorIndex = (initials.charCodeAt(0) || 0) % AVATAR_COLORS.length;
    return { initials, color: AVATAR_COLORS[colorIndex] };
  }

  const canCreate = user?.role === 'admin' || user?.role === 'manager';

  if (loading) {
    return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading workspaces...</div>;
  }

  return (
    <div className="page-container">
      {error && <div className="auth-error" style={{ marginBottom: '1.5rem' }}>{error}</div>}
      {success && <div className="notice success" style={{ marginBottom: '1.5rem' }}>{success}</div>}

      <section className="page-head">
        <div>
          <p className="eyebrow">Agency Portfolio</p>
          <h1>CRMs</h1>
          <p className="page-subtitle">Manage independent workspaces for your leads, clients, work, campaigns, and team.</p>
        </div>
        {canCreate && (
          <button
            type="button"
            className="btn primary"
            onClick={() => setShowCreate(!showCreate)}
          >
            {showCreate ? 'Cancel' : 'New CRM'}
          </button>
        )}
      </section>

      {/* Create CRM Drawer */}
      {showCreate && (
        <form
          onSubmit={handleCreateCompany}
          style={{
            marginBottom: '2rem',
            padding: '1.5rem',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            background: 'var(--panel)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: '1.1rem', marginBottom: '1.25rem' }}>Create a new CRM</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              CRM Name *
              <input
                required
                placeholder="e.g. Notes Ninja"
                value={newName}
                onChange={e => setNewName(e.target.value)}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Starting modules (optional)
              <select
                value={newModuleSetup}
                onChange={e => setNewModuleSetup(e.target.value)}
              >
                <option value="agency">Agency starter (Tasks, Videos, Designs, Websites, Content)</option>
                <option value="blank">Start blank</option>
              </select>
            </label>
          </div>
          <button className="btn primary" type="submit" disabled={creating}>
            {creating ? 'Creating...' : 'Create CRM'}
          </button>
        </form>
      )}

      {/* Grid of Workspaces */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
        {companies.length === 0 ? (
          <p className="empty" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', color: 'var(--muted)' }}>
            No CRMs created yet.
          </p>
        ) : (
          companies.map(company => {
            const { initials, color } = getAvatar(company.name);
            const isCurrentActive = activeCompany?._id === company._id;
            const assignedList = company.assignedUsers || [];

            return (
              <div
                key={company._id}
                className="profile-panel"
                style={{
                  padding: '1.5rem',
                  border: isCurrentActive ? '2px solid var(--teal)' : '1px solid var(--border)',
                  borderRadius: '12px',
                  background: 'var(--panel)',
                  boxShadow: 'var(--shadow-soft)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '1.25rem',
                }}
              >
                <div>
                  {/* Brand Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '10px',
                        background: color,
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '1.15rem',
                      }}
                    >
                      {initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Link to={`/companies/${company._id}`} style={{ textDecoration: 'none' }}>
                        <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {company.name}
                        </h2>
                      </Link>
                      <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
                        {company.website ? (
                          <a href={company.website} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>
                            {company.website}
                          </a>
                        ) : (
                          'No website URL'
                        )}
                      </p>
                    </div>
                    <span
                      className="stage-badge"
                      style={{
                        backgroundColor: company.status === 'active' ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)',
                        color: '#fff',
                        fontSize: '0.65rem',
                        padding: '2px 6px',
                      }}
                    >
                      {company.status.toUpperCase()}
                    </span>
                  </div>

                  {/* Badges */}
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
                    {company.isMain && <span className="pill" style={{ borderColor: 'var(--gold)' }}>MAIN CRM</span>}
                    {isCurrentActive && <span className="pill" style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>ACTIVE WORKSPACE</span>}
                    <span className="pill">{(company.businessType || 'service').toUpperCase()}</span>
                    <span className="pill">Health: {(company.healthStatus || 'healthy').toUpperCase()}</span>
                    <span className="pill">Owner: {company.accountOwner ? company.accountOwner.name : 'Unassigned'}</span>
                  </div>

                  {user?.role === 'admin' && !company.isMain && company.status !== 'inactive' && (
                    <button
                      type="button"
                      className="btn small"
                      style={{ marginBottom: '0.8rem' }}
                      onClick={() => handleSetMain(company._id)}
                    >
                      Make Main CRM
                    </button>
                  )}

                  {/* Metrics Box */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', background: 'var(--bg-soft, rgba(255,255,255,0.03))', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>Campaigns</span>
                      <strong style={{ fontSize: '0.95rem', color: 'var(--text)' }}>{company.campaignCount || 0} active</strong>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>Total Leads</span>
                      <strong style={{ fontSize: '0.95rem', color: 'var(--text)' }}>{company.leadCount || 0} leads</strong>
                    </div>
                  </div>

                  {/* Assigned Team */}
                  <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
                    Assigned team: <strong>{assignedList.length} {assignedList.length === 1 ? 'member' : 'members'}</strong>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {!isCurrentActive ? (
                      <button
                        type="button"
                        className="btn small primary"
                        style={{ flex: 1, fontWeight: 700 }}
                        onClick={() => switchCompany(company._id)}
                      >
                        Switch to this CRM
                      </button>
                    ) : (
                      <span className="btn small disabled" style={{ flex: 1, textAlign: 'center', opacity: 0.7 }}>
                        Current Active
                      </span>
                    )}
                    <Link
                      to={`/companies/${company._id}`}
                      className="btn small outline"
                      style={{ flex: 1, textAlign: 'center', fontWeight: 700 }}
                    >
                      View Details →
                    </Link>
                  </div>

                  {canCreate && (
                    <button
                      type="button"
                      className="btn small"
                      style={{ width: '100%' }}
                      onClick={() => openAccessModal(company)}
                    >
                      Manage workspace access
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Workspace Access Modal */}
      {accessModalCompany && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              maxWidth: '500px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: 'var(--shadow-hard)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Workspace Access</h2>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
                  {accessModalCompany.name} · Choose who can open this CRM
                </p>
              </div>
              <button
                type="button"
                className="btn small"
                onClick={() => setAccessModalCompany(null)}
              >
                &times;
              </button>
            </div>

            <input
              type="search"
              placeholder="Search team members…"
              value={userSearchQuery}
              onChange={e => setUserSearchQuery(e.target.value)}
              style={{ width: '100%', marginBottom: '1rem' }}
            />

            <form onSubmit={handleSaveAccess}>
              <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                {users
                  .filter(u => u.name.toLowerCase().includes(userSearchQuery.toLowerCase()) || (u.email && u.email.toLowerCase().includes(userSearchQuery.toLowerCase())))
                  .map(u => {
                    const isChecked = selectedUserIds.includes(u._id);
                    return (
                      <label
                        key={u._id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.5rem',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedUserIds(prev => [...prev, u._id]);
                            } else {
                              setSelectedUserIds(prev => prev.filter(id => id !== u._id));
                            }
                          }}
                        />
                        <div>
                          <strong>{u.name}</strong>
                          {u.email && <small style={{ display: 'block', color: 'var(--muted)' }}>{u.email}</small>}
                        </div>
                      </label>
                    );
                  })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setAccessModalCompany(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={savingAccess}
                >
                  {savingAccess ? 'Saving...' : 'Save Access'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
