import { CSSProperties, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CustomerDetailResponse, customersApi } from '../../api/customers';
import { useAuth } from '../../contexts/AuthContext';
import { CustomerInput } from '../../types';

type Tab = 'overview' | 'activity' | 'work' | 'files' | 'details';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { crmTerms } = useAuth();
  const [detail, setDetail] = useState<CustomerDetailResponse | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<CustomerInput>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load(customerId: string) {
    try {
      setLoading(true);
      setError('');
      const result = await customersApi.get(customerId);
      setDetail(result);
      setForm({
        name: result.data.name, company: result.data.company, email: result.data.email,
        phone: result.data.phone, source: result.data.source, value: result.data.value,
        priority: result.data.priority, stage: result.data.stage?._id, labels: result.data.labels.map(label => label._id),
        assignedTo: result.data.assignedTo?._id || '', campaign: result.data.campaign?._id || '',
        notes: result.data.notes, customData: result.data.customData
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Failed to load ${crmTerms.leadSingular.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (id) void load(id); }, [id]);

  async function save() {
    if (!id || !form.name?.trim()) return setError('Name is required.');
    try {
      setSaving(true);
      setError('');
      await customersApi.update(id, form);
      setEditing(false);
      await load(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!id || !confirm(`Delete this ${crmTerms.leadSingular.toLowerCase()} permanently?`)) return;
    try {
      await customersApi.delete(id);
      navigate('/customers');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Delete failed');
    }
  }

  if (loading && !detail) return <div className="loading">Loading…</div>;
  if (error && !detail) return <div className="alert alert-error" role="alert">{error}</div>;
  if (!detail) return <div className="empty-state">{crmTerms.leadSingular} not found.</div>;

  const { data: customer, activities, attachments, relatedWork, stages, labels, users, campaigns, fields } = detail;
  const initials = customer.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();

  return (
    <div className="lead-detail-page">
      <nav className="lead-detail-breadcrumbs"><Link to="/customers">{crmTerms.leadPlural}</Link><span>/</span><strong>{customer.name}</strong></nav>
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <section className="lead-profile-hero" style={{ '--stage-color': customer.stage?.color || '#3b82f6' } as CSSProperties}>
        <span className="lead-avatar">{initials || 'L'}</span>
        <div className="lead-profile-copy">
          <span className="stage-badge-pill">{customer.stage?.name || 'Unassigned'}</span>
          <h1>{customer.name}</h1>
          <p>{customer.company || customer.email || customer.phone || 'No contact details yet'}</p>
        </div>
        <div className="lead-profile-actions">
          <button className="btn secondary" onClick={() => setEditing(value => !value)}>{editing ? 'Cancel edit' : 'Edit'}</button>
          <button className="btn danger" onClick={() => void remove()}>Delete</button>
        </div>
      </section>

      <nav className="lead-detail-nav-tabs" aria-label="Lead details">
        {(['overview', 'activity', 'work', 'files', 'details'] as Tab[]).map(item => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}
      </nav>

      {editing ? <section className="lead-tab-pane">
        <div className="form-grid">
          <label>Name *<input required value={form.name || ''} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></label>
          <label>Company / Brand<input value={form.company || ''} onChange={event => setForm(current => ({ ...current, company: event.target.value }))} /></label>
          <label>Phone<input value={form.phone || ''} onChange={event => setForm(current => ({ ...current, phone: event.target.value }))} /></label>
          <label>Email<input type="email" value={form.email || ''} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} /></label>
          <label>Source<input value={form.source || ''} onChange={event => setForm(current => ({ ...current, source: event.target.value }))} /></label>
          <label>Value<input type="number" min="0" value={form.value || 0} onChange={event => setForm(current => ({ ...current, value: Number(event.target.value) || 0 }))} /></label>
          <label>Priority<select value={form.priority || 'medium'} onChange={event => setForm(current => ({ ...current, priority: event.target.value as CustomerInput['priority'] }))}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
          <label>Stage<select value={form.stage || ''} onChange={event => setForm(current => ({ ...current, stage: event.target.value }))}>{stages.filter(stage => stage.isActive || stage._id === customer.stage?._id).map(stage => <option key={stage._id} value={stage._id}>{stage.name}</option>)}</select></label>
          <label>Campaign<select value={form.campaign || ''} onChange={event => setForm(current => ({ ...current, campaign: event.target.value }))}><option value="">No campaign</option>{campaigns.map(campaign => <option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}</select></label>
          <label>Assigned owner<select value={form.assignedTo || ''} onChange={event => setForm(current => ({ ...current, assignedTo: event.target.value }))}><option value="">Unassigned</option>{users.map(user => <option key={user._id} value={user._id}>{user.name}</option>)}</select></label>
        </div>
        {labels.length > 0 && <div className="check-grid">{labels.map(label => <label className="check-pill" key={label._id}><input type="checkbox" checked={(form.labels || []).includes(label._id)} onChange={() => setForm(current => ({ ...current, labels: (current.labels || []).includes(label._id) ? (current.labels || []).filter(id => id !== label._id) : [...(current.labels || []), label._id] }))} />{label.name}</label>)}</div>}
        <label>Internal notes<textarea rows={6} value={form.notes || ''} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} /></label>
        <div className="form-actions"><button className="btn primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save changes'}</button></div>
      </section> : <>
        {tab === 'overview' && <div className="lead-detail-grid"><main className="lead-detail-main"><section className="lead-overview-card"><h2>Contact overview</h2><div className="lead-facts-grid">
          <div className="lead-fact-text"><small>Phone</small><strong>{customer.phone || 'Not set'}</strong></div>
          <div className="lead-fact-text"><small>Email</small><strong>{customer.email || 'Not set'}</strong></div>
          <div className="lead-fact-text"><small>Organisation</small><strong>{customer.company || 'Not set'}</strong></div>
          <div className="lead-fact-text"><small>Campaign</small><strong>{customer.campaign?.name || customer.source || 'Direct lead'}</strong></div>
          <div className="lead-fact-text"><small>Assigned owner</small><strong>{customer.assignedTo?.name || 'Unassigned'}</strong></div>
          <div className="lead-fact-text"><small>Next follow-up</small><strong>{customer.nextFollowUpAt ? new Date(customer.nextFollowUpAt).toLocaleString('en-IN') : 'Not scheduled'}</strong></div>
        </div>{customer.notes && <div className="lead-notes-card"><h3>Internal notes</h3><p>{customer.notes}</p></div>}</section></main>
        <aside className="lead-detail-sidebar"><section><h3>Lead summary</h3><dl><dt>Source</dt><dd>{customer.source || 'Direct'}</dd><dt>Value</dt><dd>₹{customer.value.toLocaleString('en-IN')}</dd><dt>Priority</dt><dd>{customer.priority}</dd><dt>Created</dt><dd>{new Date(customer.createdAt).toLocaleDateString('en-IN')}</dd></dl></section></aside></div>}

        {tab === 'activity' && <section className="lead-tab-pane"><h2>Activity timeline</h2><div className="lead-timeline-list">{activities.length === 0 ? <div className="empty-state">No activity yet.</div> : activities.map(activity => <article className="lead-timeline-item" key={activity._id}><span className="lead-timeline-icon" /><div className="lead-timeline-content"><div className="lead-timeline-meta"><strong>{activity.type.replace('_', ' ')}</strong><span>{new Date(activity.createdAt).toLocaleString('en-IN')}</span></div><p className="lead-timeline-text">{activity.note}</p><small>{activity.user?.name || 'System'}</small></div></article>)}</div></section>}

        {tab === 'work' && <section className="lead-tab-pane"><h2>Related work</h2>{relatedWork.length === 0 ? <div className="empty-state">No related work yet.</div> : relatedWork.map(item => <Link className="business-row" key={item._id} to={`/work/${item.module?.key || 'task'}/${item._id}`}><strong>{item.title}</strong><span>{item.module?.name || 'Work'} · {item.status}</span></Link>)}</section>}

        {tab === 'files' && <section className="lead-tab-pane"><h2>Attachments</h2>{attachments.length === 0 ? <div className="empty-state">No attachments uploaded yet.</div> : attachments.map(file => <article className="business-row" key={file._id}><strong>{file.originalName}</strong><span>{file.category} · {Math.ceil((file.size || 0) / 1024)} KB</span></article>)}</section>}

        {tab === 'details' && <section className="lead-tab-pane"><h2>Additional details</h2><dl className="detail-list">{fields.map(field => <div key={field._id}><dt>{field.label}</dt><dd>{String(customer.customData?.[field.key] ?? '—')}</dd></div>)}<div><dt>UTM source</dt><dd>{customer.utmSource || '—'}</dd></div><div><dt>UTM medium</dt><dd>{customer.utmMedium || '—'}</dd></div><div><dt>UTM campaign</dt><dd>{customer.utmCampaign || '—'}</dd></div></dl></section>}
      </>}
    </div>
  );
}
