import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { setupApi, SetupStep, SetupPreset } from '../../api/settings';
import { useAuth } from '../../contexts/AuthContext';

export default function SetupPage() {
  const { user, activeCompany } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [company, setCompany] = useState<{ _id: string; name: string } | null>(null);
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [completedSteps, setCompletedSteps] = useState(0);
  const [requiredStepCount, setRequiredStepCount] = useState(0);
  const [isFirstCompany, setIsFirstCompany] = useState(false);
  const [leadCount, setLeadCount] = useState(0);
  const [hasDemoData, setHasDemoData] = useState(false);
  const [presets, setPresets] = useState<Record<string, SetupPreset>>({});

  const [selectedPreset, setSelectedPreset] = useState('');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [applying, setApplying] = useState(false);
  const [clearingDemo, setClearingDemo] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);

  useEffect(() => {
    loadSetup();
  }, []);

  async function loadSetup() {
    try {
      setLoading(true);
      const res = await setupApi.get();
      setCompany(res.company);
      setSteps(res.steps);
      setCompletedSteps(res.completedSteps);
      setRequiredStepCount(res.requiredStepCount);
      setIsFirstCompany(res.isFirstCompany);
      setLeadCount(res.leadCount);
      setHasDemoData(res.hasDemoData);
      setPresets(res.presets);
    } catch (err: any) {
      setError(err.message || 'Failed to load setup data');
    } finally {
      setLoading(false);
    }
  }

  async function handleApplyPreset(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPreset || !confirmReplace) return;
    try {
      setApplying(true);
      setError('');
      setSuccess('');
      const res = await setupApi.applyPreset(selectedPreset);
      setSuccess(res.message || 'Preset applied. You can customize everything next.');
      setSelectedPreset('');
      setConfirmReplace(false);
      await loadSetup();
    } catch (err: any) {
      setError(err.message || 'Failed to apply preset');
    } finally {
      setApplying(false);
    }
  }

  async function handleClearDemo() {
    try {
      setClearingDemo(true);
      setError('');
      setSuccess('');
      const res = await setupApi.clearDemo();
      setSuccess(res.message || 'Onboarding demo data cleared.');
      await loadSetup();
    } catch (err: any) {
      setError(err.message || 'Failed to clear demo data');
    } finally {
      setClearingDemo(false);
    }
  }

  async function handleLoadDemo() {
    try {
      setLoadingDemo(true);
      setError('');
      setSuccess('');
      const res = await setupApi.loadDemo();
      setSuccess(res.message || 'Onboarding demo data loaded.');
      await loadSetup();
    } catch (err: any) {
      setError(err.message || 'Failed to load demo data');
    } finally {
      setLoadingDemo(false);
    }
  }

  if (loading) {
    return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading setup...</div>;
  }

  return (
    <div className="page-container experience-page setup-page">
      <section className="page-head">
        <div>
          <p className="eyebrow">Company setup</p>
          <h1 style={{ margin: '0.2rem 0' }}>{company ? company.name : 'CRM workspace'}</h1>
          <p className="page-subtitle">Use the existing CRM controls to make this workspace fit the company.</p>
        </div>
        <Link className="btn secondary" to="/settings">Back to customization</Link>
      </section>

      {isFirstCompany && (
        <div className="notice success" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
          <strong>Welcome to your new company workspace!</strong> This checklist sets up how your team works with this company.
        </div>
      )}

      {error && <div className="notice danger">{error}</div>}
      {success && <div className="notice success">{success}</div>}

      <section className="table-card" style={{ marginBottom: '1rem', padding: '1.25rem' }}>
        <h2>Start from an industry preset</h2>
        <p className="page-subtitle">This replaces the unused starter stages, labels, and fields. Your team can edit every item afterward.</p>
        <form onSubmit={handleApplyPreset} className="inline-form" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <select
            value={selectedPreset}
            onChange={e => setSelectedPreset(e.target.value)}
            required
            style={{ minWidth: 160 }}
          >
            <option value="">Choose a preset</option>
            {Object.entries(presets).map(([key, preset]) => (
              <option key={key} value={key}>{preset.label}</option>
            ))}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={confirmReplace}
              onChange={e => setConfirmReplace(e.target.checked)}
              required
            />
            Replace unused starter setup
          </label>
          <button className="btn primary" disabled={applying || !selectedPreset || !confirmReplace}>
            {applying ? 'Applying...' : 'Apply preset'}
          </button>
        </form>
      </section>

      {hasDemoData && (
        <section className="table-card" style={{ marginBottom: '1rem', padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: '0 0 0.25rem 0' }}>Clear Onboarding Demo Data</h2>
            <p className="page-subtitle" style={{ margin: 0 }}>Remove the sample onboarding leads and tasks to start with a completely clean CRM workspace.</p>
          </div>
          <button
            className="btn secondary outline"
            onClick={handleClearDemo}
            disabled={clearingDemo}
            style={{ color: 'var(--red)', borderColor: 'var(--red)', fontWeight: 800, whiteSpace: 'nowrap' }}
          >
            {clearingDemo ? 'Clearing...' : 'Clear Demo Data'}
          </button>
        </section>
      )}

      {!hasDemoData && leadCount === 0 && (
        <section className="table-card" style={{ marginBottom: '1rem', padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: '0 0 0.25rem 0' }}>Load Onboarding Demo Data</h2>
            <p className="page-subtitle" style={{ margin: 0 }}>Optional: Populate this workspace with a few sample leads and tasks to quickly see how the pipeline, table, and dashboard function.</p>
          </div>
          <button
            className="btn primary"
            onClick={handleLoadDemo}
            disabled={loadingDemo}
            style={{ fontWeight: 800, background: 'var(--gold)', borderColor: 'var(--gold)', color: '#fff', whiteSpace: 'nowrap' }}
          >
            {loadingDemo ? 'Loading...' : 'Load Demo Data'}
          </button>
        </section>
      )}

      <section className="table-card" style={{ marginBottom: '1rem', padding: '1.25rem' }}>
        <strong>{completedSteps} of {requiredStepCount} core setup steps ready</strong>
        <div style={{ height: 8, borderRadius: 999, background: 'var(--border)', marginTop: '.75rem', overflow: 'hidden' }}>
          <span style={{ display: 'block', width: `${Math.round((completedSteps / requiredStepCount) * 100)}%`, height: '100%', background: 'var(--gold)' }} />
        </div>
        <p className="page-subtitle" style={{ margin: '.75rem 0 0' }}>
          {leadCount ? `${leadCount} lead${leadCount === 1 ? '' : 's'} already in this workspace.` : 'Start with the company profile, then shape the pipeline before importing leads.'}
        </p>
      </section>

      <section className="settings-grid">
        {steps.map((step, index) => (
          <article key={index} className="settings-panel" style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem' }}>
              <span className="pill" style={{ '--pill': step.done ? 'var(--teal)' : 'var(--gold)' } as React.CSSProperties}>
                {step.done ? 'READY' : step.optional ? 'OPTIONAL' : `STEP ${index + 1}`}
              </span>
              {step.done && <span style={{ color: 'var(--teal)', fontWeight: 800 }}>&#10003;</span>}
            </div>
            <div>
              <h2 style={{ margin: '0 0 .35rem' }}>{step.title}</h2>
              <p className="page-subtitle" style={{ margin: 0 }}>{step.detail}</p>
            </div>
            <Link
              className={`btn ${step.done ? 'secondary' : 'primary'}`}
              to={step.href}
              style={{ marginTop: 'auto', alignSelf: 'flex-start' }}
            >
              {step.done ? 'Review' : step.action}
            </Link>
          </article>
        ))}
      </section>
    </div>
  );
}
