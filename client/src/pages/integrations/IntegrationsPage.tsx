import { useState, useEffect } from 'react';
import {
  integrationsApi,
  IntegrationsResponse,
} from '../../api/integrations';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import DatePicker from '../../components/DatePicker';

export default function IntegrationsPage() {
  const { user } = useAuth();

  const [data, setData] = useState<IntegrationsResponse | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'meta' | 'ga4' | 'drive' | 'webhook' | 'schedule'>('meta');

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
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

  // Form states for selected company
  const [metaAdAccountId, setMetaAdAccountId] = useState('');
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [metaTokenExpiresAt, setMetaTokenExpiresAt] = useState('');
  const [ga4PropertyId, setGa4PropertyId] = useState('');
  const [ga4ServiceAccountJson, setGa4ServiceAccountJson] = useState('');
  const [googleDriveFolderLink, setGoogleDriveFolderLink] = useState('');
  const [googleDriveServiceAccountJson, setGoogleDriveServiceAccountJson] = useState('');
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncInterval, setSyncInterval] = useState(360);
  const [apiKeyStatus, setApiKeyStatus] = useState<'active' | 'disabled'>('active');

  useEffect(() => {
    loadIntegrations();
  }, []);

  async function loadIntegrations() {
    try {
      setLoading(true);
      setError('');
      const res = await integrationsApi.get();
      setData(res);

      if (res.setupChecklist?.length && !selectedCompanyId) {
        const first = res.setupChecklist[0].company;
        setSelectedCompanyId(first._id);
        populateForms(first);
      } else if (selectedCompanyId && res.setupChecklist) {
        const found = res.setupChecklist.find(c => c.company._id === selectedCompanyId)?.company;
        if (found) populateForms(found);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  }

  function populateForms(company: any) {
    setMetaAdAccountId(company.metaAdAccountId || '');
    setMetaAccessToken('');
    setMetaTokenExpiresAt(company.metaTokenExpiresAt ? company.metaTokenExpiresAt.slice(0, 10) : '');
    setGa4PropertyId(company.ga4PropertyId || '');
    setGa4ServiceAccountJson('');
    setGoogleDriveFolderLink(company.googleDriveFolderLink || '');
    setGoogleDriveServiceAccountJson('');
    setSyncEnabled(Boolean(company.integrationSyncEnabled));
    setSyncInterval(company.integrationSyncIntervalMinutes || 360);
    setApiKeyStatus(company.apiKeyStatus || 'active');
  }

  function handleSelectCompany(id: string) {
    setSelectedCompanyId(id);
    const found = data?.setupChecklist.find(c => c.company._id === id)?.company;
    if (found) populateForms(found);
  }

  async function handleSaveCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCompanyId) return;
    try {
      setSavingCredentials(true);
      setError('');
      await integrationsApi.saveCredentials(selectedCompanyId, {
        metaAdAccountId,
        metaAccessToken,
        ga4PropertyId,
        ga4ServiceAccountJson,
      });
      setSuccess('Integration credentials saved and encrypted.');
      await loadIntegrations();
    } catch (err: any) {
      setError(err.message || 'Failed to save credentials');
    } finally {
      setSavingCredentials(false);
    }
  }

  async function handleSaveDrive(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCompanyId) return;
    try {
      setSavingCredentials(true);
      setError('');
      await integrationsApi.saveCredentials(selectedCompanyId, {
        googleDriveFolderLink,
        googleDriveServiceAccountJson,
      });
      setSuccess('Google Drive storage connected. New files will upload there automatically.');
      await loadIntegrations();
    } catch (err: any) {
      setError(err.message || 'Failed to connect Google Drive');
    } finally {
      setSavingCredentials(false);
    }
  }

  function promptClearMetaCredentials() {
    setConfirmState({
      open: true,
      title: 'Clear Meta Credentials',
      message: 'Clear saved Meta Ads credentials for this brand? Automatic Meta syncing will stop.',
      confirmText: 'Clear Credentials',
      variant: 'danger',
      action: async () => {
        if (!selectedCompanyId) return;
        try {
          await integrationsApi.clearMeta(selectedCompanyId);
          setMetaAdAccountId('');
          setMetaAccessToken('');
          setSuccess('Meta credentials cleared.');
          await loadIntegrations();
        } catch (err: any) {
          setError(err.message || 'Failed to clear Meta credentials');
        } finally {
          setConfirmState(prev => ({ ...prev, open: false }));
        }
      },
    });
  }

  function promptClearGa4Credentials() {
    setConfirmState({
      open: true,
      title: 'Clear GA4 Credentials',
      message: 'Clear saved Google Analytics 4 credentials for this brand? Automatic GA4 syncing will stop.',
      confirmText: 'Clear Credentials',
      variant: 'danger',
      action: async () => {
        if (!selectedCompanyId) return;
        try {
          await integrationsApi.clearGa4(selectedCompanyId);
          setGa4PropertyId('');
          setGa4ServiceAccountJson('');
          setSuccess('GA4 credentials cleared.');
          await loadIntegrations();
        } catch (err: any) {
          setError(err.message || 'Failed to clear GA4 credentials');
        } finally {
          setConfirmState(prev => ({ ...prev, open: false }));
        }
      },
    });
  }


  async function handleApiKeyStatus() {
    if (!selectedCompanyId) return;
    try {
      setSyncing(true); setError('');
      const next = apiKeyStatus === 'active' ? 'disabled' : 'active';
      await integrationsApi.setApiKeyStatus(selectedCompanyId, next);
      setApiKeyStatus(next); setSuccess(`Inbound API key ${next}.`); await loadIntegrations();
    } catch (err: any) { setError(err.message || 'Failed to update API key'); } finally { setSyncing(false); }
  }

  function promptRotateApiKey() {
    setConfirmState({ open: true, title: 'Rotate inbound API key', message: 'The current key will stop working immediately. Update every webhook sender after rotating.', confirmText: 'Rotate key', variant: 'danger', action: async () => {
      if (!selectedCompanyId) return;
      try { await integrationsApi.rotateApiKey(selectedCompanyId); setSuccess('Inbound API key rotated.'); await loadIntegrations(); }
      catch (err: any) { setError(err.message || 'Failed to rotate API key'); }
      finally { setConfirmState(prev => ({ ...prev, open: false })); }
    }});
  }

  async function handleRunDue() {
    try { setSyncing(true); setError(''); const result = await integrationsApi.runDue(); setSuccess(`Ran ${result.count} due integration sync(s).`); await loadIntegrations(); }
    catch (err: any) { setError(err.message || 'Failed to run scheduled syncs'); } finally { setSyncing(false); }
  }

  async function handleSaveSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCompanyId) return;
    try {
      setSavingSchedule(true);
      setError('');
      await integrationsApi.saveSyncSettings(selectedCompanyId, {
        integrationSyncEnabled: syncEnabled,
        integrationSyncIntervalMinutes: Number(syncInterval) || 360,
      });
      setSuccess('Sync schedule saved.');
      await loadIntegrations();
    } catch (err: any) {
      setError(err.message || 'Failed to save schedule');
    } finally {
      setSavingSchedule(false);
    }
  }

  async function handleSyncCompany() {
    if (!selectedCompanyId) return;
    try {
      setSyncing(true);
      setError('');
      await integrationsApi.syncCompany(selectedCompanyId);
      setSuccess('Company data sync completed.');
      await loadIntegrations();
    } catch (err: any) {
      setError(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  function promptSyncAll() {
    setConfirmState({
      open: true,
      title: 'Sync All Brands',
      message: 'Run full sync query across all configured brands and platforms? This might take a moment.',
      confirmText: 'Sync All',
      variant: 'primary',
      action: async () => {
        try {
          setSyncing(true);
          setError('');
          const res = await integrationsApi.syncAll();
          setSuccess(`Organization sync completed. Meta: ${res.summary.metaSuccess}, GA4: ${res.summary.ga4Success}, Failures: ${res.summary.failures}`);
          await loadIntegrations();
        } catch (err: any) {
          setError(err.message || 'Sync failed');
        } finally {
          setSyncing(false);
          setConfirmState(prev => ({ ...prev, open: false }));
        }
      },
    });
  }

  async function handleRetryLog(logId: string) {
    try {
      setError('');
      await integrationsApi.retryLog(logId);
      setSuccess('Retry triggered.');
      await loadIntegrations();
    } catch (err: any) {
      setError(err.message || 'Retry failed');
    }
  }

  if (loading && !data) {
    return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading integrations...</div>;
  }

  const selectedSetup = data?.setupChecklist.find(c => c.company._id === selectedCompanyId);
  const selectedCompany = selectedSetup?.company;
  const webhookUrl = `${window.location.origin}/api/v1/leads`;

  return (
    <div className="page-container experience-page integrations-page">
      {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="notice success" style={{ marginBottom: '1rem' }}>{success}</div>}

      <section className="page-head" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <p className="eyebrow" style={{ margin: 0, fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800 }}>Data Sync</p>
          <h1 style={{ margin: '0.2rem 0', fontSize: '1.5rem', fontFamily: 'var(--font-display)' }}>API & Webhook Integrations</h1>
          <p className="page-subtitle" style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>
            Connect campaign data, Google Drive file storage, and inbound lead sources.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <label style={{ fontSize: '0.74rem', fontWeight: 850, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Client Brand:
          </label>
          <select
            value={selectedCompanyId}
            onChange={e => handleSelectCompany(e.target.value)}
            style={{ minWidth: '220px', height: '36px', borderRadius: '6px', fontWeight: 800, background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', padding: '0 10px', cursor: 'pointer' }}
          >
            {data?.setupChecklist.map(entry => {
              const c = entry.company;
              const doneCount = entry.items.filter(i => i.done).length;
              return (
                <option key={c._id} value={c._id}>
                  {c.name} ({doneCount}/{entry.items.length} configured)
                </option>
              );
            })}
          </select>

          <button
            type="button"
            className="btn outline"
            disabled={syncing}
            onClick={promptSyncAll}
          >
            {syncing ? 'Syncing...' : 'Sync All Brands'}
          </button>
        </div>
      </section>

      {/* Macro Platform Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { id: 'meta', title: 'Meta Ads Manager', tag: 'META ADS FORM', desc: 'Sync spend figures, clicks, and ingest Meta lead forms.', color: '#1877f2', icon: 'f' },
          { id: 'ga4', title: 'Google Analytics 4', tag: 'GA4 INGESTION', desc: 'Pulls campaign traffic volume and GA4 conversion counts.', color: '#f4b400', icon: 'G' },
          { id: 'drive', title: 'Google Drive', tag: 'FILE STORAGE', desc: 'Store new lead and company files in a shared Drive folder.', color: '#0f9d58', icon: 'D' },
          { id: 'webhook', title: 'Inbound Webhook Pipe', tag: 'API ENDPOINT', desc: 'A universal inbound API route accepting leads from any website.', color: 'var(--gold)', icon: '⚡' },
          { id: 'schedule', title: 'Schedules & Logs', tag: 'DIAGNOSTICS', desc: 'Set automated sync timers, check health status, and read logs.', color: 'var(--teal)', icon: '⏱' },
        ].map(card => (
          <div
            key={card.id}
            onClick={() => setActiveTab(card.id as any)}
            style={{
              padding: '1.25rem',
              borderRadius: '12px',
              border: activeTab === card.id ? `2px solid ${card.color}` : '1px solid var(--border)',
              background: 'var(--panel)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '130px',
              boxShadow: activeTab === card.id ? `0 0 12px ${card.color}25` : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                <span
                  style={{
                    background: card.color,
                    color: '#fff',
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '0.9rem',
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  {card.icon}
                </span>
                <strong style={{ fontSize: '0.9rem', fontFamily: 'var(--font-display)' }}>{card.title}</strong>
              </div>
              <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--muted)', lineHeight: 1.4 }}>{card.desc}</p>
            </div>
            <span
              style={{
                fontSize: '0.64rem',
                fontWeight: 700,
                color: card.color,
                background: `${card.color}15`,
                border: `1px solid ${card.color}30`,
                padding: '2px 8px',
                borderRadius: '4px',
                width: 'fit-content',
                marginTop: '0.75rem',
              }}
            >
              {card.tag}
            </span>
          </div>
        ))}
      </div>

      {/* Selected Company HUD & Active Tab Content */}
      <div style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', padding: '1.5rem', marginBottom: '2rem' }}>
        {selectedCompany && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.15rem', fontFamily: 'var(--font-display)' }}>{selectedCompany.name}</h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                Sync interval: {selectedCompany.integrationSyncIntervalMinutes || 360} mins · Status:{' '}
                <strong style={{ color: selectedCompany.integrationSyncEnabled ? 'var(--green)' : 'var(--muted)' }}>
                  {selectedCompany.integrationSyncEnabled ? 'Enabled' : 'Disabled'}
                </strong>
              </span>
            </div>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn small outline" disabled={syncing} onClick={handleRunDue}>Run Due Syncs</button>
              <button type="button" className="btn small outline" disabled={syncing} onClick={handleApiKeyStatus}>{apiKeyStatus === 'active' ? 'Disable API Key' : 'Enable API Key'}</button>
              <button type="button" className="btn small outline" disabled={syncing} onClick={promptRotateApiKey}>Rotate API Key</button>
            <button
              type="button"
              className="btn small primary"
              disabled={syncing}
              onClick={handleSyncCompany}
            >
              {syncing ? 'Syncing Brand...' : '⚡ Sync Brand Now'}
            </button>
            </div>
          </div>
        )}

        {/* TAB 1: META ADS */}
        {activeTab === 'meta' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem', alignItems: 'start' }}>
            {/* Left Column: Form */}
            <form onSubmit={handleSaveCredentials} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--gold)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                Meta Ads Integration Settings
              </h3>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Meta Ad Account ID
                <input
                  placeholder="e.g. 1234567890 (numbers only, no act_ prefix)"
                  value={metaAdAccountId}
                  onChange={e => setMetaAdAccountId(e.target.value)}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Meta Access Token
                <input
                  type="password"
                  placeholder={selectedCompany?.hasMetaToken ? '•••••••• (token saved and encrypted)' : 'Paste EAAB... token'}
                  value={metaAccessToken}
                  onChange={e => setMetaAccessToken(e.target.value)}
                />
                <small style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
                  Leave blank to preserve existing encrypted token.
                </small>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Meta Token Expiry Date
                <DatePicker
                  value={metaTokenExpiresAt}
                  placeholder="Expiry date"
                  onChange={val => setMetaTokenExpiresAt(val)}
                />
              </label>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn primary" type="submit" disabled={savingCredentials}>
                  {savingCredentials ? 'Saving & Encrypting...' : 'Save Meta Settings'}
                </button>
                <button
                  type="button"
                  className="btn outline"
                  style={{ color: 'var(--red)', borderColor: 'rgba(220, 38, 38, 0.35)' }}
                  onClick={promptClearMetaCredentials}
                >
                  Clear Credentials
                </button>
              </div>
            </form>

            {/* Right Column: Instructional Guide & Checklist */}
            <div>
              <div style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.25rem', fontSize: '0.76rem', lineHeight: 1.5, color: 'var(--sub)', marginBottom: '1.25rem' }}>
                <h4 style={{ margin: '0 0 0.5rem', color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: '0.84rem' }}>
                  How to get Meta Credentials:
                </h4>
                <ol style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li>Go to your <strong>Meta Business Manager</strong> &rarr; <strong>Ad Accounts</strong>. Copy the numeric <strong>Ad Account ID</strong> (do not include the <code>act_</code> prefix).</li>
                  <li>Go to <strong>Business Settings</strong> &rarr; <strong>Users</strong> &rarr; <strong>System Users</strong>. Create a System User and assign it the <strong>Ad Account</strong> with full control.</li>
                  <li>Click <strong>Generate Token</strong>, select the <code>ads_management</code> and <code>ads_read</code> permissions, and copy the generated token.</li>
                </ol>
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '1.1rem', background: 'var(--surface)' }}>
                <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', fontFamily: 'var(--font-display)', color: 'var(--text)' }}>
                  Meta Setup Checklist:
                </h4>
                <div style={{ display: 'grid', gap: '0.45rem', fontSize: '0.74rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{metaAdAccountId ? '✅' : '⚪'}</span>
                    <span>Ad Account ID Configured</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{selectedCompany?.hasMetaToken || metaAccessToken ? '✅' : '⚪'}</span>
                    <span>System User Access Token Stored</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{selectedCompany?.integrationSyncEnabled ? '✅' : '⚪'}</span>
                    <span>Automatic Sync Enabled</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: GA4 */}
        {activeTab === 'ga4' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem', alignItems: 'start' }}>
            {/* Left Column: Form */}
            <form onSubmit={handleSaveCredentials} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--gold)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                Google Analytics 4 Settings
              </h3>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                GA4 Property ID (numeric only)
                <input
                  placeholder="e.g. 987654321"
                  value={ga4PropertyId}
                  onChange={e => setGa4PropertyId(e.target.value)}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Google Service Account JSON Key
                <textarea
                  rows={6}
                  placeholder={selectedCompany?.hasGa4Json ? '•••••••• (Service account JSON saved and encrypted)' : 'Paste private Service Account JSON key contents here'}
                  value={ga4ServiceAccountJson}
                  onChange={e => setGa4ServiceAccountJson(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: '0.74rem' }}
                />
                <small style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
                  Leave blank to preserve existing encrypted key.
                </small>
              </label>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn primary" type="submit" disabled={savingCredentials}>
                  {savingCredentials ? 'Saving & Encrypting...' : 'Save GA4 Settings'}
                </button>
                <button
                  type="button"
                  className="btn outline"
                  style={{ color: 'var(--red)', borderColor: 'rgba(220, 38, 38, 0.35)' }}
                  onClick={promptClearGa4Credentials}
                >
                  Clear Credentials
                </button>
              </div>
            </form>

            {/* Right Column: Instructions */}
            <div>
              <div style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.25rem', fontSize: '0.76rem', lineHeight: 1.5, color: 'var(--sub)', marginBottom: '1.25rem' }}>
                <h4 style={{ margin: '0 0 0.5rem', color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: '0.84rem' }}>
                  How to get Google credentials:
                </h4>
                <ol style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li>In Google Analytics, go to <strong>Admin</strong> &rarr; <strong>Property Settings</strong> and copy the <strong>Property ID</strong>.</li>
                  <li>Go to the <strong>Google Cloud Console</strong>, create a project, and create a <strong>Service Account</strong>.</li>
                  <li>Inside the Service Account, go to <strong>Keys</strong> &rarr; <strong>Add Key</strong> &rarr; <strong>Create JSON</strong>, download the file, and paste its full text contents here.</li>
                  <li><strong>Crucial Step</strong>: Copy the <code>client_email</code> address inside that JSON, go to your GA4 property &rarr; <strong>Property Access Management</strong>, add the email, and assign the <strong>Viewer</strong> role.</li>
                </ol>
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '1.1rem', background: 'var(--surface)' }}>
                <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', fontFamily: 'var(--font-display)', color: 'var(--text)' }}>
                  GA4 Setup Checklist:
                </h4>
                <div style={{ display: 'grid', gap: '0.45rem', fontSize: '0.74rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{ga4PropertyId ? '✅' : '⚪'}</span>
                    <span>GA4 Property ID Configured</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{selectedCompany?.hasGa4Json || ga4ServiceAccountJson ? '✅' : '⚪'}</span>
                    <span>Service Account JSON Stored</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{selectedCompany?.integrationSyncEnabled ? '✅' : '⚪'}</span>
                    <span>Automatic Sync Enabled</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* GOOGLE DRIVE */}
        {activeTab === 'drive' && (
          <div className="integration-setup-grid">
            <form onSubmit={handleSaveDrive} className="integration-form-stack">
              <div className="integration-section-title drive">
                <div>
                  <h3>Google Drive file storage</h3>
                  <p>New files uploaded from leads and companies will appear in this folder.</p>
                </div>
                <span className={`connection-pill ${selectedCompany?.googleDriveFolderLink && selectedCompany?.hasGoogleDriveJson ? 'connected' : ''}`}>
                  {selectedCompany?.googleDriveFolderLink && selectedCompany?.hasGoogleDriveJson ? 'Connected' : 'Setup needed'}
                </span>
              </div>

              <label className="integration-field">
                Shared Drive folder URL
                <input
                  type="url"
                  placeholder="https://drive.google.com/drive/folders/..."
                  value={googleDriveFolderLink}
                  onChange={e => setGoogleDriveFolderLink(e.target.value)}
                  required
                />
                <small>Use one folder for this client workspace. Existing CRM files stay where they are.</small>
              </label>

              <label className="integration-field">
                Google service account JSON
                <textarea
                  rows={7}
                  placeholder={selectedCompany?.hasGoogleDriveJson ? 'Service account saved securely — leave blank to keep it' : 'Paste the full JSON key here'}
                  value={googleDriveServiceAccountJson}
                  onChange={e => setGoogleDriveServiceAccountJson(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: '0.74rem' }}
                />
                <small>Encrypted before it is stored. Leave blank to keep the saved key.</small>
              </label>

              <div className="integration-action-row">
                <button className="btn primary" type="submit" disabled={savingCredentials}>
                  {savingCredentials ? 'Connecting...' : 'Connect Drive storage'}
                </button>
                {selectedCompany?.googleDriveFolderLink && (
                  <a className="btn outline" href={selectedCompany.googleDriveFolderLink} target="_blank" rel="noreferrer">
                    Open folder
                  </a>
                )}
              </div>
            </form>

            <div className="integration-guide">
              <div className="integration-guide-step"><span>1</span><div><strong>Enable Google Drive API</strong><p>Use the same Google Cloud project as the service account.</p></div></div>
              <div className="integration-guide-step"><span>2</span><div><strong>Share the folder</strong><p>Add the JSON key’s <code>client_email</code> as an Editor on the Drive folder.</p></div></div>
              <div className="integration-guide-step"><span>3</span><div><strong>Paste and connect</strong><p>Uploads switch to Drive immediately after both checks are complete.</p></div></div>
              <div className="drive-routing-note">
                <strong>Automatic routing</strong>
                <p>{selectedCompany?.googleDriveFolderLink && selectedCompany?.hasGoogleDriveJson
                  ? 'Drive is ready. New uploads will be stored in the shared folder.'
                  : 'Until setup is complete, uploads continue using CRM storage.'}</p>
              </div>
            </div>
          </div>
        )}

        {/* WEBHOOK */}
        {activeTab === 'webhook' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem', alignItems: 'start' }}>
            <div>
              <h3 style={{ margin: '0 0 1.25rem', fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--gold)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                Inbound Webhook Pipe
              </h3>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '4px', color: 'var(--muted)' }}>
                  Webhook Endpoint URL
                </label>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <input
                    type="text"
                    readOnly
                    value={webhookUrl}
                    style={{ flex: 1, height: '36px', fontSize: '0.74rem', padding: '0 10px', fontFamily: 'monospace' }}
                    onClick={e => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    type="button"
                    className="btn small outline"
                    onClick={() => {
                      navigator.clipboard.writeText(webhookUrl);
                      setSuccess('Copied Webhook URL!');
                    }}
                  >
                    Copy URL
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '4px', color: 'var(--muted)' }}>
                  Workspace Inbound API Key
                </label>
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  <code style={{ flex: 1, padding: '0.45rem 0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.78rem', color: 'var(--gold)' }}>
                    {selectedCompany?.apiKey || 'No active API key generated'}
                  </code>
                  <button
                    type="button"
                    className="btn small outline"
                    onClick={() => {
                      if (selectedCompany?.apiKey) {
                        navigator.clipboard.writeText(selectedCompany.apiKey);
                        setSuccess('Copied API Key!');
                      }
                    }}
                  >
                    Copy Key
                  </button>
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.25rem', fontSize: '0.76rem', lineHeight: 1.5, color: 'var(--sub)' }}>
              <h4 style={{ margin: '0 0 0.5rem', color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: '0.84rem' }}>
                How to integrate lead capture:
              </h4>
              <p style={{ margin: '0 0 0.75rem' }}>Send an HTTP <code>POST</code> request containing lead fields in the JSON payload.</p>

              <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '4px', fontSize: '0.74rem' }}>
                cURL Example:
              </strong>
              <pre style={{ background: 'var(--surface)', padding: '8px', borderRadius: '6px', fontSize: '0.68rem', overflowX: 'auto', color: 'var(--muted)', margin: '0 0 0.75rem 0', border: '1px solid var(--border)', fontFamily: 'monospace' }}>
{`curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${selectedCompany?.apiKey || 'YOUR_API_KEY'}" \\
  -d '{
    "name": "Jane Doe",
    "email": "jane@example.com",
    "phone": "+919876543210",
    "notes": "Interested in Premium Package"
  }'`}
              </pre>

              <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '4px', fontSize: '0.74rem' }}>
                JavaScript Fetch Example:
              </strong>
              <pre style={{ background: 'var(--surface)', padding: '8px', borderRadius: '6px', fontSize: '0.68rem', overflowX: 'auto', color: 'var(--muted)', margin: 0, border: '1px solid var(--border)', fontFamily: 'monospace' }}>
{`await fetch("${webhookUrl}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "${selectedCompany?.apiKey || 'YOUR_API_KEY'}"
  },
  body: JSON.stringify({
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "+919876543210"
  })
});`}
              </pre>
            </div>
          </div>
        )}

        {/* TAB 4: SCHEDULE & DIAGNOSTICS */}
        {activeTab === 'schedule' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem', alignItems: 'start' }}>
            <form onSubmit={handleSaveSchedule} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--gold)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                Sync Schedule Configuration
              </h3>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={syncEnabled}
                  onChange={e => setSyncEnabled(e.target.checked)}
                />
                Enable Automatic Background Sync
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Sync Interval (Minutes, minimum 15)
                <input
                  type="number"
                  min={15}
                  value={syncInterval}
                  onChange={e => setSyncInterval(Number(e.target.value) || 360)}
                />
              </label>

              <button className="btn primary" type="submit" disabled={savingSchedule} style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}>
                {savingSchedule ? 'Saving Schedule...' : 'Save Sync Schedule'}
              </button>
            </form>

            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '1.25rem', background: 'var(--surface)' }}>
              <h4 style={{ margin: '0 0 1rem', fontSize: '0.95rem', fontFamily: 'var(--font-display)', color: 'var(--gold)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                Ingestion Diagnostics
              </h4>
              <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.76rem', color: 'var(--sub)' }}>
                <div>Last Sync Run: <strong style={{ color: 'var(--text)' }}>{selectedCompany?.lastIntegrationSyncAt ? new Date(selectedCompany.lastIntegrationSyncAt).toLocaleString() : 'Never'}</strong></div>
                <div>Last Sync Status: <strong style={{ color: selectedSetup?.latestLog?.status === 'success' ? 'var(--green)' : selectedSetup?.latestLog?.status === 'failed' ? 'var(--red)' : 'var(--muted)' }}>{(selectedSetup?.latestLog?.status || 'never').toUpperCase()}</strong></div>
                <div>API Key Suffix: <strong style={{ color: 'var(--text)' }}>{selectedCompany?.apiKey ? selectedCompany.apiKey.slice(-6) : 'N/A'}</strong></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Diagnostics & History Logs */}
      <section style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', padding: '1.5rem' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem', marginBottom: '1rem', fontFamily: 'var(--font-display)' }}>Recent Sync Logs & Diagnostics</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)' }}>
                <th style={{ padding: '0.6rem 0.75rem' }}>Time</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>Brand</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>Provider</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>Trigger</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>Status</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>Synced / Failed</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {data?.logs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--muted)' }}>
                    No sync logs recorded yet.
                  </td>
                </tr>
              ) : (
                data?.logs.map(log => (
                  <tr key={log._id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      {log.startedAt ? new Date(log.startedAt).toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', fontWeight: 700 }}>
                      {log.clientCompany?.name || 'All Brands'}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', textTransform: 'uppercase' }}>
                      {log.provider}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      {log.trigger}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <span
                        className="stage-badge"
                        style={{
                          backgroundColor: log.status === 'success' ? 'var(--green)' : log.status === 'failed' ? 'var(--red)' : 'var(--muted)',
                          color: '#fff',
                          fontSize: '0.65rem',
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        {log.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      {log.syncedCount || 0} / {log.failedCount || 0}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      {log.status === 'failed' && (
                        <button
                          type="button"
                          className="btn small outline"
                          onClick={() => handleRetryLog(log._id)}
                        >
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

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
