import { CSSProperties, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CustomerDetailResponse, customersApi } from '../../api/customers';
import { workApi } from '../../api/work';
import { downloadAuthenticatedFile } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { CustomerInput } from '../../types';
import ConfirmDialog from '../../components/ConfirmDialog';
import QuickActivityPrompt from '../../components/QuickActivityPrompt';
import CustomSelect from '../../components/CustomSelect';
import DatePicker from '../../components/DatePicker';
import Icon from '../../components/Icons';

type Tab = 'overview' | 'work' | 'activity' | 'files' | 'details';

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

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  note: 'Note',
  call: 'Call',
  email: 'Email',
  whatsapp: 'WhatsApp',
  meeting: 'Meeting',
  meeting_client: 'Client Meeting',
  meeting_internal: 'Team Meeting',
  task: 'Task',
  stage_changed: 'Stage Changed',
  label_changed: 'Label Changed',
};

const MEETING_TYPES = ['meeting', 'meeting_client', 'meeting_internal'];

function formatWorkValue(value: any, field: any) {
  if (value == null || value === '') return '';
  if (field?.type === 'checkbox') return value ? 'Yes' : 'No';
  if (['date', 'datetime'].includes(field?.type)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-IN', field?.type === 'datetime' ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
  }
  if (['currency', 'number', 'percentage'].includes(field?.type)) {
    return field?.type === 'currency' ? `₹${Number(value || 0).toLocaleString('en-IN')}` : String(value);
  }
  return String(value);
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { crmTerms, user } = useAuth();
  const [detail, setDetail] = useState<CustomerDetailResponse | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<CustomerInput>>({});
  const [selectedStageId, setSelectedStageId] = useState('');
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [selectedWorkType, setSelectedWorkType] = useState('task');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ kind: 'delete' } | { kind: 'deleteAttachment'; attachmentId: string } | null>(null);
  const [searchParams] = useSearchParams();

  // Activity Composer State
  const [activityType, setActivityType] = useState('note');
  const [activityNote, setActivityNote] = useState('');
  const [activityRecordingUrl, setActivityRecordingUrl] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpTime, setFollowUpTime] = useState('10:00');
  const [timelineSearch, setTimelineSearch] = useState('');
  const [timelineFilter, setTimelineFilter] = useState('all');
  const [submittingActivity, setSubmittingActivity] = useState(false);
  const [showQuickPrompt, setShowQuickPrompt] = useState(false);
  const [stagePromptData, setStagePromptData] = useState<{
    targetStageId?: string;
    targetStageName?: string;
    currentStageName?: string;
    isTerminalStage?: boolean;
  } | null>(null);

  // Work search & filter
  const [workSearch, setWorkSearch] = useState('');
  const [workFilter, setWorkFilter] = useState('all');

  // Attachment State
  const [uploadCategory, setUploadCategory] = useState('proposal');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [workTypeOptions, setWorkTypeOptions] = useState<{ key: string; name: string }[]>([]);

  async function load(customerId: string) {
    try {
      setLoading(true);
      setError('');
      const result = await customersApi.get(customerId);
      setDetail(result);
      setSelectedStageId(result.data.stage?._id || '');
      setSelectedOwnerId(result.data.assignedTo?._id || '');
      try {
        const center = await workApi.getCenter();
        const options = (center.workTypes || []).map(wt => ({ key: wt.key, name: wt.name }));
        setWorkTypeOptions(options);
        if (options.length && !options.some(opt => opt.key === selectedWorkType)) {
          setSelectedWorkType(options[0].key);
        }
      } catch { /* fall back to default modules */ }
      setForm({
        name: result.data.name,
        company: result.data.company,
        email: result.data.email,
        phone: result.data.phone,
        source: result.data.source,
        value: result.data.value,
        priority: result.data.priority,
        stage: result.data.stage?._id,
        labels: result.data.labels.map(label => label._id),
        assignedTo: result.data.assignedTo?._id || '',
        campaign: result.data.campaign?._id || '',
        notes: result.data.notes,
        customData: result.data.customData,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Failed to load ${crmTerms.leadSingular.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) void load(id);
  }, [id]);

  async function save() {
    if (!id || !form.name?.trim()) return setError('Name is required.');
    try {
      setSaving(true);
      setError('');
      await customersApi.update(id, form);
      setEditing(false);
      setSuccess('Record updated successfully.');
      await load(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  function handleUpdateStage() {
    if (!id || !selectedStageId || !detail?.data) return;
    if (selectedStageId === detail.data.stage?._id) return;
    const targetStage = detail.stages.find(s => s._id === selectedStageId);
    const isTerminal = Boolean(targetStage?.isWon || /closed|won|lost|deal done|dead/i.test(targetStage?.name || ''));

    setStagePromptData({
      targetStageId: selectedStageId,
      targetStageName: targetStage?.name || 'New Stage',
      currentStageName: detail.data.stage?.name || 'Current Stage',
      isTerminalStage: isTerminal
    });
    setShowQuickPrompt(true);
  }

  async function handleUpdateOwner() {
    if (!id) return;
    try {
      setError('');
      await customersApi.transferLead(id, selectedOwnerId || null);
      setSuccess('Owner updated successfully.');
      await load(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to update owner');
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
      const isClient = searchParams.get('from') === 'clients' || Boolean(detail?.data.stage?.isWon);
      navigate(isClient ? '/clients' : '/customers');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Delete failed');
    }
  }

  async function handleLogActivity(e?: React.FormEvent) {
    if (e) e.preventDefault();
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
        callRecordingUrl: activityRecordingUrl.trim(),
      });
      setActivityNote('');
      setActivityRecordingUrl('');
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
    if (!id || uploadFiles.length === 0) {
      setError('Please select a file to upload.');
      return;
    }
    try {
      setUploading(true);
      setError('');
      let uploadedCount = 0;
      let skipped = 0;
      for (const file of uploadFiles) {
        if (file.size > 5 * 1024 * 1024) {
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
      setUploadFiles([]);
      setUploadNotes('');
      if (uploadedCount > 0) {
        setSuccess(skipped > 0 ? `${uploadedCount} file(s) uploaded. ${skipped} skipped (5 MB limit).` : `${uploadedCount} file(s) uploaded successfully.`);
        await load(id);
      } else {
        setError(skipped > 0 ? 'None uploaded. Files must be 5 MB or smaller.' : 'Upload failed.');
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
    const isDriveFile = attachments.find(item => item._id === attachmentId)?.storageProvider === 'google_drive';
    setConfirmAction(null);
    try {
      setError('');
      await customersApi.deleteAttachment(id, attachmentId);
      setSuccess(isDriveFile ? 'Attachment removed from CRM. The file remains in Drive.' : 'Attachment deleted.');
      await load(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to delete attachment');
    }
  }

  if (loading && !detail) return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>;
  if (error && !detail) return <div className="notice danger" style={{ margin: '1.5rem' }}>{error}</div>;
  if (!detail) return <div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>Record not found.</div>;

  const { data: customer, activities, attachments, relatedWork, fileStorage, stages, labels, users, campaigns, fields } = detail;
  const initials = customer.name.trim().charAt(0).toUpperCase() || 'C';
  const avatarPalette = getAvatarColor(customer.name);
  const stageColor = customer.stage?.color || '#b58d00';
  const isClientProfile = searchParams.get('from') === 'clients' || location.pathname.startsWith('/clients') || Boolean(customer.stage?.isWon);
  const relationshipName = isClientProfile ? crmTerms.recordSingular : crmTerms.leadSingular;
  const relationshipPlural = isClientProfile ? crmTerms.recordPlural : crmTerms.leadPlural;
  const listPath = isClientProfile ? '/clients' : '/customers';

  const workTypeChoices = workTypeOptions.length
    ? workTypeOptions
    : [
        { key: 'task', name: 'Task' },
        { key: 'video', name: 'Video' },
        { key: 'design', name: 'Design' },
        { key: 'website', name: 'Website' },
        { key: 'content', name: 'Content' },
      ];

  const completedWork = relatedWork.filter(w => /completed|done|won|delivered/i.test(w.status)).length;
  const activeWork = relatedWork.length - completedWork;
  const meetingsCount = activities.filter(a => MEETING_TYPES.includes(a.type)).length;
  const isManager = user && ['admin', 'manager'].includes(user.role);

  // Filter activities
  const filteredActivities = activities.filter(a => {
    if (timelineFilter !== 'all') {
      if (timelineFilter === 'marker-note' && a.type !== 'note') return false;
      if (timelineFilter === 'marker-call' && a.type !== 'call') return false;
      if (timelineFilter === 'marker-email' && a.type !== 'email') return false;
      if (timelineFilter === 'marker-whatsapp' && a.type !== 'whatsapp') return false;
      if (timelineFilter === 'marker-meeting' && !MEETING_TYPES.includes(a.type)) return false;
      if (timelineFilter === 'marker-task' && a.type !== 'task') return false;
      if (timelineFilter === 'marker-stage' && a.type !== 'stage_changed') return false;
      if (timelineFilter === 'marker-label' && a.type !== 'label_changed') return false;
      if (timelineFilter === 'marker-work' && (a as any).timelineType !== 'work') return false;
    }
    if (timelineSearch.trim()) {
      const q = timelineSearch.toLowerCase();
      return (a.note || '').toLowerCase().includes(q) || (a.user?.name || '').toLowerCase().includes(q);
    }
    return true;
  });

  // Filter work items
  const filteredWorkItems = relatedWork.filter(item => {
    const isCompleted = /completed|done|won|delivered/i.test(item.status);
    if (workFilter === 'active' && isCompleted) return false;
    if (workFilter === 'completed' && !isCompleted) return false;
    if (workSearch.trim()) {
      const q = workSearch.toLowerCase();
      return (item.title || '').toLowerCase().includes(q) || (item.module?.name || '').toLowerCase().includes(q);
    }
    return true;
  });

  const leadCourse = customer.campaign ? customer.campaign.name : (customer.customData && (customer.customData as any).specialization_course) || '';

  return (
    <div className={`lead-record-ui lead-detail-container ${isClientProfile ? 'is-client-profile' : ''}`}>
      {/* Navigation Breadcrumbs */}
      <div className="breadcrumbs lead-breadcrumbs" style={{ display: 'flex', gap: '0.45rem', fontSize: '0.76rem', color: 'var(--muted)', marginBottom: '12px', paddingLeft: '4px' }}>
        <Link to={listPath} style={{ color: 'var(--muted)', textDecoration: 'none' }}>{relationshipPlural}</Link>
        <span>/</span>
        {(customer as any).clientCompany && (
          <>
            <Link to={`/companies/${(customer as any).clientCompany._id}`} style={{ color: 'var(--muted)', textDecoration: 'none' }}>
              {(customer as any).clientCompany.name}
            </Link>
            <span>/</span>
          </>
        )}
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{customer.name}</span>
      </div>

      {/* Header Card */}
      <section className="page-head lead-detail-head">
        <div className="lead-header-main-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem' }}>
          <div className="lead-identity" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span
              className="lead-avatar"
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                fontSize: '1.25rem',
                fontWeight: 800,
                background: avatarPalette.bg,
                color: avatarPalette.color,
                border: '1px solid var(--border)',
                flexShrink: 0
              }}
            >
              {initials}
            </span>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)' }}>{customer.name}</h1>
              {!isClientProfile && (
                <div className="lead-header-labels" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                  <span className="stage-badge" style={{ ['--stage' as any]: stageColor, fontSize: '0.72rem', padding: '2px 8px', borderRadius: '999px', background: 'var(--panel-muted)' }}>{customer.stage?.name}</span>
                  {labels.filter(label => (form.labels || []).includes(label._id)).map(label => (
                    <span className="pill" key={label._id} style={{ ['--pill' as any]: label.color, fontSize: '0.72rem' }}>{label.name}</span>
                  ))}
                </div>
              )}
              <p className="page-subtitle" style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
                {isClientProfile
                  ? 'Conversations, work, files, and next steps in one place.'
                  : `${leadCourse || customer.company || customer.source || 'Direct'} · ${customer.email || customer.phone || 'No contact details'}`}
              </p>
            </div>
          </div>
          <div className="actions lead-header-primary-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setTab('activity');
                setTimeout(() => document.getElementById('activityNoteArea')?.focus(), 50);
              }}
            >
              {isClientProfile ? 'Add update' : 'Log activity'}
            </button>
            {customer.email && (
              <Link className="btn" to={`/mail?customer=${customer._id}`}>
                Send email
              </Link>
            )}
            <details className="more-actions" style={{ position: 'relative' }}>
              <summary className="btn" style={{ listStyle: 'none', cursor: 'pointer' }}>More</summary>
              <div
                className="more-actions-menu"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: '6px',
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '6px',
                  minWidth: '150px',
                  zIndex: 20,
                  boxShadow: 'var(--shadow-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
              >
                <button
                  type="button"
                  className="btn"
                  style={{ width: '100%', justifyContent: 'flex-start', border: 'none', background: 'transparent', padding: '6px 10px', fontSize: '0.78rem' }}
                  onClick={() => setEditing(v => !v)}
                >
                  {editing ? 'Cancel edit' : `Edit ${relationshipName.toLowerCase()}`}
                </button>
                {isManager && (
                  <button
                    type="button"
                    className="btn danger"
                    style={{ width: '100%', justifyContent: 'flex-start', border: 'none', background: 'transparent', padding: '6px 10px', fontSize: '0.78rem', color: 'var(--red)' }}
                    onClick={() => void remove()}
                  >
                    Delete {relationshipName.toLowerCase()}
                  </button>
                )}
              </div>
            </details>
          </div>
        </div>

        {!isClientProfile && (
          <div className="lead-contact-actions">
            <div className="lead-quick-action-buttons">
              {customer.phone && (
                <>
                  <a className="btn small" href={`tel:${customer.phone.replace(/[^+\d]/g, '')}`} style={{ fontSize: '0.76rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Icon name="phone" size={13} /> Call
                  </a>
                  <a className="btn small" href={`https://wa.me/${customer.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.76rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Icon name="message-circle" size={13} /> WhatsApp
                  </a>
                </>
              )}
              <button className="btn small" onClick={() => setEditing(v => !v)} style={{ fontSize: '0.76rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Icon name="tags" size={13} /> Edit details
              </button>
            </div>
            <div className="lead-header-metrics">
              <div className="lead-metric-item">
                <small style={{ display: 'block', fontSize: '0.68rem', color: 'var(--muted)' }}>Total value</small>
                <strong style={{ fontSize: '0.85rem' }}>₹{(customer.value || 0).toLocaleString('en-IN')}</strong>
              </div>
              <div className="lead-metric-item">
                <small style={{ display: 'block', fontSize: '0.68rem', color: 'var(--muted)' }}>Owner</small>
                <strong style={{ fontSize: '0.85rem' }}>{customer.assignedTo?.name || 'Unassigned'}</strong>
              </div>
              <div className="lead-metric-item">
                <small style={{ display: 'block', fontSize: '0.68rem', color: 'var(--muted)' }}>Next follow-up</small>
                <strong style={{ fontSize: '0.85rem' }}>{customer.nextFollowUpAt ? new Date(customer.nextFollowUpAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not scheduled'}</strong>
              </div>
            </div>
          </div>
        )}

        {/* Prominent Latest Call Summary & Conversation Notes */}
        {customer.notes && (
          <div className="lead-call-summary-banner">
            <div className="lead-call-summary-header">
              <div className="lead-call-summary-title">
                <span className="lead-call-summary-icon" style={{ color: 'var(--gold)', display: 'grid', placeItems: 'center' }}>
                  <Icon name="message-square" size={16} />
                </span>
                <strong>
                  Latest Call Summary & Conversation Notes
                </strong>
              </div>
              <button type="button" className="btn small lead-call-summary-btn" onClick={() => setEditing(true)}>
                Edit summary
              </button>
            </div>
            <p className="lead-call-summary-text">
              {customer.notes}
            </p>
          </div>
        )}

        {/* Tab Navigation */}
        {isClientProfile ? (
          <nav className="client-profile-nav" aria-label="Client profile sections" style={{ display: 'flex', gap: '2rem', marginTop: '1.75rem', marginBottom: 0, padding: 0, background: 'transparent' }}>
            <button
              type="button"
              className={tab === 'overview' ? 'active' : ''}
              onClick={() => setTab('overview')}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '0.5rem 0 0.85rem 0',
                color: tab === 'overview' ? 'var(--gold)' : 'var(--sub)',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                position: 'relative',
                borderBottom: tab === 'overview' ? '2px solid var(--gold)' : '2px solid transparent'
              }}
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
              Overview
            </button>
            <button
              type="button"
              className={tab === 'work' ? 'active' : ''}
              onClick={() => setTab('work')}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '0.5rem 0 0.85rem 0',
                color: tab === 'work' ? 'var(--gold)' : 'var(--sub)',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                position: 'relative',
                borderBottom: tab === 'work' ? '2px solid var(--gold)' : '2px solid transparent'
              }}
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
              Work
            </button>
            <button
              type="button"
              className={tab === 'activity' ? 'active' : ''}
              onClick={() => setTab('activity')}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '0.5rem 0 0.85rem 0',
                color: tab === 'activity' ? 'var(--gold)' : 'var(--sub)',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                position: 'relative',
                borderBottom: tab === 'activity' ? '2px solid var(--gold)' : '2px solid transparent'
              }}
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              History
            </button>
            <button
              type="button"
              className={tab === 'files' ? 'active' : ''}
              onClick={() => setTab('files')}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '0.5rem 0 0.85rem 0',
                color: tab === 'files' ? 'var(--gold)' : 'var(--sub)',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                position: 'relative',
                borderBottom: tab === 'files' ? '2px solid var(--gold)' : '2px solid transparent'
              }}
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              Files
            </button>
          </nav>
        ) : (
          <nav className="lead-section-nav" aria-label="Lead sections" style={{ display: 'flex', gap: '24px', overflowX: 'auto', borderTop: '1px solid var(--border)' }}>
            {(['overview', 'activity', 'work', 'files', 'details'] as Tab[]).map(t => (
              <button
                type="button"
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '15px 0',
                  whiteSpace: 'nowrap',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  color: tab === t ? 'var(--gold)' : 'var(--sub)',
                  borderBottom: tab === t ? '2px solid var(--gold)' : '2px solid transparent'
                }}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </nav>
        )}
      </section>

      {error && <div className="notice danger" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="notice success" style={{ marginBottom: '1rem' }}>{success}</div>}

      {/* Grid Layout: Main column + Right Settings Sidebar */}
      <div className="lead-profile-grid">
        {/* Left Column */}
        <div className="lead-main-column">
          {editing ? (
            <article className="profile-panel lead-overview-card">
              <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 800 }}>Edit {relationshipName}</h2>
              <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700 }}>
                  Name *
                  <input required value={form.name || ''} onChange={e => setForm(c => ({ ...c, name: e.target.value }))} style={{ width: '100%', marginTop: '4px' }} />
                </label>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700 }}>
                  Company / Brand
                  <input value={form.company || ''} onChange={e => setForm(c => ({ ...c, company: e.target.value }))} style={{ width: '100%', marginTop: '4px' }} />
                </label>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700 }}>
                  Phone
                  <input value={form.phone || ''} onChange={e => setForm(c => ({ ...c, phone: e.target.value }))} style={{ width: '100%', marginTop: '4px' }} />
                </label>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700 }}>
                  Email
                  <input type="email" value={form.email || ''} onChange={e => setForm(c => ({ ...c, email: e.target.value }))} style={{ width: '100%', marginTop: '4px' }} />
                </label>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700 }}>
                  Source
                  <input value={form.source || ''} onChange={e => setForm(c => ({ ...c, source: e.target.value }))} style={{ width: '100%', marginTop: '4px' }} />
                </label>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700 }}>
                  Value
                  <input type="number" min="0" value={form.value || 0} onChange={e => setForm(c => ({ ...c, value: Number(e.target.value) || 0 }))} style={{ width: '100%', marginTop: '4px' }} />
                </label>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700 }}>
                  Priority
                  <div style={{ marginTop: '4px' }}>
                    <CustomSelect
                      value={form.priority || 'medium'}
                      onChange={val => setForm(c => ({ ...c, priority: val as CustomerInput['priority'] }))}
                      options={[
                        { value: 'low', label: 'Low' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'high', label: 'High' },
                      ]}
                    />
                  </div>
                </label>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700 }}>
                  Stage
                  <div style={{ marginTop: '4px' }}>
                    <CustomSelect
                      value={form.stage || ''}
                      onChange={val => setForm(c => ({ ...c, stage: val }))}
                      options={stages.filter(s => s.isActive || s._id === customer.stage?._id).map(s => ({ value: s._id, label: s.name }))}
                    />
                  </div>
                </label>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700 }}>
                  Campaign
                  <div style={{ marginTop: '4px' }}>
                    <CustomSelect
                      value={form.campaign || ''}
                      onChange={val => setForm(c => ({ ...c, campaign: val }))}
                      placeholder="No campaign"
                      options={[
                        { value: '', label: 'No campaign' },
                        ...campaigns.map(c => ({ value: c._id, label: c.name }))
                      ]}
                    />
                  </div>
                </label>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700 }}>
                  Assigned owner
                  <div style={{ marginTop: '4px' }}>
                    <CustomSelect
                      value={form.assignedTo || ''}
                      onChange={val => setForm(c => ({ ...c, assignedTo: val }))}
                      placeholder="Unassigned"
                      options={[
                        { value: '', label: 'Unassigned' },
                        ...users.map(u => ({ value: u._id, label: u.name }))
                      ]}
                    />
                  </div>
                </label>
              </div>
              {labels.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Labels</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {labels.map(l => (
                      <label key={l._id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer', background: 'var(--panel-muted)', padding: '4px 10px', borderRadius: '6px' }}>
                        <input
                          type="checkbox"
                          checked={(form.labels || []).includes(l._id)}
                          onChange={() => setForm(c => ({
                            ...c,
                            labels: (c.labels || []).includes(l._id) ? (c.labels || []).filter(id => id !== l._id) : [...(c.labels || []), l._id]
                          }))}
                        />
                        {l.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginTop: '1rem' }}>
                Internal notes
                <textarea rows={4} value={form.notes || ''} onChange={e => setForm(c => ({ ...c, notes: e.target.value }))} style={{ width: '100%', marginTop: '4px' }} />
              </label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '1.25rem' }}>
                <button type="button" className="btn primary" disabled={saving} onClick={() => void save()}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <button type="button" className="btn" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </article>
          ) : (
            <>
              {/* Overview Tab */}
              {tab === 'overview' && (
                <article className="profile-panel lead-overview-card" style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px 32px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.02), 0 1px 2px rgba(0, 0, 0, 0.03)' }}>
                  <div className="profile-summary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <strong style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)' }}>
                      {isClientProfile ? 'Relationship overview' : `Rs. ${(customer.value || 0).toLocaleString('en-IN')}`}
                    </strong>
                    <span className="stage-badge" style={{ ['--stage' as any]: stageColor, fontSize: '0.72rem', padding: '4px 10px', borderRadius: '999px', fontWeight: 700 }}>
                      {customer.stage?.name}
                    </span>
                  </div>

                  {isClientProfile && (
                    <div className="client-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px', margin: '1.25rem 0' }}>
                      <div
                        onClick={() => setTab('work')}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--panel-muted)', cursor: 'pointer' }}
                      >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--sub)" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                        <div className="metric-value" style={{ display: 'flex', flexDirection: 'column-reverse', gap: '0.1rem' }}>
                          <small style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 650 }}>Work items</small>
                          <strong style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1.1 }}>{relatedWork.length}</strong>
                        </div>
                      </div>
                      <div
                        onClick={() => setTab('work')}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--panel-muted)', cursor: 'pointer' }}
                      >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#10b981" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        <div className="metric-value" style={{ display: 'flex', flexDirection: 'column-reverse', gap: '0.1rem' }}>
                          <small style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 650 }}>Completed</small>
                          <strong style={{ fontSize: '1.15rem', fontWeight: 800, color: '#10b981', margin: 0, lineHeight: 1.1 }}>{completedWork}</strong>
                        </div>
                      </div>
                      <div
                        onClick={() => setTab('work')}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--panel-muted)', cursor: 'pointer' }}
                      >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#3b82f6" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        <div className="metric-value" style={{ display: 'flex', flexDirection: 'column-reverse', gap: '0.1rem' }}>
                          <small style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 650 }}>In progress</small>
                          <strong style={{ fontSize: '1.15rem', fontWeight: 800, color: '#3b82f6', margin: 0, lineHeight: 1.1 }}>{activeWork}</strong>
                        </div>
                      </div>
                      <div
                        onClick={() => setTab('activity')}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--panel-muted)', cursor: 'pointer' }}
                      >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#8b5cf6" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        <div className="metric-value" style={{ display: 'flex', flexDirection: 'column-reverse', gap: '0.1rem' }}>
                          <small style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 650 }}>Meetings</small>
                          <strong style={{ fontSize: '1.15rem', fontWeight: 800, color: '#8b5cf6', margin: 0, lineHeight: 1.1 }}>{meetingsCount}</strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Fact Grid */}
                  <div className="lead-facts" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px 18px', marginTop: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel-muted)', minHeight: '52px' }}>
                      <span className="fact-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', background: 'var(--panel)', border: '1px solid var(--border-strong)', color: 'var(--muted)', flexShrink: 0 }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      </span>
                      <div className="fact-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', flex: 1, minWidth: 0 }}>
                        <small style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 650 }}>Phone</small>
                        <strong style={{ fontSize: '0.85rem', color: 'var(--text)', wordBreak: 'break-all' }}>{customer.phone || 'Not set'}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel-muted)', minHeight: '52px' }}>
                      <span className="fact-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', background: 'var(--panel)', border: '1px solid var(--border-strong)', color: 'var(--muted)', flexShrink: 0 }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="m22 6-10 7L2 6"/></svg>
                      </span>
                      <div className="fact-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', flex: 1, minWidth: 0 }}>
                        <small style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 650 }}>Email</small>
                        <strong style={{ fontSize: '0.85rem', color: 'var(--text)', wordBreak: 'break-all' }}>{customer.email || 'Not set'}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel-muted)', minHeight: '52px' }}>
                      <span className="fact-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', background: 'var(--panel)', border: '1px solid var(--border-strong)', color: 'var(--muted)', flexShrink: 0 }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 12h4M10 8h4M14 21v-3a2 2 0 0 0-4 0v3M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/></svg>
                      </span>
                      <div className="fact-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', flex: 1, minWidth: 0 }}>
                        <small style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 650 }}>Organisation</small>
                        <strong style={{ fontSize: '0.85rem', color: 'var(--text)', wordBreak: 'break-all' }}>{customer.company || 'Not set'}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel-muted)', minHeight: '52px' }}>
                      <span className="fact-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', background: 'var(--panel)', border: '1px solid var(--border-strong)', color: 'var(--muted)', flexShrink: 0 }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                      </span>
                      <div className="fact-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', flex: 1, minWidth: 0 }}>
                        <small style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 650 }}>{isClientProfile ? 'How they came to you' : 'Source / campaign'}</small>
                        <strong style={{ fontSize: '0.85rem', color: 'var(--text)', wordBreak: 'break-all' }}>{leadCourse || customer.source || 'Not recorded'}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel-muted)', minHeight: '52px' }}>
                      <span className="fact-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', background: 'var(--panel)', border: '1px solid var(--border-strong)', color: 'var(--muted)', flexShrink: 0 }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      </span>
                      <div className="fact-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', flex: 1, minWidth: 0 }}>
                        <small style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 650 }}>Owner</small>
                        <strong style={{ fontSize: '0.85rem', color: 'var(--text)', wordBreak: 'break-all' }}>{customer.assignedTo ? customer.assignedTo.name : 'Unassigned'}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel-muted)', minHeight: '52px' }}>
                      <span className="fact-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', background: 'var(--panel)', border: '1px solid var(--border-strong)', color: 'var(--muted)', flexShrink: 0 }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>
                      </span>
                      <div className="fact-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', flex: 1, minWidth: 0 }}>
                        <small style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 650 }}>{isClientProfile ? 'Next planned contact' : 'Next follow-up'}</small>
                        <strong style={{ fontSize: '0.85rem', color: 'var(--text)', wordBreak: 'break-all' }}>
                          {customer.nextFollowUpAt ? new Date(customer.nextFollowUpAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not scheduled'}
                        </strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel-muted)', minHeight: '52px' }}>
                      <span className="fact-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', background: 'var(--panel)', border: '1px solid var(--border-strong)', color: 'var(--muted)', flexShrink: 0 }}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                      </span>
                      <div className="fact-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', flex: 1, minWidth: 0 }}>
                        <small style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 650 }}>Last contact</small>
                        <strong style={{ fontSize: '0.85rem', color: 'var(--text)', wordBreak: 'break-all' }}>
                          {customer.lastContactedAt ? new Date(customer.lastContactedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'No interaction yet'}
                        </strong>
                      </div>
                    </div>

                    {!isClientProfile && customer.labels && customer.labels.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel-muted)', minHeight: '52px' }}>
                        <span className="fact-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', background: 'var(--panel)', border: '1px solid var(--border-strong)', color: 'var(--muted)', flexShrink: 0 }}>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                        </span>
                        <div className="fact-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', flex: 1, minWidth: 0 }}>
                          <small style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 650 }}>Labels / qualification</small>
                          <strong style={{ fontSize: '0.85rem', color: 'var(--text)', wordBreak: 'break-all' }}>{customer.labels.map(l => l.name).join(' · ')}</strong>
                        </div>
                      </div>
                    )}

                    {fields.map(field => {
                      const val = customer.customData?.[field.key];
                      if (val == null || val === '') return null;
                      return (
                        <div key={field._id} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel-muted)', minHeight: '52px' }}>
                          <span className="fact-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', background: 'var(--panel)', border: '1px solid var(--border-strong)', color: 'var(--muted)', flexShrink: 0 }}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
                          </span>
                          <div className="fact-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', flex: 1, minWidth: 0 }}>
                            <small style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 650 }}>{field.label}</small>
                            <strong style={{ fontSize: '0.85rem', color: 'var(--text)', wordBreak: 'break-all' }}>{formatWorkValue(val, field)}</strong>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {customer.labels && customer.labels.length > 0 && (
                    <div className="label-row" style={{ marginTop: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {customer.labels.map(label => (
                        <span key={label._id} className="pill" style={{ ['--pill' as any]: label.color, fontSize: '0.72rem' }}>{label.name}</span>
                      ))}
                    </div>
                  )}

                  {customer.notes && (
                    <p className="notes lead-notes" style={{ marginTop: '1.25rem', background: 'var(--panel-muted)', padding: '0.85rem 1rem', borderRadius: '8px', fontSize: '0.82rem', color: 'var(--text)' }}>
                      {customer.notes}
                    </p>
                  )}
                </article>
              )}

              {/* Work Tab */}
              {tab === 'work' && (
                <>
                  <article className="profile-panel lead-overview-card" style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px 32px' }}>
                    <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.1rem', fontWeight: 800 }}>{isClientProfile ? 'Work for this client' : 'Related work'}</h2>
                    <p className="muted-small" style={{ margin: '0 0 1rem', fontSize: '0.76rem', color: 'var(--muted)' }}>
                      {isClientProfile ? 'See what is in progress and what has been completed.' : `Every record from any custom work module linked to this ${relationshipName.toLowerCase()} appears here.`}
                    </p>

                    <div className="work-filters-bar" style={{ display: 'flex', gap: '0.5rem', margin: '0.75rem 0 1.25rem 0', flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Search work items..."
                        value={workSearch}
                        onChange={e => setWorkSearch(e.target.value)}
                        style={{ flex: 1, minWidth: '140px', height: '36px', fontSize: '0.76rem', padding: '0 0.75rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }}
                      />
                      <CustomSelect
                        value={workFilter}
                        onChange={val => setWorkFilter(val)}
                        options={[
                          { value: 'all', label: 'All statuses' },
                          { value: 'active', label: 'Active' },
                          { value: 'completed', label: 'Completed' },
                        ]}
                        style={{ width: '140px' }}
                      />
                    </div>

                    {filteredWorkItems.length === 0 ? (
                      <p className="empty" style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)', fontSize: '0.82rem' }}>No related work found.</p>
                    ) : (
                      <div className="attachment-list work-lifecycle-list client-profile-work-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {filteredWorkItems.map(item => (
                          <article
                            key={item._id}
                            className="work-lifecycle-card client-profile-work-card"
                            style={{
                              borderLeft: '4px solid var(--gold)',
                              padding: '1rem',
                              borderRadius: '10px',
                              background: 'var(--panel-muted)',
                              border: '1px solid var(--border)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '1rem'
                            }}
                          >
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Link to={`/work/${item.module?.key || 'task'}/${item._id}`} style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)' }}>
                                  {item.title}
                                </Link>
                                <span className="meta-tag" style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--sub)' }}>
                                  {item.module?.name || 'Work'}
                                </span>
                                <span className="meta-tag" style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', background: 'var(--panel)', border: '1px solid var(--border)', color: /completed|done|won/i.test(item.status) ? '#10b981' : '#3b82f6', fontWeight: 700 }}>
                                  {item.status}
                                </span>
                              </div>
                              {item.deadline && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '4px' }}>
                                  Due {new Date(item.deadline).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                </div>
                              )}
                            </div>
                            <Link className="btn small" to={`/work/${item.module?.key || 'task'}/${item._id}`} style={{ fontSize: '0.74rem', padding: '4px 10px' }}>
                              Open task
                            </Link>
                          </article>
                        ))}
                      </div>
                    )}
                  </article>

                  <article className="profile-panel lead-overview-card" style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px 32px' }}>
                    <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.1rem', fontWeight: 800 }}>{isClientProfile ? 'Add work' : 'Create related work'}</h2>
                    <p className="muted-small" style={{ margin: '0 0 1rem', fontSize: '0.76rem', color: 'var(--muted)' }}>Create a record in any module and keep it attached to this {relationshipName.toLowerCase()}.</p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <CustomSelect
                        value={selectedWorkType}
                        onChange={val => setSelectedWorkType(val)}
                        options={workTypeChoices.map(choice => ({ value: choice.key, label: choice.name }))}
                        style={{ minWidth: '180px' }}
                      />
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() => {
                          navigate(`/work/${selectedWorkType}?prefill_customer=${customer._id}&prefill_title=${encodeURIComponent(customer.name + ' - ' + selectedWorkType)}`);
                        }}
                      >
                        Open new work form
                      </button>
                    </div>
                  </article>
                </>
              )}

              {/* History / Activity Tab */}
              {tab === 'activity' && (
                <>
                  <article className="profile-panel lead-overview-card" style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px 32px' }}>
                    <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 800 }}>{isClientProfile ? 'Add an update' : 'Activity timeline'}</h2>
                    <form id="activityForm" onSubmit={handleLogActivity}>
                      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', overflowX: 'auto' }}>
                        {[
                          { key: 'note', label: 'Note' },
                          { key: 'call', label: 'Call' },
                          { key: 'email', label: 'Email' },
                          { key: 'whatsapp', label: 'WhatsApp' },
                          { key: 'meeting_client', label: 'Client Meeting' },
                          { key: 'meeting_internal', label: 'Team Meeting' },
                          { key: 'task', label: 'Task' },
                        ].map(type => (
                          <button
                            key={type.key}
                            type="button"
                            onClick={() => setActivityType(type.key)}
                            style={{
                              background: activityType === type.key ? 'var(--hover)' : 'transparent',
                              color: activityType === type.key ? 'var(--gold)' : 'var(--sub)',
                              border: 'none',
                              padding: '0.45rem 0.85rem',
                              borderRadius: '6px',
                              fontSize: '0.76rem',
                              fontWeight: 800,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {type.label}
                          </button>
                        ))}
                      </div>

                      <textarea
                        id="activityNoteArea"
                        rows={4}
                        placeholder={
                          activityType === 'call' ? 'Log call outcome details...' :
                          activityType === 'email' ? 'Record email communication details...' :
                          activityType === 'whatsapp' ? 'Log WhatsApp message summary...' :
                          MEETING_TYPES.includes(activityType) ? 'Summarize meeting discussions and items...' :
                          activityType === 'task' ? 'Assign a task/to-do item...' : 'Write a note...'
                        }
                        value={activityNote}
                        onChange={e => setActivityNote(e.target.value)}
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)', fontSize: '0.82rem', marginBottom: '1rem' }}
                        required
                      />

                      {(activityType === 'call' || MEETING_TYPES.includes(activityType)) && (
                        <div style={{ marginBottom: '1rem' }}>
                          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--sub)', marginBottom: '0.35rem' }}>
                            {activityType === 'call' ? 'Call recording link (optional)' : 'Meeting / recording link (optional)'}
                          </label>
                          <input
                            type="url"
                            placeholder="https://meet.google.com/... or recording URL"
                            value={activityRecordingUrl}
                            onChange={e => setActivityRecordingUrl(e.target.value)}
                            style={{ width: '100%', padding: '0.65rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)', fontSize: '0.82rem' }}
                          />
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '160px' }}>
                          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--sub)', marginBottom: '0.35rem' }}>
                            {isClientProfile ? 'Next planned contact' : 'Next Follow-up Date'}
                          </label>
                          <DatePicker
                            value={followUpDate}
                            onChange={val => setFollowUpDate(val)}
                            style={{ width: '100%', height: '38px' }}
                          />
                        </div>
                        <div style={{ width: '140px' }}>
                          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--sub)', marginBottom: '0.35rem' }}>Time</label>
                          <CustomSelect
                            value={followUpTime}
                            onChange={val => setFollowUpTime(val)}
                            options={[
                              { value: '09:00', label: '09:00 AM' },
                              { value: '10:00', label: '10:00 AM' },
                              { value: '11:00', label: '11:00 AM' },
                              { value: '12:00', label: '12:00 PM' },
                              { value: '14:00', label: '02:00 PM' },
                              { value: '15:00', label: '03:00 PM' },
                              { value: '16:00', label: '04:00 PM' },
                              { value: '17:00', label: '05:00 PM' },
                              { value: '18:00', label: '06:00 PM' },
                            ]}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Quick reschedule:</span>
                          <button type="button" className="btn small" style={{ fontSize: '0.72rem', padding: '2px 8px' }} onClick={() => void handleQuickFollowUp(1)}>+1 Day</button>
                          <button type="button" className="btn small" style={{ fontSize: '0.72rem', padding: '2px 8px' }} onClick={() => void handleQuickFollowUp(3)}>+3 Days</button>
                          <button type="button" className="btn small" style={{ fontSize: '0.72rem', padding: '2px 8px' }} onClick={() => void handleQuickFollowUp(7)}>+1 Week</button>
                        </div>
                        <button className="btn primary" type="submit" disabled={submittingActivity || !activityNote.trim()}>
                          {submittingActivity ? 'Saving…' : 'Save Activity'}
                        </button>
                      </div>
                    </form>
                  </article>

                  <article className="profile-panel lead-overview-card" style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px 32px' }}>
                    <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 800 }}>{isClientProfile ? 'All history' : 'History timeline'}</h2>
                    <div className="timeline-filters-bar" style={{ display: 'flex', gap: '0.5rem', margin: '0.75rem 0 1rem 0', flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Search history..."
                        value={timelineSearch}
                        onChange={e => setTimelineSearch(e.target.value)}
                        style={{ flex: 1, minWidth: '140px', height: '36px', fontSize: '0.76rem', padding: '0 0.75rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }}
                      />
                      <CustomSelect
                        value={timelineFilter}
                        onChange={val => setTimelineFilter(val)}
                        options={[
                          { value: 'all', label: 'All types' },
                          { value: 'marker-note', label: 'Notes' },
                          { value: 'marker-work', label: 'Work updates' },
                          { value: 'marker-call', label: 'Calls' },
                          { value: 'marker-email', label: 'Emails' },
                          { value: 'marker-meeting', label: 'Meetings' },
                          { value: 'marker-whatsapp', label: 'WhatsApp' },
                          { value: 'marker-task', label: 'Tasks' },
                          { value: 'marker-stage', label: 'Stage changes' },
                          { value: 'marker-label', label: 'Label changes' },
                        ]}
                        style={{ width: '140px' }}
                      />
                    </div>

                    <div className="timeline" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {filteredActivities.length === 0 ? (
                        <p className="empty" style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)', fontSize: '0.82rem' }}>No history yet.</p>
                      ) : (
                        filteredActivities.map(act => {
                          const markerClass = act.type === 'call' ? 'marker-call' :
                            act.type === 'email' ? 'marker-email' :
                            MEETING_TYPES.includes(act.type) ? 'marker-meeting' :
                            act.type === 'whatsapp' ? 'marker-whatsapp' :
                            act.type === 'task' ? 'marker-task' :
                            act.type === 'stage_changed' ? 'marker-stage' :
                            act.type === 'label_changed' ? 'marker-label' : 'marker-note';

                          return (
                            <div key={act._id} className="timeline-item" style={{ display: 'flex', gap: '12px', padding: '12px 14px', borderRadius: '8px', background: 'var(--panel-muted)', border: '1px solid var(--border)' }}>
                              <div className={`timeline-marker ${markerClass}`} style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: '0.72rem', fontWeight: 800 }}>
                                {act.type === 'call' ? '📞' : act.type === 'email' ? '✉️' : MEETING_TYPES.includes(act.type) ? '📅' : act.type === 'whatsapp' ? '💬' : act.type === 'task' ? '✓' : '📝'}
                              </div>
                              <div className="timeline-content" style={{ flex: 1, minWidth: 0 }}>
                                <div className="timeline-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)' }}>
                                    {(ACTIVITY_TYPE_LABELS[act.type] || act.type).toUpperCase()} <small style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: '6px' }}>by {act.user ? act.user.name : 'System'}</small>
                                  </span>
                                  <small style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{new Date(act.createdAt).toLocaleString('en-IN')}</small>
                                </div>
                                <p style={{ margin: '0', fontSize: '0.82rem', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{act.note}</p>
                                {act.callRecordingUrl && (
                                  <a
                                    href={act.callRecordingUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ display: 'inline-block', marginTop: '6px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--gold)', textDecoration: 'none' }}
                                  >
                                    🎙️ Call / meeting recording ↗
                                  </a>
                                )}
                                {act.nextFollowUpAt && (
                                  <small style={{ display: 'block', marginTop: '4px', color: 'var(--gold)', fontWeight: 700 }}>
                                    Next Follow-up: {new Date(act.nextFollowUpAt).toLocaleString('en-IN')}
                                  </small>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </article>
                </>
              )}

              {/* Files Tab */}
              {tab === 'files' && (
                <>
                  <article className="profile-panel lead-overview-card" style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px 32px' }}>
                    <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.1rem', fontWeight: 800 }}>Files</h2>
                    <p className="muted-small" style={{ margin: '0 0 1rem', fontSize: '0.76rem', color: 'var(--muted)' }}>
                      Store documents, confirmations, requests, receipts, contracts, and any other files related to this {relationshipName.toLowerCase()}.
                    </p>
                    <div className={`file-storage-status ${fileStorage?.ready ? 'drive-ready' : ''}`}>
                      <span className="file-storage-icon">{fileStorage?.ready ? 'D' : 'C'}</span>
                      <div>
                        <strong>{fileStorage?.ready ? 'Uploads go to Google Drive' : 'Uploads use CRM storage'}</strong>
                        <small>{fileStorage?.ready ? 'Files are saved in this workspace’s shared Drive folder.' : 'Connect Drive in Integrations whenever you are ready.'}</small>
                      </div>
                      {fileStorage?.folderUrl && <a href={fileStorage.folderUrl} target="_blank" rel="noreferrer">Open folder</a>}
                    </div>
                    <form onSubmit={handleUploadAttachment} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <CustomSelect
                        value={uploadCategory}
                        onChange={val => setUploadCategory(val)}
                        options={[
                          { value: 'proposal', label: 'Proposal' },
                          { value: 'contract', label: 'Contract' },
                          { value: 'invoice', label: 'Invoice' },
                          { value: 'brief', label: 'Brief' },
                          { value: 'screenshot', label: 'Screenshot' },
                          { value: 'other', label: 'Other' },
                        ]}
                        style={{ maxWidth: '200px' }}
                      />
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt,.csv"
                        onChange={e => setUploadFiles(Array.from(e.target.files || []))}
                        style={{ fontSize: '0.78rem' }}
                      />
                      <textarea
                        rows={2}
                        placeholder="Notes (optional)..."
                        value={uploadNotes}
                        onChange={e => setUploadNotes(e.target.value)}
                        style={{ padding: '0.65rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)', fontSize: '0.82rem' }}
                      />
                      <button className="btn primary" type="submit" disabled={uploading || uploadFiles.length === 0} style={{ alignSelf: 'flex-start' }}>
                        {uploading ? 'Uploading...' : uploadFiles.length > 1 ? `Upload ${uploadFiles.length} files` : fileStorage?.ready ? 'Upload to Drive' : 'Upload file'}
                      </button>
                    </form>
                  </article>

                  <article className="profile-panel lead-overview-card" style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px 32px' }}>
                    <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 800 }}>Uploaded files ({attachments.length})</h2>
                    {attachments.length === 0 ? (
                      <p className="empty" style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)', fontSize: '0.82rem' }}>No attachments uploaded yet.</p>
                    ) : (
                      <div className="attachment-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {attachments.map(att => (
                          <div key={att._id} className="attachment-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', background: 'var(--panel-muted)', border: '1px solid var(--border)' }}>
                            <div>
                              <strong style={{ display: 'block', fontSize: '0.84rem', color: 'var(--text)' }}>{att.originalName}</strong>
                              <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                                {att.category} · {Math.ceil((att.size || 0) / 1024)} KB · {att.uploadedBy ? att.uploadedBy.name : 'System'}
                              </span>
                              <span className={`storage-badge ${att.storageProvider === 'google_drive' ? 'drive' : ''}`}>
                                {att.storageProvider === 'google_drive' ? 'Google Drive' : 'CRM'}
                              </span>
                              {att.notes && <small style={{ display: 'block', fontSize: '0.72rem', color: 'var(--sub)', marginTop: '2px' }}>{att.notes}</small>}
                            </div>
                            <div className="attachment-actions" style={{ display: 'flex', gap: '6px' }}>
                              {att.externalUrl && (
                                <a className="btn small outline" href={att.externalUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>Open</a>
                              )}
                              <button
                                type="button"
                                className="btn small"
                                style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                                onClick={() => downloadAuthenticatedFile(`/customers/${customer._id}/attachments/${att._id}/download`, att.originalName)}
                              >
                                Download
                              </button>
                              {(isManager || String(att.uploadedBy?._id) === String(user?._id)) && (
                                <button
                                  type="button"
                                  className="btn small danger"
                                  style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                                  onClick={() => confirmDeleteAttachment(att._id)}
                                >
                                  {att.storageProvider === 'google_drive' ? 'Remove' : 'Delete'}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                </>
              )}

              {/* Details Tab (for leads) */}
              {tab === 'details' && (
                <article className="profile-panel lead-overview-card" style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px 32px' }}>
                  <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 800 }}>Additional details</h2>
                  <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', margin: 0 }}>
                    {fields.map(field => (
                      <div key={field._id}>
                        <dt style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>{field.label}</dt>
                        <dd style={{ margin: '2px 0 0', fontSize: '0.85rem', color: 'var(--text)', fontWeight: 600 }}>{String(customer.customData?.[field.key] ?? '—')}</dd>
                      </div>
                    ))}
                    <div>
                      <dt style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>UTM source</dt>
                      <dd style={{ margin: '2px 0 0', fontSize: '0.85rem', color: 'var(--text)' }}>{customer.utmSource || '—'}</dd>
                    </div>
                    <div>
                      <dt style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>UTM medium</dt>
                      <dd style={{ margin: '2px 0 0', fontSize: '0.85rem', color: 'var(--text)' }}>{customer.utmMedium || '—'}</dd>
                    </div>
                    <div>
                      <dt style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>UTM campaign</dt>
                      <dd style={{ margin: '2px 0 0', fontSize: '0.85rem', color: 'var(--text)' }}>{customer.utmCampaign || '—'}</dd>
                    </div>
                  </dl>
                </article>
              )}
            </>
          )}
        </div>

        {/* Right Column: Settings Card */}
        <aside className="lead-side-column">
          <article className="profile-panel lead-controls-card">
            <h2 className="lead-controls-title">
              {isClientProfile ? 'Relationship settings' : `Manage ${relationshipName.toLowerCase()}`}
            </h2>

            {/* Stage / Status Section */}
            <section className="lead-stage-card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ margin: '0 0 0.4rem', fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                {isClientProfile ? 'Client status' : 'Lead stage'}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <CustomSelect
                  value={selectedStageId}
                  onChange={val => setSelectedStageId(val)}
                  options={stages.filter(s => !isClientProfile || s.isWon).map(s => ({ value: s._id, label: s.name }))}
                />
                <button type="button" className="btn primary" onClick={handleUpdateStage} style={{ height: '38px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700 }}>
                  Update {isClientProfile ? 'status' : 'stage'}
                </button>
              </div>
            </section>

            {/* Owner Section */}
            {isManager && (
              <section className="lead-owner-card" style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ margin: '0 0 0.4rem', fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                  Owner
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <CustomSelect
                    value={selectedOwnerId}
                    onChange={val => setSelectedOwnerId(val)}
                    placeholder="Unassigned"
                    options={[
                      { value: '', label: 'Unassigned' },
                      ...users.map(u => ({ value: u._id, label: `${u.name}${u.role ? ` (${u.role})` : ''}` }))
                    ]}
                  />
                  <button type="button" className="btn" onClick={handleUpdateOwner} style={{ height: '38px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700 }}>
                    Update owner
                  </button>
                </div>
              </section>
            )}

            {/* More details toggle */}
            <details className="lead-extra-details" style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px dashed var(--border)' }}>
              <summary style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--sub)', cursor: 'pointer', marginBottom: '0.75rem' }}>
                More {relationshipName.toLowerCase()} data
              </summary>
              <h4 style={{ margin: '0.5rem 0', fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>Custom data</h4>
              <dl style={{ margin: '0 0 1rem', fontSize: '0.78rem' }}>
                {fields.map(f => (
                  <div key={f._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <dt style={{ color: 'var(--muted)' }}>{f.label}</dt>
                    <dd style={{ margin: 0, fontWeight: 600, color: 'var(--text)' }}>{String(customer.customData?.[f.key] ?? 'Not set')}</dd>
                  </div>
                ))}
              </dl>

              <h4 style={{ margin: '0.5rem 0', fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                {isClientProfile ? 'Conversion details' : 'Source details'}
              </h4>
              <dl style={{ margin: 0, fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><dt style={{ color: 'var(--muted)' }}>UTM Source</dt><dd style={{ margin: 0 }}>{customer.utmSource || 'N/A'}</dd></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><dt style={{ color: 'var(--muted)' }}>UTM Medium</dt><dd style={{ margin: 0 }}>{customer.utmMedium || 'N/A'}</dd></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><dt style={{ color: 'var(--muted)' }}>UTM Campaign</dt><dd style={{ margin: 0 }}>{customer.utmCampaign || 'N/A'}</dd></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><dt style={{ color: 'var(--muted)' }}>UTM Content</dt><dd style={{ margin: 0 }}>{customer.utmContent || 'N/A'}</dd></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><dt style={{ color: 'var(--muted)' }}>UTM Term</dt><dd style={{ margin: 0 }}>{customer.utmTerm || 'N/A'}</dd></div>
              </dl>
            </details>
          </article>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction?.kind === 'deleteAttachment'
          ? (attachments.find(item => item._id === confirmAction.attachmentId)?.storageProvider === 'google_drive' ? 'Remove Attachment' : 'Delete Attachment')
          : `Delete this ${relationshipName.toLowerCase()}?`}
        message={confirmAction?.kind === 'deleteAttachment'
          ? (attachments.find(item => item._id === confirmAction.attachmentId)?.storageProvider === 'google_drive'
            ? 'Remove this attachment from the CRM? The original file will stay in Google Drive.'
            : 'Delete this attachment permanently?')
          : `This will permanently delete the ${relationshipName.toLowerCase()} and all of its data. This action cannot be undone.`}
        confirmText={confirmAction?.kind === 'deleteAttachment' && attachments.find(item => item._id === confirmAction.attachmentId)?.storageProvider === 'google_drive' ? 'Remove from CRM' : 'Delete'}
        variant="danger"
        onConfirm={() => void (confirmAction?.kind === 'deleteAttachment' ? handleConfirmDeleteAttachment() : handleConfirmDelete())}
        onCancel={() => setConfirmAction(null)}
      />

      <QuickActivityPrompt
        open={showQuickPrompt}
        customerId={id || ''}
        customerName={customer.name}
        targetStageId={stagePromptData?.targetStageId}
        targetStageName={stagePromptData?.targetStageName}
        currentStageName={stagePromptData?.currentStageName}
        isTerminalStage={stagePromptData?.isTerminalStage}
        onClose={() => {
          setShowQuickPrompt(false);
          setStagePromptData(null);
        }}
        onSaved={() => {
          setShowQuickPrompt(false);
          setStagePromptData(null);
          if (id) void load(id);
        }}
        onLogged={() => {
          setShowQuickPrompt(false);
          setStagePromptData(null);
          if (id) void load(id);
        }}
      />
    </div>
  );
}
