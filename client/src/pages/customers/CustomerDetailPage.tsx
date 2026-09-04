import { CSSProperties, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CustomerDetailResponse, customersApi } from '../../api/customers';
import { useAuth } from '../../contexts/AuthContext';
import { CustomerInput } from '../../types';

type Tab = 'overview' | 'activity' | 'work' | 'files' | 'details';

const avatarPalettes = [
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
  return avatarPalettes[Math.abs(hash) % avatarPalettes.length];
}

const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview',
  activity: 'Activity',
  work: 'Work',
  files: 'Files',
  details: 'Details',
};

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { crmTerms, user } = useAuth();
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
        notes: result.data.notes, customData: result.data.customData,
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
    if (!id || !window.confirm(`Delete this ${crmTerms.leadSingular.toLowerCase()} permanently?`)) return;
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
  const initials = customer.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'L';
  const avatarPalette = getAvatarColor(customer.name);
  const stageColor = customer.stage?.color || '#3b82f6';

  let stageBg = '#eff6ff';
  let stageText = '#2563eb';
  if (/proposal/i.test(customer.stage?.name || '')) { stageBg = '#fff7ed'; stageText = '#ea580c'; }
  else if (/qualified/i.test(customer.stage?.name || '')) { stageBg = '#ecfdf5'; stageText = '#059669'; }
  else if (/contacted/i.test(customer.stage?.name || '')) { stageBg = '#faf5ff'; stageText = '#7c3aed'; }
  else if (/follow/i.test(customer.stage?.name || '')) { stageBg = '#ecfeff'; stageText = '#0891b2'; }
  else if (customer.stage?.isWon) { stageBg = '#ecfdf5'; stageText = '#059669'; }

  const isManager = user && ['admin', 'manager'].includes(user.role);

  return (
    <div className="lead-record-ui">
      <nav className="lead-detail-breadcrumbs"><Link to="/customers">{crmTerms.leadPlural}</Link><span>/</span><strong>{customer.name}</strong></nav>
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {/* Header card */}
      <section className="lead-detail-head" style={{ '--stage-color': stageColor } as CSSProperties}>
        <div className="lead-identity">
          <span className="lead-avatar" style={{ background: avatarPalette.bg, color: avatarPalette.color }}>{initials}</span>
          <div>
            <div>
              <h1>{customer.name}</h1>
              <span className="stage-badge-pill" style={{ background: stageBg, color: stageText }}>{customer.stage?.name || 'Unassigned'}</span>
            </div>
            <p className="page-subtitle">{customer.company || customer.email || customer.phone || 'No contact details yet'}</p>
            <div className="lead-header-labels">
              {labels.filter(label => (form.labels || []).includes(label._id)).map(label => (
                <span className="pill" key={label._id} style={{ marginInlineEnd: '4px' }}>{label.name}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="actions">
          <button className="btn secondary" onClick={() => setEditing(value => !value)}>{editing ? 'Cancel edit' : 'Edit'}</button>
          <button className="btn danger" onClick={() => void remove()}>Delete</button>
        </div>
      </section>

      {/* Section nav */}
      <nav className="lead-section-nav" aria-label={`${crmTerms.leadSingular} sections`}>
        {(Object.keys(TAB_LABELS) as Tab[]).map(item => (
          <button type="button" key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{TAB_LABELS[item]}</button>
        ))}
      </nav>

      <div className="lead-profile-grid">
        {/* Main column */}
        <main className="lead-main-column">
          {editing ? (
            <section className="lead-tab-pane">
              <div className="lead-overview-card">
                <h2>Edit {crmTerms.leadSingular}</h2>
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
                {labels.length > 0 && <div className="check-grid">{labels.map(label => <label className="check-pill" key={label._id}><input type="checkbox" checked={(form.labels || []).includes(label._id)} onChange={() => setForm(current => ({ ...current, labels: (current.labels || []).includes(label._id) ? (current.labels || []).filter(innerId => innerId !== label._id) : [...(current.labels || []), label._id] }))} />{label.name}</label>)}</div>}
                <label>Internal notes<textarea rows={6} value={form.notes || ''} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} /></label>
                <div className="form-actions"><button className="btn primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save changes'}</button></div>
              </div>
            </section>
          ) : (
            <>
              {tab === 'overview' && (
                <section className="lead-overview-card">
                  <h2>{crmTerms.leadSingular} information</h2>
                  <div className="lead-facts">
                    <div><small>Phone</small><strong>{customer.phone || 'Not set'}</strong></div>
                    <div><small>Email</small><strong>{customer.email || 'Not set'}</strong></div>
                    <div><small>Organisation</small><strong>{customer.company || 'Not set'}</strong></div>
                    <div><small>Course / Campaign</small><strong>{customer.campaign?.name || customer.source || 'Direct lead'}</strong></div>
                    <div><small>Assigned owner</small><strong>{customer.assignedTo?.name || 'Unassigned'}</strong></div>
                    <div><small>Next follow-up</small><strong>{customer.nextFollowUpAt ? new Date(customer.nextFollowUpAt).toLocaleString('en-IN') : 'Not scheduled'}</strong></div>
                  </div>
                  {customer.notes && <div className="lead-notes"><h3>Internal notes</h3><p>{customer.notes}</p></div>}
                </section>
              )}

              {tab === 'activity' && (
                <section className="lead-tab-pane">
                  <div className="lead-overview-card">
                    <h2>Activity timeline</h2>
                    <div className="lead-timeline-list">
                      {activities.length === 0 ? (
                        <div className="empty-state">No activity yet.</div>
                      ) : activities.map(activity => (
                        <article className="lead-timeline-item" key={activity._id}>
                          <span className="lead-timeline-icon" />
                          <div className="lead-timeline-content">
                            <div className="lead-timeline-meta">
                              <strong>{activity.type.replace('_', ' ')}</strong>
                              <span>{new Date(activity.createdAt).toLocaleString('en-IN')}</span>
                            </div>
                            <p className="lead-timeline-text">{activity.note}</p>
                            <small>{activity.user?.name || 'System'}</small>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {tab === 'work' && (
                <section className="lead-tab-pane">
                  <div className="lead-overview-card">
                    <h2>Related work</h2>
                    {relatedWork.length === 0 ? (
                      <div className="empty-state">No related work yet.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {relatedWork.map(item => (
                          <Link className="business-row" key={item._id} to={`/work/${item.module?.key || 'task'}/${item._id}`}>
                            <strong>{item.title}</strong>
                            <span>{item.module?.name || 'Work'} · <span className="stage-badge-pill" style={{ background: 'var(--panel-muted)' }}>{item.status}</span></span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {tab === 'files' && (
                <section className="lead-tab-pane">
                  <div className="lead-overview-card">
                    <h2>Attachments</h2>
                    {attachments.length === 0 ? (
                      <div className="empty-state">No attachments uploaded yet.</div>
                    ) : (
                      attachments.map(file => (
                        <article className="business-row" key={file._id}>
                          <strong>{file.originalName}</strong>
                          <span>{file.category} · {Math.ceil((file.size || 0) / 1024)} KB</span>
                        </article>
                      ))
                    )}
                  </div>
                </section>
              )}

              {tab === 'details' && (
                <section className="lead-tab-pane">
                  <div className="lead-overview-card">
                    <h2>Additional details</h2>
                    <dl className="sidebar-quick-dl">
                      {fields.map(field => (
                        <div key={field._id}><dt>{field.label}</dt><dd>{String(customer.customData?.[field.key] ?? '—')}</dd></div>
                      ))}
                      <div><dt>UTM source</dt><dd>{customer.utmSource || '—'}</dd></div>
                      <div><dt>UTM medium</dt><dd>{customer.utmMedium || '—'}</dd></div>
                      <div><dt>UTM campaign</dt><dd>{customer.utmCampaign || '—'}</dd></div>
                    </dl>
                  </div>
                </section>
              )}
            </>
          )}
        </main>

        {/* Side column */}
        <aside className="lead-side-column">
          <section className="lead-controls-card">
            <div className="lead-quick-card">
              <h3>Quick summary</h3>
              <dl>
                <dt>Phone</dt><dd>{customer.phone || '—'}</dd>
                <dt>Email</dt><dd>{customer.email || '—'}</dd>
                <dt>Source</dt><dd>{customer.source || 'Direct'}</dd>
                <dt>Value</dt><dd>₹{customer.value.toLocaleString('en-IN')}</dd>
                <dt>Created</dt><dd>{new Date(customer.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</dd>
              </dl>
            </div>

            <div className="lead-stage-card">
              <h3>{crmTerms.leadSingular} stage</h3>
              <div className="stack-form">
                <select value={customer.stage?._id || ''} onChange={async event => {
                  const next = event.target.value;
                  try { await customersApi.update(id!, { ...form, stage: next }); await load(id!); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Update failed'); }
                }}>
                  {stages.filter(stage => stage.isActive || stage._id === customer.stage?._id).map(stage => <option key={stage._id} value={stage._id}>{stage.name}</option>)}
                </select>
              </div>
            </div>

            {isManager && (
              <div className="lead-owner-card">
                <h3>Assigned owner</h3>
                <div className="stack-form">
                  <select value={customer.assignedTo?._id || ''} onChange={async event => {
                    try { await customersApi.update(id!, { ...form, assignedTo: event.target.value || undefined }); await load(id!); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Update failed'); }
                  }}>
                    <option value="">Unassigned</option>
                    {users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                  </select>
                </div>
              </div>
            )}

            <div className="lead-followup-panel">
              <h3>Next follow-up</h3>
              {customer.nextFollowUpAt ? (
                <div className="lead-followup-summary">
                  <strong>{new Date(customer.nextFollowUpAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</strong>
                  <small className="lead-next-date">{new Date(customer.nextFollowUpAt).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</small>
                  <span className="lead-scheduled-badge">Scheduled</span>
                </div>
              ) : (
                <div className="lead-followup-summary">
                  <span className="eyebrow">No follow-up scheduled</span>
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
