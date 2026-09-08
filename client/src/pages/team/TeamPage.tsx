import {
  Building2,
  Users,
  Shield,
  Search,
  Filter,
  Lock,
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { teamApi, TeamMember, CustomRole, TeamSummary, TeamMemberInput, WorkTypeLite, LeadFieldLite } from '../../api/team';
import { Company } from '../../api/companies';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmDialog from '../../components/ConfirmDialog';

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
  const [workTypes, setWorkTypes] = useState<WorkTypeLite[]>([]);
  const [leadFields, setLeadFields] = useState<LeadFieldLite[]>([]);
  const [teamSummary, setTeamSummary] = useState<TeamSummary>({ total: 0, active: 0, inactive: 0 });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Members View Mode: 'table' or 'grouped'
  const [membersViewMode, setMembersViewMode] = useState<'table' | 'grouped'>('table');

  // Roles Tab Filters
  const [roleSearchQuery, setRoleSearchQuery] = useState('');
  const [roleCompanyFilter, setRoleCompanyFilter] = useState('');

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    action: () => Promise<void> | void;
  }>({
    open: false,
    title: '',
    message: '',
    action: () => {},
  });

  // Search/filter state for Members tab
  const searchQuery = searchParams.get('q') || '';
  const statusFilter = searchParams.get('status') || '';
  const roleFilter = searchParams.get('role') || '';
  const companyFilter = searchParams.get('company') || '';

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
  const [roleForm, setRoleForm] = useState<{
    name: string;
    scope: 'organization' | 'assigned';
    permissions: string[];
    leadFieldsConfigured: boolean;
    leadVisible: string[];
    leadEditable: string[];
    workActions: Record<string, string[]>;
    editableFields: Record<string, string[]>;
  }>({
    name: '',
    scope: 'assigned',
    permissions: [],
    leadFieldsConfigured: false,
    leadVisible: [],
    leadEditable: [],
    workActions: {},
    editableFields: {},
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
      if (companyFilter) params.company = companyFilter;

      const res = await teamApi.list(params);
      setUsers(res.users || []);
      setCompanies(res.companies || []);
      setCustomRoles(res.customRoles || []);
      setRoleDefinitions(res.roleDefinitions || {});
      setPermissionModules(res.permissionModules || []);
      setPermissionActions(res.permissionActions || []);
      setWorkTypes(res.workTypes || []);
      setLeadFields(res.leadFields || []);
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

  function filterByRoleInMembersTab(roleKey: string, isCustom = false) {
    const updated = new URLSearchParams();
    updated.set('tab', 'members');
    updated.set('role', isCustom ? `custom:${roleKey}` : roleKey);
    if (roleCompanyFilter) {
      updated.set('company', roleCompanyFilter);
    }
    setActiveTab('members');
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
    const userCompanyIds = member.assignedCompanies && member.assignedCompanies.length > 0
      ? member.assignedCompanies.map((c: any) => c._id || c)
      : companies
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
      hiddenModules: member.hiddenModules || [],
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

  function handleDeleteMember(memberId: string, memberName: string) {
    setConfirmState({
      open: true,
      title: 'Deactivate Team Member',
      message: `Deactivate team member "${memberName}"? The account will be marked inactive and workspace access removed while preserving historical logs and assignments.`,
      action: async () => {
        try {
          await teamApi.delete(memberId);
          setSuccess(`Team member "${memberName}" deactivated.`);
          await loadTeamData();
        } catch (err: any) {
          setError(err.message || 'Failed to deactivate member');
        } finally {
          setConfirmState(prev => ({ ...prev, open: false }));
        }
      },
    });
  }

  async function handleReactivateMember(memberId: string, memberName: string) {
    try {
      await teamApi.update(memberId, { isActive: true });
      setSuccess(`Team member "${memberName}" reactivated.`);
      await loadTeamData();
    } catch (err: any) {
      setError(err.message || 'Failed to reactivate member');
    }
  }

  function openCreateRole() {
    setEditingRole(null);
    setRoleForm({
      name: '',
      scope: 'assigned',
      permissions: [],
      leadFieldsConfigured: false,
      leadVisible: [],
      leadEditable: [],
      workActions: {},
      editableFields: {},
    });
    setShowRoleModal(true);
  }

  function openEditRole(role: CustomRole) {
    setEditingRole(role);
    const workActions: Record<string, string[]> = {};
    const editableFields: Record<string, string[]> = {};
    (role.workTypePermissions || []).forEach(perm => {
      const wtId = typeof perm.workTypeId === 'object' && perm.workTypeId ? (perm.workTypeId as any)._id : String(perm.workTypeId || '');
      if (wtId) {
        workActions[wtId] = perm.actions || [];
        editableFields[wtId] = perm.editableFieldKeys || [];
      }
    });

    setRoleForm({
      name: role.name,
      scope: role.scope || 'assigned',
      permissions: role.permissions || [],
      leadFieldsConfigured: Boolean(role.leadFieldPermissions?.configured),
      leadVisible: role.leadFieldPermissions?.visible || [],
      leadEditable: role.leadFieldPermissions?.editable || [],
      workActions,
      editableFields,
    });
    setShowRoleModal(true);
  }

  function toggleInArray(array: string[], item: string): string[] {
    return array.includes(item) ? array.filter(x => x !== item) : [...array, item];
  }

  function togglePermission(perm: string) {
    setRoleForm(prev => ({
      ...prev,
      permissions: toggleInArray(prev.permissions, perm),
    }));
  }

  function toggleLeadVisible(key: string) {
    setRoleForm(prev => {
      const nextVisible = toggleInArray(prev.leadVisible, key);
      const nextEditable = nextVisible.includes(key) ? prev.leadEditable : prev.leadEditable.filter(x => x !== key);
      return { ...prev, leadVisible: nextVisible, leadEditable: nextEditable };
    });
  }

  function toggleLeadEditable(key: string) {
    setRoleForm(prev => {
      const nextEditable = toggleInArray(prev.leadEditable, key);
      const nextVisible = nextEditable.includes(key) && !prev.leadVisible.includes(key)
        ? [...prev.leadVisible, key]
        : prev.leadVisible;
      return { ...prev, leadVisible: nextVisible, leadEditable: nextEditable };
    });
  }

  function toggleWorkAction(workTypeId: string, action: string) {
    setRoleForm(prev => ({
      ...prev,
      workActions: { ...prev.workActions, [workTypeId]: toggleInArray(prev.workActions[workTypeId] || [], action) },
    }));
  }

  function toggleEditableField(workTypeId: string, field: string) {
    setRoleForm(prev => ({
      ...prev,
      editableFields: { ...prev.editableFields, [workTypeId]: toggleInArray(prev.editableFields[workTypeId] || [], field) },
    }));
  }

  async function handleSaveRole(e: React.FormEvent) {
    e.preventDefault();
    if (!roleForm.name.trim()) return;
    try {
      setSavingRole(true);
      setError('');
      const payload = {
        name: roleForm.name,
        scope: roleForm.scope,
        permissions: roleForm.permissions,
        leadFieldPermissions: {
          configured: roleForm.leadFieldsConfigured,
          visible: roleForm.leadVisible,
          editable: roleForm.leadEditable,
        },
        workTypePermissions: workTypes
          .map(workType => ({
            workTypeId: workType._id,
            actions: roleForm.workActions[workType._id] || [],
            editableFieldKeys: roleForm.editableFields[workType._id] || [],
          }))
          .filter(perm => perm.actions.length),
      };
      if (editingRole) {
        await teamApi.updateRole(editingRole._id, payload);
        setSuccess(`Custom role "${roleForm.name}" updated.`);
      } else {
        await teamApi.createRole(payload);
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

  function handleDeleteRole(roleId: string, roleName: string) {
    setConfirmState({
      open: true,
      title: 'Delete Role',
      message: `Delete role "${roleName}"? Assigned users will lose its permissions.`,
      action: async () => {
        try {
          await teamApi.deleteRole(roleId);
          setSuccess(`Role "${roleName}" deleted.`);
          setShowRoleModal(false);
          await loadTeamData();
        } catch (err: any) {
          setError(err.message || 'Failed to delete role');
        } finally {
          setConfirmState(prev => ({ ...prev, open: false }));
        }
      },
    });
  }

  // Helper to get company names for any user
  const getUserCompanies = (member: TeamMember) => {
    if (member.assignedCompanies && member.assignedCompanies.length > 0) {
      return member.assignedCompanies;
    }
    return companies
      .filter(c => (c.assignedUsers || []).some((u: any) => String(u._id || u) === String(member._id)))
      .map(c => ({ _id: c._id, name: c.name, isMain: c.isMain }));
  };

  // Memoized user groupings by company
  const companyGroupedUsers = useMemo(() => {
    const groups: { company: Company | { _id: string; name: string; isMain?: boolean }; members: TeamMember[] }[] = [];

    companies.forEach(company => {
      const membersInCompany = users.filter(user => {
        const userComps = getUserCompanies(user);
        return userComps.some(c => String(c._id) === String(company._id));
      });
      if (membersInCompany.length > 0) {
        groups.push({ company, members: membersInCompany });
      }
    });

    const unassignedMembers = users.filter(user => {
      const userComps = getUserCompanies(user);
      return userComps.length === 0;
    });

    if (unassignedMembers.length > 0) {
      groups.push({
        company: { _id: 'unassigned', name: 'Unassigned / Global CRM' },
        members: unassignedMembers,
      });
    }

    return groups;
  }, [users, companies]);

  // Memoized role assignments mapping
  const roleMembersMap = useMemo(() => {
    const customMap: Record<string, TeamMember[]> = {};
    const systemMap: Record<string, TeamMember[]> = {};

    customRoles.forEach(r => {
      customMap[r._id] = [];
    });

    Object.keys(roleDefinitions).forEach(k => {
      systemMap[k] = [];
    });

    users.forEach(member => {
      if (member.customRole?._id && customMap[member.customRole._id]) {
        customMap[member.customRole._id].push(member);
      } else if (systemMap[member.role]) {
        systemMap[member.role].push(member);
      }
    });

    return { customMap, systemMap };
  }, [users, customRoles, roleDefinitions]);

  // Filtered roles based on search and company filter
  const filteredCustomRoles = useMemo(() => {
    return customRoles.filter(r => {
      const matchesSearch = !roleSearchQuery ||
        r.name.toLowerCase().includes(roleSearchQuery.toLowerCase()) ||
        r.permissions.some(p => p.toLowerCase().includes(roleSearchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      if (!roleCompanyFilter) return true;

      const members = roleMembersMap.customMap[r._id] || [];
      return members.some(m => {
        const userComps = getUserCompanies(m);
        return userComps.some(c => String(c._id) === String(roleCompanyFilter));
      });
    });
  }, [customRoles, roleSearchQuery, roleCompanyFilter, roleMembersMap]);

  const filteredSystemRoles = useMemo(() => {
    return Object.entries(roleDefinitions).filter(([key, def]) => {
      const matchesSearch = !roleSearchQuery ||
        key.toLowerCase().includes(roleSearchQuery.toLowerCase()) ||
        (def.label && def.label.toLowerCase().includes(roleSearchQuery.toLowerCase())) ||
        (def.description && def.description.toLowerCase().includes(roleSearchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      if (!roleCompanyFilter) return true;

      const members = roleMembersMap.systemMap[key] || [];
      return members.some(m => {
        const userComps = getUserCompanies(m);
        return userComps.some(c => String(c._id) === String(roleCompanyFilter));
      });
    });
  }, [roleDefinitions, roleSearchQuery, roleCompanyFilter, roleMembersMap]);

  if (loading && users.length === 0) {
    return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading team data...</div>;
  }

  return (
    <div className="page-container experience-page team-page">
      {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="notice success" style={{ marginBottom: '1rem' }}>{success}</div>}

      {/* Header */}
      <section className="page-head" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Team & Permissions</h1>
          <p className="page-subtitle">
            {teamSummary.total} members across {companies.length} CRM Workspaces · {customRoles.length} custom {customRoles.length === 1 ? 'role' : 'roles'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
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
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Users size={15} />
          Team Members ({teamSummary.total})
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
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Shield size={15} />
          Roles & Permissions ({customRoles.length + Object.keys(roleDefinitions).length})
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
                    <option value="">No custom role (use system role)</option>
                    {customRoles.map(cr => (
                      <option key={cr._id} value={cr._id}>{cr.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <span style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Assign to Companies / Workspaces *
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {companies.map(comp => {
                    const isSelected = (newMember.assignedCompanies || []).includes(comp._id);
                    return (
                      <label
                        key={comp._id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          padding: '0.35rem 0.75rem',
                          borderRadius: '8px',
                          border: `1px solid ${isSelected ? 'var(--gold, #ea580c)' : 'var(--border)'}`,
                          background: isSelected ? 'color-mix(in srgb, var(--gold, #ea580c) 10%, var(--panel))' : 'var(--panel)',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: isSelected ? 700 : 500,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => {
                            const curr = newMember.assignedCompanies || [];
                            setNewMember({
                              ...newMember,
                              assignedCompanies: e.target.checked
                                ? [...curr, comp._id]
                                : curr.filter(id => id !== comp._id),
                            });
                          }}
                        />
                        <Building2 size={13} style={{ color: isSelected ? 'var(--gold, #ea580c)' : 'var(--muted)' }} />
                        <span>{comp.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button className="btn primary" type="submit" disabled={addingMember}>
                {addingMember ? 'Creating...' : 'Create Team Member'}
              </button>
            </form>
          )}

          {/* Filter Bar */}
          <div className="filter-bar" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--muted)' }} />
                <input
                  type="text"
                  placeholder="Search team member..."
                  value={searchQuery}
                  onChange={e => handleFilterChange('q', e.target.value)}
                  style={{ minWidth: '200px', paddingLeft: '32px' }}
                />
              </div>

              <select
                value={companyFilter}
                onChange={e => handleFilterChange('company', e.target.value)}
                style={{ minWidth: '190px' }}
              >
                <option value="">All Companies / Workspaces</option>
                {companies.map(c => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
                <option value="unassigned">Unassigned (No Company)</option>
              </select>

              <select
                value={roleFilter}
                onChange={e => handleFilterChange('role', e.target.value)}
                style={{ minWidth: '160px' }}
              >
                <option value="">All roles</option>
                <optgroup label="System Roles">
                  {Object.entries(roleDefinitions).map(([key, def]) => (
                    <option key={key} value={key}>{def.label || key}</option>
                  ))}
                </optgroup>
                <optgroup label="Custom Roles">
                  {customRoles.map(cr => (
                    <option key={cr._id} value={`custom:${cr._id}`}>{cr.name}</option>
                  ))}
                </optgroup>
              </select>

              <select
                value={statusFilter}
                onChange={e => handleFilterChange('status', e.target.value)}
                style={{ minWidth: '120px' }}
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>

              {(searchQuery || statusFilter || roleFilter || companyFilter) && (
                <button
                  type="button"
                  className="btn small"
                  onClick={() => setSearchParams(new URLSearchParams({ tab: 'members' }))}
                >
                  Reset
                </button>
              )}
            </div>

            {/* View Mode Toggle: Table vs Grouped by Company */}
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
              <button
                type="button"
                className="btn small"
                onClick={() => setMembersViewMode('table')}
                style={{
                  background: membersViewMode === 'table' ? 'var(--gold-dim, rgba(245, 158, 11, 0.2))' : 'var(--panel)',
                  border: 'none',
                  borderRadius: 0,
                  fontWeight: membersViewMode === 'table' ? 800 : 500,
                  fontSize: '0.78rem',
                }}
              >
                Table View
              </button>
              <button
                type="button"
                className="btn small"
                onClick={() => setMembersViewMode('grouped')}
                style={{
                  background: membersViewMode === 'grouped' ? 'var(--gold-dim, rgba(245, 158, 11, 0.2))' : 'var(--panel)',
                  border: 'none',
                  borderRadius: 0,
                  fontWeight: membersViewMode === 'grouped' ? 800 : 500,
                  fontSize: '0.78rem',
                }}
              >
                <Building2 size={13} style={{ marginRight: '4px' }} />
                Group by Company
              </button>
            </div>
          </div>

          {/* Members Content: Grouped vs Table */}
          {membersViewMode === 'grouped' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {companyGroupedUsers.map(group => (
                <div
                  key={group.company._id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    background: 'var(--panel)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '0.85rem 1.25rem',
                      background: 'var(--bg-soft, rgba(255,255,255,0.03))',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <Building2 size={18} style={{ color: 'var(--gold, #ea580c)' }} />
                      <strong style={{ fontSize: '1rem' }}>{group.company.name}</strong>
                      {group.company.isMain && (
                        <span className="pill" style={{ borderColor: 'var(--gold)', fontSize: '0.7rem', color: 'var(--gold)' }}>
                          Primary Agency
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 600 }}>
                      {group.members.length} {group.members.length === 1 ? 'member' : 'members'}
                    </span>
                  </div>

                  <div style={{ padding: '0.5rem 1rem' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th style={{ padding: '0.6rem 0.75rem', fontSize: '0.75rem', color: 'var(--muted)' }}>Member</th>
                          <th style={{ padding: '0.6rem 0.75rem', fontSize: '0.75rem', color: 'var(--muted)' }}>Role</th>
                          <th style={{ padding: '0.6rem 0.75rem', fontSize: '0.75rem', color: 'var(--muted)' }}>Custom Role</th>
                          <th style={{ padding: '0.6rem 0.75rem', fontSize: '0.75rem', color: 'var(--muted)' }}>Status</th>
                          <th style={{ padding: '0.6rem 0.75rem', fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.members.map(member => (
                          <tr key={member._id} style={{ borderBottom: '1px solid var(--border-soft, rgba(255,255,255,0.04))' }}>
                            <td style={{ padding: '0.6rem 0.75rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <div
                                  style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '50%',
                                    background: 'var(--gold-dim, rgba(245, 158, 11, 0.2))',
                                    color: 'var(--gold)',
                                    fontWeight: 800,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.75rem',
                                  }}
                                >
                                  {member.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <strong style={{ display: 'block', fontSize: '0.85rem' }}>{member.name}</strong>
                                  <small style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>{member.email}</small>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem', fontSize: '0.82rem' }}>
                              <span style={{ fontWeight: 600 }}>{roleDefinitions[member.role]?.label || member.role}</span>
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem', fontSize: '0.82rem' }}>
                              {member.customRole ? (
                                <span className="pill" style={{ borderColor: 'var(--teal)', fontSize: '0.72rem', color: 'var(--teal)' }}>
                                  {member.customRole.name}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>Standard</span>
                              )}
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem' }}>
                              <span
                                className="stage-badge"
                                style={{
                                  backgroundColor: member.isActive !== false ? 'var(--teal, #0d9488)' : 'var(--muted, #64748b)',
                                  color: '#fff',
                                  fontSize: '0.62rem',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                }}
                              >
                                {member.isActive !== false ? 'ACTIVE' : 'INACTIVE'}
                              </span>
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>
                              <button
                                type="button"
                                className="btn small outline"
                                style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                                onClick={() => openEditMember(member)}
                              >
                                Edit
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <section className="table-card" style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Member</th>
                    <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>System Role</th>
                    <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Custom Role</th>
                    <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Assigned Companies / Workspaces</th>
                    <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Activity & Logins</th>
                    <th style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: 'var(--muted)', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--muted)' }}>
                        No team members match this filter.
                      </td>
                    </tr>
                  ) : (
                    users.map(member => {
                      const userCompanies = getUserCompanies(member);
                      return (
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
                            <span style={{ fontWeight: 650 }}>{roleDefinitions[member.role]?.label || member.role}</span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                            {member.customRole ? (
                              <span className="pill" style={{ borderColor: 'var(--teal)', color: 'var(--teal)', fontSize: '0.75rem' }}>
                                {member.customRole.name}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>Standard</span>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            {userCompanies.length > 0 ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                {userCompanies.map((c: any) => (
                                  <span
                                    key={c._id || c}
                                    style={{
                                      fontSize: '0.72rem',
                                      padding: '3px 8px',
                                      borderRadius: '6px',
                                      background: 'color-mix(in srgb, var(--gold, #ea580c) 8%, var(--panel))',
                                      border: '1px solid color-mix(in srgb, var(--gold, #ea580c) 30%, var(--border))',
                                      fontWeight: 650,
                                      color: 'var(--text)',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    }}
                                  >
                                    <Building2 size={11} style={{ color: 'var(--gold, #ea580c)' }} />
                                    {c.name || companies.find(comp => String(comp._id) === String(c._id || c))?.name || 'Company'}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                                Unassigned
                              </span>
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
                                borderRadius: '4px',
                              }}
                            >
                              {member.isActive !== false ? 'ACTIVE' : 'INACTIVE'}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem' }}>
                            <div>{member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Never logged in'}</div>
                            <small style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>
                              {member.loginCount ? `${member.loginCount} login${member.loginCount === 1 ? '' : 's'}` : '0 logins'}
                            </small>
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
                                member.isActive !== false ? (
                                  <button
                                    type="button"
                                    className="btn small danger"
                                    onClick={() => handleDeleteMember(member._id, member.name)}
                                  >
                                    Deactivate
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn small"
                                    style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}
                                    onClick={() => handleReactivateMember(member._id, member.name)}
                                  >
                                    Reactivate
                                  </button>
                                )
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}

      {/* Tab: Roles & Permissions */}
      {activeTab === 'roles' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Roles Filter & Search Bar */}
          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem 1.25rem',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              background: 'var(--panel)',
            }}
          >
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: '220px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--muted)' }} />
                <input
                  type="text"
                  placeholder="Search roles or permissions..."
                  value={roleSearchQuery}
                  onChange={e => setRoleSearchQuery(e.target.value)}
                  style={{ width: '100%', paddingLeft: '32px' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Filter size={14} style={{ color: 'var(--muted)' }} />
                <select
                  value={roleCompanyFilter}
                  onChange={e => setRoleCompanyFilter(e.target.value)}
                  style={{ minWidth: '220px' }}
                >
                  <option value="">Filter by Workspace / Company (All)</option>
                  {companies.map(c => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {(roleSearchQuery || roleCompanyFilter) && (
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    setRoleSearchQuery('');
                    setRoleCompanyFilter('');
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>

            <div style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 600 }}>
              Showing {filteredCustomRoles.length} Custom · {filteredSystemRoles.length} Built-in Roles
            </div>
          </div>

          {/* Section 1: Custom Workspace Roles */}
          <section className="team-card" style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Shield size={18} style={{ color: 'var(--gold, #ea580c)' }} />
                  Custom Workspace Roles ({filteredCustomRoles.length})
                </h2>
                <p style={{ color: 'var(--muted)', fontSize: '0.82rem', margin: '0.25rem 0 0' }}>
                  Workspace-specific access configurations and team assignments.
                </p>
              </div>
              <button type="button" className="btn small primary" onClick={openCreateRole}>
                + New Custom Role
              </button>
            </div>

            {filteredCustomRoles.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: '8px' }}>
                No custom roles match the current search / workspace filter.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
                {filteredCustomRoles.map(r => {
                  const assignedMembers = roleMembersMap.customMap[r._id] || [];
                  const displayedMembers = roleCompanyFilter
                    ? assignedMembers.filter(m => getUserCompanies(m).some(c => String(c._id) === String(roleCompanyFilter)))
                    : assignedMembers;

                  return (
                    <div
                      key={r._id}
                      style={{
                        padding: '1.25rem',
                        border: '1px solid var(--border)',
                        borderRadius: '10px',
                        background: 'var(--bg-soft, rgba(255,255,255,0.02))',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '1rem',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                      }}
                    >
                      <div>
                        {/* Role Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                          <div>
                            <strong style={{ fontSize: '1.05rem', display: 'block' }}>{r.name}</strong>
                            <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: 'var(--gold-dim, rgba(245, 158, 11, 0.15))',
                                  color: 'var(--gold, #ea580c)',
                                  fontWeight: 700,
                                }}
                              >
                                {r.scope === 'organization' ? 'All Company Records' : 'Assigned Records Only'}
                              </span>
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: 'var(--hover, rgba(255,255,255,0.06))',
                                  border: '1px solid var(--border)',
                                  fontWeight: 600,
                                }}
                              >
                                {r.permissions?.length || 0} permissions
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Permission Modules Summary */}
                        <div style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Enabled Modules
                          </span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                            {r.permissions && r.permissions.length > 0 ? (
                              Array.from(new Set(r.permissions.map(p => p.split('.')[0]))).map(mod => (
                                <span
                                  key={mod}
                                  style={{
                                    fontSize: '0.7rem',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    background: 'var(--panel)',
                                    border: '1px solid var(--border)',
                                    color: 'var(--text)',
                                    fontWeight: 600,
                                    textTransform: 'capitalize',
                                  }}
                                >
                                  {mod}
                                </span>
                              ))
                            ) : (
                              <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>No explicit module permissions</span>
                            )}
                          </div>
                        </div>

                        {/* Assigned Team Members Section */}
                        <div
                          style={{
                            marginTop: '0.75rem',
                            paddingTop: '0.75rem',
                            borderTop: '1px solid var(--border-soft, rgba(255,255,255,0.06))',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Users size={12} />
                              Assigned Members ({displayedMembers.length})
                            </span>
                          </div>

                          {displayedMembers.length === 0 ? (
                            <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                              {assignedMembers.length > 0 ? 'No members in this company' : 'No team members assigned'}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                              {displayedMembers.map(member => {
                                const memberComps = getUserCompanies(member);
                                return (
                                  <div
                                    key={member._id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      padding: '0.35rem 0.6rem',
                                      borderRadius: '6px',
                                      background: 'var(--panel)',
                                      border: '1px solid var(--border-soft, rgba(255,255,255,0.05))',
                                      fontSize: '0.78rem',
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                                      <div
                                        style={{
                                          width: '22px',
                                          height: '22px',
                                          borderRadius: '50%',
                                          background: 'var(--gold-dim, rgba(245, 158, 11, 0.2))',
                                          color: 'var(--gold)',
                                          fontWeight: 800,
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          fontSize: '0.68rem',
                                          flexShrink: 0,
                                        }}
                                      >
                                        {member.name.charAt(0).toUpperCase()}
                                      </div>
                                      <span style={{ fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {member.name}
                                      </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                                      {memberComps.map((c: any) => (
                                        <span
                                          key={c._id || c}
                                          style={{
                                            fontSize: '0.65rem',
                                            padding: '1px 5px',
                                            borderRadius: '4px',
                                            background: 'color-mix(in srgb, var(--gold, #ea580c) 10%, var(--panel))',
                                            border: '1px solid color-mix(in srgb, var(--gold, #ea580c) 25%, var(--border))',
                                            color: 'var(--text)',
                                            fontWeight: 600,
                                          }}
                                        >
                                          {c.name || 'Company'}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Card Footer Actions */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem', borderTop: '1px solid var(--border-soft, rgba(255,255,255,0.06))' }}>
                        <button
                          type="button"
                          className="btn small outline"
                          style={{ fontSize: '0.74rem', padding: '3px 10px' }}
                          onClick={() => filterByRoleInMembersTab(r._id, true)}
                        >
                          <Users size={12} style={{ marginRight: '4px' }} />
                          View in Members Tab
                        </button>

                        <button
                          type="button"
                          className="btn small primary"
                          style={{ fontSize: '0.74rem', padding: '3px 10px' }}
                          onClick={() => openEditRole(r)}
                        >
                          Edit Role
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Section 2: Built-in System Roles */}
          <section className="team-card" style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', padding: '1.5rem' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Lock size={18} style={{ color: 'var(--teal, #0d9488)' }} />
              Built-in System Roles ({filteredSystemRoles.length})
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginBottom: '1.25rem' }}>
              Standard CRM system roles with baseline capability sets and their assigned users.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
              {filteredSystemRoles.map(([key, def]) => {
                const assignedMembers = roleMembersMap.systemMap[key] || [];
                const displayedMembers = roleCompanyFilter
                  ? assignedMembers.filter(m => getUserCompanies(m).some(c => String(c._id) === String(roleCompanyFilter)))
                  : assignedMembers;

                return (
                  <div
                    key={key}
                    style={{
                      padding: '1.25rem',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      background: 'var(--bg-soft, rgba(255,255,255,0.02))',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '0.85rem',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <strong style={{ fontSize: '1rem' }}>{def.label || key}</strong>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'var(--hover)',
                            border: '1px solid var(--border)',
                            color: 'var(--muted)',
                            fontWeight: 700,
                          }}
                        >
                          System Role
                        </span>
                      </div>
                      <p style={{ color: 'var(--muted)', fontSize: '0.78rem', margin: '0 0 0.75rem' }}>
                        {def.description || 'System role access.'}
                      </p>

                      {/* Assigned Members */}
                      <div
                        style={{
                          paddingTop: '0.65rem',
                          borderTop: '1px solid var(--border-soft, rgba(255,255,255,0.06))',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                          <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--muted)' }}>
                            Assigned Members ({displayedMembers.length})
                          </span>
                        </div>

                        {displayedMembers.length === 0 ? (
                          <div style={{ fontSize: '0.74rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                            {assignedMembers.length > 0 ? 'No members in this company' : '0 members'}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            {displayedMembers.map(member => {
                              const memberComps = getUserCompanies(member);
                              return (
                                <div
                                  key={member._id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0.3rem 0.5rem',
                                    borderRadius: '6px',
                                    background: 'var(--panel)',
                                    border: '1px solid var(--border-soft, rgba(255,255,255,0.05))',
                                    fontSize: '0.76rem',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', overflow: 'hidden' }}>
                                    <div
                                      style={{
                                        width: '20px',
                                        height: '20px',
                                        borderRadius: '50%',
                                        background: 'var(--gold-dim, rgba(245, 158, 11, 0.2))',
                                        color: 'var(--gold)',
                                        fontWeight: 800,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.65rem',
                                        flexShrink: 0,
                                      }}
                                    >
                                      {member.name.charAt(0).toUpperCase()}
                                    </div>
                                    <span style={{ fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {member.name}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.2rem', flexShrink: 0 }}>
                                    {memberComps.map((c: any) => (
                                      <span
                                        key={c._id || c}
                                        style={{
                                          fontSize: '0.64rem',
                                          padding: '1px 4px',
                                          borderRadius: '4px',
                                          background: 'color-mix(in srgb, var(--gold, #ea580c) 10%, var(--panel))',
                                          border: '1px solid color-mix(in srgb, var(--gold, #ea580c) 25%, var(--border))',
                                          color: 'var(--text)',
                                          fontWeight: 600,
                                        }}
                                      >
                                        {c.name || 'Company'}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ paddingTop: '0.4rem', borderTop: '1px solid var(--border-soft, rgba(255,255,255,0.06))' }}>
                      <button
                        type="button"
                        className="btn small outline"
                        style={{ fontSize: '0.72rem', width: '100%', justifyContent: 'center' }}
                        onClick={() => filterByRoleInMembersTab(key, false)}
                      >
                        Filter Team by this Role
                      </button>
                    </div>
                  </div>
                );
              })}
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
                  <option value="">No custom role (use system role)</option>
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

              <div>
                <span style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Assigned Companies / Workspaces
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {companies.map(comp => {
                    const isSelected = (editForm.assignedCompanies || []).includes(comp._id);
                    return (
                      <label
                        key={comp._id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          padding: '0.35rem 0.75rem',
                          borderRadius: '8px',
                          border: `1px solid ${isSelected ? 'var(--gold, #ea580c)' : 'var(--border)'}`,
                          background: isSelected ? 'color-mix(in srgb, var(--gold, #ea580c) 10%, var(--panel))' : 'var(--panel)',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: isSelected ? 700 : 500,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => {
                            const curr = editForm.assignedCompanies || [];
                            setEditForm({
                              ...editForm,
                              assignedCompanies: e.target.checked
                                ? [...curr, comp._id]
                                : curr.filter(id => id !== comp._id),
                            });
                          }}
                        />
                        <Building2 size={13} style={{ color: isSelected ? 'var(--gold, #ea580c)' : 'var(--muted)' }} />
                        <span>{comp.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
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

              {leadFields.length > 0 && (
                <div>
                  <strong style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Lead field access</strong>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', marginBottom: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={roleForm.leadFieldsConfigured}
                      onChange={e => setRoleForm({ ...roleForm, leadFieldsConfigured: e.target.checked })}
                    />
                    Limit this role to selected lead fields
                  </label>
                  <p style={{ color: 'var(--muted)', fontSize: '0.75rem', margin: '0 0 0.5rem' }}>
                    Checked under View can be seen. Checked under Edit can be changed and is automatically visible.
                  </p>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>Field</th>
                          <th style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>View</th>
                          <th style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>Edit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leadFields.map(field => (
                          <tr key={field._id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '0.4rem 0.6rem', fontWeight: 700 }}>{field.label || field.key}</td>
                            <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={roleForm.leadVisible.includes(field.key)}
                                onChange={() => toggleLeadVisible(field.key)}
                              />
                            </td>
                            <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={roleForm.leadEditable.includes(field.key)}
                                onChange={() => toggleLeadEditable(field.key)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {workTypes.length > 0 && (
                <div>
                  <strong style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Work module access</strong>
                  {workTypes.map(workType => {
                    const editableFieldOptions = [
                      'title', 'clientCompany', 'assignedTo', 'collaborators', 'secondaryAssignee',
                      'status', 'priority', 'deadline', 'startDate', 'deliveredAt', 'notes',
                      ...(workType.fields || []).map(f => f.key),
                    ];
                    return (
                      <fieldset
                        key={workType._id}
                        style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.75rem' }}
                      >
                        <legend style={{ fontSize: '0.8rem', fontWeight: 800, padding: '0 0.35rem' }}>{workType.name}</legend>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
                          {permissionActions.map(action => {
                            const checked = (roleForm.workActions[workType._id] || []).includes(action);
                            return (
                              <label
                                key={action}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.76rem', padding: '0.25rem 0.6rem', border: '1px solid var(--border)', borderRadius: '999px', cursor: 'pointer' }}
                              >
                                <input type="checkbox" checked={checked} onChange={() => toggleWorkAction(workType._id, action)} />
                                {action}
                              </label>
                            );
                          })}
                        </div>
                        <small style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '0.35rem' }}>Editable fields</small>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {editableFieldOptions.map(field => {
                            const checked = (roleForm.editableFields[workType._id] || []).includes(field);
                            const label = field.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
                            return (
                              <label
                                key={field}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.76rem', padding: '0.25rem 0.6rem', border: '1px solid var(--border)', borderRadius: '999px', cursor: 'pointer' }}
                              >
                                <input type="checkbox" checked={checked} onChange={() => toggleEditableField(workType._id, field)} />
                                {label}
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    );
                  })}
                </div>
              )}
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

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmText="Delete"
        variant="danger"
        onConfirm={confirmState.action}
        onCancel={() => setConfirmState(prev => ({ ...prev, open: false }))}
      />
    </div>
  );
}
