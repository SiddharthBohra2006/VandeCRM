import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { settingsApi, SettingsResponse, Terminology, ThemeColors, AutomationRule } from '../../api/settings';
import { WorkType } from '../../api/work';
import { Stage, Label, CustomField } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import WorkTypeBuilder from './WorkTypeBuilder';
import AutomationsTab from './AutomationsTab';
import Icon from '../../components/Icons';
import ConfirmDialog from '../../components/ConfirmDialog';
import { THEME_PRESETS, applyThemePreset, applyThemeRipple } from '../../theme';

const STAGE_GRID = '24px 1.5fr 70px 80px 80px 80px 80px 110px';
const STAGE_HEADER = [
  ['', ''],
  ['Stage Name', 'left'],
  ['Color', 'center'],
  ['Won?', 'center'],
  ['Lost?', 'center'],
  ['Default?', 'center'],
  ['Active?', 'center'],
  ['Action', 'right'],
] as const;

interface StageDraft {
  name: string;
  color: string;
  isWon: boolean;
  isLost: boolean;
  isDefault: boolean;
  isActive: boolean;
}
interface LabelDraft {
  name: string;
  color: string;
  isHighPotential: boolean;
  isActive: boolean;
}
interface FieldDraft {
  label: string;
  type: string;
  options: string;
  required: boolean;
  isActive: boolean;
}

type FieldType = 'text' | 'number' | 'date' | 'select' | 'checkbox';

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown choices' },
  { value: 'checkbox', label: 'Yes / no' },
];

const DEFAULT_THEME: ThemeColors = {
  gold: '#b58d00',
  teal: '#0f766e',
  background: '#ffffff',
  surface: '#ffffff',
  text: '#121214',
};

export default function SettingsPage() {
  const { user, activeCompany } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeCategory = searchParams.get('category') || 'stages';
  const isAdmin = user?.role === 'admin';

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
  const [theme, setTheme] = useState<ThemeColors>(DEFAULT_THEME);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Stage form
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('#475569');
  const [newStageWon, setNewStageWon] = useState(false);
  const [newStageLost, setNewStageLost] = useState(false);
  const [newStageDefault, setNewStageDefault] = useState(false);
  const [addingStage, setAddingStage] = useState(false);
  const [stageDrafts, setStageDrafts] = useState<Record<string, StageDraft>>({});
  const [dragStageId, setDragStageId] = useState<string | null>(null);

  // Field form
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<FieldType>('text');
  const [newFieldOptions, setNewFieldOptions] = useState('');
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [addingField, setAddingField] = useState(false);
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, FieldDraft>>({});
  const [dragFieldId, setDragFieldId] = useState<string | null>(null);

  // Label form
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#2563eb');
  const [newLabelHighPotential, setNewLabelHighPotential] = useState(false);
  const [addingLabel, setAddingLabel] = useState(false);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, LabelDraft>>({});

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
        setTheme({ ...DEFAULT_THEME, ...res.organization.theme });
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

  const sd = (s: Stage): StageDraft => stageDrafts[s._id] || {
    name: s.name,
    color: s.color || '#64748b',
    isWon: s.isWon,
    isLost: s.isLost,
    isDefault: s.isDefault,
    isActive: s.isActive !== false,
  };

  const fd = (f: CustomField): FieldDraft => fieldDrafts[f._id] || {
    label: f.label,
    type: f.type || 'text',
    options: (f.options || []).join(', '),
    required: f.required,
    isActive: f.isActive !== false,
  };

  const ld = (l: Label): LabelDraft => labelDrafts[l._id] || {
    name: l.name,
    color: l.color || '#2563eb',
    isHighPotential: l.isHighPotential,
    isActive: l.isActive !== false,
  };

  // ==================== STAGES ====================
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
        isDefault: newStageDefault,
        order: 80,
      });
      setNewStageName('');
      setNewStageWon(false);
      setNewStageLost(false);
      setNewStageDefault(false);
      setSuccess('Stage added.');
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Failed to create stage');
    } finally {
      setAddingStage(false);
    }
  }

  async function handleUpdateStage(id: string) {
    const draft = sd(stages.find(s => s._id === id)!);
    try {
      await settingsApi.updateStage(id, {
        name: draft.name.trim(),
        color: draft.color,
        isWon: draft.isWon,
        isLost: draft.isLost,
        isDefault: draft.isDefault,
        isActive: draft.isActive,
      });
      setSuccess('Stage updated.');
      setStageDrafts(prev => { const n = { ...prev }; delete n[id]; return n; });
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Failed to update stage');
    }
  }

  function handleDeleteStage(id: string, name: string) {
    setConfirmState({
      open: true,
      title: 'Delete Stage',
      message: `Delete stage "${name}"? Records currently in this stage should be moved first.`,
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

  async function saveStageOrder() {
    try {
      const ids = Array.from(document.querySelectorAll('[data-settings-panel="stages"] .draggable-stage')).map(
        el => el.getAttribute('data-stage-id') || ''
      ).filter(Boolean);
      await settingsApi.reorderStages(ids);
    } catch (err: any) {
      setError(err.message || 'Failed to save stage order');
    }
  }

  // ==================== FIELDS ====================
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
        entity: 'customer',
        order: 50,
      });
      setNewFieldLabel('');
      setNewFieldOptions('');
      setNewFieldRequired(false);
      setSuccess('Field added to form.');
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Failed to create field');
    } finally {
      setAddingField(false);
    }
  }

  async function handleUpdateField(id: string) {
    const draft = fd(fields.find(f => f._id === id)!);
    try {
      await settingsApi.updateField(id, {
        label: draft.label.trim(),
        type: draft.type,
        options: draft.options.split(',').map(o => o.trim()).filter(Boolean),
        required: draft.required,
        isActive: draft.isActive,
      });
      setSuccess('Field updated.');
      setFieldDrafts(prev => { const n = { ...prev }; delete n[id]; return n; });
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Failed to update field');
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

  async function saveFieldOrder() {
    try {
      const ids = Array.from(document.querySelectorAll('[data-settings-panel="fields"] .field-card')).map(
        el => el.getAttribute('data-field-id') || ''
      ).filter(Boolean);
      await settingsApi.reorderFields(ids);
    } catch (err: any) {
      setError(err.message || 'Failed to save field order');
    }
  }

  // ==================== LABELS ====================
  async function handleAddLabel(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabelName.trim()) return;
    try {
      setAddingLabel(true);
      await settingsApi.createLabel({
        name: newLabelName.trim(),
        color: newLabelColor,
        isHighPotential: newLabelHighPotential,
      });
      setNewLabelName('');
      setNewLabelColor('#2563eb');
      setNewLabelHighPotential(false);
      setSuccess('Tag added.');
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Failed to create tag');
    } finally {
      setAddingLabel(false);
    }
  }

  async function handleUpdateLabel(id: string) {
    const draft = ld(labels.find(l => l._id === id)!);
    try {
      await settingsApi.updateLabel(id, {
        name: draft.name.trim(),
        color: draft.color,
        isHighPotential: draft.isHighPotential,
        isActive: draft.isActive,
      });
      setSuccess('Tag updated.');
      setLabelDrafts(prev => { const n = { ...prev }; delete n[id]; return n; });
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Failed to update tag');
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

  // ==================== TERMINOLOGY ====================
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

  // ==================== THEME ====================
  async function handleApplyTheme(gold: string, teal: string, background: string, surface: string, text: string) {
    try {
      await settingsApi.updateTheme({ gold, teal, background, surface, text });
      const preset = THEME_PRESETS.find(p =>
        p.gold.toLowerCase() === gold.toLowerCase() &&
        p.bg.toLowerCase() === background.toLowerCase() &&
        p.surface.toLowerCase() === surface.toLowerCase()
      );
      if (preset) {
        applyThemePreset(preset);
      } else {
        applyThemePreset({
          name: 'Custom',
          description: 'Custom',
          type: isDark(background) ? 'dark' : 'light',
          gold,
          teal,
          bg: background,
          surface,
          text,
        });
      }
      setTheme({ gold, teal, background, surface, text });
      setSuccess('Theme updated.');
    } catch (err: any) {
      setError(err.message || 'Failed to update theme');
    }
  }

  function activePresetKey(): string | null {
    for (const p of THEME_PRESETS) {
      if (
        String(p.gold).toLowerCase() === String(theme.gold).toLowerCase() &&
        String(p.bg).toLowerCase() === String(theme.background).toLowerCase() &&
        String(p.surface).toLowerCase() === String(theme.surface).toLowerCase()
      ) return p.name;
    }
    return null;
  }

  if (loading && stages.length === 0 && fields.length === 0) {
    return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading settings...</div>;
  }

  const categories = [
    { id: 'stages', label: terminology.pipelineName, admin: false },
    { id: 'fields', label: `${terminology.recordSingular} form`, admin: false },
    { id: 'labels', label: `${terminology.recordSingular} tags`, admin: false },
    { id: 'work-types', label: 'Custom modules', admin: true },
    { id: 'terminology', label: 'CRM names', admin: true },
    { id: 'automations', label: 'Automations', admin: true },
    { id: 'appearance', label: 'Look & feel', admin: false },
  ].filter(c => (c.admin ? isAdmin : true));

  const visibleStageOrder = [...stages];
  const visibleFieldOrder = [...fields];

  return (
    <div className="page-container">
      <section className="page-head">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>CRM customization</h1>
        </div>
        {isAdmin && <Link className="btn primary" to="/settings/setup">Company setup</Link>}
      </section>

      {error && <div className="notice danger" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="notice success" style={{ marginBottom: '1rem' }}>{success}</div>}

      <nav className="settings-category-nav" aria-label="Settings categories">
        {categories.map(cat => (
          <button
            key={cat.id}
            type="button"
            data-settings-category={cat.id}
            className={activeCategory === cat.id ? 'active' : ''}
            onClick={() => handleCategoryChange(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </nav>
      <p className="settings-scope-note">
        Editing <strong>{activeCompany?.name || 'your workspace'}</strong>. Select a tab above; changes apply only after you save.
      </p>

      <section className="settings-grid">
        {/* ============ AUTOMATIONS ============ */}
        {isAdmin && (
          <article className="settings-panel wide" data-settings-panel="automations" hidden={activeCategory !== 'automations'}>
            <AutomationsTab
              stages={stages}
              labels={labels}
              workTypes={workTypes}
              users={users}
              automations={automations}
              leadSingular={terminology.leadSingular}
              onChanged={loadSettings}
            />
          </article>
        )}

        {/* ============ CUSTOM MODULES ============ */}
        {isAdmin && (
          <article className="settings-panel wide" data-settings-panel="work-types" hidden={activeCategory !== 'work-types'}>
            <div className="module-settings-head">
              <div>
                <h2>Custom modules</h2>
                <p className="page-subtitle">Create a business record such as Patient, Student, Order, Property, Project, or Case. Each module gets its own fields and workflow.</p>
              </div>
              <button className="btn primary" type="button" onClick={() => { setBuilderTarget(null); setBuilderOpen(true); }}>
                + Create module
              </button>
            </div>

            <div className="module-card-list">
              {workTypes.map(item => (
                <article key={item._id} className="module-card" style={{ '--module-color': item.color || 'var(--gold)' } as React.CSSProperties}>
                  <span className="module-card-icon">
                    <Icon name={(item.icon as any) || 'clipboard-list'} size={19} />
                  </span>
                  <div>
                    <strong>{item.name}</strong>
                    <small>/{item.key} · {item.statuses?.length || 0} statuses · {item.fields?.length || 0} fields</small>
                  </div>
                  <span className={`module-state ${item.isActive ? '' : 'inactive'}`}>{item.isActive ? 'Active' : 'Hidden'}</span>
                  <button className="btn small" type="button" onClick={() => { setBuilderTarget(item); setBuilderOpen(true); }}>
                    Customize
                  </button>
                </article>
              ))}
              {workTypes.length === 0 && <p className="empty">No work modules yet. Create the first one.</p>}
            </div>

            {builderOpen && (
              <WorkTypeBuilder
                workType={builderTarget}
                onClose={() => { setBuilderOpen(false); setBuilderTarget(null); }}
                onChanged={loadSettings}
              />
            )}
          </article>
        )}

        {/* ============ APPEARANCE ============ */}
        <article className="settings-panel wide" data-settings-panel="appearance" hidden={activeCategory !== 'appearance'}>
          <h2>UI Theme Customization</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.78rem', marginBottom: '1.25rem' }}>
            Select a curated theme preset. Applying a theme will instantly update the interface with a smooth color ripple wave.
          </p>

          <div className="theme-presets-grid" style={{ marginBottom: '1.5rem' }}>
            {THEME_PRESETS.map(preset => (
              <ThemeCard
                key={preset.name}
                preset={preset}
                active={activePresetKey() === preset.name}
                onClick={(e: React.MouseEvent) => {
                  handleApplyTheme(preset.gold, preset.teal, preset.bg, preset.surface, preset.text);
                  applyThemeRipple(e.clientX || e.currentTarget.getBoundingClientRect().left + e.currentTarget.getBoundingClientRect().width / 2, e.clientY || e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2, preset.bg);
                }}
              />
            ))}
          </div>

          {/* Advanced Collapsible */}
          <details style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <summary style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--gold)', cursor: 'pointer', userSelect: 'none' }}>
              🛠️ Advanced: Custom Colors
            </summary>
            <form
              className="palette-form"
              style={{ marginTop: '1rem' }}
              onSubmit={e => {
                e.preventDefault();
                handleApplyTheme(theme.gold, theme.teal, theme.background, theme.surface, theme.text);
              }}
            >
              <label>Gold accent<input type="color" value={theme.gold} onChange={e => setTheme({ ...theme, gold: e.target.value })} /></label>
              <label>Teal accent<input type="color" value={theme.teal} onChange={e => setTheme({ ...theme, teal: e.target.value })} /></label>
              <label>Background<input type="color" value={theme.background} onChange={e => setTheme({ ...theme, background: e.target.value })} /></label>
              <label>Surface<input type="color" value={theme.surface} onChange={e => setTheme({ ...theme, surface: e.target.value })} /></label>
              <label>Text<input type="color" value={theme.text} onChange={e => setTheme({ ...theme, text: e.target.value })} /></label>
              <button className="btn primary" type="submit">Save Palette</button>
            </form>
          </details>
        </article>

        {/* ============ STAGES ============ */}
        <article className="settings-panel wide" data-settings-panel="stages" hidden={activeCategory !== 'stages'}>
          <div className="panel-title-row">
            <div>
              <h2>{terminology.pipelineName}</h2>
              <p className="page-subtitle">A stage is one step in your sales process. {terminology.recordPlural} move through these steps from first enquiry to a final result.</p>
            </div>
            <span>Drag to change the order</span>
          </div>
          <div className="settings-explainer">
            <strong>How to use this</strong>
            <span>Use <b>Default</b> for where new {terminology.recordPlural.toLowerCase()} begin. Use <b>Won</b> or <b>Lost</b> only for final outcomes. Keep a stage <b>Active</b> while your team should be able to use it.</span>
          </div>

          <form onSubmit={handleAddStage} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '1rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontWeight: 700, fontSize: '0.8rem' }}>
                New stage name
                <input name="name" placeholder="Example: Demo booked" required className="form-control" style={{ width: '100%' }} value={newStageName} onChange={e => setNewStageName(e.target.value)} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontWeight: 700, fontSize: '0.8rem', textAlign: 'center' }}>
                Color
                <input type="color" value={newStageColor} onChange={e => setNewStageColor(e.target.value)} style={{ width: '100%', height: '38px', padding: '0.2rem', cursor: 'pointer' }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'normal', color: 'var(--text)' }}>
                <input type="checkbox" style={{ width: 'auto', minHeight: 'auto' }} checked={newStageWon} onChange={e => { setNewStageWon(e.target.checked); if (e.target.checked) setNewStageLost(false); }} />
                This means a sale is won
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'normal', color: 'var(--text)' }}>
                <input type="checkbox" style={{ width: 'auto', minHeight: 'auto' }} checked={newStageLost} onChange={e => { setNewStageLost(e.target.checked); if (e.target.checked) setNewStageWon(false); }} />
                This means a {terminology.recordSingular.toLowerCase()} is lost
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'normal', color: 'var(--text)' }}>
                <input type="checkbox" style={{ width: 'auto', minHeight: 'auto' }} checked={newStageDefault} onChange={e => setNewStageDefault(e.target.checked)} />
                New {terminology.recordPlural.toLowerCase()} start here
              </label>
            </div>
            <button className="btn primary" type="submit" disabled={addingStage} style={{ alignSelf: 'flex-start', padding: '0.6rem 1.5rem' }}>
              {addingStage ? 'Adding...' : 'Add Stage'}
            </button>
          </form>

          <div id="stageReorderList" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div className="stage-list-header desktop-only" style={{ display: 'grid', gridTemplateColumns: STAGE_GRID, gap: '.5rem', padding: '0.5rem .62rem', fontSize: '0.72rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', marginBottom: '0.25rem' }}>
              {STAGE_HEADER.map(([label, align], i) => (
                <span key={i} style={{ textAlign: align as any }}>{label}</span>
              ))}
            </div>
            {visibleStageOrder.map(stage => {
              const d = sd(stage);
              return (
                <form
                  key={stage._id}
                  data-stage-id={stage._id}
                  className={`settings-row draggable-stage ${dragStageId === stage._id ? 'is-dragging' : ''}`}
                  draggable
                  onDragStart={() => setDragStageId(stage._id)}
                  onDragEnd={() => {
                    setDragStageId(null);
                    saveStageOrder();
                  }}
                  onDragOver={e => {
                    e.preventDefault();
                    const target = e.currentTarget;
                    if (!dragStageId || dragStageId === stage._id) return;
                    const rect = target.getBoundingClientRect();
                    const after = e.clientY > rect.top + rect.height / 2;
                    const container = target.parentElement!;
                    const dragged = document.querySelector(`[data-stage-id="${dragStageId}"]`);
                    if (dragged) container.insertBefore(dragged, after ? target.nextSibling : target);
                  }}
                  style={{ display: 'grid', gridTemplateColumns: STAGE_GRID, gap: '.5rem', alignItems: 'center', padding: '.62rem', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: 0, background: 'var(--panel)' }}
                  onSubmit={e => { e.preventDefault(); handleUpdateStage(stage._id); }}
                >
                  <span className="drag-handle" title="Drag to change this stage's position" style={{ cursor: 'grab', color: 'var(--teal)', fontWeight: 900, userSelect: 'none' }}>⋮⋮</span>
                  <input name="name" value={d.name} required className="form-control" placeholder="Stage name" style={{ width: '100%' }} onChange={e => setStageDrafts(prev => ({ ...prev, [stage._id]: { ...d, name: e.target.value } }))} />
                  <input type="color" value={d.color} style={{ width: '100%', height: '32px', padding: '0.1rem', cursor: 'pointer' }} title="Stage color" onChange={e => setStageDrafts(prev => ({ ...prev, [stage._id]: { ...d, color: e.target.value } }))} />
                  <input type="checkbox" title="Won sale" style={{ justifySelf: 'center', width: 'auto', minHeight: 'auto' }} checked={d.isWon} onChange={e => setStageDrafts(prev => ({ ...prev, [stage._id]: { ...d, isWon: e.target.checked } }))} />
                  <input type="checkbox" title="Lost lead" style={{ justifySelf: 'center', width: 'auto', minHeight: 'auto' }} checked={d.isLost} onChange={e => setStageDrafts(prev => ({ ...prev, [stage._id]: { ...d, isLost: e.target.checked } }))} />
                  <input type="checkbox" title="Starting stage" style={{ justifySelf: 'center', width: 'auto', minHeight: 'auto' }} checked={d.isDefault} onChange={e => setStageDrafts(prev => ({ ...prev, [stage._id]: { ...d, isDefault: e.target.checked } }))} />
                  <input type="checkbox" title="Available to team" style={{ justifySelf: 'center', width: 'auto', minHeight: 'auto' }} checked={d.isActive} onChange={e => setStageDrafts(prev => ({ ...prev, [stage._id]: { ...d, isActive: e.target.checked } }))} />
                  <button className="btn small" type="submit" style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}>Save changes</button>
                </form>
              );
            })}
          </div>
        </article>

        {/* ============ LABELS ============ */}
        <article className="settings-panel wide" data-settings-panel="labels" hidden={activeCategory !== 'labels'}>
          <h2>{terminology.recordSingular} tags</h2>
          <p className="page-subtitle">Tags help your team spot and group similar {terminology.recordPlural.toLowerCase()}. They do not change a {terminology.recordSingular.toLowerCase()}'s {terminology.pipelineName.toLowerCase()} stage.</p>
          <form onSubmit={handleAddLabel} className="inline-form">
            <label>Tag name<input name="name" placeholder="Example: High priority" required value={newLabelName} onChange={e => setNewLabelName(e.target.value)} /></label>
            <label>Tag color<input type="color" value={newLabelColor} onChange={e => setNewLabelColor(e.target.value)} /></label>
            <label><input type="checkbox" checked={newLabelHighPotential} onChange={e => setNewLabelHighPotential(e.target.checked)} /> Count as high potential</label>
            <button className="btn primary" type="submit" disabled={addingLabel}>{addingLabel ? 'Adding...' : 'Add tag'}</button>
          </form>

          {labels.map(label => {
            const d = ld(label);
            return (
              <form key={label._id} className="label-card" onSubmit={e => { e.preventDefault(); handleUpdateLabel(label._id); }}>
                <input type="color" value={d.color} aria-label={`Color for ${label.name}`} onChange={e => setLabelDrafts(prev => ({ ...prev, [label._id]: { ...d, color: e.target.value } }))} />
                <label>Tag name<input name="name" value={d.name} required onChange={e => setLabelDrafts(prev => ({ ...prev, [label._id]: { ...d, name: e.target.value } }))} /></label>
                <label><input type="checkbox" checked={d.isHighPotential} onChange={e => setLabelDrafts(prev => ({ ...prev, [label._id]: { ...d, isHighPotential: e.target.checked } }))} /> Count as high potential</label>
                <label><input type="checkbox" checked={d.isActive} onChange={e => setLabelDrafts(prev => ({ ...prev, [label._id]: { ...d, isActive: e.target.checked } }))} /> Available to team</label>
                <button className="btn small" type="submit">Save tag</button>
              </form>
            );
          })}
        </article>

        {/* ============ FIELDS ============ */}
        <article className="settings-panel wide" data-settings-panel="fields" hidden={activeCategory !== 'fields'}>
          <h2>{terminology.recordSingular} form builder</h2>
          <p className="page-subtitle">Choose exactly what your team records for each {terminology.leadSingular.toLowerCase()}. These fields appear when creating or editing a {terminology.leadSingular.toLowerCase()} in {activeCompany?.name || 'your workspace'}.</p>
          <div className="settings-explainer">
            <strong>Build the form</strong>
            <span>Use <b>Text</b> for words, <b>Number</b> for amounts, <b>Date</b> for dates, <b>Dropdown</b> for fixed choices, and <b>Checkbox</b> for yes/no. Mark a field Required only when every record must have it.</span>
          </div>
          <form onSubmit={handleAddField} className="inline-form field-form">
            <label>Question / field name<input name="label" placeholder="Example: Budget range" required value={newFieldLabel} onChange={e => setNewFieldLabel(e.target.value)} /></label>
            <label>Answer type
              <select value={newFieldType} onChange={e => setNewFieldType(e.target.value as FieldType)}>
                {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label>Choices (only for dropdown)<input name="options" placeholder="Example: Small, Medium, Large" value={newFieldOptions} onChange={e => setNewFieldOptions(e.target.value)} /></label>
            <label className="mini-check"><input type="checkbox" checked={newFieldRequired} onChange={e => setNewFieldRequired(e.target.checked)} /> Must be filled in</label>
            <button className="btn primary" type="submit" disabled={addingField}>{addingField ? 'Adding...' : 'Add to form'}</button>
          </form>

          <div className="form-preview">
            <strong>Current form preview</strong>
            <span>These are the extra questions your team sees.</span>
            <div>
              {fields.filter(f => f.isActive).map(f => (
                <label key={f._id}>{f.label}{f.required ? ' *' : ''}<input disabled placeholder={f.type === 'select' ? (f.options || []).join(' / ') : `Enter ${f.label.toLowerCase()}`} /></label>
              ))}
            </div>
          </div>

          <div className="field-card-list">
            {visibleFieldOrder.map(field => {
              const d = fd(field);
              return (
                <form
                  key={field._id}
                  data-field-id={field._id}
                  className="field-card"
                  draggable
                  onDragStart={() => setDragFieldId(field._id)}
                  onDragEnd={() => { setDragFieldId(null); saveFieldOrder(); }}
                  onDragOver={e => {
                    e.preventDefault();
                    if (!dragFieldId || dragFieldId === field._id) return;
                    const target = e.currentTarget;
                    const container = target.parentElement!;
                    const dragged = document.querySelector(`[data-field-id="${dragFieldId}"]`);
                    if (dragged) container.insertBefore(dragged, e.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2 ? target.nextSibling : target);
                  }}
                  onSubmit={e => { e.preventDefault(); handleUpdateField(field._id); }}
                >
                  <input type="hidden" name="entity" value={field.entity || 'customer'} />
                  <div className="field-card-head">
                    <span className="drag-handle" title="Drag to reorder">⋮⋮</span>
                    <strong>{field.label}</strong>
                    <span>{d.isActive ? 'Included on form' : 'Not on form'}</span>
                  </div>
                  <label>Name<input name="label" value={d.label} required onChange={e => setFieldDrafts(prev => ({ ...prev, [field._id]: { ...d, label: e.target.value } }))} /></label>
                  <label>Answer type
                    <select value={d.type} onChange={e => setFieldDrafts(prev => ({ ...prev, [field._id]: { ...d, type: e.target.value } }))}>
                      {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </label>
                  <label>Dropdown choices<input name="options" value={d.options} placeholder="Only used for dropdowns" onChange={e => setFieldDrafts(prev => ({ ...prev, [field._id]: { ...d, options: e.target.value } }))} /></label>
                  <div className="field-card-actions">
                    <label><input type="checkbox" checked={d.required} onChange={e => setFieldDrafts(prev => ({ ...prev, [field._id]: { ...d, required: e.target.checked } }))} /> Required</label>
                    <label><input type="checkbox" checked={d.isActive} onChange={e => setFieldDrafts(prev => ({ ...prev, [field._id]: { ...d, isActive: e.target.checked } }))} /> Include on form</label>
                    <button className="btn small" type="submit">Save field</button>
                  </div>
                </form>
              );
            })}
            {fields.length === 0 && <p className="empty">No fields added yet. Create the first one.</p>}
          </div>
        </article>

        {/* ============ TERMINOLOGY ============ */}
        {isAdmin && (
          <article className="settings-panel" data-settings-panel="terminology" hidden={activeCategory !== 'terminology'}>
            <h2>CRM names</h2>
            <p className="page-subtitle">Use the words your business uses. Example: Potential Booking / Guest, Student / Enrolled Student, or Lead / Client. This updates labels only, never saved data.</p>
            <form onSubmit={handleSaveTerminology} className="inline-form">
              <label>One lead<input name="leadSingular" value={termForm.leadSingular} required onChange={e => setTermForm({ ...termForm, leadSingular: e.target.value })} /></label>
              <label>Many leads<input name="leadPlural" value={termForm.leadPlural} required onChange={e => setTermForm({ ...termForm, leadPlural: e.target.value })} /></label>
              <label>One client<input name="recordSingular" value={termForm.recordSingular} required onChange={e => setTermForm({ ...termForm, recordSingular: e.target.value })} /></label>
              <label>Many clients<input name="recordPlural" value={termForm.recordPlural} required onChange={e => setTermForm({ ...termForm, recordPlural: e.target.value })} /></label>
              <label>Pipeline name<input name="pipelineName" value={termForm.pipelineName} required onChange={e => setTermForm({ ...termForm, pipelineName: e.target.value })} /></label>
              <button className="btn primary" type="submit" disabled={savingTerms}>{savingTerms ? 'Saving...' : 'Save names'}</button>
            </form>
          </article>
        )}
      </section>

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

function isDark(hex: string): boolean {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return false;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return r + g + b < 382;
}

function ThemeCard({ preset, active, onClick }: {
  preset: typeof THEME_PRESETS[number];
  active: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <div className={`theme-card ${active ? 'is-active' : ''}`} onClick={onClick}>
      <div className="theme-card-mockup" style={{ background: preset.bg, border: `1px solid ${preset.type === 'dark' ? '#1e293b' : '#e7e5e4'}` }}>
        <div style={{ width: 22, background: preset.surface, borderRight: `1px solid ${preset.type === 'dark' ? '#1e293b' : '#e7e5e4'}`, display: 'flex', flexDirection: 'column', padding: '6px 3px', gap: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: preset.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontSize: 6, fontWeight: 800 }}>V</div>
          <div style={{ width: 14, height: 3, borderRadius: 1, background: preset.gold, opacity: 0.8 }} />
          <div style={{ width: 14, height: 3, borderRadius: 1, background: preset.text, opacity: 0.3 }} />
          <div style={{ width: 14, height: 3, borderRadius: 1, background: preset.text, opacity: 0.3 }} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 14, background: preset.surface, borderBottom: `1px solid ${preset.type === 'dark' ? '#1e293b' : '#e7e5e4'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px' }}>
            <div style={{ width: 30, height: 4, borderRadius: 1, background: preset.text, opacity: 0.25 }} />
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: preset.gold }} />
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: preset.text, opacity: 0.4 }} />
            </div>
          </div>
          <div style={{ flex: 1, padding: 6, display: 'flex', gap: 4, background: preset.bg }}>
            <div style={{ flex: 1, background: preset.surface, border: `1px solid ${preset.type === 'dark' ? '#1e293b' : '#e7e5e4'}`, borderRadius: 4, padding: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ width: 12, height: 2, borderRadius: 1, background: preset.text, opacity: 0.4 }} />
              <div style={{ width: 25, height: 5, borderRadius: 1.5, background: preset.gold }} />
            </div>
            <div style={{ flex: 1, background: preset.surface, border: `1px solid ${preset.type === 'dark' ? '#1e293b' : '#e7e5e4'}`, borderRadius: 4, padding: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ width: 12, height: 2, borderRadius: 1, background: preset.text, opacity: 0.4 }} />
              <div style={{ width: 20, height: 4, borderRadius: 1.5, background: preset.teal }} />
            </div>
          </div>
        </div>
      </div>
      <div className="theme-card-info">
        <span className="theme-card-name">{preset.name}</span>
        <span className="theme-type-tag">{preset.description}</span>
      </div>
      <span className="active-badge-indicator">
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </span>
    </div>
  );
}
