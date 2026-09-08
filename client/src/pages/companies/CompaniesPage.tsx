import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LayoutGrid, List, Search, Plus, Users, ArrowRight, X } from 'lucide-react';
import { companiesApi, Company, AssignedUser } from '../../api/companies';
import { useAuth } from '../../contexts/AuthContext';
import { hasPermission } from '../../utils/permissions';
import ConfirmDialog from '../../components/ConfirmDialog';
import CustomSelect from '../../components/CustomSelect';
import '../../styles/companies.css';

const BUSINESS_TYPES = { service: 'Service', consumer: 'Consumer', commerce: 'Commerce', other: 'Other' };
const COLORS = ['#2563eb', '#7c3aed', '#059669', '#c2410c'];

export default function CompaniesPage() {
  const { user, activeCompany, switchCompany, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<AssignedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusTab, setStatusTab] = useState('all');
  const [search, setSearch] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [sort, setSort] = useState('updated');
  const [view, setView] = useState('grid');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [newType, setNewType] = useState('service');
  const [template, setTemplate] = useState('agency');
  const [creating, setCreating] = useState(false);
  const [opening, setOpening] = useState('');
  const [statusCompany, setStatusCompany] = useState<Company | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [accessCompany, setAccessCompany] = useState<Company | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [accessError, setAccessError] = useState('');
  const [savingAccess, setSavingAccess] = useState(false);
  const accessDialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const canCreate = hasPermission(user, 'businesses.create');
  const canUpdate = hasPermission(user, 'businesses.update');

  useEffect(() => { void loadCompanies(); }, []);
  useEffect(() => {
    if (showCreate) {
      nameInput.current?.focus();
      nameInput.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [showCreate]);
  useEffect(() => {
    if (accessCompany) accessDialog.current?.showModal();
    else accessDialog.current?.close();
  }, [accessCompany]);

  async function loadCompanies() {
    setLoading(true);
    setError('');
    try {
      const response = await companiesApi.list();
      setCompanies(response.data);
      setUsers(response.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load CRMs. Please try again.');
    } finally { setLoading(false); }
  }

  function resetFilters() {
    setSearch('');
    setBusinessType('');
    setStatusTab('all');
  }

  async function createCompany(event: React.FormEvent) {
    event.preventDefault();
    if (creating || !name.trim()) return;
    setCreating(true);
    setError('');
    setSuccess('');
    try {
      const response = await companiesApi.create({ name: name.trim(), businessType: newType, moduleSetup: template });
      setCompanies(previous => [response.data, ...previous]);
      resetFilters();
      setSort('updated');
      setShowCreate(false);
      setName('');
      setNewType('service');
      setTemplate('agency');
      setSuccess(`“${response.data.name}” is ready. Select Open CRM to start working.`);
      await loadCompanies();
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create CRM. Please try again.');
    } finally { setCreating(false); }
  }

  async function openCompany(company: Company) {
    if (opening) return;
    setOpening(company._id);
    setError('');
    setSuccess('');
    try {
      if (activeCompany?._id !== company._id) await switchCompany(company._id);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open this CRM. Please try again.');
    } finally { setOpening(''); }
  }

  async function changeStatus() {
    if (!statusCompany || savingStatus) return;
    setSavingStatus(true);
    setError('');
    setSuccess('');
    try {
      const status = statusCompany.status === 'inactive' ? 'active' : 'inactive';
      const response = await companiesApi.setStatus(statusCompany._id, status);
      setCompanies(previous => previous.map(company => company._id === response.data._id ? { ...company, ...response.data } : company));
      setSuccess(`“${statusCompany.name}” ${status === 'active' ? 'restored' : 'archived'}.`);
      setStatusCompany(null);
      await refreshUser();
    } catch (err) {
      setStatusCompany(null);
      setError(err instanceof Error ? err.message : 'Could not update CRM. Please try again.');
    } finally { setSavingStatus(false); }
  }

  async function saveAccess(event: React.FormEvent) {
    event.preventDefault();
    if (!accessCompany || savingAccess) return;
    setSavingAccess(true);
    setAccessError('');
    setSuccess('');
    try {
      await companiesApi.updateCollaborators(accessCompany._id, selectedUsers);
      setSuccess(`Team access saved for “${accessCompany.name}”.`);
      setAccessCompany(null);
      await loadCompanies();
      await refreshUser();
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : 'Could not save access. Please try again.');
    } finally { setSavingAccess(false); }
  }

  const filtered = useMemo(() => companies.filter(company => {
    if (statusTab === 'active' && company.status === 'inactive') return false;
    if (statusTab === 'archived' && company.status !== 'inactive') return false;
    if (businessType && (company.businessType || 'service') !== businessType) return false;
    const query = search.trim().toLowerCase();
    return [company.name, company.businessType || 'service', company.category, company.accountOwner?.name]
      .some(value => value?.toLowerCase().includes(query));
  }).sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'leads') return (b.leadCount || 0) - (a.leadCount || 0);
    return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
  }), [companies, statusTab, search, businessType, sort]);
  const archivedCount = companies.filter(company => company.status === 'inactive').length;
  const matchingUsers = users.filter(member => ['admin', 'manager', 'agent'].includes(member.role || '') &&
    `${member.name} ${member.email || ''}`.toLowerCase().includes(userSearch.trim().toLowerCase()));

  return <div className="crms-page-shell">
    <header className="crms-header">
      <div><div className="crms-eyebrow">WORKSPACES</div><h1>CRMs</h1>
        <p>Choose a workspace to manage its leads, work, and team.</p></div>
      {canCreate && <button className="crms-primary" disabled={creating} aria-expanded={showCreate} aria-controls="create-crm"
        onClick={() => setShowCreate(!showCreate)}>{showCreate ? <X size={17} /> : <Plus size={17} />}{showCreate ? 'Cancel' : 'New CRM'}</button>}
    </header>
    {error && <div className="crms-notice crms-error" role="alert">{error}<button onClick={() => void loadCompanies()} disabled={loading}>Reload CRMs</button></div>}
    {success && <div className="crms-notice crms-success" role="status">{success}</div>}

    {showCreate && <form id="create-crm" className="crms-create" onSubmit={createCompany}>
      <h2>Create a CRM</h2><p>Give it a name. You can change the details later.</p>
      <fieldset disabled={creating}>
        <label>Workspace name<input ref={nameInput} required maxLength={160} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. MedLife Clinics" /></label>
        <label>Business type
          <CustomSelect
            value={newType}
            onChange={val => setNewType(val)}
            options={Object.entries(BUSINESS_TYPES).map(([value, label]) => ({ value, label }))}
          />
        </label>
        <label>Starting setup
          <CustomSelect
            value={template}
            onChange={val => setTemplate(val)}
            options={[
              { value: 'agency', label: 'Agency starter' },
              { value: 'blank', label: 'Basic CRM + tasks' }
            ]}
          />
        </label>
      </fieldset>
      <p className="crms-hint">{template === 'agency' ? 'Includes tasks, meetings, videos, designs, websites, content, and payments.' : 'Start with leads and tasks. Add more work types in Settings when needed.'}</p>
      <button type="submit" className="crms-primary" disabled={creating || !name.trim()}>{creating ? 'Creating…' : 'Create CRM'}</button>
    </form>}

    <section className="crms-toolbar" aria-label="Filter CRMs">
      <div className="crms-tabs">
        {[['all', 'All CRMs', companies.length], ['active', 'Active', companies.length - archivedCount], ['archived', 'Archived', archivedCount]].map(([value, label, count]) =>
          <button key={value} aria-pressed={statusTab === value} onClick={() => setStatusTab(String(value))}>{label}<span>{count}</span></button>)}
      </div>
      <div className="crms-controls">
        <label className="crms-search"><Search size={16} /><input aria-label="Search CRMs" type="search" placeholder="Search CRMs…" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <CustomSelect
          aria-label="Business type filter"
          value={businessType}
          onChange={val => setBusinessType(val)}
          options={[
            { value: '', label: 'All business types' },
            ...Object.entries(BUSINESS_TYPES).map(([value, label]) => ({ value, label }))
          ]}
          variant="compact"
        />
        <CustomSelect
          aria-label="Sort CRMs"
          value={sort}
          onChange={val => setSort(val)}
          options={[
            { value: 'updated', label: 'Last updated' },
            { value: 'name', label: 'Name (A–Z)' },
            { value: 'leads', label: 'Most leads' }
          ]}
          variant="compact"
        />
        <div className="crms-view"><button aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid size={17} /></button>
          <button aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={17} /></button></div>
      </div>
    </section>

    {loading && <p role="status">Loading CRMs…</p>}
    {!loading && !error && filtered.length === 0 && <section className="crms-empty"><h2>{companies.length ? 'No matching CRMs' : 'Create your first CRM'}</h2>
      <p>{companies.length ? 'Try another search or clear the filters.' : 'Keep your leads and team together in one workspace.'}</p>
      {companies.length > 0 ? <button onClick={resetFilters}>Clear filters</button> : canCreate && <button className="crms-primary" onClick={() => setShowCreate(true)}>New CRM</button>}</section>}

    <div className={`crms-grid ${view === 'list' ? 'crms-list' : ''}`} aria-busy={loading}>
      {filtered.map(company => {
        const current = company._id === activeCompany?._id;
        const archived = company.status === 'inactive';
        const members = company.assignedUsers || [];
        const initials = company.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
        const color = COLORS[Array.from(company.name).reduce((sum, char) => sum + char.charCodeAt(0), 0) % COLORS.length];
        return <article key={company._id} className={`crms-card ${current ? 'is-current' : ''}`} aria-label={company.name}>
          <div className="crms-card-main"><div className="crms-card-head">
            <div className="crms-avatar" style={{ background: color }} aria-hidden="true">{initials}</div>
            <div className="crms-card-title"><h2><Link to={`/companies/${company._id}`}>{company.name}</Link></h2>
              <span>{BUSINESS_TYPES[company.businessType || 'service'] || 'Other'}{company.accountOwner ? ` · ${company.accountOwner.name}` : ''}</span></div>
          </div>
          <div className="crms-badges"><span className={`crms-badge ${archived ? '' : 'active'}`}>{archived ? 'Archived' : company.status === 'onboarding' ? 'Onboarding' : 'Active'}</span>
            {current && <span className="crms-badge current">Current workspace</span>}{company.isMain && <span className="crms-badge">Main CRM</span>}</div>
          </div>
          <div className="crms-metrics"><div><strong>{company.leadCount || 0}</strong><span>Leads</span></div><div><strong>{company.campaignCount || 0}</strong><span>Active campaigns</span></div>
            <div><strong>{members.length}</strong><span>Team members</span></div></div>
          <div className="crms-card-actions">
            {!archived && <button className="crms-primary" disabled={!!opening} onClick={() => void openCompany(company)}>{opening === company._id ? 'Opening…' : 'Open CRM'}<ArrowRight size={15} /></button>}
            <Link className="crms-button" to={`/companies/${company._id}`}>Details</Link>
            {canUpdate && <button onClick={() => { setAccessCompany(company); setSelectedUsers(members.map(member => member._id)); setUserSearch(''); setAccessError(''); }}><Users size={15} />Team access</button>}
            {canUpdate && <button className="crms-archive" disabled={!archived && (current || company.isMain)}
              title={current ? 'Open another CRM before archiving this one.' : company.isMain ? 'The main CRM cannot be archived.' : undefined}
              onClick={() => setStatusCompany(company)}>{archived ? 'Restore' : 'Archive'}</button>}
          </div>
        </article>;
      })}
    </div>
    {companies.length > 0 && <p className="crms-results" aria-live="polite">Showing {filtered.length} of {companies.length} CRMs</p>}

    <dialog ref={accessDialog} className="crms-dialog" aria-labelledby="crm-access-title" onCancel={event => { event.preventDefault(); if (!savingAccess) setAccessCompany(null); }}>
      <form onSubmit={saveAccess}><header><h2 id="crm-access-title">Team access</h2><button type="button" aria-label="Close team access" disabled={savingAccess} onClick={() => setAccessCompany(null)}><X size={18} /></button></header>
        <p>{accessCompany?.name}</p><p className="crms-hint">Admins and managers already have access to all CRMs. Select the agents who should access this workspace.</p>
        {accessError && <div role="alert" className="crms-notice crms-error">{accessError}</div>}
        <input type="search" aria-label="Search team members" placeholder="Search team members…" value={userSearch} onChange={event => setUserSearch(event.target.value)} />
        <fieldset disabled={savingAccess} className="crms-members">
          {matchingUsers.map(member => <label key={member._id}><input type="checkbox" checked={['admin', 'manager'].includes(member.role || '') || selectedUsers.includes(member._id)}
            disabled={['admin', 'manager'].includes(member.role || '') || member._id === user?._id}
            onChange={event => setSelectedUsers(previous => event.target.checked ? [...previous, member._id] : previous.filter(id => id !== member._id))} />
            <span><strong>{member.name}</strong><small>{member.email} · {member.role}</small></span></label>)}
          {!matchingUsers.length && <p>No team members match your search.</p>}
        </fieldset>
        <footer><button type="button" disabled={savingAccess} onClick={() => setAccessCompany(null)}>Cancel</button><button className="crms-primary" disabled={savingAccess}>{savingAccess ? 'Saving…' : 'Save access'}</button></footer>
      </form>
    </dialog>
    <ConfirmDialog open={!!statusCompany} title={statusCompany?.status === 'inactive' ? 'Restore CRM?' : 'Archive CRM?'}
      message={statusCompany?.status === 'inactive' ? `Restore “${statusCompany.name}” so its team can open it again.` : `Archive “${statusCompany?.name}”? Its data is kept, but its team cannot open it until you restore it.`}
      confirmText={statusCompany?.status === 'inactive' ? 'Restore CRM' : 'Archive CRM'} variant="warning" loading={savingStatus}
      onConfirm={() => void changeStatus()} onCancel={() => setStatusCompany(null)} />
  </div>;
}
