import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { companiesApi, Company, CompanyMetrics, AssignedUser, CompanyAttachment } from '../../api/companies';
import { customersApi } from '../../api/customers';
import { downloadAuthenticatedFile } from '../../api/client';
import { Customer, Stage } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, switchCompany, activeCompany } = useAuth();

  const [company, setCompany] = useState<Company | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<CompanyAttachment[]>([]);
  const [metrics, setMetrics] = useState<CompanyMetrics | null>(null);
  const [users, setUsers] = useState<AssignedUser[]>([]);

  const [activeTab, setActiveTab] = useState<'overview' | 'settings'>('overview');
  const [activityFilter, setActivityFilter] = useState<'all' | 'note' | 'stage_changed' | 'call' | 'email-meeting'>('all');
  const [showNewLeadDrawer, setShowNewLeadDrawer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [creatingLead, setCreatingLead] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Confirm dialog state
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmText?: string;
    variant?: 'danger' | 'warning' | 'primary';
    action: () => Promise<void> | void;
  }>({
    open: false,
    title: '',
    message: '',
    action: () => {},
  });

  // Attachment upload state
  const [attachmentCategory, setAttachmentCategory] = useState<'proposal' | 'contract' | 'invoice' | 'brief' | 'screenshot' | 'other'>('proposal');
  const [attachmentNotes, setAttachmentNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<{ name: string; base64: string } | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<{ name: string; base64: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Lead form state
  const [leadForm, setLeadForm] = useState({
    name: '',
    email: '',
    phone: '',
    value: 0,
    stage: '',
    campaign: '',
    notes: '',
  });

  // Settings form state
  const [formData, setFormData] = useState({
    name: '',
    website: '',
    businessType: 'service',
    category: '',
    contactPerson: '',
    phone: '',
    email: '',
    instagram: '',
    location: '',
    status: 'active',
    healthStatus: 'healthy',
    monthlyPackage: 0,
    startDate: '',
    monthlyVideoTarget: 0,
    monthlyDesignTarget: 0,
    monthlyContentTarget: 0,
    monthlyLeadTarget: 0,
    sopDocumentLink: '',
    googleDriveFolderLink: '',
    notes: '',
    metaPixelId: '',
    ga4MeasurementId: '',
    accountOwner: '',
    assignedUsers: [] as string[],
  });

  useEffect(() => {
    if (id) {
      loadCompanyDetails(id);
    }
  }, [id]);

  async function loadCompanyDetails(companyId: string) {
    try {
      setLoading(true);
      setError('');
      const res = await companiesApi.get(companyId);
      setCompany(res.data);
      setCustomers(res.customers || []);
      setStages(res.stages || []);
      setCampaigns(res.campaigns || []);
      setActivities(res.activities || []);
      setAttachments(res.attachments || []);
      setMetrics(res.metrics || null);
      setUsers(res.users || []);

      if (res.stages && res.stages.length > 0 && !leadForm.stage) {
        setLeadForm(prev => ({ ...prev, stage: res.stages[0]._id }));
      }

      setFormData({
        name: res.data.name || '',
        website: res.data.website || '',
        businessType: res.data.businessType || 'service',
        category: res.data.category || '',
        contactPerson: res.data.contactPerson || '',
        phone: res.data.phone || '',
        email: res.data.email || '',
        instagram: res.data.instagram || '',
        location: res.data.location || '',
        status: res.data.status || 'active',
        healthStatus: res.data.healthStatus || 'healthy',
        monthlyPackage: res.data.monthlyPackage || 0,
        startDate: res.data.startDate ? res.data.startDate.slice(0, 10) : '',
        monthlyVideoTarget: res.data.monthlyVideoTarget || 0,
        monthlyDesignTarget: res.data.monthlyDesignTarget || 0,
        monthlyContentTarget: res.data.monthlyContentTarget || 0,
        monthlyLeadTarget: res.data.monthlyLeadTarget || 0,
        sopDocumentLink: res.data.sopDocumentLink || '',
        googleDriveFolderLink: res.data.googleDriveFolderLink || '',
        notes: res.data.notes || '',
        metaPixelId: res.data.metaPixelId || '',
        ga4MeasurementId: res.data.ga4MeasurementId || '',
        accountOwner: res.data.accountOwner?._id || '',
        assignedUsers: (res.data.assignedUsers || []).map((u: any) => u._id || u),
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load company details');
    } finally {
      setLoading(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? [...e.target.files] : [];
    if (files.length === 0) return;
    const valid = files.filter(file => file.size <= 5 * 1024 * 1024);
    if (valid.length !== files.length) {
      setError(`${files.length - valid.length} file${files.length - valid.length === 1 ? '' : 's'} skipped: must be 5 MB or smaller.`);
    }
    if (valid.length === 0) {
      setSelectedFile(null);
      setSelectedFiles([]);
      return;
    }
    const reads = valid.map(file => new Promise<{ name: string; base64: string }>(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, base64: reader.result as string });
      reader.readAsDataURL(file);
    }));
    void Promise.all(reads).then(all => {
      setSelectedFile(all[0]);
      setSelectedFiles([...all]);
    });
  }

  async function handleUploadAttachment(e: React.FormEvent) {
    e.preventDefault();
    const files = selectedFiles.length > 0 ? selectedFiles : (selectedFile ? [selectedFile] : []);
    if (!id || files.length === 0) {
      setError('Please select a file to upload.');
      return;
    }

    try {
      setUploadingAttachment(true);
      setError('');
      let uploadedCount = 0;
      for (const file of files) {
        const res = await companiesApi.uploadAttachment(id, {
          category: attachmentCategory,
          originalName: file.name,
          fileData: file.base64,
          notes: attachmentNotes,
        });
        setAttachments(prev => [res.data, ...prev]);
        uploadedCount += 1;
      }
      setSelectedFile(null);
      setSelectedFiles([]);
      setAttachmentNotes('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setSuccess(uploadedCount > 1 ? `${uploadedCount} attachments uploaded successfully.` : 'Attachment uploaded successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to upload attachment');
    } finally {
      setUploadingAttachment(false);
    }
  }

  function promptDeleteAttachment(attachmentId: string, name: string) {
    setConfirmState({
      open: true,
      title: 'Delete Attachment',
      message: `Delete "${name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
      action: async () => {
        if (!id) return;
        try {
          await companiesApi.deleteAttachment(id, attachmentId);
          setAttachments(prev => prev.filter(a => a._id !== attachmentId));
          setSuccess('Attachment deleted.');
        } catch (err: any) {
          setError(err.message || 'Failed to delete attachment');
        } finally {
          setConfirmState(prev => ({ ...prev, open: false }));
        }
      },
    });
  }

  async function handleCreateLead(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !company) return;

    try {
      setCreatingLead(true);
      setError('');
      const res = await customersApi.create({
        name: leadForm.name,
        email: leadForm.email,
        phone: leadForm.phone,
        value: Number(leadForm.value) || 0,
        stage: leadForm.stage || (stages[0]?._id ?? ''),
        campaign: leadForm.campaign || undefined,
        notes: leadForm.notes,
        clientCompany: company._id,
      });

      setCustomers(prev => [res.data, ...prev]);
      setLeadForm({
        name: '',
        email: '',
        phone: '',
        value: 0,
        stage: stages[0]?._id || '',
        campaign: '',
        notes: '',
      });
      setShowNewLeadDrawer(false);
      setSuccess(`Lead "${res.data.name}" added to ${company.name}.`);
      // Reload metrics in background
      loadCompanyDetails(id);
    } catch (err: any) {
      setError(err.message || 'Failed to create lead');
    } finally {
      setCreatingLead(false);
    }
  }

  async function handleAddCollaborator(userId: string) {
    if (!id || !userId) return;
    try {
      setError('');
      await companiesApi.addCollaborator(id, userId);
      const addedUser = users.find(u => u._id === userId);
      if (addedUser) {
        setCompany(prev => (prev ? {
          ...prev,
          assignedUsers: [...(prev.assignedUsers || []), addedUser],
        } : null));
        setFormData(prev => ({
          ...prev,
          assignedUsers: [...prev.assignedUsers, userId],
        }));
      }
      setSuccess('Collaborator assigned.');
    } catch (err: any) {
      setError(err.message || 'Failed to add collaborator');
    }
  }

  function promptRemoveCollaborator(userId: string, userName: string) {
    setConfirmState({
      open: true,
      title: 'Remove Collaborator',
      message: `Remove ${userName} from this workspace?`,
      confirmText: 'Remove',
      variant: 'warning',
      action: async () => {
        if (!id) return;
        try {
          await companiesApi.removeCollaborator(id, userId);
          setCompany(prev => (prev ? {
            ...prev,
            assignedUsers: (prev.assignedUsers || []).filter(u => u._id !== userId),
          } : null));
          setFormData(prev => ({
            ...prev,
            assignedUsers: prev.assignedUsers.filter(uid => uid !== userId),
          }));
          setSuccess('Collaborator removed.');
        } catch (err: any) {
          setError(err.message || 'Failed to remove collaborator');
        } finally {
          setConfirmState(prev => ({ ...prev, open: false }));
        }
      },
    });
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    try {
      setSaving(true);
      setError('');
      const res = await companiesApi.update(id, formData);
      setCompany(res.data);
      setSuccess('Company settings updated successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to update company');
    } finally {
      setSaving(false);
    }
  }

  function promptRegenerateApiKey() {
    setConfirmState({
      open: true,
      title: 'Regenerate API Key',
      message: 'Regenerate inbound API key? The old key will immediately stop working.',
      confirmText: 'Regenerate Key',
      variant: 'warning',
      action: async () => {
        if (!id) return;
        try {
          const res = await companiesApi.regenerateApiKey(id);
          setCompany(prev => (prev ? { ...prev, apiKey: res.apiKey } : null));
          setSuccess('Inbound API key regenerated.');
        } catch (err: any) {
          setError(err.message || 'Failed to regenerate API key');
        } finally {
          setConfirmState(prev => ({ ...prev, open: false }));
        }
      },
    });
  }

  if (loading) {
    return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading company details...</div>;
  }

  if (!company) {
    return (
      <div className="page-container" style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Company not found</h2>
        <Link to="/companies" className="btn primary" style={{ marginTop: '1rem' }}>
          Back to Workspaces
        </Link>
      </div>
    );
  }

  const isCurrentActive = activeCompany?._id === company._id;

  // Initials & avatar color calculation
  const initials = company.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'CO';
  const avatarColors = ['#0f766e', '#b58d00', '#2563eb', '#dc2626', '#16a34a', '#7c3aed'];
  const avatarColor = avatarColors[initials.charCodeAt(0) % avatarColors.length];

  // Filtered activities
  const filteredActivities = activities.filter(act => {
    if (activityFilter === 'all') return true;
    if (activityFilter === 'note') return act.type === 'note';
    if (activityFilter === 'stage_changed') return act.type === 'stage_changed';
    if (activityFilter === 'call') return act.type === 'call';
    if (activityFilter === 'email-meeting') return act.type === 'email' || act.type === 'meeting' || act.type === 'whatsapp';
    return true;
  });

  // Campaign breakdown aggregation
  const campaignMap: { [key: string]: { count: number; value: number; platform: string } } = {};
  customers.forEach(c => {
    const key = c.campaign ? (c.campaign as any).name || 'Campaign' : 'Organic / Direct';
    const platform = c.campaign ? (c.campaign as any).platform || '' : '';
    if (!campaignMap[key]) campaignMap[key] = { count: 0, value: 0, platform };
    campaignMap[key].count++;
    campaignMap[key].value += (c.value || 0);
  });

  const unassignedUsers = users.filter(
    u => !(company.assignedUsers || []).some(x => String(x._id) === String(u._id))
  );

  return (
    <div className="page-container">
      {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="notice success" style={{ marginBottom: '1rem' }}>{success}</div>}

      {/* Breadcrumbs */}
      <div className="breadcrumbs" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted)' }}>
        <Link to="/companies" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
          CRM Workspaces
        </Link>
        <span>/</span>
        <span style={{ color: 'var(--text)' }}>{company.name}</span>
      </div>

      {/* Header Hero Panel */}
      <section className="page-head" style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '12px',
              background: avatarColor,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '1.4rem',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            }}
          >
            {initials}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h1 style={{ margin: 0, fontSize: '1.5rem', fontFamily: 'var(--font-display)' }}>{company.name}</h1>
              <span
                className="stage-badge"
                style={{
                  backgroundColor: company.status === 'active' ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)',
                  color: '#fff',
                  fontSize: '0.62rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontWeight: 800,
                }}
              >
                {company.status.toUpperCase()}
              </span>
              <span
                className="stage-badge"
                style={{
                  backgroundColor: company.healthStatus === 'at-risk' ? 'var(--red, #dc2626)' : company.healthStatus === 'watch' ? 'var(--gold, #b58d00)' : 'var(--green, #16a34a)',
                  color: '#fff',
                  fontSize: '0.62rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontWeight: 800,
                }}
              >
                {(company.healthStatus || 'healthy').toUpperCase()}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
              {company.website ? (
                <a href={company.website} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)' }}>
                  {company.website}
                </a>
              ) : (
                'No website URL configured'
              )}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            className="btn primary"
            onClick={() => setShowNewLeadDrawer(prev => !prev)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <span>+</span>
            <span>{showNewLeadDrawer ? 'Close Form' : 'Add New Lead'}</span>
          </button>
          {!isCurrentActive && (
            <button
              type="button"
              className="btn outline"
              onClick={() => switchCompany(company._id)}
            >
              Switch to this CRM
            </button>
          )}
        </div>
      </section>

      {/* Tabs Navigation */}
      <nav className="team-tabs" style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)' }}>
        <button
          type="button"
          className={`btn small ${activeTab === 'overview' ? 'primary' : 'outline'}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          className={`btn small ${activeTab === 'settings' ? 'primary' : 'outline'}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings & API
        </button>
      </nav>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div>
          {/* 10-Metric Overview Grid */}
          <section
            className="stats-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
              gap: '1rem',
              marginBottom: '2rem',
            }}
          >
            <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
              <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>Total Leads</span>
              <strong style={{ fontSize: '1.3rem' }}>{metrics?.totalLeads ?? customers.length}</strong>
            </div>
            <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
              <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>Win Rate</span>
              <strong style={{ fontSize: '1.3rem' }}>{metrics?.winRate ?? metrics?.conversionRate ?? 0}%</strong>
            </div>
            <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
              <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>Pipeline Value</span>
              <strong style={{ fontSize: '1.3rem', color: 'var(--teal)' }}>₹{(metrics?.pipelineValue || 0).toLocaleString('en-IN')}</strong>
            </div>
            <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
              <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>Won Revenue</span>
              <strong style={{ fontSize: '1.3rem', color: 'var(--gold)' }}>₹{(metrics?.wonValue || metrics?.wonRevenue || 0).toLocaleString('en-IN')}</strong>
            </div>
            <div className="metric warn" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
              <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>Active Leads</span>
              <strong style={{ fontSize: '1.3rem' }}>{metrics?.activeCount ?? customers.filter(c => !c.stage?.isWon && !c.stage?.isLost).length}</strong>
            </div>
            <div className="metric danger" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
              <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>Lost Leads</span>
              <strong style={{ fontSize: '1.3rem' }}>{metrics?.lostCount ?? customers.filter(c => c.stage?.isLost).length}</strong>
            </div>
            <div className="metric warn" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
              <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>Ad Spend</span>
              <strong style={{ fontSize: '1.3rem' }}>₹{(metrics?.spend || 0).toLocaleString('en-IN')}</strong>
            </div>
            <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
              <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>Avg CPL</span>
              <strong style={{ fontSize: '1.3rem' }}>₹{Math.round(metrics?.costPerLead || 0).toLocaleString('en-IN')}</strong>
            </div>
            <div className="metric" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
              <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>ROI</span>
              <strong style={{ fontSize: '1.3rem' }}>{Math.round(metrics?.roi || 0)}%</strong>
            </div>
            <div className="metric danger" style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--panel)' }}>
              <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 700 }}>Follow-ups Due</span>
              <strong style={{ fontSize: '1.3rem' }}>{metrics?.overdueFollowups || 0}</strong>
            </div>
          </section>

          {/* Add Lead Inline Drawer */}
          {showNewLeadDrawer && (
            <form
              onSubmit={handleCreateLead}
              style={{
                marginBottom: '2rem',
                padding: '1.5rem',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                background: 'var(--panel)',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>
                  Add Lead to {company.name}
                </h2>
                <button
                  type="button"
                  className="btn small outline"
                  onClick={() => setShowNewLeadDrawer(false)}
                >
                  Cancel
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Lead Name *
                  <input
                    required
                    placeholder="e.g. Ramesh Kumar"
                    value={leadForm.name}
                    onChange={e => setLeadForm({ ...leadForm, name: e.target.value })}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Email Address
                  <input
                    type="email"
                    placeholder="e.g. sid@vande.digital"
                    value={leadForm.email}
                    onChange={e => setLeadForm({ ...leadForm, email: e.target.value })}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Phone Number
                  <input
                    type="tel"
                    placeholder="e.g. +91 9999999999"
                    value={leadForm.phone}
                    onChange={e => setLeadForm({ ...leadForm, phone: e.target.value })}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Deal Value (₹)
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 50000"
                    value={leadForm.value || ''}
                    onChange={e => setLeadForm({ ...leadForm, value: Number(e.target.value) || 0 })}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Lead Stage
                  <select
                    value={leadForm.stage}
                    onChange={e => setLeadForm({ ...leadForm, stage: e.target.value })}
                  >
                    {stages.map(s => (
                      <option key={s._id} value={s._id}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Ad Campaign
                  <select
                    value={leadForm.campaign}
                    onChange={e => setLeadForm({ ...leadForm, campaign: e.target.value })}
                  >
                    <option value="">None (Organic / Direct)</option>
                    {campaigns.map(c => (
                      <option key={c._id} value={c._id}>{c.name} ({c.platform || 'General'})</option>
                    ))}
                  </select>
                </label>
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)', marginBottom: '1.25rem' }}>
                Initial Notes
                <textarea
                  rows={2}
                  placeholder="Describe the lead requirements or background..."
                  value={leadForm.notes}
                  onChange={e => setLeadForm({ ...leadForm, notes: e.target.value })}
                />
              </label>

              <button type="submit" className="btn primary" disabled={creatingLead}>
                {creatingLead ? 'Saving...' : 'Save Lead'}
              </button>
            </form>
          )}

          {/* Attachments & Stored Documents Section */}
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            {/* Upload Attachment Card */}
            <article className="profile-panel" style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)' }}>
              <h2 style={{ marginTop: 0, fontSize: '1.1rem', marginBottom: '0.25rem' }}>Company Attachments</h2>
              <p style={{ fontSize: '0.76rem', color: 'var(--muted)', marginBottom: '1rem' }}>
                Store account-level proposals, contracts, invoices, briefs, screenshots, and reports.
              </p>

              <form onSubmit={handleUploadAttachment} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.76rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Category
                  <select
                    value={attachmentCategory}
                    onChange={e => setAttachmentCategory(e.target.value as any)}
                  >
                    <option value="proposal">Proposal</option>
                    <option value="contract">Contract</option>
                    <option value="invoice">Invoice</option>
                    <option value="brief">Brief</option>
                    <option value="screenshot">Screenshot</option>
                    <option value="other">Other</option>
                  </select>
                </label>

                <label
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px dashed var(--border)',
                    borderRadius: '8px',
                    padding: '1rem',
                    background: 'var(--bg-soft)',
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  <span style={{ fontSize: '0.78rem', color: 'var(--teal)', fontWeight: 700 }}>
                    {selectedFiles.length > 1 ? `${selectedFiles.length} files selected` : (selectedFile ? selectedFile.name : 'Select file (PDF, Doc, Image, CSV up to 5MB, multi-select allowed)')}
                  </span>
                  <input
                    type="file"
                    multiple
                    ref={fileInputRef}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt,.csv"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                </label>

                <textarea
                  rows={2}
                  placeholder="Notes optional"
                  value={attachmentNotes}
                  onChange={e => setAttachmentNotes(e.target.value)}
                  style={{ resize: 'vertical' }}
                />

                <button
                  type="submit"
                  className="btn primary"
                  disabled={uploadingAttachment || (selectedFiles.length === 0 && !selectedFile)}
                >
                  {uploadingAttachment ? 'Uploading...' : selectedFiles.length > 1 ? `Upload ${selectedFiles.length} Attachments` : 'Upload Attachment'}
                </button>
              </form>
            </article>

            {/* Stored Documents Card */}
            <article className="profile-panel" style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Stored Documents</h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 700 }}>
                  {attachments.length} files
                </span>
              </div>

              {attachments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', border: '1px dashed var(--border)', borderRadius: '8px', color: 'var(--muted)', fontSize: '0.8rem' }}>
                  No company attachments uploaded yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '340px', overflowY: 'auto' }}>
                  {attachments.map(att => (
                    <div
                      key={att._id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.75rem',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        background: 'var(--bg-soft)',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <strong style={{ display: 'block', fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {att.originalName}
                        </strong>
                        <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
                          {att.category} · {Math.ceil((att.size || 0) / 1024)} KB · {att.uploadedBy?.name || 'System'}
                        </span>
                        {att.notes && (
                          <small style={{ display: 'block', color: 'var(--sub)', fontSize: '0.72rem', marginTop: '2px' }}>
                            {att.notes}
                          </small>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                        <button
                          type="button"
                          className="btn small outline"
                          style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                          onClick={() => downloadAuthenticatedFile(`/companies/${company._id}/attachments/${att._id}/download`, att.originalName)}
                        >
                          Download
                        </button>
                        <button
                          type="button"
                          className="btn small danger"
                          style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                          onClick={() => promptDeleteAttachment(att._id, att.originalName)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </section>

          {/* Main Content Grid (Leads & Activity on Left, Collaborators & Campaigns on Right) */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
            {/* Left Side: Leads Portfolio & Workspace Activity Stream */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Leads Portfolio */}
              <article className="business-panel" style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <div>
                    <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>Leads Portfolio</h2>
                    <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
                      List of advertiser prospects and closed clients.
                    </p>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 700 }}>
                    {customers.length} records
                  </span>
                </div>

                {customers.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem 1.5rem', border: '1px dashed var(--border)', borderRadius: '8px', background: 'var(--bg-soft)' }}>
                    <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>No leads generated yet</h3>
                    <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
                      Click "Add New Lead" to log the first customer prospect.
                    </p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--muted)' }}>
                          <th style={{ padding: '0.75rem 0.5rem' }}>Name</th>
                          <th style={{ padding: '0.75rem 0.5rem' }}>Stage</th>
                          <th style={{ padding: '0.75rem 0.5rem' }}>Value</th>
                          <th style={{ padding: '0.75rem 0.5rem' }}>Assignee</th>
                          <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customers.map(c => (
                          <tr key={c._id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                            <td style={{ padding: '0.85rem 0.5rem' }}>
                              <Link to={`/customers/${c._id}`} style={{ display: 'flex', flexDirection: 'column', textDecoration: 'none' }}>
                                <strong style={{ fontSize: '0.86rem', color: 'var(--text)' }}>{c.name}</strong>
                                <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{c.email || 'No email registered'}</span>
                              </Link>
                            </td>
                            <td style={{ padding: '0.85rem 0.5rem' }}>
                              <span
                                className="stage-badge"
                                style={{
                                  backgroundColor: c.stage?.color || 'var(--muted)',
                                  color: '#fff',
                                  fontSize: '0.65rem',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                }}
                              >
                                {c.stage?.name || 'Unknown'}
                              </span>
                            </td>
                            <td style={{ padding: '0.85rem 0.5rem', fontWeight: 800, fontSize: '0.82rem' }}>
                              ₹{(c.value || 0).toLocaleString('en-IN')}
                            </td>
                            <td style={{ padding: '0.85rem 0.5rem', fontSize: '0.78rem', color: 'var(--sub)' }}>
                              {c.assignedTo?.name || 'Unassigned'}
                            </td>
                            <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right' }}>
                              <Link
                                to={`/customers/${c._id}`}
                                className="btn small outline"
                                style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                              >
                                View
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>

              {/* Filterable Workspace Activity Stream */}
              <article className="business-panel" style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>Workspace Activity Stream</h2>
                    <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
                      Unified history of stage transitions and comments across all leads.
                    </p>
                  </div>

                  <div className="filter-pills" style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {[
                      { id: 'all', label: 'All' },
                      { id: 'note', label: 'Notes' },
                      { id: 'stage_changed', label: 'Stages' },
                      { id: 'call', label: 'Calls' },
                      { id: 'email-meeting', label: 'Emails / Meetings' },
                    ].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        className={`tab-btn ${activityFilter === tab.id ? 'active' : ''}`}
                        onClick={() => setActivityFilter(tab.id as any)}
                        style={{
                          padding: '4px 10px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          borderRadius: '6px',
                          cursor: 'pointer',
                          border: '1px solid var(--border)',
                          background: activityFilter === tab.id ? 'var(--hover, rgba(255,255,255,0.08))' : 'transparent',
                          color: activityFilter === tab.id ? 'var(--gold)' : 'var(--sub)',
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="timeline" style={{ margin: 0 }}>
                  {filteredActivities.length === 0 ? (
                    <p className="empty" style={{ fontSize: '0.8rem', color: 'var(--muted)', padding: '2rem 0', textAlign: 'center' }}>
                      No matching activities found for this workspace.
                    </p>
                  ) : (
                    filteredActivities.map(act => {
                      let marker = 'N';
                      if (act.type === 'call') marker = 'C';
                      else if (act.type === 'email') marker = 'E';
                      else if (act.type === 'meeting') marker = 'M';
                      else if (act.type === 'whatsapp') marker = 'W';
                      else if (act.type === 'task') marker = 'T';
                      else if (act.type === 'stage_changed') marker = 'S';
                      else if (act.type === 'label_changed') marker = 'L';

                      return (
                        <div
                          key={act._id}
                          className="timeline-item"
                          style={{
                            display: 'flex',
                            gap: '1rem',
                            padding: '0.85rem 0',
                            borderBottom: '1px solid var(--border)',
                          }}
                        >
                          <div
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              background: 'var(--bg-soft)',
                              border: '1px solid var(--border)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              color: 'var(--gold)',
                              flexShrink: 0,
                            }}
                          >
                            {marker}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.35rem' }}>
                              <span style={{ fontSize: '0.76rem', fontWeight: 800, color: 'var(--text)' }}>
                                {act.type.replace('_', ' ').toUpperCase()} by {act.user?.name || 'System'}
                                {act.customer && (
                                  <Link
                                    to={`/customers/${act.customer._id || act.customer}`}
                                    style={{ color: 'var(--teal)', fontWeight: 800, textDecoration: 'none', marginLeft: '0.4rem' }}
                                  >
                                    @{act.customer.name || 'Lead'}
                                  </Link>
                                )}
                              </span>
                              <small style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
                                {new Date(act.createdAt).toLocaleString('en-IN')}
                              </small>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--sub)', lineHeight: 1.45 }}>
                              {act.note || act.type}
                            </p>
                            {act.nextFollowUpAt && (
                              <small style={{ display: 'block', marginTop: '4px', color: 'var(--gold)', fontWeight: 700, fontSize: '0.72rem' }}>
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
            </div>

            {/* Right Side: Assigned Collaborators & Campaign Performance */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Assigned Collaborators Panel */}
              <article className="business-panel" style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)' }}>
                <div style={{ marginBottom: '1.25rem' }}>
                  <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>Assigned Collaborators</h2>
                  <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--muted)' }}>
                    Team members collaborating on this account.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.25rem' }}>
                  {(!company.assignedUsers || company.assignedUsers.length === 0) ? (
                    <p style={{ fontSize: '0.78rem', color: 'var(--muted)', textAlign: 'center', padding: '1.5rem', border: '1px dashed var(--border)', borderRadius: '8px', margin: 0 }}>
                      No staff assigned to this company.
                    </p>
                  ) : (
                    company.assignedUsers.map(collab => (
                      <div
                        key={collab._id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.65rem',
                          padding: '0.65rem 0.85rem',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          background: 'var(--bg-soft)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              background: 'var(--gold-dim, rgba(212,175,55,0.15))',
                              border: '1px solid var(--gold)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.74rem',
                              fontWeight: 800,
                              color: 'var(--gold)',
                            }}
                          >
                            {collab.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                          </div>
                          <div>
                            <strong style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text)' }}>
                              {collab.name}
                            </strong>
                            <span style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 750, textTransform: 'uppercase' }}>
                              {collab.role || 'Agent'}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => promptRemoveCollaborator(collab._id, collab.name)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--muted)',
                            cursor: 'pointer',
                            padding: '4px',
                            fontSize: '0.85rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '4px',
                          }}
                          title="Remove Collaborator"
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {unassignedUsers.length > 0 && (
                  <select
                    onChange={e => {
                      if (e.target.value) {
                        handleAddCollaborator(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    defaultValue=""
                    style={{
                      width: '100%',
                      height: '34px',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      borderRadius: '8px',
                      padding: '0 0.75rem',
                      border: '1px solid var(--border)',
                      background: 'var(--panel)',
                      color: 'var(--text)',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="" disabled>+ Assign Collaborator...</option>
                    {unassignedUsers.map(u => (
                      <option key={u._id} value={u._id}>{u.name} ({u.role || 'Agent'})</option>
                    ))}
                  </select>
                )}
              </article>

              {/* Campaign Performance Panel */}
              <article className="business-panel" style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)' }}>
                <div style={{ marginBottom: '1.25rem' }}>
                  <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>Campaign Performance</h2>
                  <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--muted)' }}>
                    Marketing sources driving leads for this company.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {Object.keys(campaignMap).length === 0 ? (
                    <p style={{ fontSize: '0.78rem', color: 'var(--muted)', textAlign: 'center', padding: '1rem', margin: 0 }}>
                      No campaign data recorded yet.
                    </p>
                  ) : (
                    Object.entries(campaignMap).map(([name, cData]) => (
                      <div
                        key={name}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.65rem 0.85rem',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          background: 'var(--bg-soft)',
                        }}
                      >
                        <div>
                          <strong style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text)' }}>
                            {name}
                          </strong>
                          {cData.platform && (
                            <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
                              {cData.platform}
                            </span>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <strong style={{ display: 'block', fontSize: '0.82rem', color: 'var(--teal)' }}>
                            ₹{cData.value.toLocaleString('en-IN')}
                          </strong>
                          <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
                            {cData.count} leads
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </article>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS & API TAB */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} style={{ maxWidth: '880px' }}>
          <article className="profile-panel" style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', marginBottom: '1.5rem' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.15rem', marginBottom: '1rem' }}>Workspace Configuration</h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Company Name *
                <input
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Website URL
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={formData.website}
                  onChange={e => setFormData({ ...formData, website: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                CRM Type
                <select
                  value={formData.businessType}
                  onChange={e => setFormData({ ...formData, businessType: e.target.value })}
                >
                  <option value="service">Service / Client</option>
                  <option value="consumer">Consumers / Customers</option>
                  <option value="commerce">Products / Notes Selling</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Category
                <input
                  placeholder="e.g. Real Estate, SaaS"
                  value={formData.category}
                  onChange={e => setFormData({ ...formData, category: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Contact Person
                <input
                  value={formData.contactPerson}
                  onChange={e => setFormData({ ...formData, contactPerson: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Phone Number
                <input
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Email Address
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Instagram Handle
                <input
                  placeholder="@handle"
                  value={formData.instagram}
                  onChange={e => setFormData({ ...formData, instagram: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Location / City
                <input
                  value={formData.location}
                  onChange={e => setFormData({ ...formData, location: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Status
                <select
                  value={formData.status}
                  onChange={e => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="active">Active</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Workspace Health
                <select
                  value={formData.healthStatus}
                  onChange={e => setFormData({ ...formData, healthStatus: e.target.value })}
                >
                  <option value="healthy">Healthy</option>
                  <option value="watch">Watch</option>
                  <option value="at-risk">At Risk</option>
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Account Owner
                <select
                  value={formData.accountOwner}
                  onChange={e => setFormData({ ...formData, accountOwner: e.target.value })}
                >
                  <option value="">No owner assigned</option>
                  {users.map(u => (
                    <option key={u._id} value={u._id}>{u.name} ({u.role || 'Agent'})</option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem', marginBottom: '1.25rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Monthly Package (₹)
                <input
                  type="number"
                  min="0"
                  value={formData.monthlyPackage}
                  onChange={e => setFormData({ ...formData, monthlyPackage: Number(e.target.value) || 0 })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Monthly Lead Target
                <input
                  type="number"
                  min="0"
                  value={formData.monthlyLeadTarget}
                  onChange={e => setFormData({ ...formData, monthlyLeadTarget: Number(e.target.value) || 0 })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Monthly Video Target
                <input
                  type="number"
                  min="0"
                  value={formData.monthlyVideoTarget}
                  onChange={e => setFormData({ ...formData, monthlyVideoTarget: Number(e.target.value) || 0 })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Monthly Design Target
                <input
                  type="number"
                  min="0"
                  value={formData.monthlyDesignTarget}
                  onChange={e => setFormData({ ...formData, monthlyDesignTarget: Number(e.target.value) || 0 })}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                SOP Document Link
                <input
                  type="url"
                  placeholder="https://docs.google.com/..."
                  value={formData.sopDocumentLink}
                  onChange={e => setFormData({ ...formData, sopDocumentLink: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Google Drive Folder Link
                <input
                  type="url"
                  placeholder="https://drive.google.com/..."
                  value={formData.googleDriveFolderLink}
                  onChange={e => setFormData({ ...formData, googleDriveFolderLink: e.target.value })}
                />
              </label>
            </div>
          </article>

          {/* Tracking & Inbound API Key Card */}
          <article className="profile-panel" style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', marginBottom: '1.5rem' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.15rem', marginBottom: '1rem' }}>Tracking & Inbound API</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Meta Pixel ID
                <input
                  placeholder="e.g. 123456789012345"
                  value={formData.metaPixelId}
                  onChange={e => setFormData({ ...formData, metaPixelId: e.target.value })}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                GA4 Measurement ID
                <input
                  placeholder="e.g. G-XXXXXXXXXX"
                  value={formData.ga4MeasurementId}
                  onChange={e => setFormData({ ...formData, ga4MeasurementId: e.target.value })}
                />
              </label>
            </div>

            <div style={{ background: 'var(--bg-soft)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <strong style={{ fontSize: '0.85rem' }}>Inbound API Key:</strong>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <code style={{ background: 'var(--surface)', padding: '0.4rem 0.75rem', borderRadius: '4px', flex: 1, fontSize: '0.85rem', color: 'var(--teal)' }}>
                  {company.apiKey || 'No API key generated'}
                </code>
                <button
                  type="button"
                  className="btn small outline"
                  onClick={promptRegenerateApiKey}
                >
                  Regenerate Key
                </button>
              </div>
            </div>
          </article>

          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving Settings...' : 'Save Company Settings'}
          </button>
        </form>
      )}

      {/* Confirmation Dialog Modal */}
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        variant={confirmState.variant}
        onConfirm={confirmState.action}
        onCancel={() => setConfirmState(prev => ({ ...prev, open: false }))}
      />
    </div>
  );
}
