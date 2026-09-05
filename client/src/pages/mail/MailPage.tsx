import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { mailApi, EmailAccount, EmailTemplate, EmailMessage } from '../../api/mail';
import { Customer } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function MailPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeFolder, setActiveFolder] = useState<'sent' | 'leads' | 'templates' | 'settings'>('sent');
  const [account, setAccount] = useState<EmailAccount | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [templateCategories, setTemplateCategories] = useState<string[]>([]);

  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const [showCompose, setShowCompose] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

  // Compose State
  const [composeCustomerId, setComposeCustomerId] = useState('');
  const [composeTemplateId, setComposeTemplateId] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [sending, setSending] = useState(false);

  // Template Form State
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: '', category: 'custom', subject: '', body: '' });
  const [savingTemplate, setSavingTemplate] = useState(false);

  // SMTP Settings Form State
  const [smtpForm, setSmtpForm] = useState({
    name: 'Default SMTP',
    fromName: '',
    fromEmail: '',
    replyTo: '',
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUsername: '',
    smtpPassword: '',
  });
  const [savingSmtp, setSavingSmtp] = useState(false);

  useEffect(() => {
    loadMailData();
  }, []);

  useEffect(() => {
    const customerParam = searchParams.get('customer');
    if (!customerParam || customers.length === 0) return;
    const target = customers.find(c => c._id === customerParam);
    if (target) {
      setSelectedCustomer(target);
      setComposeCustomerId(target._id);
      setShowCompose(true);
    }
    const updated = new URLSearchParams(searchParams);
    updated.delete('customer');
    setSearchParams(updated, { replace: true });
  }, [searchParams, customers, setSearchParams]);

  async function loadMailData() {
    try {
      setLoading(true);
      setError('');
      const res = await mailApi.get();
      setAccount(res.account);
      setTemplates(res.templates || []);
      setCustomers(res.customers || []);
      setMessages(res.messages || []);
      setTemplateCategories(res.templateCategories || []);

      if (res.messages?.length && !selectedMessage) {
        setSelectedMessage(res.messages[0]);
      }

      if (res.account) {
        setSmtpForm({
          name: res.account.name || 'Default SMTP',
          fromName: res.account.fromName || '',
          fromEmail: res.account.fromEmail || '',
          replyTo: res.account.replyTo || '',
          smtpHost: res.account.smtpHost || '',
          smtpPort: res.account.smtpPort || 587,
          smtpSecure: Boolean(res.account.smtpSecure),
          smtpUsername: res.account.smtpUsername || '',
          smtpPassword: '',
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load mail center');
    } finally {
      setLoading(false);
    }
  }

  function handleSelectTemplateForCompose(tmplId: string) {
    setComposeTemplateId(tmplId);
    const tmpl = templates.find(t => t._id === tmplId);
    if (tmpl) {
      setComposeSubject(tmpl.subject);
      setComposeBody(tmpl.body);
    }
  }

  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!composeCustomerId || !composeSubject.trim() || !composeBody.trim()) return;
    try {
      setSending(true);
      setError('');
      await mailApi.send({
        customerId: composeCustomerId,
        templateId: composeTemplateId || undefined,
        subject: composeSubject.trim(),
        body: composeBody.trim(),
      });
      setSuccess('Email sent successfully.');
      setShowCompose(false);
      setComposeCustomerId('');
      setComposeTemplateId('');
      setComposeSubject('');
      setComposeBody('');
      await loadMailData();
    } catch (err: any) {
      setError(err.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  }

  async function handleSaveSmtp(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSavingSmtp(true);
      setError('');
      const res = await mailApi.saveSettings(smtpForm);
      setAccount(res.data);
      setSuccess('SMTP settings saved and verified.');
    } catch (err: any) {
      setError(err.message || 'Failed to save SMTP settings');
    } finally {
      setSavingSmtp(false);
    }
  }

  async function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!templateForm.name.trim() || !templateForm.subject.trim() || !templateForm.body.trim()) return;
    try {
      setSavingTemplate(true);
      setError('');
      if (selectedTemplate) {
        await mailApi.updateTemplate(selectedTemplate._id, templateForm);
        setSuccess('Template updated.');
      } else {
        await mailApi.createTemplate(templateForm);
        setSuccess('Template created.');
      }
      setShowTemplateModal(false);
      setSelectedTemplate(null);
      await loadMailData();
    } catch (err: any) {
      setError(err.message || 'Failed to save template');
    } finally {
      setSavingTemplate(false);
    }
  }

  function handleDeleteTemplate(id: string, name: string) {
    setConfirmState({
      open: true,
      title: 'Delete Template',
      message: `Delete email template "${name}"?`,
      confirmText: 'Delete',
      variant: 'danger',
      action: async () => {
        try {
          await mailApi.deleteTemplate(id);
          setSuccess('Template deleted.');
          if (selectedTemplate?._id === id) setSelectedTemplate(null);
          await loadMailData();
        } catch (err: any) {
          setError(err.message || 'Failed to delete template');
        } finally {
          setConfirmState(prev => ({ ...prev, open: false }));
        }
      },
    });
  }

  if (loading && messages.length === 0 && customers.length === 0) {
    return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading mail center...</div>;
  }

  const filteredMessages = messages.filter(m =>
    !searchQuery ||
    m.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.toEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (m.customer?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCustomers = customers.filter(c =>
    !searchQuery ||
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.company || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTemplates = templates.filter(t =>
    !searchQuery ||
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="page-container">
      {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="notice success" style={{ marginBottom: '1rem' }}>{success}</div>}

      <section className="page-head" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0 }}>Mail Center</h1>
          <p className="page-subtitle">Send, track, and template client communications via verified SMTP.</p>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={() => { setShowCompose(true); setSelectedMessage(null); }}
        >
          + Compose Email
        </button>
      </section>

      {/* 3-Pane Mail Container */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '180px 320px minmax(0, 1fr)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          background: 'var(--panel)',
          minHeight: '620px',
          overflow: 'hidden',
        }}
      >
        {/* Pane 1: Navigation / Folders */}
        <div style={{ borderRight: '1px solid var(--border)', padding: '1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--bg-soft, rgba(255,255,255,0.01))' }}>
          {[
            { id: 'sent', label: 'Sent Mail', count: messages.length },
            { id: 'leads', label: 'Recipient Leads', count: customers.length },
            { id: 'templates', label: 'Templates', count: templates.length },
            { id: 'settings', label: 'SMTP Settings', count: account?.isActive ? '✓' : '!' },
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setActiveFolder(f.id as any);
                setShowCompose(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.65rem 0.75rem',
                border: 'none',
                borderRadius: '8px',
                background: activeFolder === f.id && !showCompose ? 'var(--gold-dim, rgba(245, 158, 11, 0.15))' : 'transparent',
                color: activeFolder === f.id && !showCompose ? 'var(--text)' : 'var(--muted)',
                fontWeight: activeFolder === f.id && !showCompose ? 800 : 600,
                fontSize: '0.82rem',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span>{f.label}</span>
              <small style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>{f.count}</small>
            </button>
          ))}
        </div>

        {/* Pane 2: List */}
        <div style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--panel)', overflow: 'hidden' }}>
          <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--border)' }}>
            <input
              type="text"
              placeholder={`Search ${activeFolder}...`}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', fontSize: '0.8rem', padding: '6px 10px', borderRadius: '6px' }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {activeFolder === 'sent' && (
              filteredMessages.length === 0 ? (
                <p className="empty" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>No sent emails.</p>
              ) : (
                filteredMessages.map(msg => (
                  <div
                    key={msg._id}
                    onClick={() => { setSelectedMessage(msg); setShowCompose(false); }}
                    style={{
                      padding: '0.85rem 1rem',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: selectedMessage?._id === msg._id && !showCompose ? 'var(--bg-soft, rgba(255,255,255,0.03))' : 'transparent',
                      borderLeft: selectedMessage?._id === msg._id && !showCompose ? '3px solid var(--gold)' : '3px solid transparent',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <strong style={{ fontSize: '0.85rem' }}>{msg.customer?.name || msg.toEmail}</strong>
                      <small style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>{new Date(msg.sentAt).toLocaleDateString()}</small>
                    </div>
                    <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {msg.subject}
                    </span>
                  </div>
                ))
              )
            )}

            {activeFolder === 'leads' && (
              filteredCustomers.length === 0 ? (
                <p className="empty" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>No leads with emails.</p>
              ) : (
                filteredCustomers.map(cust => (
                  <div
                    key={cust._id}
                    onClick={() => {
                      setSelectedCustomer(cust);
                      setComposeCustomerId(cust._id);
                      setShowCompose(true);
                    }}
                    style={{
                      padding: '0.85rem 1rem',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    <strong style={{ display: 'block', fontSize: '0.85rem' }}>{cust.name}</strong>
                    <small style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>{cust.email}</small>
                  </div>
                ))
              )
            )}

            {activeFolder === 'templates' && (
              <>
                <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    className="btn small outline"
                    style={{ width: '100%' }}
                    onClick={() => {
                      setSelectedTemplate(null);
                      setTemplateForm({ name: '', category: 'custom', subject: '', body: '' });
                      setShowTemplateModal(true);
                    }}
                  >
                    + New Template
                  </button>
                </div>
                {filteredTemplates.map(tmpl => (
                  <div
                    key={tmpl._id}
                    onClick={() => { setSelectedTemplate(tmpl); setShowCompose(false); }}
                    style={{
                      padding: '0.85rem 1rem',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: selectedTemplate?._id === tmpl._id && !showCompose ? 'var(--bg-soft, rgba(255,255,255,0.03))' : 'transparent',
                    }}
                  >
                    <strong style={{ display: 'block', fontSize: '0.85rem' }}>{tmpl.name}</strong>
                    <small style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>{tmpl.subject}</small>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Pane 3: Detail / Compose / Settings */}
        <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
          {showCompose ? (
            <div>
              <h2 style={{ marginTop: 0, fontSize: '1.1rem', marginBottom: '1rem' }}>Compose Email</h2>
              <form onSubmit={handleSendEmail} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Recipient Lead *
                  <select
                    required
                    value={composeCustomerId}
                    onChange={e => setComposeCustomerId(e.target.value)}
                  >
                    <option value="">Select recipient...</option>
                    {customers.map(c => (
                      <option key={c._id} value={c._id}>{c.name} &lt;{c.email}&gt;</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Apply Template (Optional)
                  <select
                    value={composeTemplateId}
                    onChange={e => handleSelectTemplateForCompose(e.target.value)}
                  >
                    <option value="">No template</option>
                    {templates.map(t => (
                      <option key={t._id} value={t._id}>{t.name} ({t.category})</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Subject *
                  <input
                    required
                    placeholder="e.g. Follow-up regarding your project"
                    value={composeSubject}
                    onChange={e => setComposeSubject(e.target.value)}
                  />
                </label>

                <div>
                  <small style={{ color: 'var(--muted)', fontSize: '0.72rem', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                    Insert Merge Tag:
                  </small>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {['{{name}}', '{{company}}', '{{email}}', '{{phone}}', '{{dealValue}}', '{{user.name}}'].map(tag => (
                      <button
                        key={tag}
                        type="button"
                        className="btn small outline"
                        style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                        onClick={() => setComposeBody(prev => prev + ' ' + tag)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Body * (Supports variables like &#123;&#123;lead.name&#125;&#125;, &#123;&#123;lead.company&#125;&#125;, &#123;&#123;user.name&#125;&#125;)
                  <textarea
                    required
                    rows={10}
                    value={composeBody}
                    onChange={e => setComposeBody(e.target.value)}
                  />
                </label>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button className="btn primary" type="submit" disabled={sending}>
                    {sending ? 'Sending...' : 'Send Email'}
                  </button>
                  <button type="button" className="btn outline" onClick={() => setShowCompose(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          ) : activeFolder === 'settings' ? (
            <div>
              <h2 style={{ marginTop: 0, fontSize: '1.1rem', marginBottom: '1rem' }}>SMTP Account Settings</h2>
              <form onSubmit={handleSaveSmtp} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', maxWidth: '520px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                    Sender Name
                    <input
                      placeholder="e.g. Your Agency"
                      value={smtpForm.fromName}
                      onChange={e => setSmtpForm({ ...smtpForm, fromName: e.target.value })}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                    Sender Email *
                    <input
                      type="email"
                      required
                      placeholder="contact@vande.com"
                      value={smtpForm.fromEmail}
                      onChange={e => setSmtpForm({ ...smtpForm, fromEmail: e.target.value })}
                    />
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                    SMTP Host *
                    <input
                      required
                      placeholder="smtp.resend.com or smtp.gmail.com"
                      value={smtpForm.smtpHost}
                      onChange={e => setSmtpForm({ ...smtpForm, smtpHost: e.target.value })}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                    SMTP Port *
                    <input
                      type="number"
                      required
                      value={smtpForm.smtpPort}
                      onChange={e => setSmtpForm({ ...smtpForm, smtpPort: Number(e.target.value) || 587 })}
                    />
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                    SMTP Username *
                    <input
                      required
                      value={smtpForm.smtpUsername}
                      onChange={e => setSmtpForm({ ...smtpForm, smtpUsername: e.target.value })}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                    SMTP Password
                    <input
                      type="password"
                      placeholder={account ? '•••••••• (unchanged)' : 'Enter password'}
                      value={smtpForm.smtpPassword}
                      onChange={e => setSmtpForm({ ...smtpForm, smtpPassword: e.target.value })}
                    />
                  </label>
                </div>

                <button className="btn primary" type="submit" disabled={savingSmtp} style={{ marginTop: '0.5rem', alignSelf: 'flex-start' }}>
                  {savingSmtp ? 'Verifying & Saving...' : 'Verify & Save Settings'}
                </button>
              </form>
            </div>
          ) : selectedMessage ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>{selectedMessage.subject}</h2>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>
                    To: <strong>{selectedMessage.toEmail}</strong> {selectedMessage.customer ? `(${selectedMessage.customer.name})` : ''} · From: {selectedMessage.fromEmail}
                  </p>
                </div>
                <small style={{ color: 'var(--muted)' }}>
                  {new Date(selectedMessage.sentAt).toLocaleString()}
                </small>
              </div>

              <div style={{ background: 'var(--bg-soft, rgba(255,255,255,0.02))', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border)', whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: '0.9rem' }}>
                {selectedMessage.body}
              </div>
            </div>
          ) : selectedTemplate ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Template: {selectedTemplate.name}</h2>
                <button
                  type="button"
                  className="btn small danger"
                  onClick={() => handleDeleteTemplate(selectedTemplate._id, selectedTemplate.name)}
                >
                  Delete
                </button>
              </div>
              <p><strong>Subject:</strong> {selectedTemplate.subject}</p>
              <div style={{ background: 'var(--bg-soft, rgba(255,255,255,0.02))', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)', whiteSpace: 'pre-wrap' }}>
                {selectedTemplate.body}
              </div>
            </div>
          ) : (
            <p className="empty" style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>
              Select an item to view or click Compose Email.
            </p>
          )}
        </div>
      </div>

      {/* Template Modal */}
      {showTemplateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <form
            onSubmit={handleSaveTemplate}
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '520px',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Create Email Template</h2>
              <button type="button" className="btn small" onClick={() => setShowTemplateModal(false)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Template Name *
                <input
                  required
                  placeholder="e.g. Welcome Introduction"
                  value={templateForm.name}
                  onChange={e => setTemplateForm({ ...templateForm, name: e.target.value })}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Category
                <select
                  value={templateForm.category}
                  onChange={e => setTemplateForm({ ...templateForm, category: e.target.value })}
                >
                  {templateCategories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Subject *
                <input
                  required
                  placeholder="e.g. Welcome to {{organization.name}}"
                  value={templateForm.subject}
                  onChange={e => setTemplateForm({ ...templateForm, subject: e.target.value })}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Body *
                <textarea
                  required
                  rows={6}
                  value={templateForm.body}
                  onChange={e => setTemplateForm({ ...templateForm, body: e.target.value })}
                />
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button type="button" className="btn small" onClick={() => setShowTemplateModal(false)}>Cancel</button>
              <button type="submit" className="btn small primary" disabled={savingTemplate}>
                {savingTemplate ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </form>
        </div>
      )}

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
