import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { settingsApi, SettingsResponse, Terminology, ThemeColors, AutomationRule } from '../../api/settings';
import { WorkType } from '../../api/work';
import { Stage, Label, CustomField } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import WorkTypeBuilder from './WorkTypeBuilder';
import AutomationsTab from './AutomationsTab';
import Icon from '../../components/Icons';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function SettingsPage() {
  const { user, activeCompany } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeCategory = searchParams.get('category') || 'stages';

  const [stages, setStages] = useState<Stage[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [automations, setAutomations] = useState<AutomationRule[]>([]);
  const [users, setUsers] = useState<{ _id: string; name: string; role: string }[]>([]);
  const [builderTarget, setBuilderTarget] = useState<WorkType | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    action: () => Promise<void> | void;
  }>({
    open: false,
    title: '',
    message: '',
    action: () => {},
  });
  const [terminology, setTerminology] = useState<Terminology>({
    leadSingular: 'Lead',
    leadPlural: 'Leads',
    recordSingular: 'Deliverable',
    recordPlural: 'Deliverables',
    pipelineName: 'Pipeline',
  });
  const [theme, setTheme] = useState<ThemeColors>({
    gold: '#b58d00',
    teal: '#0f766e',
    background: '#ffffff',
    surface: '#ffffff',
    text: '#121214',
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Stage form
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('#475569');
  const [newStageWon, setNewStageWon] = useState(false);
  const [newStageLost, setNewStageLost] = useState(false);
  const [addingStage, setAddingStage] = useState(false);

  // Field form
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');
  const [newFieldOptions, setNewFieldOptions] = useState('');
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [addingField, setAddingField] = useState(false);

  // Label form
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#64748b');
  const [addingLabel, setAddingLabel] = useState(false);

  // Terminology form
  const [termForm, setTermForm] = useState<Terminology>(terminology);
  const [savingTerms, setSavingTerms] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      setError('');
      const res = await settingsApi.get();
      setStages(res.stages || []);
      setLabels(res.labels || []);
      setFields(res.fields || []);
      setWorkTypes(res.workTypes || []);
      setAutomations(res.automations || []);
      setUsers(res.users || []);
      if (res.terminology) {
        setTerminology(res.terminology);
        setTermForm(res.terminology);
      }
      if (res.organization?.theme) {
        setTheme(res.organization.theme);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  function handleCategoryChange(cat: string) {
    const updated = new URLSearchParams(searchParams);
    updated.set('category', cat);
    setSearchParams(updated);
  }

  // Stage actions
  async function handleAddStage(e: React.FormEvent) {
    e.preventDefault();
    if (!newStageName.trim()) return;
    try {
      setAddingStage(true);
      await settingsApi.createStage({
        name: newStageName.trim(),
        color: newStageColor,
        isWon: newStageWon,
        isLost: newStageLost,
      });
      setNewStageName('');
      setNewStageWon(false);
      setNewStageLost(false);
      setSuccess('Stage created.');
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Failed to create stage');
    } finally {
      setAddingStage(false);
    }
  }

  function handleDeleteStage(id: string, name: string) {
    setConfirmState({
      open: true,
      title: 'Delete Stage',
      message: `Delete stage "${name}"? Leads currently in this stage should be moved first.`,
      action: async () => {
        try {
          await settingsApi.deleteStage(id);
          setSuccess(`Stage "${name}" deleted.`);
          await loadSettings();
        } catch (err: any) {
          setError(err.message || 'Failed to delete stage');
        } finally {
          setConfirmState(prev => ({ ...prev, open: false }));
        }
      },
    });
  }

  // Field actions
  async function handleAddField(e: React.FormEvent) {
    e.preventDefault();
    if (!newFieldLabel.trim()) return;
    try {
      setAddingField(true);
      const opts = newFieldOptions
        .split(',')
        .map(o => o.trim())
        .filter(Boolean);
      await settingsApi.createField({
        label: newFieldLabel.trim(),
        type: newFieldType,
        options: opts,
        required: newFieldRequired,
      });
      setNewFieldLabel('');
      setNewFieldOptions('');
      setNewFieldRequired(false);
      setSuccess('Field created.');
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Failed to create field');
    } finally {
      setAddingField(false);
    }
  }

  function handleDeleteField(id: string, label: string) {
    setConfirmState({
      open: true,
      title: 'Delete Custom Field',
      message: `Delete custom field "${label}"?`,
      action: async () => {
        try {
          await settingsApi.deleteField(id);
          setSuccess(`Field "${label}" deleted.`);
          await loadSettings();
        } catch (err: any) {
          setError(err.message || 'Failed to delete field');
        } finally {
          setConfirmState(prev => ({ ...prev, open: false }));
        }
      },
    });
  }

  // Label actions
  async function handleAddLabel(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabelName.trim()) return;
    try {
      setAddingLabel(true);
      await settingsApi.createLabel({
        name: newLabelName.trim(),
        color: newLabelColor,
      });
      setNewLabelName('');
      setSuccess('Tag created.');
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Failed to create tag');
    } finally {
      setAddingLabel(false);
    }
  }

  function handleDeleteLabel(id: string, name: string) {
    setConfirmState({
      open: true,
      title: 'Delete Tag',
      message: `Delete tag "${name}"?`,
      action: async () => {
        try {
          await settingsApi.deleteLabel(id);
          setSuccess(`Tag "${name}" deleted.`);
          await loadSettings();
        } catch (err: any) {
          setError(err.message || 'Failed to delete tag');
        } finally {
          setConfirmState(prev => ({ ...prev, open: false }));
        }
      },
    });
  }

  // Terminology
  async function handleSaveTerminology(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSavingTerms(true);
      await settingsApi.updateTerminology(termForm);
      setTerminology(termForm);
      setSuccess('CRM terminology updated.');
    } catch (err: any) {
      setError(err.message || 'Failed to update terminology');
    } finally {
      setSavingTerms(false);
    }
  }

  // Theme presets
  async function handleApplyThemePreset(gold: string, teal: string) {
    try {
      await settingsApi.updateTheme({ gold, teal });
      setTheme(prev => ({ ...prev, gold, teal }));
      setSuccess('Theme updated.');
    } catch (err: any) {
      setError(err.message || 'Failed to update theme');
    }
  }

  if (loading && stages.length === 0) {
    return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading settings...</div>;
  }

  return (
    <div className="page-container">
      {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="notice success" style={{ marginBottom: '1rem' }}>{success}</div>}

      <section className="page-head" style={{ marginBottom: '1.5rem' }}>
        <div>
          <p className="eyebrow">Admin</p>
          <h1 style={{ margin: '0.2rem 0' }}>CRM customization</h1>
          <p className="page-subtitle">Configure pipeline stages, custom fields, tags, and workspace terminology.</p>
        </div>
      </section>

      {/* Categories Navigation */}
      <nav style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem', flexWrap: 'wrap' }}>
        {[
          { id: 'stages', label: `${terminology.pipelineName} Stages` },
          { id: 'fields', label: `${terminology.leadSingular} Form Fields` },
          { id: 'labels', label: `${terminology.leadSingular} Tags` },
          { id: 'work-types', label: 'Custom Modules' },
          { id: 'automations', label: 'Automations' },
          { id: 'terminology', label: 'CRM Names' },
          { id: 'appearance', label: 'Look & Feel' },
        ].map(cat => (
          <button
            key={cat.id}
            type="button"
            className="btn small"
            onClick={() => handleCategoryChange(cat.id)}
            style={{
              background: activeCategory === cat.id ? 'var(--gold-dim, rgba(245, 158, 11, 0.15))' : 'var(--panel)',
              borderColor: activeCategory === cat.id ? 'var(--gold)' : 'var(--border)',
              color: 'var(--text)',
              fontWeight: 800,
            }}
          >
            {cat.label}
          </button>
        ))}
      </nav>

      {/* STAGES TAB */}
      {activeCategory === 'stages' && (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          <article className="team-card" style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', padding: '1.5rem' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.1rem', marginBottom: '1rem' }}>Add Pipeline Stage</h2>
            <form onSubmit={handleAddStage} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Stage Name *
                <input
                  required
                  placeholder="e.g. Discovery Call Booked"
                  value={newStageName}
                  onChange={e => setNewStageName(e.target.value)}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Stage Color
                <input
                  type="color"
                  value={newStageColor}
                  onChange={e => setNewStageColor(e.target.value)}
                  style={{ height: '36px', width: '60px', padding: '2px', border: 'none' }}
                />
              </label>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
                  <input
                    type="checkbox"
                    checked={newStageWon}
                    onChange={e => { setNewStageWon(e.target.checked); if (e.target.checked) setNewStageLost(false); }}
                  />
                  Won Deal Stage
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
                  <input
                    type="checkbox"
                    checked={newStageLost}
                    onChange={e => { setNewStageLost(e.target.checked); if (e.target.checked) setNewStageWon(false); }}
                  />
                  Lost Deal Stage
                </label>
              </div>

              <button className="btn primary" type="submit" disabled={addingStage} style={{ marginTop: '0.5rem' }}>
                {addingStage ? 'Adding...' : '+ Add Stage'}
              </button>
            </form>
          </article>

          <article className="team-card" style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', padding: '1.5rem' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.1rem', marginBottom: '1rem' }}>Current Stages ({stages.length})</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {stages.map(stage => (
                <div
                  key={stage._id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    background: 'var(--bg-soft, rgba(255,255,255,0.02))',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: stage.color || 'var(--muted)' }} />
                    <strong style={{ fontSize: '0.9rem' }}>{stage.name}</strong>
                    {stage.isWon && <span className="stage-badge" style={{ backgroundColor: 'var(--teal)', fontSize: '0.65rem' }}>WON</span>}
                    {stage.isLost && <span className="stage-badge" style={{ backgroundColor: 'var(--red)', fontSize: '0.65rem' }}>LOST</span>}
                    {stage.isDefault && <span className="stage-badge" style={{ backgroundColor: 'var(--gold)', fontSize: '0.65rem' }}>DEFAULT</span>}
                  </div>
                  <button
                    type="button"
                    className="btn small danger"
                    onClick={() => handleDeleteStage(stage._id, stage.name)}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </article>
        </section>
      )}

      {/* FIELDS TAB */}
      {activeCategory === 'fields' && (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          <article className="team-card" style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', padding: '1.5rem' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.1rem', marginBottom: '1rem' }}>Add Custom Field</h2>
            <form onSubmit={handleAddField} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Field Label *
                <input
                  required
                  placeholder="e.g. Budget Range"
                  value={newFieldLabel}
                  onChange={e => setNewFieldLabel(e.target.value)}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Data Type
                <select
                  value={newFieldType}
                  onChange={e => setNewFieldType(e.target.value)}
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="currency">Currency (INR)</option>
                  <option value="select">Dropdown Select</option>
                  <option value="date">Date</option>
                  <option value="checkbox">Checkbox (Yes/No)</option>
                </select>
              </label>

              {newFieldType === 'select' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                  Dropdown Options (comma-separated)
                  <input
                    placeholder="Option 1, Option 2, Option 3"
                    value={newFieldOptions}
                    onChange={e => setNewFieldOptions(e.target.value)}
                  />
                </label>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={newFieldRequired}
                  onChange={e => setNewFieldRequired(e.target.checked)}
                />
                Required Field
              </label>

              <button className="btn primary" type="submit" disabled={addingField} style={{ marginTop: '0.5rem' }}>
                {addingField ? 'Adding...' : '+ Add Field'}
              </button>
            </form>
          </article>

          <article className="team-card" style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', padding: '1.5rem' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.1rem', marginBottom: '1rem' }}>Custom Fields ({fields.length})</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {fields.length === 0 ? (
                <p className="empty" style={{ color: 'var(--muted)' }}>No custom fields added yet.</p>
              ) : (
                fields.map(f => (
                  <div
                    key={f._id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 1rem',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      background: 'var(--bg-soft, rgba(255,255,255,0.02))',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.9rem' }}>{f.label}</strong>
                      <small style={{ display: 'block', color: 'var(--muted)', fontSize: '0.75rem' }}>
                        Type: {f.type} {f.required ? '· Required' : ''}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="btn small danger"
                      onClick={() => handleDeleteField(f._id, f.label)}
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>
      )}

      {/* LABELS TAB */}
      {activeCategory === 'labels' && (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          <article className="team-card" style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', padding: '1.5rem' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.1rem', marginBottom: '1rem' }}>Add Lead Tag</h2>
            <form onSubmit={handleAddLabel} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Tag Name *
                <input
                  required
                  placeholder="e.g. VIP Client"
                  value={newLabelName}
                  onChange={e => setNewLabelName(e.target.value)}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                Tag Color
                <input
                  type="color"
                  value={newLabelColor}
                  onChange={e => setNewLabelColor(e.target.value)}
                  style={{ height: '36px', width: '60px', padding: '2px', border: 'none' }}
                />
              </label>

              <button className="btn primary" type="submit" disabled={addingLabel} style={{ marginTop: '0.5rem' }}>
                {addingLabel ? 'Adding...' : '+ Add Tag'}
              </button>
            </form>
          </article>

          <article className="team-card" style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', padding: '1.5rem' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.1rem', marginBottom: '1rem' }}>Tags ({labels.length})</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {labels.map(lbl => (
                <div
                  key={lbl._id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.35rem 0.75rem',
                    border: `1px solid ${lbl.color || 'var(--border)'}`,
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{lbl.name}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteLabel(lbl._id, lbl.name)}
                    style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '0.9rem', padding: 0 }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </article>
        </section>
      )}

      {/* TERMINOLOGY TAB */}
      {activeCategory === 'terminology' && (
        <article className="team-card" style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', padding: '1.5rem', maxWidth: '600px' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.1rem', marginBottom: '1rem' }}>CRM Naming & Terminology</h2>
          <form onSubmit={handleSaveTerminology} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Lead Singular Name
              <input
                required
                value={termForm.leadSingular}
                onChange={e => setTermForm({ ...termForm, leadSingular: e.target.value })}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Lead Plural Name
              <input
                required
                value={termForm.leadPlural}
                onChange={e => setTermForm({ ...termForm, leadPlural: e.target.value })}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Deliverable / Task Singular Name
              <input
                required
                value={termForm.recordSingular}
                onChange={e => setTermForm({ ...termForm, recordSingular: e.target.value })}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Deliverable / Task Plural Name
              <input
                required
                value={termForm.recordPlural}
                onChange={e => setTermForm({ ...termForm, recordPlural: e.target.value })}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
              Pipeline Board Name
              <input
                required
                value={termForm.pipelineName}
                onChange={e => setTermForm({ ...termForm, pipelineName: e.target.value })}
              />
            </label>

            <button className="btn primary" type="submit" disabled={savingTerms} style={{ marginTop: '0.5rem', alignSelf: 'flex-start' }}>
              {savingTerms ? 'Saving...' : 'Save Terminology'}
            </button>
          </form>
        </article>
      )}

      {/* APPEARANCE TAB */}
      {activeCategory === 'appearance' && (
        <article className="team-card" style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)', padding: '1.5rem' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.1rem', marginBottom: '1rem' }}>Theme Presets</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            {[
              { name: 'Vande Classic Dark', gold: '#ffcc00', teal: '#00bcd4' },
              { name: 'Warm Amber & Emerald', gold: '#f59e0b', teal: '#10b981' },
              { name: 'Royal Indigo & Cyan', gold: '#6366f1', teal: '#06b6d4' },
              { name: 'Crimson & Slate', gold: '#e11d48', teal: '#0f766e' },
            ].map(preset => (
              <div
                key={preset.name}
                style={{
                  padding: '1rem',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  background: 'var(--bg-soft, rgba(255,255,255,0.02))',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: preset.gold }} />
                  <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: preset.teal }} />
                </div>
                <strong>{preset.name}</strong>
                <button
                  type="button"
                  className="btn small outline"
                  onClick={() => handleApplyThemePreset(preset.gold, preset.teal)}
                >
                  Apply Preset
                </button>
              </div>
            ))}
          </div>
        </article>
      )}
      {/* CUSTOM WORK TYPES (MODULES) TAB */}
      {activeCategory === 'work-types' && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Custom Sidebar Modules</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '0.85rem' }}>
                Create and customize deliverable workflows, status pipelines, and custom fields.
              </p>
            </div>
            <button
              type="button"
              className="btn primary"
              onClick={() => { setBuilderTarget(null); setBuilderOpen(true); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Icon name="plus" size={16} />
              <span>Add Module</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {workTypes.map(wt => (
              <div
                key={wt._id}
                className="module-card"
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  background: 'var(--panel)',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                  '--module-color': wt.color || 'var(--gold)',
                } as any}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, background: 'var(--panel-muted, rgba(255,255,255,0.05))', color: wt.color || 'var(--gold)' }}>
                      <Icon name={wt.icon || 'clipboard-list'} size={20} />
                    </span>
                    <div>
                      <strong style={{ fontSize: '1rem', display: 'block' }}>{wt.name}</strong>
                      <code style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>/work/{wt.key}</code>
                    </div>
                  </div>
                  <span className={`stage-badge ${wt.isActive !== false ? 'done' : 'pending'}`} style={{ fontSize: '0.7rem' }}>
                    {wt.isActive !== false ? 'Active' : 'Disabled'}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '12px', fontSize: '0.78rem', color: 'var(--muted)' }}>
                  <span>{wt.statuses?.length || 0} statuses</span>
                  <span>•</span>
                  <span>{wt.fields?.length || 0} fields</span>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    className="btn small outline"
                    style={{ flex: 1 }}
                    onClick={() => { setBuilderTarget(wt); setBuilderOpen(true); }}
                  >
                    Edit Module
                  </button>
                </div>
              </div>
            ))}
          </div>

          {builderOpen && (
            <WorkTypeBuilder
              workType={builderTarget}
              onClose={() => { setBuilderOpen(false); setBuilderTarget(null); }}
              onChanged={loadSettings}
            />
          )}
        </section>
      )}

      {/* AUTOMATIONS TAB */}
      {activeCategory === 'automations' && (
        <AutomationsTab
          stages={stages}
          labels={labels}
          workTypes={workTypes}
          users={users}
          automations={automations}
          leadSingular={terminology.leadSingular}
          onChanged={loadSettings}
        />
      )}

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmText="Delete"
        variant="danger"
        onConfirm={confirmState.action}
        onCancel={() => setConfirmState(prev => ({ ...prev, open: false }))}
      />
    </div>
  );
}
