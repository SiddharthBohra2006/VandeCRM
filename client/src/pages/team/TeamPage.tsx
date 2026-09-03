import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { teamApi, TeamMember, CustomRole, TeamSummary, TeamMemberInput } from '../../api/team';
import { Company } from '../../api/companies';
import { useAuth } from '../../contexts/AuthContext';

export default function TeamPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<'members' | 'roles'>(
    (searchParams.get('tab') as 'members' | 'roles') || 'members'
  );

  const [users, setUsers] = useState<TeamMember[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [roleDefinitions, setRoleDefinitions] = useState<Record<string, { label: string; description?: string }>>({});
  const [permissionModules, setPermissionModules] = useState<string[]>([]);
  const [permissionActions, setPermissionActions] = useState<string[]>([]);
  const [teamSummary, setTeamSummary] = useState<TeamSummary>({ total: 0, active: 0, inactive: 0 });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Search/filter state
  const searchQuery = searchParams.get('q') || '';
  const statusFilter = searchParams.get('status') || '';
  const roleFilter = searchParams.get('role') || '';

  // Add Member State
  const [showAddMember, setShowAddMember] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [newMember, setNewMember] = useState<TeamMemberInput>({
    name: '',
    email: '',
    password: '',
    role: 'agent',
    customRole: '',
    assignedCompanies: [],
    isActive: true,
  });

  // Edit Member State
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editForm, setEditForm] = useState<TeamMemberInput>({
    name: '',
    email: '',
    password: '',
    role: 'agent',
    customRole: '',
    assignedCompanies: [],
    isActive: true,
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Role Form State
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [roleForm, setRoleForm] = useState<{ name: string; scope: 'organization' | 'assigned'; permissions: string[] }>({
    name: '',
    scope: 'assigned',
    permissions: [],
  });
  const [savingRole, setSavingRole] = useState(false);

  useEffect(() => {
    loadTeamData();
  }, [searchParams]);

  async function loadTeamData() {
    try {
      setLoading(true);
      setError('');
      const params: Record<string, string> = {};
      if (searchQuery) params.q = searchQuery;
      if (statusFilter) params.status = statusFilter;
      if (roleFilter) params.role = roleFilter;

      const res = await teamApi.list(params);
      setUsers(res.users || []);
      setCompanies(res.companies || []);
      setCustomRoles(res.customRoles || []);
      setRoleDefinitions(res.roleDefinitions || {});
      setPermissionModules(res.permissionModules || []);
      setPermissionActions(res.permissionActions || []);
      setTeamSummary(res.teamSummary || { total: 0, active: 0, inactive: 0 });
    } catch (err: any) {
      setError(err.message || 'Failed to load team data');
    } finally {
      setLoading(false);
    }
  }

  function handleTabChange(tab: 'members' | 'roles') {
    setActiveTab(tab);
    const updated = new URLSearchParams(searchParams);
    updated.set('tab', tab);
    setSearchParams(updated);
  }

  function handleFilterChange(key: string, value: string) {
    const updated = new URLSearchParams(searchParams);
    if (value) updated.set(key, value);
    else updated.delete(key);
    setSearchParams(updated);
  }

  async function handleCreateMember(e: React.FormEvent) {
    e.preventDefault();
    if (!newMember.name.trim() || !newMember.email.trim() || !newMember.password) return;
    try {
      setAddingMember(true);
      setError('');
      await teamApi.create(newMember);
      setSuccess(`Team member "${newMember.name}" created.`);
      setShowAddMember(false);
      setNewMember({
        name: '',
        email: '',
        password: '',
        role: 'agent',
        customRole: '',
        assignedCompanies: [],
        isActive: true,
      });
      await loadTeamData();
    } catch (err: any) {
      setError(err.message || 'Failed to create team member');
    } finally {
      setAddingMember(false);
    }
  }

  function openEditMember(member: TeamMember) {
    setEditingMember(member);
    const userCompanyIds = companies
      .filter(c => (c.assignedUsers || []).some((u: any) => String(u._id || u) === String(member._id)))
      .map(c => c._id);

    setEditForm({
      name: member.name,
      email: member.email,
      password: '',
      role: member.role,
      customRole: member.customRole?._id || '',
      assignedCompanies: userCompanyIds,
      isActive: member.isActive !== false,
    });
  }

  async function handleSaveMemberEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingMember) return;
    try {
      setSavingEdit(true);
      setError('');
      await teamApi.update(editingMember._id, editForm);
      setSuccess(`Team member "${editForm.name}" updated.`);
      setEditingMember(null);
      await loadTeamData();
    } catch (err: any) {
      setError(err.message || 'Failed to update member');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteMember(memberId: string, memberName: string) {
    if (!window.confirm(`Delete team member "${memberName}"? This cannot be undone.`)) return;
    try {
      await teamApi.delete(memberId);
      setSuccess(`Team member "${memberName}" deleted.`);
      await loadTeamData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete member');
    }
  }

  function openCreateRole() {
    setEditingRole(null);
    setRoleForm({ name: '', scope: 'assigned', permissions: [] });
    setShowRoleModal(true);
  }

  function openEditRole(role: CustomRole) {
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      scope: role.scope,
      permissions: role.permissions || [],
    });
    setShowRoleModal(true);
  }

  function togglePermission(perm: string) {
    setRoleForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter(p => p !== perm)
        : [...prev.permissions, perm],
    }));
  }

  async function handleSaveRole(e: React.FormEvent) {
    e.preventDefault();
    if (!roleForm.name.trim()) return;
    try {
      setSavingRole(true);
      setError('');
      if (editingRole) {
        await teamApi.updateRole(editingRole._id, roleForm);
        setSuccess(`Custom role "${roleForm.name}" updated.`);
      } else {
        await teamApi.createRole(roleForm);
        setSuccess(`Custom role "${roleForm.name}" created.`);
      }
      setShowRoleModal(false);
      await loadTeamData();
    } catch (err: any) {
      setError(err.message || 'Failed to save role');
    } finally {
      setSavingRole(false);
    }
  }

  async function handleDeleteRole(roleId: string, roleName: string) {
    if (!window.confirm(`Delete role "${roleName}"? Assigned users will lose its permissions.`)) return;
    try {
      await teamApi.deleteRole(roleId);
      setSuccess(`Role "${roleName}" deleted.`);
      setShowRoleModal(false);
      await loadTeamData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete role');
    }
  }

  if (loading && users.length === 0) {
    return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading team...</div>;
  }

  return (
    <div className="page-container">
      {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="notice success" style={{ marginBottom: '1rem' }}>{success}</div>}

      {/* Header */}
      <section className="page-head" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Team</h1>
          <p className="page-subtitle">
            {teamSummary.total} members · {customRoles.length} custom {customRoles.length === 1 ? 'role' : 'roles'}
          </p>
        </div>

        <div>
          {activeTab === 'roles' ? (
            <button
              type="button"
              className="btn primary"
              onClick={openCreateRole}
            >
              + Create Role
            </button>
          ) : (
            <button
              type="button"
              className="btn primary"
              onClick={() => setShowAddMember(!showAddMember)}
            >
              {showAddMember ? 'Cancel' : '+ Add Member'}
            </button>
          )}
        </div>
      </section>

      {/* Tabs */}
      <nav className="team-tabs" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem' }}>
        <button
          type="button"
          className="btn small"
          onClick={() => handleTabChange('members')}
          style={{
            background: activeTab === 'members' ? 'var(--gold-dim, rgba(245, 158, 11, 0.15))' : 'var(--panel)',
            borderColor: activeTab === 'members' ? 'var(--gold)' : 'var(--border)',
            color: 'var(--text)',
            fontWeight: 800,
          }}
        >
          Team Members
        </button>
        <button
          type="button"
          className="btn small"
          onClick={() => handleTabChange('roles')}
          style={{
            background: activeTab === 'roles' ? 'var(--gold-dim, rgba(245, 158, 11, 0.15))' : 'var(--panel)',
            borderColor: activeTab === 'roles' ? 'var(--gold)' : 'var(--border)',
            color: 'var(--text)',
            fontWeight: 800,
          }}
        >
          Roles & Permissions
        </button>
      </nav>

      {/* Tab: Members */}
      {activeTab === 'members' && (
        <>
          {/* Stats */}
          <section className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Total Users</span>
              <strong style={{ fontSize: '1.25rem' }}>{teamSummary.total}</strong>
            </div>
            <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Active Users</span>
              <strong style={{ fontSize: '1.25rem', color: 'var(--teal)' }}>{teamSummary.active}</strong>
            </div>
            <div className="metric danger" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>Inactive</span>
              <strong style={{ fontSize: '1.25rem', color: 'var(--red)' }}>{teamSummary.inactive}</strong>
            </div>
            <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>CRM Workspaces</span>
              <strong style={{ fontSize: '1.25rem' }}>{companies.length}</strong>
            </div>
          </section>

          {/* Add Member Form */}
          {showAddMember && (
            <form
              onSubmit={handleCreateMember}
              style={{
                marginBottom: '1.5rem',
                padding: '1.5rem',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                background: 'var(--panel)',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Add Team Member</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Full Name *
                  <input
                    required
                    placeholder="e.g. Priya Sharma"
                    value={newMember.name}
                    onChange={e => setNewMember({ ...newMember, name: e.target.value })}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Email Address *
                  <input
                    type="email"
                    required
                    placeholder="priya@example.com"
                    value={newMember.email}
                    onChange={e => setNewMember({ ...newMember, email: e.target.value })}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Temporary Password *
                  <input
                    type="password"
                    required
                    minLength={8}
                    placeholder="Minimum 8 characters"
                    value={newMember.password}
                    onChange={e => setNewMember({ ...newMember, password: e.target.value })}
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  System Role
                  <select
                    value={newMember.role}
                    onChange={e => setNewMember({ ...newMember, role: e.target.value })}
                  >
                    {Object.entries(roleDefinitions).map(([key, def]) => (
                      <option key={key} value={key}>{def.label || key}</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Custom Role (Optional)
                  <select
                    value={newMember.customRole || ''}
                    onChange={e => setNewMember({ ...newMember, customRole: e.target.value || null })}
                  >
                    <option value="">No custom role</option>
                    {customRoles.map(cr => (
                      <option key={cr._id} value={cr._id}>{cr.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <button className="btn primary" type="submit" disabled={addingMember}>
                {addingMember ? 'Creating...' : 'Create Team Member'}
              </button>
            </form>
          )}

          {/* Filter Bar */}
          <div className="filter-bar" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
            <input
              type="text"
              placeholder="Search team..."
              value={searchQuery}
              onChange={e => handleFilterChange('q', e.target.value)}
              style={{ minWidth: '180px' }}
            />

            <select
              value={statusFilter}
              onChange={e => handleFilterChange('status', e.target.value)}
              style={{ minWidth: '130px' }}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>

            <select
              value={roleFilter}
              onChange={e => handleFilterChange('role', e.target.value)}
              style={{ minWidth: '160px' }}
            >
              <option value="">All roles</option>
              {Object.entries(roleDefinitions).map(([key, def]) => (
                <option key={key} value={key}>{def.label || key}</option>
              ))}
            </select>

            {(searchQuery || statusFilter || roleFilter) && (
              <button
                type="button"
                className="btn small"
                onClick={() => setSearchParams(new URLSearchParams({ tab: 'members' }))}
              >
                Reset
              </button>
            )}
          </div>

          {/* Table */}
          <section className="table-card" style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Member</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Role</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Custom Role</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Last Login</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}></th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}>
                      No team members match this view.
                    </td>
                  </tr>
                ) : (
                  users.map(member => (
                    <tr key={member._id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              background: 'var(--gold-dim, rgba(245, 158, 11, 0.2))',
                              color: 'var(--gold)',
                              fontWeight: 800,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.8rem',
                            }}
                          >
                            {member.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <strong style={{ display: 'block', fontSize: '0.9rem' }}>{member.name}</strong>
                            <small style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>{member.email}</small>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                        {roleDefinitions[member.role]?.label || member.role}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                        {member.customRole ? (
                          <span className="pill" style={{ borderColor: 'var(--teal)' }}>
                            {member.customRole.name}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>Standard</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          className="stage-badge"
                          style={{
                            backgroundColor: member.isActive !== false ? 'var(--teal, #0d9488)' : 'var(--muted, #64748b)',
                            color: '#fff',
                            fontSize: '0.65rem',
                            padding: '2px 6px',
                          }}
                        >
                          {member.isActive !== false ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                        {member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleDateString() : 'Never'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn small outline"
                            onClick={() => openEditMember(member)}
                          >
                            Edit
                          </button>
                          {user?._id !== member._id && (
                            <button
                              type="button"
                              className="btn small danger"
                              onClick={() => handleDeleteMember(member._id, member.name)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </>
      )}

      {/* Tab: Roles & Permissions */}
      {activeTab === 'roles' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Custom Roles Grid */}
          <section className="team-card" style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', padding: '1.5rem' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Custom Roles ({customRoles.length})</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Workspace-specific access for your team. Open a role to review or change its permissions.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {customRoles.map(r => (
                <div
                  key={r._id}
                  style={{
                    padding: '1rem',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    background: 'var(--bg-soft, rgba(255,255,255,0.02))',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '1rem', display: 'block', marginBottom: '0.25rem' }}>{r.name}</strong>
                    <span style={{ fontSize: '0.78rem', color: 'var(--teal)', display: 'block', marginBottom: '0.5rem' }}>
                      {r.permissions.length} permissions enabled ({r.scope})
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn small outline"
                    style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}
                    onClick={() => openEditRole(r)}
                  >
                    Edit Role
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Built-in System Roles */}
          <section className="team-card" style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', padding: '1.5rem' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Built-in System Roles</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Standard system roles with default permission access.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
              {Object.entries(roleDefinitions).map(([key, def]) => (
                <div
                  key={key}
                  style={{
                    padding: '1rem',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    background: 'var(--bg-soft, rgba(255,255,255,0.02))',
                  }}
                >
                  <strong style={{ display: 'block', marginBottom: '0.25rem' }}>{def.label || key}</strong>
                  <small style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{def.description || 'System role'}</small>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Edit Member Modal */}
      {editingMember && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <form
            onSubmit={handleSaveMemberEdit}
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '500px',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Edit Member</h2>
              <button type="button" className="btn small" onClick={() => setEditingMember(null)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Full Name
                <input
                  required
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                New Password (leave blank to keep unchanged)
                <input
                  type="password"
                  minLength={8}
                  placeholder="Minimum 8 characters"
                  value={editForm.password || ''}
                  onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                System Role
                <select
                  value={editForm.role}
                  onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                >
                  {Object.entries(roleDefinitions).map(([key, def]) => (
                    <option key={key} value={key}>{def.label || key}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Custom Role
                <select
                  value={editForm.customRole || ''}
                  onChange={e => setEditForm({ ...editForm, customRole: e.target.value || null })}
                >
                  <option value="">No custom role</option>
                  {customRoles.map(cr => (
                    <option key={cr._id} value={cr._id}>{cr.name}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={e => setEditForm({ ...editForm, isActive: e.target.checked })}
                />
                Active Account
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button type="button" className="btn small" onClick={() => setEditingMember(null)}>Cancel</button>
              <button type="submit" className="btn small primary" disabled={savingEdit}>
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Role Dialog / Modal */}
      {showRoleModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <form
            onSubmit={handleSaveRole}
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '650px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                {editingRole ? `Edit Role: ${editingRole.name}` : 'Create Custom Role'}
              </h2>
              <button type="button" className="btn small" onClick={() => setShowRoleModal(false)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Role Name *
                <input
                  required
                  placeholder="e.g. Sales Executive"
                  value={roleForm.name}
                  onChange={e => setRoleForm({ ...roleForm, name: e.target.value })}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Scope
                <select
                  value={roleForm.scope}
                  onChange={e => setRoleForm({ ...roleForm, scope: e.target.value as any })}
                >
                  <option value="assigned">Only records assigned to them</option>
                  <option value="organization">All company records</option>
                </select>
              </label>

              <div>
                <strong style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Permission Matrix</strong>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>Module</th>
                        {permissionActions.map(action => (
                          <th key={action} style={{ padding: '0.4rem 0.6rem', textAlign: 'center', textTransform: 'capitalize' }}>
                            {action}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {permissionModules.map(mod => (
                        <tr key={mod} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.4rem 0.6rem', fontWeight: 700, textTransform: 'capitalize' }}>{mod}</td>
                          {permissionActions.map(action => {
                            const permKey = `${mod}.${action}`;
                            const isChecked = roleForm.permissions.includes(permKey);
                            return (
                              <td key={action} style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => togglePermission(permKey)}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem' }}>
              <div>
                {editingRole && (
                  <button
                    type="button"
                    className="btn small danger"
                    onClick={() => handleDeleteRole(editingRole._id, editingRole.name)}
                  >
                    Delete Role
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn small" onClick={() => setShowRoleModal(false)}>Cancel</button>
                <button type="submit" className="btn small primary" disabled={savingRole}>
                  {savingRole ? 'Saving...' : 'Save Role'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
