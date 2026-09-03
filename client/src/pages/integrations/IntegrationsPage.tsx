import { useState, useEffect } from 'react';
import {
  integrationsApi,
  IntegrationsResponse,
  SyncLog,
  CompanyIntegrationSetup,
} from '../../api/integrations';
import { useAuth } from '../../contexts/AuthContext';

export default function IntegrationsPage() {
  const { user } = useAuth();

  const [data, setData] = useState<IntegrationsResponse | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'meta' | 'ga4' | 'webhook' | 'schedule'>('meta');

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form states for selected company
  const [metaAdAccountId, setMetaAdAccountId] = useState('');
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [ga4PropertyId, setGa4PropertyId] = useState('');
  const [ga4ServiceAccountJson, setGa4ServiceAccountJson] = useState('');
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncInterval, setSyncInterval] = useState(360);

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
    setGa4PropertyId(company.ga4PropertyId || '');
    setGa4ServiceAccountJson('');
    setSyncEnabled(Boolean(company.integrationSyncEnabled));
    setSyncInterval(company.integrationSyncIntervalMinutes || 360);
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

  async function handleSyncAll() {
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
    }
  }

  async function handleRetryLog(id: string) {
    try {
      setError('');
      await integrationsApi.retryLog(id);
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

  return (
    <div className="page-container">
      {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="notice success" style={{ marginBottom: '1rem' }}>{success}</div>}

      <section className="page-head" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <p className="eyebrow">Data Sync</p>
          <h1 style={{ margin: 0 }}>API & Webhook Integrations</h1>
          <p className="page-subtitle">Configure Meta Ads, Google Analytics 4, and universal webhook pipes.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <select
            value={selectedCompanyId}
            onChange={e => handleSelectCompany(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '6px', fontWeight: 800, background: 'var(--panel)', color: 'var(--text)' }}
          >
            {data?.setupChecklist.map(entry => {
              const c = entry.company;
              const doneCount = entry.items.filter(i => i.done).length;
              return (
                <option key={c._id} value={c._id}>
                  {c.name} ({doneCount}/6 configured)
                </option>
              );
            })}
          </select>

          <button
            type="button"
            className="btn outline"
            disabled={syncing}
            onClick={handleSyncAll}
          >
            {syncing ? 'Syncing...' : 'Sync All Brands'}
          </button>
        </div>
      </section>

      {/* Macro Platform Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { id: 'meta', title: 'Meta Ads Manager', tag: 'META ADS', desc: 'Sync spend figures, clicks, and lead forms.', color: '#1877f2' },
          { id: 'ga4', title: 'Google Analytics 4', tag: 'GA4 INGESTION', desc: 'Pull traffic volumes and conversion counts.', color: '#f4b400' },
          { id: 'webhook', title: 'Inbound Webhook Pipe', tag: 'WEBHOOK API', desc: 'Universal API route accepting leads from any website.', color: 'var(--gold)' },
          { id: 'schedule', title: 'Schedules & Logs', tag: 'DIAGNOSTICS', desc: 'Set sync timers and read real-time logs.', color: 'var(--teal)' },
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
              minHeight: '120px',
            }}
          >
            <div>
              <strong style={{ display: 'block', fontSize: '0.95rem', marginBottom: '0.35rem' }}>{card.title}</strong>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.4 }}>{card.desc}</p>
            </div>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: card.color, marginTop: '0.75rem' }}>
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
              <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.15rem' }}>{selectedCompany.name}</h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                Sync interval: {selectedCompany.integrationSyncIntervalMinutes || 360} mins · Status: {selectedCompany.integrationSyncEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <button
              type="button"
              className="btn small primary"
              disabled={syncing}
              onClick={handleSyncCompany}
            >
              {syncing ? 'Syncing Brand...' : '⚡ Sync Brand Now'}
            </button>
          </div>
        )}

        {/* META TAB */}
        {activeTab === 'meta' && (
          <form onSubmit={handleSaveCredentials} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '600px' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Meta Ads Integration Credentials</h3>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Meta Ad Account ID (digits only, without act_)
              <input
                placeholder="e.g. 123456789012345"
                value={metaAdAccountId}
                onChange={e => setMetaAdAccountId(e.target.value)}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Meta System User / Long-Lived Access Token
              <input
                type="password"
                placeholder={selectedCompany?.hasMetaToken ? '•••••••• (token saved and encrypted)' : 'Paste EAAB... token'}
                value={metaAccessToken}
                onChange={e => setMetaAccessToken(e.target.value)}
              />
            </label>

            <button className="btn primary" type="submit" disabled={savingCredentials} style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}>
              {savingCredentials ? 'Saving & Encrypting...' : 'Save Meta Credentials'}
            </button>
          </form>
        )}

        {/* GA4 TAB */}
        {activeTab === 'ga4' && (
          <form onSubmit={handleSaveCredentials} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '600px' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Google Analytics 4 Credentials</h3>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              GA4 Property ID (numeric only)
              <input
                placeholder="e.g. 392817291"
                value={ga4PropertyId}
                onChange={e => setGa4PropertyId(e.target.value)}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Google Service Account JSON Key
              <textarea
                rows={6}
                placeholder={selectedCompany?.hasGa4Json ? '•••••••• (Service account JSON saved and encrypted)' : '{"type": "service_account", "client_email": "...", "private_key": "..."}'}
                value={ga4ServiceAccountJson}
                onChange={e => setGa4ServiceAccountJson(e.target.value)}
              />
            </label>

            <button className="btn primary" type="submit" disabled={savingCredentials} style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}>
              {savingCredentials ? 'Saving & Encrypting...' : 'Save GA4 Credentials'}
            </button>
          </form>
        )}

        {/* WEBHOOK TAB */}
        {activeTab === 'webhook' && (
          <div style={{ maxWidth: '650px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Universal Inbound Webhook Pipe</h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.5 }}>
              Push leads from website landing pages, Webflow, WordPress, or Zapier directly into this CRM workspace.
            </p>

            <div style={{ background: 'var(--bg-soft, rgba(255,255,255,0.02))', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Webhook URL:</span>
                <code style={{ display: 'block', padding: '0.4rem 0.6rem', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  {window.location.origin}/api/v1/leads
                </code>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Brand API Key Header:</span>
                <code style={{ display: 'block', padding: '0.4rem 0.6rem', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  X-API-Key: {selectedCompany?.apiKey || 'No active API key for this workspace'}
                </code>
              </div>
            </div>
          </div>
        )}

        {/* SCHEDULE TAB */}
        {activeTab === 'schedule' && (
          <form onSubmit={handleSaveSchedule} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '500px' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Automated Synchronization Schedule</h3>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
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
        )}
      </div>

      {/* Diagnostics & History Logs */}
      <section style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', padding: '1.5rem' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem', marginBottom: '1rem' }}>Recent Sync Logs & Diagnostics</h2>
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
                          backgroundColor: log.status === 'success' ? 'var(--teal)' : log.status === 'failed' ? 'var(--red)' : 'var(--muted)',
                          fontSize: '0.65rem',
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
    </div>
  );
}
