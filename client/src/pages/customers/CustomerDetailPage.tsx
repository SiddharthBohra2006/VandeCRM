import { CSSProperties, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CustomerDetailResponse, customersApi } from '../../api/customers';
import { downloadAuthenticatedFile } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { CustomerInput } from '../../types';
import ConfirmDialog from '../../components/ConfirmDialog';

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
  const [success, setSuccess] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ kind: 'delete' } | { kind: 'deleteAttachment'; attachmentId: string } | null>(null);
  const [searchParams] = useSearchParams();

  // Activity Composer State
  const [activityType, setActivityType] = useState('note');
  const [activityNote, setActivityNote] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpTime, setFollowUpTime] = useState('10:00');
  const [timelineSearch, setTimelineSearch] = useState('');
  const [timelineFilter, setTimelineFilter] = useState('all');
  const [submittingActivity, setSubmittingActivity] = useState(false);

  // Attachment State
  const [uploadCategory, setUploadCategory] = useState('proposal');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

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
      setSuccess('Lead updated successfully.');
      await load(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!id) return;
    setConfirmAction({ kind: 'delete' });
  }

  async function handleConfirmDelete() {
    if (!id) return;
    setConfirmAction(null);
    try {
      await customersApi.delete(id);
      navigate('/customers');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Delete failed');
    }
  }

  async function handleLogActivity() {
    if (!id || !activityNote.trim()) {
      setError('Please enter a note for this activity.');
      return;
    }
    try {
      setSubmittingActivity(true);
      setError('');
      let nextFollowUpAt: string | undefined;
      if (followUpDate) {
        nextFollowUpAt = new Date(`${followUpDate}T${followUpTime}:00`).toISOString();
      }
      await customersApi.addActivity(id, {
        type: activityType,
        note: activityNote.trim(),
        nextFollowUpAt,
      });
      setActivityNote('');
      setFollowUpDate('');
      setSuccess('Activity logged successfully.');
      await load(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to log activity');
    } finally {
      setSubmittingActivity(false);
    }
  }

  async function handleQuickFollowUp(days: number) {
    if (!id) return;
    try {
      setError('');
      const target = new Date();
      target.setDate(target.getDate() + days);
      target.setHours(10, 0, 0, 0);
      await customersApi.addActivity(id, {
        type: 'task',
        note: `Follow-up scheduled for +${days} day(s) on ${target.toLocaleDateString('en-IN')}.`,
        nextFollowUpAt: target.toISOString(),
      });
      setSuccess(`Follow-up scheduled for ${target.toLocaleDateString('en-IN')}.`);
      await load(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to reschedule follow-up');
    }
  }

  async function handleUploadAttachment(e: React.FormEvent) {
    e.preventDefault();
    const files = uploadFiles.length > 0 ? uploadFiles : (uploadFile ? [uploadFile] : []);
    if (!id || files.length === 0) {
      setError('Please select a file to upload.');
      return;
    }
    try {
      setUploading(true);
      setError('');
      let uploadedCount = 0;
      let skipped = 0;
      for (const file of files) {
        if (file.size > 3 * 1024 * 1024) {
          skipped += 1;
          continue;
        }
        const fileData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = event => resolve(String(event.target?.result || ''));
          reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
          reader.readAsDataURL(file);
        });
        await customersApi.uploadAttachment(id, {
          fileData,
          originalName: file.name,
          category: uploadCategory,
          notes: uploadNotes,
        });
        uploadedCount += 1;
      }
      setUploadFile(null);
      setUploadFiles([]);
      setUploadNotes('');
      if (uploadedCount > 0) {
        setSuccess(skipped > 0 ? `${uploadedCount} file${uploadedCount === 1 ? '' : 's'} uploaded. ${skipped} skipped (3 MB limit).` : `${uploadedCount} file${uploadedCount === 1 ? '' : 's'} uploaded successfully.`);
        await load(id);
      } else {
        const err = new Error(skipped > 0 ? 'None uploaded. Files must be 3 MB or smaller.' : 'Upload failed.');
        setError(err.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function confirmDeleteAttachment(attachmentId: string) {
    if (!id) return;
    setConfirmAction({ kind: 'deleteAttachment', attachmentId });
  }

  async function handleConfirmDeleteAttachment() {
    if (!id || confirmAction?.kind !== 'deleteAttachment') return;
    const attachmentId = confirmAction.attachmentId;
    setConfirmAction(null);
    try {
      setError('');
      await customersApi.deleteAttachment(id, attachmentId);
      setSuccess('Attachment deleted.');
      await load(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to delete attachment');
    }
  }

  if (loading && !detail) return <div className="loading">Loading…</div>;
  if (error && !detail) return <div className="alert alert-error" role="alert">{error}</div>;
  if (!detail) return <div className="empty-state">{crmTerms.leadSingular} not found.</div>;

  const { data: customer, activities, attachments, relatedWork, stages, labels, users, campaigns, fields } = detail;
  const initials = customer.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'L';
  const avatarPalette = getAvatarColor(customer.name);
  const stageColor = customer.stage?.color || '#3b82f6';
  const cleanPhone = (customer.phone || '').replace(/\D/g, '');

  const isClientProfile = searchParams.get('from') === 'clients' || Boolean(customer.stage?.isWon);
  const completedWork = relatedWork.filter(w => /completed|done|won/i.test(w.status)).length;
  const activeWork = relatedWork.length - completedWork;
  const meetingsCount = activities.filter(a => a.type === 'meeting').length;

  let stageBg = '#eff6ff';
  let stageText = '#2563eb';
  if (/proposal/i.test(customer.stage?.name || '')) { stageBg = '#fff7ed'; stageText = '#ea580c'; }
  else if (/qualified/i.test(customer.stage?.name || '')) { stageBg = '#ecfdf5'; stageText = '#059669'; }
  else if (/contacted/i.test(customer.stage?.name || '')) { stageBg = '#faf5ff'; stageText = '#7c3aed'; }
  else if (/follow/i.test(customer.stage?.name || '')) { stageBg = '#ecfeff'; stageText = '#0891b2'; }
  else if (customer.stage?.isWon) { stageBg = '#ecfdf5'; stageText = '#059669'; }

  const isManager = user && ['admin', 'manager'].includes(user.role);

  // Filter activities
  const filteredActivities = activities.filter(a => {
    if (timelineFilter !== 'all' && a.type !== timelineFilter) return false;
    if (timelineSearch.trim()) {
      const q = timelineSearch.toLowerCase();
      return (a.note || '').toLowerCase().includes(q) || (a.user?.name || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="lead-record-ui">
      <nav className="lead-detail-breadcrumbs">
        <Link to={isClientProfile ? '/clients' : '/customers'}>
          {isClientProfile ? crmTerms.recordPlural : crmTerms.leadPlural}
        </Link>
        <span>/</span>
        <strong>{customer.name}</strong>
      </nav>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {success && <div className="alert alert-success" role="alert">{success}</div>}

      {/* Header card */}
      <section className="lead-detail-head" style={{ '--stage-color': stageColor } as CSSProperties}>
        <div className="lead-identity">
          <span className="lead-avatar" style={{ background: avatarPalette.bg, color: avatarPalette.color }}>{initials}</span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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

        {/* Quick Contact & Action strip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
          {customer.phone && (
            <>
              <a className="btn btn-secondary" href={`tel:${customer.phone}`}>
                📞 Call
              </a>
              {cleanPhone && (
                <a className="btn btn-secondary" href={`https://wa.me/${cleanPhone}`} target="_blank" rel="noreferrer">
                  💬 WhatsApp
                </a>
              )}
            </>
          )}
          {customer.email && (
            <Link className="btn btn-secondary" to={`/mail?customer=${customer._id}`}>
              ✉️ Send email
            </Link>
          )}
          <button className="btn btn-secondary" onClick={() => setEditing(value => !value)}>
            {editing ? 'Cancel edit' : 'Edit'}
          </button>
          <button className="btn btn-danger" onClick={() => void remove()}>Delete</button>
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
                  <h2>{isClientProfile ? `${crmTerms.recordSingular} information` : `${crmTerms.leadSingular} information`}</h2>
                  {isClientProfile && (
                    <div className="client-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', margin: '1rem 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel-muted)' }}>
                        <div><small style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)' }}>Work items</small><strong style={{ fontSize: '1.15rem' }}>{relatedWork.length}</strong></div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel-muted)' }}>
                        <div><small style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)' }}>Completed</small><strong style={{ fontSize: '1.15rem', color: '#10b981' }}>{completedWork}</strong></div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel-muted)' }}>
                        <div><small style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)' }}>In progress</small><strong style={{ fontSize: '1.15rem', color: '#3b82f6' }}>{activeWork}</strong></div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--panel-muted)' }}>
                        <div><small style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)' }}>Meetings</small><strong style={{ fontSize: '1.15rem', color: '#8b5cf6' }}>{meetingsCount}</strong></div>
                      </div>
                    </div>
                  )}
                  <div className="lead-facts">
                    <div><small>Phone</small><strong>{customer.phone || 'Not set'}</strong></div>
                    <div><small>Email</small><strong>{customer.email || 'Not set'}</strong></div>
                    <div><small>Organisation</small><strong>{customer.company || 'Not set'}</strong></div>
                    <div><small>{isClientProfile ? 'How they came to you' : 'Course / Campaign'}</small><strong>{customer.campaign?.name || customer.source || (isClientProfile ? 'Direct' : 'Direct lead')}</strong></div>
                    <div><small>Assigned owner</small><strong>{customer.assignedTo?.name || 'Unassigned'}</strong></div>
                    <div><small>{isClientProfile ? 'Next planned contact' : 'Next follow-up'}</small><strong>{customer.nextFollowUpAt ? new Date(customer.nextFollowUpAt).toLocaleString('en-IN') : 'Not scheduled'}</strong></div>
                  </div>
                  {customer.notes && <div className="lead-notes"><h3>Internal notes</h3><p>{customer.notes}</p></div>}
                </section>
              )}

              {tab === 'activity' && (
                <section className="lead-tab-pane">
                  {/* Activity Composer Box */}
                  <div className="lead-overview-card" style={{ marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '0.92rem', marginBottom: '0.75rem' }}>Log activity & follow-up</h2>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', overflowX: 'auto' }}>
                      {[
                        { key: 'note', label: 'Note' },
                        { key: 'call', label: 'Call' },
                        { key: 'email', label: 'Email' },
                        { key: 'whatsapp', label: 'WhatsApp' },
                        { key: 'meeting', label: 'Meeting' },
                        { key: 'task', label: 'Task' },
                      ].map(type => (
                        <button
                          key={type.key}
                          type="button"
                          onClick={() => setActivityType(type.key)}
                          style={{
                            background: activityType === type.key ? 'var(--gold, #ea580c)' : 'transparent',
                            color: activityType === type.key ? '#fff' : 'var(--muted)',
                            border: 'none',
                            padding: '4px 12px',
                            borderRadius: 6,
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>

                    <textarea
                      rows={3}
                      placeholder={`Write a ${activityType} note...`}
                      value={activityNote}
                      onChange={e => setActivityNote(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', marginBottom: '0.75rem', fontSize: '0.82rem' }}
                    />

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)' }}>Next follow-up:</label>
                      <input
                        type="date"
                        value={followUpDate}
                        onChange={e => setFollowUpDate(e.target.value)}
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.76rem' }}
                      />
                      <input
                        type="time"
                        value={followUpTime}
                        onChange={e => setFollowUpTime(e.target.value)}
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.76rem' }}
                      />
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Quick reschedule:</span>
                      <button type="button" className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => handleQuickFollowUp(1)}>+1 Day</button>
                      <button type="button" className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => handleQuickFollowUp(3)}>+3 Days</button>
                      <button type="button" className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => handleQuickFollowUp(7)}>+1 Week</button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-primary"
                        type="button"
                        disabled={submittingActivity || !activityNote.trim()}
                        onClick={handleLogActivity}
                      >
                        {submittingActivity ? 'Saving...' : 'Save Activity'}
                      </button>
                    </div>
                  </div>

                  {/* Activity Timeline */}
                  <div className="lead-overview-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                      <h2>Activity timeline</h2>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          placeholder="Search history..."
                          value={timelineSearch}
                          onChange={e => setTimelineSearch(e.target.value)}
                          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.76rem' }}
                        />
                        <select
                          value={timelineFilter}
                          onChange={e => setTimelineFilter(e.target.value)}
                          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.76rem' }}
                        >
                          <option value="all">All types</option>
                          <option value="note">Notes</option>
                          <option value="call">Calls</option>
                          <option value="email">Emails</option>
                          <option value="whatsapp">WhatsApp</option>
                          <option value="meeting">Meetings</option>
                          <option value="task">Tasks</option>
                          <option value="stage_changed">Stage changes</option>
                        </select>
                      </div>
                    </div>

                    <div className="lead-timeline-list">
                      {filteredActivities.length === 0 ? (
                        <div className="empty-state">No matching activity yet.</div>
                      ) : filteredActivities.map(activity => (
                        <article className="lead-timeline-item" key={activity._id}>
                          <span className="lead-timeline-icon" />
                          <div className="lead-timeline-content">
                            <div className="lead-timeline-meta">
                              <strong>{activity.type.replace('_', ' ').toUpperCase()}</strong>
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
                  <div className="lead-overview-card" style={{ marginBottom: '1.5rem' }}>
                    <h2>Upload attachment</h2>
                    <form onSubmit={handleUploadAttachment} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <select
                          value={uploadCategory}
                          onChange={e => setUploadCategory(e.target.value)}
                          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.78rem' }}
                        >
                          <option value="proposal">Proposal</option>
                          <option value="contract">Contract</option>
                          <option value="invoice">Invoice</option>
                          <option value="brief">Brief</option>
                          <option value="screenshot">Screenshot</option>
                          <option value="other">Other</option>
                        </select>
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt,.csv"
                          onChange={e => { setUploadFile(e.target.files?.[0] || null); setUploadFiles([...(e.target.files || [])]); }}
                          style={{ fontSize: '0.78rem' }}
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Notes (optional)..."
                        value={uploadNotes}
                        onChange={e => setUploadNotes(e.target.value)}
                        style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.78rem' }}
                      />
                      <button className="btn btn-primary" type="submit" disabled={uploading || (uploadFiles.length === 0 && !uploadFile)} style={{ alignSelf: 'flex-start' }}>
                        {uploading ? 'Uploading...' : uploadFiles.length > 1 ? `Upload ${uploadFiles.length} Files` : 'Upload File'}
                      </button>
                    </form>
                  </div>

                  <div className="lead-overview-card">
                    <h2>Attachments ({attachments.length})</h2>
                    {attachments.length === 0 ? (
                      <div className="empty-state">No attachments uploaded yet.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {attachments.map(file => (
                          <article className="business-row" key={file._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <strong>{file.originalName}</strong>
                              <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                                {file.category} · {Math.ceil((file.size || 0) / 1024)} KB · {new Date(file.createdAt).toLocaleDateString('en-IN')}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                                onClick={() => downloadAuthenticatedFile(`/customers/${customer._id}/attachments/${file._id}/download`, file.originalName)}
                              >
                                Download
                              </button>
                              <button
                                className="btn btn-danger"
                                style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                                onClick={() => confirmDeleteAttachment(file._id)}
                              >
                                Delete
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
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
                  try {
                    await customersApi.updateStage(id!, next);
                    setSuccess('Stage updated.');
                    await load(id!);
                  } catch (caught) {
                    setError(caught instanceof Error ? caught.message : 'Update failed');
                  }
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
                    try {
                      await customersApi.transferLead(id!, event.target.value || null);
                      setSuccess('Owner updated.');
                      await load(id!);
                    } catch (caught) {
                      setError(caught instanceof Error ? caught.message : 'Update failed');
                    }
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

      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction?.kind === 'deleteAttachment' ? 'Delete Attachment' : `Delete this ${crmTerms.leadSingular.toLowerCase()}?`}
        message={confirmAction?.kind === 'deleteAttachment'
          ? 'Delete this attachment permanently?'
          : `This will permanently delete the ${crmTerms.leadSingular.toLowerCase()} and all of its data. This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        onConfirm={() => void (confirmAction?.kind === 'deleteAttachment' ? handleConfirmDeleteAttachment() : handleConfirmDelete())}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
