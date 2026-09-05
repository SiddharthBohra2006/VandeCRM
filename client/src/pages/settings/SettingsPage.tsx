import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Palette, Workflow, FileEdit, Tag, LayoutGrid, Type, Zap,
  Check, ChevronDown, RotateCcw, Copy, Settings as SettingsIcon,
  Eye, Lightbulb, ArrowRight, CheckCircle2, Sparkles, BarChart3,
  Plus, Pencil, Trash2, MoreVertical, Info, Hash, Calendar,
  ListFilter, User as UserIcon, IndianRupee, Search, HelpCircle, GripVertical,
  Briefcase, UsersRound, Layers, ListChecks, Video, FolderKanban, CheckSquare, ExternalLink,
  Building2, User, Users, Globe
} from 'lucide-react';
import { settingsApi, SettingsResponse, Terminology, ThemeColors, AutomationRule } from '../../api/settings';
import { WorkType } from '../../api/work';
import { Stage, Label, CustomField } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import WorkTypeBuilder from './WorkTypeBuilder';
import AutomationsTab from './AutomationsTab';
import Icon from '../../components/Icons';
import ConfirmDialog from '../../components/ConfirmDialog';
import { THEME_PRESETS, applyThemePreset, applyThemeRipple, changeThemeWithAnimation, getActiveThemePreset } from '../../theme';
import '../../styles/customization.css';

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
  { value: 'select', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
];

function getFieldIconInfo(field: CustomField) {
  const lbl = (field.label || '').toLowerCase();
  const type = (field.type || 'text').toLowerCase();

  if (lbl.includes('budget') || lbl.includes('price') || lbl.includes('cost') || lbl.includes('value') || lbl.includes('amount') || lbl.includes('revenue') || lbl.includes('fee') || lbl.includes('₹') || lbl.includes('$')) {
    return { icon: IndianRupee, bg: 'rgba(100, 116, 139, 0.12)', color: '#475569' };
  }
  if (type === 'date' || lbl.includes('date') || lbl.includes('time') || lbl.includes('start') || lbl.includes('end')) {
    return { icon: Calendar, bg: 'rgba(16, 185, 129, 0.14)', color: '#10b981' };
  }
  if (type === 'number' || lbl.includes('s.no') || lbl.includes('sno') || lbl.includes('no') || lbl.includes('num') || lbl.includes('serial') || lbl.includes('count')) {
    return { icon: Hash, bg: 'rgba(59, 130, 246, 0.14)', color: '#3b82f6' };
  }
  if (lbl.includes('assign') || lbl.includes('user') || lbl.includes('owner') || lbl.includes('member') || lbl.includes('team') || lbl.includes('person')) {
    return { icon: UserIcon, bg: 'rgba(168, 85, 247, 0.14)', color: '#a855f7' };
  }
  if (lbl.includes('source') || lbl.includes('tag') || lbl.includes('campaign') || lbl.includes('label')) {
    return { icon: Tag, bg: 'rgba(217, 70, 239, 0.14)', color: '#d946ef' };
  }
  if (type === 'select' || lbl.includes('type') || lbl.includes('service') || lbl.includes('category') || lbl.includes('status')) {
    return { icon: ListFilter, bg: 'rgba(59, 130, 246, 0.14)', color: '#2563eb' };
  }
  return { icon: Type, bg: 'rgba(100, 116, 139, 0.12)', color: '#475569' };
}

const DEFAULT_THEME: ThemeColors = {
  gold: '#f59e0b',
  teal: '#0d9488',
  background: '#fffbf7',
  surface: '#ffffff',
  text: '#111827',
};

export default function SettingsPage() {
  const { user, activeCompany, refreshUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeCategory = searchParams.get('category') || 'appearance';
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
  const [activePresetName, setActivePresetName] = useState(() => {
    return localStorage.getItem('theme-name') || 'Midnight Slate';
  });
  const [theme, setTheme] = useState<ThemeColors>(() => {
    const cur = THEME_PRESETS.find(p => p.name === (localStorage.getItem('theme-name') || 'Midnight Slate')) || THEME_PRESETS[0];
    return {
      gold: cur.gold,
      teal: cur.teal,
      background: cur.bg,
      surface: cur.surface,
      text: cur.text,
    };
  });
  const [savingTheme, setSavingTheme] = useState(false);

  useEffect(() => {
    const handleThemeEvent = (e: Event) => {
      const customEvt = e as CustomEvent;
      const preset = customEvt.detail || THEME_PRESETS.find(p => p.name === localStorage.getItem('theme-name')) || THEME_PRESETS[0];
      if (preset) {
        setActivePresetName(preset.name);
        setTheme({
          gold: preset.gold,
          teal: preset.teal,
          background: preset.bg,
          surface: preset.surface,
          text: preset.text,
        });
      }
    };
    window.addEventListener('crm-theme-changed', handleThemeEvent);
    window.addEventListener('storage', handleThemeEvent);
    return () => {
      window.removeEventListener('crm-theme-changed', handleThemeEvent);
      window.removeEventListener('storage', handleThemeEvent);
    };
  }, []);

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
  const [showAddFieldRow, setShowAddFieldRow] = useState(false);
  const [seedingFields, setSeedingFields] = useState(false);
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, FieldDraft>>({});
  const [dragFieldId, setDragFieldId] = useState<string | null>(null);

  const STANDARD_DEFAULT_FIELDS: Array<{ label: string; type: FieldType; options: string[]; required: boolean; isActive: boolean }> = [
    { label: 'Budget Range', type: 'select', options: ['Under 25k', '25k-50k', '50k-1L', '1L+'], required: false, isActive: true },
    { label: 'Expected Start Date', type: 'date', options: [], required: false, isActive: true },
    { label: 'S.No.', type: 'number', options: [], required: false, isActive: true },
    { label: 'Project Title', type: 'text', options: [], required: true, isActive: true },
    { label: 'Project Type', type: 'select', options: ['Website', 'SEO', 'Social Media', 'Ads', 'Other'], required: false, isActive: true },
    { label: 'Assigned To', type: 'text', options: ['All team members'], required: false, isActive: true },
    { label: 'Lead Source', type: 'select', options: ['Website', 'Instagram', 'Referral', 'WhatsApp', 'Other'], required: false, isActive: true },
  ];

  async function handleSeedDefaultFields() {
    try {
      setSeedingFields(true);
      for (const f of STANDARD_DEFAULT_FIELDS) {
        await settingsApi.createField({
          label: f.label,
          type: f.type,
          options: f.options,
          required: f.required,
          isActive: f.isActive,
          entity: 'customer',
        });
      }
      setSuccess('Standard CRM fields loaded successfully.');
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Failed to load standard fields');
    } finally {
      setSeedingFields(false);
    }
  }

  // Label form
  const TAG_COLOR_PRESETS = ['#ea580c', '#ef4444', '#8b5cf6', '#3b82f6', '#10b981', '#22c55e', '#f59e0b', '#64748b'];
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#ea580c');
  const [newLabelHighPotential, setNewLabelHighPotential] = useState(false);
  const [newLabelAvailableToTeam, setNewLabelAvailableToTeam] = useState(true);
  const [addingLabel, setAddingLabel] = useState(false);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, LabelDraft>>({});
  const [tagSearch, setTagSearch] = useState('');
  const [tagSort, setTagSort] = useState<'order' | 'name'>('order');
  const [dragTagId, setDragTagId] = useState<string | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState('');
  const customTagColorRef = useRef<HTMLInputElement>(null);

  // Custom Modules State
  const [moduleSearch, setModuleSearch] = useState('');
  const [moduleSort, setModuleSort] = useState<'order' | 'name' | 'statuses'>('order');
  const [activeModuleMenuId, setActiveModuleMenuId] = useState<string | null>(null);
  const [seedingModules, setSeedingModules] = useState(false);

  // Terminology form
  const [termForm, setTermForm] = useState<Terminology>(terminology);
  const [savingTerms, setSavingTerms] = useState(false);

  // Workspace identity form
  const [orgForm, setOrgForm] = useState<{ name: string; analyticsHeading: string; currency: string; locale: string }>({
    name: user?.organization?.name || '',
    analyticsHeading: user?.organization?.analyticsHeading || 'Digital Insights',
    currency: user?.organization?.currency || 'INR',
    locale: user?.organization?.locale || 'en-IN',
  });
  const [savingOrg, setSavingOrg] = useState(false);

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
      if (res.organization) {
        setOrgForm({
          name: res.organization.name || user?.organization?.name || '',
          analyticsHeading: res.organization.analyticsHeading || 'Digital Insights',
          currency: res.organization.currency || 'INR',
          locale: res.organization.locale || 'en-IN',
        });
      }
      if (res.terminology) {
        setTerminology(res.terminology);
        setTermForm(res.terminology);
      }
      const savedPresetName = localStorage.getItem('theme-name');
      const activePreset = THEME_PRESETS.find(p => p.name === savedPresetName) || THEME_PRESETS[0];
      setActivePresetName(activePreset.name);
      setTheme({
        gold: activePreset.gold,
        teal: activePreset.teal,
        background: activePreset.bg,
        surface: activePreset.surface,
        text: activePreset.text,
      });
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
  const newStageColorRef = useRef<HTMLInputElement>(null);

  async function handleAddStage(e: React.FormEvent) {
    e.preventDefault();
    if (!newStageName.trim()) return;
    try {
      setAddingStage(true);
      await settingsApi.createStage({
        name: newStageName.trim(),
        color: newStageColor || '#ea580c',
        isWon: newStageWon,
        isLost: newStageLost,
        isDefault: newStageDefault,
        order: (stages.length + 1) * 10,
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

  async function handleQuickStageUpdate(stageId: string, updates: Partial<StageDraft>) {
    const current = sd(stages.find(s => s._id === stageId)!);
    const next = { ...current, ...updates };
    setStageDrafts(prev => ({ ...prev, [stageId]: next }));
    try {
      await settingsApi.updateStage(stageId, {
        name: next.name.trim(),
        color: next.color,
        isWon: next.isWon,
        isLost: next.isLost,
        isDefault: next.isDefault,
        isActive: next.isActive,
      });
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Failed to update stage');
    }
  }

  async function handleResetDefaultStages() {
    setConfirmState({
      open: true,
      title: 'Reset to default stages',
      message: 'Reset pipeline stages to standard defaults (New Lead, Untouched, Contact Attempted, 1st Message Done, Contacted, 1st Call Done)?',
      action: async () => {
        try {
          const defaultStages = [
            { name: 'New Lead', color: '#3B82F6', isDefault: true, isActive: true, isWon: false, isLost: false, order: 10 },
            { name: 'Untouched', color: '#6B7280', isDefault: false, isActive: true, isWon: false, isLost: false, order: 20 },
            { name: 'Contact Attempted', color: '#06B6D4', isDefault: false, isActive: true, isWon: false, isLost: false, order: 30 },
            { name: '1st Message Done', color: '#8B5CF6', isDefault: false, isActive: true, isWon: false, isLost: false, order: 40 },
            { name: 'Contacted', color: '#0E7490', isDefault: false, isActive: true, isWon: false, isLost: false, order: 50 },
            { name: '1st Call Done', color: '#0891B2', isDefault: false, isActive: true, isWon: false, isLost: false, order: 60 },
          ];
          for (const st of defaultStages) {
            const existing = stages.find(s => s.name.toLowerCase() === st.name.toLowerCase());
            if (existing) {
              await settingsApi.updateStage(existing._id, st);
            } else {
              await settingsApi.createStage(st);
            }
          }
          setSuccess('Reset pipeline stages to defaults.');
          await loadSettings();
        } catch (err: any) {
          setError(err.message || 'Failed to reset stages');
        }
      },
    });
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
      const ids = Array.from(document.querySelectorAll('[data-settings-panel="stages"] .stage-row-lux')).map(
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
      setShowAddFieldRow(false);
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

  async function handleQuickFieldUpdate(fieldId: string, updates: Partial<FieldDraft>) {
    const current = fd(fields.find(f => f._id === fieldId)!);
    const next = { ...current, ...updates };
    setFieldDrafts(prev => ({ ...prev, [fieldId]: next }));
    try {
      await settingsApi.updateField(fieldId, {
        label: next.label.trim(),
        type: next.type,
        options: next.options.split(',').map(o => o.trim()).filter(Boolean),
        required: next.required,
        isActive: next.isActive,
      });
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Failed to update field');
    }
  }

  async function saveFieldOrder() {
    try {
      const ids = Array.from(document.querySelectorAll('[data-settings-panel="fields"] .field-row-lux')).map(
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
        isActive: newLabelAvailableToTeam,
      });
      setNewLabelName('');
      setNewLabelColor('#ea580c');
      setNewLabelHighPotential(false);
      setNewLabelAvailableToTeam(true);
      setSuccess('Tag added.');
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Failed to create tag');
    } finally {
      setAddingLabel(false);
    }
  }

  async function handleQuickLabelUpdate(id: string, updates: Partial<LabelDraft>) {
    const current = ld(labels.find(l => l._id === id)!);
    const next = { ...current, ...updates };
    setLabelDrafts(prev => ({ ...prev, [id]: next }));
    try {
      await settingsApi.updateLabel(id, {
        name: next.name.trim(),
        color: next.color,
        isHighPotential: next.isHighPotential,
        isActive: next.isActive,
      });
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Failed to update tag');
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

  // ==================== WORK TYPES / CUSTOM MODULES ====================
  const STANDARD_DEFAULT_WORK_TYPES: Partial<WorkType>[] = [
    {
      name: 'Tasks',
      key: 'tasks',
      icon: 'square-check-big',
      color: '#ea580c',
      isActive: true,
      statuses: [
        { key: 'backlog', label: 'Backlog', color: '#64748b' },
        { key: 'todo', label: 'To Do', color: '#3b82f6' },
        { key: 'in-progress', label: 'In Progress', color: '#f59e0b' },
        { key: 'review', label: 'In Review', color: '#8b5cf6' },
        { key: 'blocked', label: 'Blocked', color: '#ef4444' },
        { key: 'done', label: 'Done', color: '#16a34a', isTerminalWon: true },
        { key: 'cancelled', label: 'Cancelled', color: '#94a3b8', isTerminalLost: true },
      ],
      fields: [
        { key: 'title', label: 'Task Title', type: 'text', required: true },
        { key: 'assignedTo', label: 'Assignee', type: 'user-picker', required: false },
        { key: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High', 'Urgent'], required: true },
        { key: 'deadline', label: 'Due Date', type: 'date', required: false },
        { key: 'estimatedHours', label: 'Estimated Hours', type: 'number', required: false },
        { key: 'tags', label: 'Tags', type: 'select', options: ['Feature', 'Bug', 'Support', 'Internal'], required: false },
        { key: 'relatedCustomer', label: 'Client / Company', type: 'customer-picker', required: false },
        { key: 'notes', label: 'Description / Notes', type: 'textarea', required: false },
      ],
    },
    {
      name: 'Meetings',
      key: 'meetings',
      icon: 'calendar',
      color: '#2563eb',
      isActive: true,
      statuses: [
        { key: 'scheduled', label: 'Scheduled', color: '#3b82f6' },
        { key: 'confirmed', label: 'Confirmed', color: '#0d9488' },
        { key: 'completed', label: 'Completed', color: '#16a34a', isTerminalWon: true },
        { key: 'rescheduled', label: 'Rescheduled', color: '#f59e0b' },
        { key: 'cancelled', label: 'Cancelled', color: '#ef4444', isTerminalLost: true },
      ],
      fields: [
        { key: 'meetingAgenda', label: 'Meeting Agenda & Link', type: 'textarea', required: true },
      ],
    },
    {
      name: 'Videos',
      key: 'videos',
      icon: 'video',
      color: '#9333ea',
      isActive: true,
      statuses: [
        { key: 'ideation', label: 'Ideation', color: '#64748b' },
        { key: 'scripting', label: 'Scripting', color: '#3b82f6' },
        { key: 'shooting', label: 'Shooting', color: '#f59e0b' },
        { key: 'editing', label: 'Editing', color: '#8b5cf6' },
        { key: 'client-review', label: 'Client Review', color: '#ec4899' },
        { key: 'approved', label: 'Approved', color: '#16a34a', isTerminalWon: true },
        { key: 'published', label: 'Published', color: '#059669', isTerminalWon: true },
      ],
      fields: Array.from({ length: 23 }, (_, i) => ({
        key: `video_field_${i + 1}`,
        label: i === 0 ? 'Video Title' : i === 1 ? 'Channel / Platform' : i === 2 ? 'Script URL' : `Spec Field ${i + 1}`,
        type: i === 1 ? 'select' : 'text',
        options: i === 1 ? ['YouTube', 'Instagram', 'TikTok', 'Website'] : undefined,
      })),
    },
    {
      name: 'Designs',
      key: 'designs',
      icon: 'palette',
      color: '#0d9488',
      isActive: true,
      statuses: [
        { key: 'request', label: 'Requested', color: '#64748b' },
        { key: 'wireframe', label: 'Wireframing', color: '#3b82f6' },
        { key: 'designing', label: 'Designing', color: '#f59e0b' },
        { key: 'internal-review', label: 'Internal Review', color: '#8b5cf6' },
        { key: 'client-feedback', label: 'Client Feedback', color: '#ec4899' },
        { key: 'approved', label: 'Approved', color: '#16a34a', isTerminalWon: true },
        { key: 'delivered', label: 'Delivered', color: '#059669', isTerminalWon: true },
      ],
      fields: [
        { key: 'designType', label: 'Asset Type', type: 'select', options: ['UI/UX', 'Banner', 'Social Post', 'Logo', 'Presentation'], required: true },
        { key: 'figmaLink', label: 'Figma File URL', type: 'url', required: false },
        { key: 'dimensions', label: 'Canvas Size / Dimensions', type: 'text', required: false },
        { key: 'brandGuidelines', label: 'Brand Guidelines', type: 'textarea', required: false },
        { key: 'designer', label: 'Lead Designer', type: 'user-picker', required: false },
        { key: 'revisionCount', label: 'Revision Rounds', type: 'number', required: false },
        { key: 'deliverableFiles', label: 'Export Asset Links', type: 'textarea', required: false },
      ],
    },
    {
      name: 'Projects',
      key: 'projects',
      icon: 'briefcase',
      color: '#d97706',
      isActive: true,
      statuses: [
        { key: 'planning', label: 'Planning', color: '#64748b' },
        { key: 'kickoff', label: 'Kickoff', color: '#3b82f6' },
        { key: 'in-progress', label: 'In Progress', color: '#f59e0b' },
        { key: 'testing-qa', label: 'QA / Testing', color: '#8b5cf6' },
        { key: 'delivered', label: 'Delivered', color: '#16a34a', isTerminalWon: true },
        { key: 'closed', label: 'Closed / Handover', color: '#059669', isTerminalWon: true },
      ],
      fields: Array.from({ length: 12 }, (_, i) => ({
        key: `project_field_${i + 1}`,
        label: i === 0 ? 'Project Scope' : i === 1 ? 'Budget (INR)' : i === 2 ? 'Tech Stack' : `Project Milestone ${i + 1}`,
        type: i === 1 ? 'currency' : 'text',
      })),
    },
    {
      name: 'Clients',
      key: 'clients',
      icon: 'users',
      color: '#e11d48',
      isActive: true,
      statuses: [
        { key: 'onboarding', label: 'Onboarding', color: '#3b82f6' },
        { key: 'active', label: 'Active Retainer', color: '#16a34a', isTerminalWon: true },
        { key: 'renewal', label: 'Renewal Due', color: '#f59e0b' },
        { key: 'at-risk', label: 'At Risk', color: '#ef4444' },
        { key: 'churned', label: 'Churned', color: '#94a3b8', isTerminalLost: true },
      ],
      fields: Array.from({ length: 15 }, (_, i) => ({
        key: `client_field_${i + 1}`,
        label: i === 0 ? 'Company Size' : i === 1 ? 'Contract Value' : i === 2 ? 'Account Manager' : `Client Attribute ${i + 1}`,
        type: i === 1 ? 'currency' : 'text',
      })),
    },
  ];

  function getModuleVisuals(item: WorkType) {
    const name = (item.name || '').toLowerCase();
    const icon = (item.icon || '').toLowerCase();
    const color = item.color || '#ea580c';

    if (name.includes('task') || icon.includes('check')) {
      return {
        iconName: 'square-check-big',
        bg: '#ffedd5',
        color: '#ea580c',
        defaultDesc: 'Track and manage all your tasks efficiently.',
      };
    }
    if (name.includes('meet') || icon.includes('calendar')) {
      return {
        iconName: 'calendar',
        bg: '#dbeafe',
        color: '#2563eb',
        defaultDesc: 'Schedule and track client meetings.',
      };
    }
    if (name.includes('video') || icon.includes('video') || icon.includes('clapper')) {
      return {
        iconName: 'video',
        bg: '#f3e8ff',
        color: '#9333ea',
        defaultDesc: 'Manage video production and content.',
      };
    }
    if (name.includes('design') || icon.includes('palette') || icon.includes('paint')) {
      return {
        iconName: 'palette',
        bg: '#ccfbf1',
        color: '#0d9488',
        defaultDesc: 'Track design requests and deliveries.',
      };
    }
    if (name.includes('project') || icon.includes('folder') || icon.includes('briefcase')) {
      return {
        iconName: 'briefcase',
        bg: '#fef3c7',
        color: '#d97706',
        defaultDesc: 'Manage all your projects end to end.',
      };
    }
    if (name.includes('client') || icon.includes('user')) {
      return {
        iconName: 'users',
        bg: '#ffe4e6',
        color: '#e11d48',
        defaultDesc: 'Store and manage client information.',
      };
    }

    return {
      iconName: item.icon || 'clipboard-list',
      bg: `color-mix(in srgb, ${color} 15%, #ffffff)`,
      color: color,
      defaultDesc: (item as any).description || `Manage ${item.name} records and workflow.`,
    };
  }

  async function handleToggleWorkTypeActive(item: WorkType) {
    try {
      await settingsApi.updateWorkType(item._id, { isActive: !item.isActive });
      setSuccess(`Module "${item.name}" ${!item.isActive ? 'activated' : 'hidden'}.`);
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Failed to update module');
    }
  }

  function handleDeleteWorkType(id: string, name: string) {
    setConfirmState({
      open: true,
      title: 'Delete Custom Module',
      message: `Delete module "${name}"? Existing items in this module will remain in database but will not be shown in Work Center.`,
      action: async () => {
        try {
          await settingsApi.deleteWorkType(id);
          setSuccess(`Module "${name}" deleted.`);
          await loadSettings();
        } catch (err: any) {
          setError(err.message || 'Failed to delete module');
        } finally {
          setConfirmState(prev => ({ ...prev, open: false }));
        }
      },
    });
  }

  async function handleSeedStandardWorkTypes() {
    try {
      setSeedingModules(true);
      for (const mod of STANDARD_DEFAULT_WORK_TYPES) {
        await settingsApi.createWorkType(mod);
      }
      setSuccess('Standard CRM custom modules loaded successfully.');
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Failed to seed modules');
    } finally {
      setSeedingModules(false);
    }
  }

  // ==================== TERMINOLOGY ====================
  function handleResetTerminology() {
    const defaultTerms: Terminology = {
      leadSingular: 'Lead',
      leadPlural: 'Leads',
      recordSingular: 'Client',
      recordPlural: 'Clients',
      pipelineName: 'Sales pipeline',
    };
    setTermForm(defaultTerms);
    setSuccess('Terminology reset to standard CRM defaults.');
  }

  async function handleSaveTerminology(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSavingTerms(true);
      await settingsApi.updateTerminology(termForm);
      setTerminology(termForm);
      setSuccess('CRM terminology updated.');
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Failed to update terminology');
    } finally {
      setSavingTerms(false);
    }
  }

  async function handleSaveOrganization(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSavingOrg(true);
      await settingsApi.updateOrganization({
        name: orgForm.name.trim(),
        analyticsHeading: orgForm.analyticsHeading.trim(),
        currency: orgForm.currency.trim().toUpperCase(),
        locale: orgForm.locale.trim(),
      });
      await refreshUser();
      setSuccess('Workspace identity updated.');
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Failed to update workspace identity');
    } finally {
      setSavingOrg(false);
    }
  }

// ==================== THEME ====================
  async function handleSaveThemeChanges() {
    try {
      setSavingTheme(true);
      await handleApplyTheme(theme.gold, theme.teal, theme.background, theme.surface, theme.text);
      setSuccess('CRM customization saved successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to save customization changes');
    } finally {
      setSavingTheme(false);
    }
  }

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

  function handleCustomColorChange(key: keyof ThemeColors, value: string) {
    const nextTheme = { ...theme, [key]: value };
    setTheme(nextTheme);

    const root = document.documentElement;
    if (key === 'gold') {
      root.style.setProperty('--gold', value);
      root.style.setProperty('--gold-dim', `color-mix(in srgb, ${value} 10%, transparent)`);
      root.style.setProperty('--gold-hover', `color-mix(in srgb, ${value} 85%, black)`);
    } else if (key === 'teal') {
      root.style.setProperty('--teal', value);
      root.style.setProperty('--teal-dim', `color-mix(in srgb, ${value} 10%, transparent)`);
    } else if (key === 'background') {
      root.style.setProperty('--bg', value);
      root.style.setProperty('--bg-soft', `color-mix(in srgb, ${value} 92%, ${nextTheme.text})`);
    } else if (key === 'surface') {
      root.style.setProperty('--panel', value);
      root.style.setProperty('--panel-2', value);
      root.style.setProperty('--panel-muted', `color-mix(in srgb, ${value} 95%, ${nextTheme.text})`);
      root.style.setProperty('--input', `color-mix(in srgb, ${value} 96%, ${nextTheme.text})`);
      root.style.setProperty('--hover', `color-mix(in srgb, ${value} 94%, ${nextTheme.text})`);
      root.style.setProperty('--border', `color-mix(in srgb, ${value} 88%, ${nextTheme.text})`);
      root.style.setProperty('--border-strong', `color-mix(in srgb, ${value} 80%, ${nextTheme.text})`);
    } else if (key === 'text') {
      root.style.setProperty('--text', value);
      root.style.setProperty('--muted', `color-mix(in srgb, ${nextTheme.surface} 45%, ${value})`);
      root.style.setProperty('--sub', `color-mix(in srgb, ${nextTheme.surface} 30%, ${value})`);
    }

    settingsApi.updateTheme(nextTheme).catch(() => {});
  }

  function activePresetKey(): string {
    return activePresetName;
  }



  if (loading && stages.length === 0 && fields.length === 0) {
    return <div className="loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading settings...</div>;
  }

  const categories = [
    { id: 'appearance', label: 'Appearance', icon: Palette, admin: false },
    { id: 'stages', label: terminology.pipelineName || 'Sales pipeline', icon: Workflow, admin: false },
    { id: 'fields', label: `${terminology.recordSingular} form`, icon: FileEdit, admin: false },
    { id: 'labels', label: `${terminology.recordSingular} tags`, icon: Tag, admin: false },
    { id: 'work-types', label: 'Custom modules', icon: LayoutGrid, admin: true },
    { id: 'terminology', label: 'CRM names', icon: Type, admin: true },
    { id: 'automations', label: 'Automations', icon: Zap, admin: true },
    { id: 'org', label: 'Workspace', icon: Building2, admin: true },
  ].filter(c => (c.admin ? isAdmin : true));

  const visibleStageOrder = [...stages];
  const visibleFieldOrder = [...fields];

  return (
    <div className="customization-page-wrap">
      {/* Top Breadcrumbs */}
      <nav className="customization-breadcrumbs" aria-label="Breadcrumb">
        <Link to="/settings" className="bc-link">Settings</Link>
        <span className="bc-sep">›</span>
        <span className="bc-current">
          {activeCategory === 'stages' ? (terminology.pipelineName || 'Sales pipeline') :
           activeCategory === 'fields' ? `${terminology.recordSingular} form builder` :
           activeCategory === 'appearance' ? 'CRM customisation' :
           activeCategory === 'org' ? 'Workspace' :
           categories.find(c => c.id === activeCategory)?.label || 'CRM customisation'}
        </span>
      </nav>

      {/* Page Header */}
      <section className="customization-head">
        <div className="customization-head-text">
          <h1>
            {activeCategory === 'stages' ? 'Sales pipeline stages' :
             activeCategory === 'fields' ? `${terminology.recordSingular} form builder` :
             activeCategory === 'labels' ? `${terminology.recordSingular} tags` :
             activeCategory === 'work-types' ? 'Custom modules' :
             activeCategory === 'terminology' ? 'CRM names' :
             activeCategory === 'automations' ? 'Automations' :
             activeCategory === 'appearance' ? 'CRM customization' :
             activeCategory === 'org' ? 'Workspace' :
             categories.find(c => c.id === activeCategory)?.label || 'CRM customization'}
          </h1>
          <p>
            {activeCategory === 'stages'
              ? 'Define and manage the stages of your sales pipeline. These stages will be used across your CRM for leads, deals and reports.'
              : activeCategory === 'fields'
              ? `Customize the questions and data points your team captures when adding or editing ${terminology.leadPlural.toLowerCase()} in your CRM.`
              : activeCategory === 'labels'
              ? 'Personalize the look, feel and behaviour of your CRM workspace. Changes apply instantly and only to this company.'
              : activeCategory === 'work-types'
              ? 'Create and manage the building blocks of your CRM. Each module has its own fields, statuses and workflow, tailored to your business.'
              : activeCategory === 'terminology'
              ? 'Use the words your business uses. This will personalize your CRM workspace and make it easier for your team to work with familiar terms.'
              : activeCategory === 'automations'
              ? 'Save time and automate your CRM. Create rules to automatically take actions when something happens in your workspace.'
              : activeCategory === 'org'
              ? 'Personalize your brand and workspace identity — the name, analytics heading and localisation used across the CRM.'
              : 'Personalize the look, feel and behaviour of your CRM workspace. Changes apply instantly and only to this company.'}
          </p>
        </div>
        <div className="customization-head-actions">
          {activeCategory === 'automations' ? (
            <>
              <div className="pipeline-highlight-banner">
                <div className="pipeline-highlight-icon">
                  <Zap size={18} />
                </div>
                <div className="pipeline-highlight-text">
                  <strong>Automate the busy work</strong>
                  <span>Focus on what matters. Let your CRM handle the rest.</span>
                </div>
              </div>
              {isAdmin && (
                <Link className="btn-company-setup" to="/settings/setup">
                  <SettingsIcon size={16} />
                  <span>Company setup</span>
                </Link>
              )}
            </>
          ) : activeCategory === 'work-types' ? (
            <>
              <div className="pipeline-highlight-banner">
                <div className="pipeline-highlight-icon">
                  <LayoutGrid size={18} />
                </div>
                <div className="pipeline-highlight-text">
                  <strong>Custom modules give complete workflow control</strong>
                  <span>Create custom boards, forms, and stages for your business.</span>
                </div>
              </div>
              {isAdmin && (
                <Link className="btn-company-setup" to="/settings/setup">
                  <SettingsIcon size={16} />
                  <span>Company setup</span>
                </Link>
              )}
            </>
          ) : activeCategory === 'stages' ? (
            <div className="pipeline-highlight-banner">
              <div className="pipeline-highlight-icon">
                <BarChart3 size={18} />
              </div>
              <div className="pipeline-highlight-text">
                <strong>A clear pipeline helps your team stay focused</strong>
                <span>Track progress from first touch to closed won.</span>
              </div>
            </div>
          ) : activeCategory === 'fields' ? (
            <div className="pipeline-highlight-banner">
              <div className="pipeline-highlight-icon">
                <FileEdit size={18} />
              </div>
              <div className="pipeline-highlight-text">
                <strong>Custom fields adapt CRM to your workflow</strong>
                <span>Capture essential data for every {terminology.leadSingular.toLowerCase()}.</span>
              </div>
            </div>
          ) : activeCategory === 'appearance' ? (
            <>
              {isAdmin && (
                <Link className="btn-company-setup" to="/settings/setup">
                  <SettingsIcon size={16} />
                  <span>Company setup</span>
                  <ChevronDown size={14} style={{ color: 'var(--muted)' }} />
                </Link>
              )}
              <button
                className="btn-save-changes"
                type="button"
                disabled={savingTheme}
                onClick={handleSaveThemeChanges}
              >
                <Check size={16} />
                <span>{savingTheme ? 'Saving...' : 'Save changes'}</span>
                <ChevronDown size={14} style={{ opacity: 0.85 }} />
              </button>
            </>
          ) : (
            isAdmin && (
              <Link className="btn-company-setup" to="/settings/setup">
                <SettingsIcon size={16} />
                <span>Company setup</span>
              </Link>
            )
          )}
        </div>
      </section>

      {error && <div className="notice danger" style={{ marginBottom: '0.5rem' }}>{error}</div>}
      {success && <div className="notice success" style={{ marginBottom: '0.5rem' }}>{success}</div>}

      {/* Tabs Navigation */}
      <nav className="customization-tabs-nav" aria-label="Settings categories">
        {categories.map(cat => {
          const IconComp = cat.icon;
          return (
            <button
              key={cat.id}
              type="button"
              data-settings-category={cat.id}
              className={`customization-tab-btn ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => handleCategoryChange(cat.id)}
            >
              <IconComp size={16} />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ============ APPEARANCE (LUXURY CUSTOMIZATION UI) ============ */}
      {activeCategory === 'appearance' && (
        <div className="customization-main-grid">
          {/* Left Column */}
          <div className="customization-left-col">
            {/* Choose a theme Card */}
            <div className="customization-card">
              <div className="customization-card-header">
                <div className="customization-header-left">
                  <div className="customization-header-icon">
                    <Palette size={18} />
                  </div>
                  <div className="customization-header-titles">
                    <h2>Choose a theme</h2>
                    <p>Select a curated theme preset. Changes apply instantly to your CRM workspace.</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="customization-header-action-btn"
                  onClick={() => {
                    document.getElementById('live-preview-section')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  <span>View live preview</span>
                  <ArrowRight size={13} />
                </button>
              </div>

              <div className="theme-presets-grid-lux">
                {THEME_PRESETS.map(preset => (
                  <ThemeCardLux
                    key={preset.name}
                    preset={preset}
                    active={activePresetName === preset.name}
                    onClick={(e: React.MouseEvent) => {
                      setActivePresetName(preset.name);
                      setTheme({
                        gold: preset.gold,
                        teal: preset.teal,
                        background: preset.bg,
                        surface: preset.surface,
                        text: preset.text,
                      });
                      changeThemeWithAnimation(preset, e);
                      settingsApi.updateTheme({
                        gold: preset.gold,
                        teal: preset.teal,
                        background: preset.bg,
                        surface: preset.surface,
                        text: preset.text,
                      }).catch(() => {});
                    }}
                  />
                ))}
              </div>
            </div>


            {/* Brand & Custom Colors Card */}
            <div className="customization-card">
              <div className="customization-card-header">
                <div className="customization-header-left">
                  <div className="customization-header-icon">
                    <Sparkles size={18} />
                  </div>
                  <div className="customization-header-titles">
                    <h2>Brand & custom colors</h2>
                    <p>Fine-tune individual workspace colors to match your brand identity.</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="customization-header-action-btn"
                  title="Reset to selected preset colors"
                  onClick={() => {
                    const cur = THEME_PRESETS.find(p => p.name === activePresetName) || THEME_PRESETS[0];
                    setTheme({
                      gold: cur.gold,
                      teal: cur.teal,
                      background: cur.bg,
                      surface: cur.surface,
                      text: cur.text,
                    });
                    handleApplyTheme(cur.gold, cur.teal, cur.bg, cur.surface, cur.text);
                  }}
                >
                  <RotateCcw size={13} />
                  <span>Reset to preset</span>
                </button>
              </div>

              <div className="color-swatches-grid">
                {/* Primary Color */}
                <div className="color-swatch-card">
                  <span className="color-swatch-label">Primary Color</span>
                  <label className="color-swatch-input-box">
                    <input
                      type="color"
                      value={theme.gold}
                      onChange={e => handleCustomColorChange('gold', e.target.value)}
                      className="color-native-input"
                    />
                    <span className="color-swatch-dot" style={{ background: theme.gold }} />
                    <span className="color-swatch-hex">{theme.gold.toUpperCase()}</span>
                    <button
                      type="button"
                      className="color-copy-btn"
                      title="Copy HEX"
                      onClick={e => {
                        e.preventDefault();
                        navigator.clipboard.writeText(theme.gold);
                        setSuccess('Primary color copied to clipboard');
                      }}
                    >
                      <Copy size={13} />
                    </button>
                  </label>
                </div>

                {/* Secondary Accent */}
                <div className="color-swatch-card">
                  <span className="color-swatch-label">Accent / Secondary</span>
                  <label className="color-swatch-input-box">
                    <input
                      type="color"
                      value={theme.teal}
                      onChange={e => handleCustomColorChange('teal', e.target.value)}
                      className="color-native-input"
                    />
                    <span className="color-swatch-dot" style={{ background: theme.teal }} />
                    <span className="color-swatch-hex">{theme.teal.toUpperCase()}</span>
                    <button
                      type="button"
                      className="color-copy-btn"
                      title="Copy HEX"
                      onClick={e => {
                        e.preventDefault();
                        navigator.clipboard.writeText(theme.teal);
                        setSuccess('Accent color copied to clipboard');
                      }}
                    >
                      <Copy size={13} />
                    </button>
                  </label>
                </div>

                {/* Background */}
                <div className="color-swatch-card">
                  <span className="color-swatch-label">Background</span>
                  <label className="color-swatch-input-box">
                    <input
                      type="color"
                      value={theme.background}
                      onChange={e => handleCustomColorChange('background', e.target.value)}
                      className="color-native-input"
                    />
                    <span className="color-swatch-dot" style={{ background: theme.background }} />
                    <span className="color-swatch-hex">{theme.background.toUpperCase()}</span>
                    <button
                      type="button"
                      className="color-copy-btn"
                      title="Copy HEX"
                      onClick={e => {
                        e.preventDefault();
                        navigator.clipboard.writeText(theme.background);
                        setSuccess('Background color copied to clipboard');
                      }}
                    >
                      <Copy size={13} />
                    </button>
                  </label>
                </div>

                {/* Surface / Card */}
                <div className="color-swatch-card">
                  <span className="color-swatch-label">Card / Surface</span>
                  <label className="color-swatch-input-box">
                    <input
                      type="color"
                      value={theme.surface}
                      onChange={e => handleCustomColorChange('surface', e.target.value)}
                      className="color-native-input"
                    />
                    <span className="color-swatch-dot" style={{ background: theme.surface }} />
                    <span className="color-swatch-hex">{theme.surface.toUpperCase()}</span>
                    <button
                      type="button"
                      className="color-copy-btn"
                      title="Copy HEX"
                      onClick={e => {
                        e.preventDefault();
                        navigator.clipboard.writeText(theme.surface);
                        setSuccess('Surface color copied to clipboard');
                      }}
                    >
                      <Copy size={13} />
                    </button>
                  </label>
                </div>

                {/* Text / Typography */}
                <div className="color-swatch-card">
                  <span className="color-swatch-label">Typography / Text</span>
                  <label className="color-swatch-input-box">
                    <input
                      type="color"
                      value={theme.text}
                      onChange={e => handleCustomColorChange('text', e.target.value)}
                      className="color-native-input"
                    />
                    <span className="color-swatch-dot" style={{ background: theme.text }} />
                    <span className="color-swatch-hex">{theme.text.toUpperCase()}</span>
                    <button
                      type="button"
                      className="color-copy-btn"
                      title="Copy HEX"
                      onClick={e => {
                        e.preventDefault();
                        navigator.clipboard.writeText(theme.text);
                        setSuccess('Text color copied to clipboard');
                      }}
                    >
                      <Copy size={13} />
                    </button>
                  </label>
                </div>
              </div>
            </div>
          </div>


          {/* Right Column: Live Preview */}
          <div className="live-preview-card" id="live-preview-section">
            <div className="customization-card-header">
              <div className="customization-header-left">
                <div className="customization-header-icon">
                  <Eye size={18} />
                </div>
                <div className="customization-header-titles">
                  <h2>Live preview</h2>
                  <p>See how your CRM will look with the selected theme.</p>
                </div>
              </div>
            </div>

            {/* Live Miniature CRM Frame */}
            <div
              className="live-crm-frame"
              style={{
                '--preview-bg': theme.background,
                '--preview-surface': theme.surface,
                '--preview-gold': theme.gold,
                '--preview-teal': theme.teal,
                '--preview-text': theme.text,
              } as React.CSSProperties}
            >
              {/* Mini TopBar */}
              <div className="live-mini-topbar">
                <div className="live-topbar-left">
                  <span className="live-avatar-tag">MD</span>
                  <div className="live-search-pill" />
                </div>
                <div className="live-topbar-right">
                  <div className="live-dot-indicator" style={{ background: theme.gold }} />
                  <div className="live-dot-indicator" style={{ background: theme.teal }} />
                </div>
              </div>

              {/* Mini Body */}
              <div className="live-mini-layout">
                {/* Mini Sidebar */}
                <div className="live-mini-sidebar">
                  <div className="live-sidebar-pill active" style={{ background: theme.gold }} />
                  <div className="live-sidebar-pill inactive" />
                  <div className="live-sidebar-pill inactive" />
                  <div className="live-sidebar-pill inactive" />
                  <div className="live-sidebar-pill inactive" />
                </div>

                {/* Mini Main Content */}
                <div className="live-mini-main">
                  {/* 3 Stat Cards */}
                  <div className="live-stat-cards-row">
                    <div className="live-stat-box">
                      <div className="live-stat-icon-wrap" style={{ background: `color-mix(in srgb, ${theme.gold} 15%, transparent)`, color: theme.gold }}>
                        <div style={{ width: 7, height: 7, borderRadius: 2, background: 'currentColor' }} />
                      </div>
                      <strong className="live-stat-number">12</strong>
                      <span className="live-stat-lbl">New Leads</span>
                    </div>
                    <div className="live-stat-box">
                      <div className="live-stat-icon-wrap" style={{ background: `color-mix(in srgb, ${theme.teal} 15%, transparent)`, color: theme.teal }}>
                        <div style={{ width: 7, height: 7, borderRadius: 2, background: 'currentColor' }} />
                      </div>
                      <strong className="live-stat-number">8</strong>
                      <span className="live-stat-lbl">In Progress</span>
                    </div>
                    <div className="live-stat-box">
                      <div className="live-stat-icon-wrap" style={{ background: `color-mix(in srgb, ${theme.gold} 20%, transparent)`, color: theme.gold }}>
                        <div style={{ width: 7, height: 7, borderRadius: 2, background: 'currentColor' }} />
                      </div>
                      <strong className="live-stat-number">5</strong>
                      <span className="live-stat-lbl">Meetings</span>
                    </div>
                  </div>


                  {/* Sales Overview Bar Chart */}
                  <div className="live-chart-box">
                    <span className="live-chart-head">Sales Overview</span>
                    <div className="live-bars-container">
                      {[28, 45, 62, 38, 80, 52, 44, 76, 92, 68, 84, 100, 72, 94].map((h, i) => (
                        <div
                          key={i}
                          className="live-bar-item"
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Bottom Grid: Recent Activity & My Tasks */}
                  <div className="live-bottom-grid">
                    <div className="live-sub-card">
                      <span className="live-sub-title">Recent Activity</span>
                      <div className="live-activity-list">
                        <div className="live-activity-row">
                          <span className="live-act-dot" style={{ background: '#10b981' }} />
                          <span className="live-act-line" />
                        </div>
                        <div className="live-activity-row">
                          <span className="live-act-dot" style={{ background: '#f59e0b' }} />
                          <span className="live-act-line" />
                        </div>
                        <div className="live-activity-row">
                          <span className="live-act-dot" style={{ background: theme.teal }} />
                          <span className="live-act-line" />
                        </div>
                      </div>
                    </div>

                    <div className="live-sub-card">
                      <span className="live-sub-title">My Tasks</span>
                      <div className="live-tasks-list">
                        <div className="live-task-row">
                          <span className="live-task-box" />
                          <span className="live-task-line" />
                        </div>
                        <div className="live-task-row">
                          <span className="live-task-box" />
                          <span className="live-task-line" />
                        </div>
                        <div className="live-task-row">
                          <span className="live-task-box" />
                          <span className="live-task-line" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tip Banner */}
            <div className="live-preview-tip-box">
              <Lightbulb size={18} />
              <p>This is a live preview. Try different themes and colors to see how your CRM will look.</p>
            </div>
          </div>
        </div>
      )}

      <section className="settings-grid" hidden={activeCategory === 'appearance'}>
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
        {isAdmin && activeCategory === 'work-types' && (
          <div className="modules-manager-container">
            {/* Top Main Card: Your modules */}
            <div className="modules-list-card">
              <div className="modules-list-header">
                <div className="modules-list-header-left">
                  <div className="modules-title-row">
                    <h3 className="modules-list-title">Your modules</h3>
                    <span className="modules-count-badge">{workTypes.length}</span>
                  </div>
                  <p className="modules-list-subtitle">
                    Create a business record such as Patient, Student, Order, Property, Project, or Case. Each module gets its own fields and workflow.
                  </p>
                </div>

                <div className="modules-list-header-right">
                  <div className="modules-search-wrap">
                    <Search size={14} />
                    <input
                      type="text"
                      placeholder="Search modules..."
                      value={moduleSearch}
                      onChange={e => setModuleSearch(e.target.value)}
                    />
                  </div>

                  <select
                    className="modules-sort-select"
                    value={moduleSort}
                    onChange={e => setModuleSort(e.target.value as any)}
                  >
                    <option value="order">Sort by order</option>
                    <option value="name">Sort by name</option>
                    <option value="statuses">Sort by statuses</option>
                  </select>

                  <button
                    type="button"
                    className="btn-create-module-orange"
                    onClick={() => { setBuilderTarget(null); setBuilderOpen(true); }}
                  >
                    <Plus size={15} />
                    <span>Create module</span>
                  </button>
                </div>
              </div>

              {/* 3-Column Grid of Custom Modules */}
              <div className="modules-grid-lux">
                {workTypes.length === 0 ? (
                  <div className="modules-empty-card-state">
                    <LayoutGrid size={32} color="#ea580c" />
                    <h4>No custom modules created yet</h4>
                    <p>Load the standard recommended modules (Tasks, Meetings, Videos, Designs, Projects, Clients) or build your first custom module.</p>
                    <div className="modules-empty-actions">
                      <button
                        type="button"
                        className="btn-seed-modules-primary"
                        onClick={handleSeedStandardWorkTypes}
                        disabled={seedingModules}
                      >
                        <Sparkles size={14} />
                        <span>{seedingModules ? 'Loading modules...' : 'Load standard 6 modules'}</span>
                      </button>
                      <button
                        type="button"
                        className="btn-create-empty-sec"
                        onClick={() => { setBuilderTarget(null); setBuilderOpen(true); }}
                      >
                        <Plus size={14} />
                        <span>Create custom module</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  workTypes
                    .filter(item => {
                      if (!moduleSearch.trim()) return true;
                      const q = moduleSearch.toLowerCase();
                      return item.name.toLowerCase().includes(q) || item.key.toLowerCase().includes(q);
                    })
                    .sort((a, b) => {
                      if (moduleSort === 'name') return a.name.localeCompare(b.name);
                      if (moduleSort === 'statuses') return (b.statuses?.length || 0) - (a.statuses?.length || 0);
                      return 0;
                    })
                    .map(item => {
                      const visuals = getModuleVisuals(item);
                      const isMenuOpen = activeModuleMenuId === item._id;

                      return (
                        <div key={item._id} className="custom-module-card">
                          {/* Top part: Icon + Name + Active badge + 3 dots */}
                          <div className="module-card-top-row">
                            <div className="module-icon-badge" style={{ backgroundColor: visuals.bg, color: visuals.color }}>
                              <Icon name={visuals.iconName as any} size={22} />
                            </div>

                            <div className="module-card-body">
                              <div className="module-name-status-row">
                                <h4 className="module-card-name">{item.name}</h4>
                                <span className={`module-status-pill ${item.isActive ? 'active' : 'hidden'}`}>
                                  {item.isActive ? 'Active' : 'Hidden'}
                                </span>
                              </div>
                              <p className="module-card-desc">{visuals.defaultDesc}</p>
                            </div>

                            <div className="module-menu-wrap">
                              <button
                                type="button"
                                className="btn-module-menu-dots"
                                title="Module options"
                                onClick={() => setActiveModuleMenuId(isMenuOpen ? null : item._id)}
                              >
                                <MoreVertical size={16} />
                              </button>

                              {isMenuOpen && (
                                <>
                                  <div className="module-menu-backdrop" onClick={() => setActiveModuleMenuId(null)} />
                                  <div className="module-menu-dropdown">
                                    <button
                                      type="button"
                                      className="module-menu-item"
                                      onClick={() => {
                                        setActiveModuleMenuId(null);
                                        setBuilderTarget(item);
                                        setBuilderOpen(true);
                                      }}
                                    >
                                      <Pencil size={13} />
                                      <span>Customize fields & workflow</span>
                                    </button>
                                    <button
                                      type="button"
                                      className="module-menu-item"
                                      onClick={() => {
                                        setActiveModuleMenuId(null);
                                        handleToggleWorkTypeActive(item);
                                      }}
                                    >
                                      <Eye size={13} />
                                      <span>{item.isActive ? 'Hide module' : 'Show module'}</span>
                                    </button>
                                    <button
                                      type="button"
                                      className="module-menu-item danger"
                                      onClick={() => {
                                        setActiveModuleMenuId(null);
                                        handleDeleteWorkType(item._id, item.name);
                                      }}
                                    >
                                      <Trash2 size={13} />
                                      <span>Delete module</span>
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Bottom part: Stats (statuses / fields) + Customize button */}
                          <div className="module-card-footer">
                            <div className="module-card-stats">
                              <div className="module-stat-item" title={`${item.statuses?.length || 0} pipeline statuses`}>
                                <Layers size={14} className="stat-icon" />
                                <span>{item.statuses?.length || 0} statuses</span>
                              </div>
                              <div className="module-stat-item" title={`${item.fields?.length || 0} custom fields`}>
                                <ListChecks size={14} className="stat-icon" />
                                <span>{item.fields?.length || 0} fields</span>
                              </div>
                            </div>

                            <button
                              type="button"
                              className="btn-module-customize"
                              onClick={() => {
                                setBuilderTarget(item);
                                setBuilderOpen(true);
                              }}
                            >
                              <span>Customize</span>
                              <ArrowRight size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>

            {/* Bottom 2 Helper Cards (Side-by-side) */}
            <div className="module-bottom-helpers-grid">
              {/* Left Card: Create a new module */}
              <div
                className="create-module-helper-card"
                onClick={() => { setBuilderTarget(null); setBuilderOpen(true); }}
                title="Create a new custom module"
              >
                <div className="create-module-plus-circle">
                  <Plus size={18} />
                </div>
                <div className="create-module-helper-text">
                  <h4>Create a new module</h4>
                  <p>Set up a custom module with your own fields and workflow.</p>
                </div>
              </div>

              {/* Right Card: Helpful Tip Callout */}
              <div className="module-tip-helper-card">
                <div className="module-tip-bulb-badge">
                  <Lightbulb size={18} />
                </div>
                <div className="module-tip-text">
                  <p className="module-tip-main">
                    Custom modules give you the flexibility to match your CRM with your business.
                  </p>
                  <p className="module-tip-sub">
                    Need help setting this up? Custom modules allow you to tailor workflows, or contact <a href="mailto:admin@vandeagency.com">admin@vandeagency.com</a> for assistance.
                  </p>
                </div>
              </div>
            </div>

            {builderOpen && (
              <WorkTypeBuilder
                workType={builderTarget}
                onClose={() => { setBuilderOpen(false); setBuilderTarget(null); }}
                onChanged={loadSettings}
              />
            )}
          </div>
        )}

        {/* ============ STAGES ============ */}
        <article className="settings-panel wide" data-settings-panel="stages" hidden={activeCategory !== 'stages'}>
          {/* Add a new stage Card */}
          <div className="stage-add-card">
            <div className="stage-add-header">
              <div className="stage-add-icon-btn">
                <Plus size={18} />
              </div>
              <div className="stage-add-titles">
                <h2>Add a new stage</h2>
                <p>Create a new milestone in your pipeline flow.</p>
              </div>
            </div>
            <form onSubmit={handleAddStage} className="stage-add-form">
              <div className="stage-input-color-row">
                <div className="stage-name-input-wrap">
                  <input
                    type="text"
                    name="name"
                    placeholder="e.g. Demo Booked"
                    required
                    className="stage-name-input-lux"
                    value={newStageName}
                    onChange={e => setNewStageName(e.target.value)}
                  />
                </div>
                <div className="stage-color-wrap">
                  <div
                    className="stage-color-picker-pill"
                    onClick={() => newStageColorRef.current?.click()}
                    title="Choose stage color"
                  >
                    <span className="stage-color-swatch-box" style={{ background: newStageColor }} />
                    <ChevronDown size={14} className="stage-color-chevron" />
                    <input
                      ref={newStageColorRef}
                      type="color"
                      className="color-native-input"
                      value={newStageColor}
                      onChange={e => setNewStageColor(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="stage-flags-actions-row">
                <div className="stage-flags-group">
                  <label className="stage-flag-label won">
                    <input
                      type="checkbox"
                      checked={newStageWon}
                      onChange={e => {
                        setNewStageWon(e.target.checked);
                        if (e.target.checked) setNewStageLost(false);
                      }}
                    />
                    <span>Won?</span>
                  </label>
                  <label className="stage-flag-label lost">
                    <input
                      type="checkbox"
                      checked={newStageLost}
                      onChange={e => {
                        setNewStageLost(e.target.checked);
                        if (e.target.checked) setNewStageWon(false);
                      }}
                    />
                    <span>Lost?</span>
                  </label>
                  <label className="stage-flag-label default">
                    <input
                      type="checkbox"
                      checked={newStageDefault}
                      onChange={e => setNewStageDefault(e.target.checked)}
                    />
                    <span>Default?</span>
                  </label>
                </div>

                <div className="stage-add-btns">
                  <button
                    type="button"
                    className="btn-stage-cancel"
                    onClick={() => {
                      setNewStageName('');
                      setNewStageWon(false);
                      setNewStageLost(false);
                      setNewStageDefault(false);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-stage-submit"
                    disabled={addingStage}
                  >
                    {addingStage ? 'Adding...' : '+ Add stage'}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Your stages List Card */}
          <div className="stage-list-card">
            <div className="stage-list-card-head">
              <div className="stage-list-titles">
                <h2>Your stages ({visibleStageOrder.length})</h2>
                <p>Drag stages to reorder your pipeline flow.</p>
              </div>
              <div className="stage-list-actions">
                <button
                  type="button"
                  className="btn-stage-secondary"
                  onClick={handleResetDefaultStages}
                  title="Reset to default stages"
                >
                  <RotateCcw size={14} />
                  <span>Reset to default</span>
                </button>
                <Link
                  to="/leads"
                  className="btn-stage-secondary"
                  title="View leads pipeline"
                >
                  <BarChart3 size={14} />
                  <span>View pipeline</span>
                </Link>
              </div>
            </div>

            <div className="stage-table-container" id="stageReorderList">
              <div className="stage-grid-header-lux">
                <span>#</span>
                <span>STAGE NAME</span>
                <span>COLOR</span>
                <span style={{ textAlign: 'center' }}>WON?</span>
                <span style={{ textAlign: 'center' }}>LOST?</span>
                <span style={{ textAlign: 'center' }}>DEFAULT?</span>
                <span style={{ textAlign: 'center' }}>ACTIVE</span>
                <span style={{ textAlign: 'center' }}>LEADS</span>
                <span style={{ textAlign: 'center' }}>DEALS</span>
                <span style={{ textAlign: 'right' }}>ACTIONS</span>
              </div>

              {visibleStageOrder.map((stage, idx) => {
                const d = sd(stage);
                return (
                  <div
                    key={stage._id}
                    data-stage-id={stage._id}
                    className={`stage-row-lux ${dragStageId === stage._id ? 'is-dragging' : ''}`}
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
                  >
                    <div className="stage-drag-cell">
                      <span className="stage-drag-handle" title="Drag to reorder">⋮⋮</span>
                      <span className="stage-index-num">{idx + 1}</span>
                    </div>

                    <div className="stage-name-cell">
                      <span className="stage-dot-circle" style={{ background: d.color || '#3b82f6' }} />
                      <input
                        type="text"
                        className="stage-name-input-inline"
                        value={d.name}
                        onChange={e => {
                          const val = e.target.value;
                          setStageDrafts(prev => ({ ...prev, [stage._id]: { ...d, name: val } }));
                        }}
                        onBlur={() => handleUpdateStage(stage._id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        title="Click to edit name"
                      />
                    </div>

                    <div className="stage-color-cell">
                      <label className="stage-color-badge-lux" title="Change color">
                        <span className="stage-color-square-dot" style={{ background: d.color || '#3b82f6' }} />
                        <span>{d.color || '#3B82F6'}</span>
                        <input
                          type="color"
                          className="color-native-input"
                          value={d.color || '#3b82f6'}
                          onChange={e => handleQuickStageUpdate(stage._id, { color: e.target.value })}
                        />
                      </label>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <input
                        type="checkbox"
                        className="stage-check-won"
                        checked={d.isWon}
                        title="Won stage"
                        onChange={e => handleQuickStageUpdate(stage._id, { isWon: e.target.checked, ...(e.target.checked ? { isLost: false } : {}) })}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <input
                        type="checkbox"
                        className="stage-check-lost"
                        checked={d.isLost}
                        title="Lost stage"
                        onChange={e => handleQuickStageUpdate(stage._id, { isLost: e.target.checked, ...(e.target.checked ? { isWon: false } : {}) })}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <input
                        type="checkbox"
                        className="stage-check-default"
                        checked={d.isDefault}
                        title="Default starting stage"
                        onChange={e => handleQuickStageUpdate(stage._id, { isDefault: e.target.checked })}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <label className="stage-switch" title="Active in CRM">
                        <input
                          type="checkbox"
                          checked={d.isActive}
                          onChange={e => handleQuickStageUpdate(stage._id, { isActive: e.target.checked })}
                        />
                        <span className="stage-switch-slider" />
                      </label>
                    </div>

                    <div className="stage-stat-cell">
                      {stage.leadCount ?? 0}
                    </div>

                    <div className="stage-stat-cell">
                      {stage.dealCount ?? 0}
                    </div>

                    <div className="stage-action-btns-cell">
                      <button
                        type="button"
                        className="btn-stage-cell-action"
                        title="Edit stage name"
                        onClick={() => {
                          const inputEl = document.querySelector(`[data-stage-id="${stage._id}"] .stage-name-input-inline`) as HTMLInputElement;
                          inputEl?.focus();
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn-stage-cell-action"
                        title="Delete stage"
                        onClick={() => handleDeleteStage(stage._id, stage.name)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Tip Banner */}
          <div className="stage-bottom-tip-banner">
            <div className="stage-bottom-tip-left">
              <Info size={16} />
              <span><strong>Tip:</strong> Keep your pipeline simple. 5–8 stages work best for most teams.</span>
            </div>
            <a href="#pipeline-best-practices" className="stage-bottom-tip-link" onClick={e => { e.preventDefault(); window.open('https://en.wikipedia.org/wiki/Sales_pipeline', '_blank'); }}>
              <span>Learn best practices</span>
              <ArrowRight size={14} />
            </a>
          </div>
        </article>

        {/* ============ LABELS ============ */}
        {activeCategory === 'labels' && (
          <div className="tags-manager-container">
            {/* Top Card: Create a new tag */}
            <div className="tag-create-card">
              <div className="tag-create-header">
                <div className="tag-create-icon-badge">
                  <Tag size={18} />
                </div>
                <div className="tag-create-titles">
                  <h3 className="tag-create-title">Create a new tag</h3>
                  <p className="tag-create-subtitle">Add a tag with a unique color to organize your leads.</p>
                </div>
              </div>

              <form onSubmit={handleAddLabel} className="tag-create-form-lux">
                <div className="tag-create-form-row">
                  {/* Left: Tag Name */}
                  <div className="tag-field-group name-field">
                    <label className="tag-field-label">Tag name</label>
                    <input
                      type="text"
                      className="tag-input-text-lux"
                      placeholder="e.g. High priority"
                      value={newLabelName}
                      onChange={e => setNewLabelName(e.target.value)}
                      required
                    />
                  </div>

                  {/* Middle-Left: Tag Color */}
                  <div className="tag-field-group color-field">
                    <label className="tag-field-label">Tag color</label>
                    <div className="tag-swatches-row">
                      {TAG_COLOR_PRESETS.map(c => (
                        <button
                          key={c}
                          type="button"
                          className={`tag-color-swatch-circle ${newLabelColor === c ? 'is-active' : ''}`}
                          style={{ backgroundColor: c }}
                          onClick={() => setNewLabelColor(c)}
                          title={`Select ${c}`}
                        >
                          {newLabelColor === c && <Check size={11} color="#ffffff" strokeWidth={3.5} />}
                        </button>
                      ))}
                      {/* Plus / Custom Color Picker */}
                      <button
                        type="button"
                        className={`tag-color-swatch-plus ${!TAG_COLOR_PRESETS.includes(newLabelColor) ? 'is-active' : ''}`}
                        style={!TAG_COLOR_PRESETS.includes(newLabelColor) ? { backgroundColor: newLabelColor, color: '#ffffff' } : {}}
                        onClick={() => customTagColorRef.current?.click()}
                        title="Pick custom color"
                      >
                        {!TAG_COLOR_PRESETS.includes(newLabelColor) ? (
                          <Check size={11} color="#ffffff" strokeWidth={3.5} />
                        ) : (
                          <Plus size={13} />
                        )}
                      </button>
                      <input
                        type="color"
                        ref={customTagColorRef}
                        value={newLabelColor}
                        onChange={e => setNewLabelColor(e.target.value)}
                        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
                      />
                    </div>
                  </div>

                  {/* Middle-Right: Stacked Checkboxes */}
                  <div className="tag-checkboxes-col">
                    <label className="tag-checkbox-lux-label">
                      <input
                        type="checkbox"
                        checked={newLabelHighPotential}
                        onChange={e => setNewLabelHighPotential(e.target.checked)}
                        className="tag-checkbox-input"
                      />
                      <span className="tag-checkbox-text">
                        Count as high potential
                        <span className="tag-help-tooltip" title="High potential tags are prioritized">
                          <HelpCircle size={13} />
                        </span>
                      </span>
                    </label>

                    <label className="tag-checkbox-lux-label">
                      <input
                        type="checkbox"
                        checked={newLabelAvailableToTeam}
                        onChange={e => setNewLabelAvailableToTeam(e.target.checked)}
                        className="tag-checkbox-input"
                      />
                      <span className="tag-checkbox-text">Available to team</span>
                    </label>
                  </div>

                  {/* Right: Submit Button */}
                  <div className="tag-action-col">
                    <button
                      type="submit"
                      className="btn-add-tag-lux"
                      disabled={addingLabel}
                    >
                      {addingLabel ? 'Adding...' : 'Add tag'}
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Bottom Card: Your Tags List */}
            <div className="tags-list-card">
              <div className="tags-list-header">
                <div className="tags-list-header-left">
                  <h3 className="tags-list-title">Your tags ({labels.length})</h3>
                  <p className="tags-list-subtitle">These tags are available for your team. Drag to reorder.</p>
                </div>
                <div className="tags-list-header-right">
                  <div className="tags-search-wrap">
                    <Search size={14} />
                    <input
                      type="text"
                      placeholder="Search tags..."
                      value={tagSearch}
                      onChange={e => setTagSearch(e.target.value)}
                    />
                  </div>
                  <select
                    className="tags-sort-select"
                    value={tagSort}
                    onChange={e => setTagSort(e.target.value as any)}
                  >
                    <option value="order">Sort by name</option>
                    <option value="name">Sort by order</option>
                  </select>
                  <button type="button" className="btn-tags-more-options" title="More options">
                    <MoreVertical size={16} />
                  </button>
                </div>
              </div>

              {/* Grid Table */}
              <div className="tags-table-lux-wrap">
                <div className="tags-grid-header-lux">
                  <span className="col-center">#</span>
                  <span className="col-left">Tag name</span>
                  <span className="col-left">Color</span>
                  <span className="col-center">High potential</span>
                  <span className="col-center">Available to team</span>
                  <span className="col-center">Leads</span>
                  <span className="col-center">Created by</span>
                  <span className="col-center">Actions</span>
                </div>

                <div className="tags-grid-body-lux">
                  {labels.length === 0 ? (
                    <div className="tags-empty-state">
                      <Tag size={28} />
                      <p>No tags created yet. Add your first tag above.</p>
                    </div>
                  ) : (
                    labels
                      .filter(l => {
                        if (!tagSearch.trim()) return true;
                        const q = tagSearch.toLowerCase();
                        return l.name.toLowerCase().includes(q) || (l.color && l.color.toLowerCase().includes(q));
                      })
                      .sort((a, b) => {
                        if (tagSort === 'name') return a.name.localeCompare(b.name);
                        return 0;
                      })
                      .map((label, idx) => {
                        const d = ld(label);
                        return (
                          <div
                            key={label._id}
                            className="tag-row-lux"
                            data-tag-id={label._id}
                          >
                            {/* Drag / Index */}
                            <div className="tag-drag-cell">
                              <span className="tag-drag-handle" title="Drag to reorder">
                                <GripVertical size={14} />
                              </span>
                              <span className="tag-row-index">{idx + 1}</span>
                            </div>

                            {/* Tag Name */}
                            <div className="tag-name-cell">
                              <span className="tag-row-dot" style={{ backgroundColor: d.color || '#2563eb' }} />
                              {editingTagId === label._id ? (
                                <input
                                  type="text"
                                  className="tag-inline-edit-input"
                                  value={editingTagName}
                                  autoFocus
                                  onChange={e => setEditingTagName(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      if (editingTagName.trim() && editingTagName.trim() !== d.name) {
                                        handleQuickLabelUpdate(label._id, { name: editingTagName.trim() });
                                      }
                                      setEditingTagId(null);
                                    } else if (e.key === 'Escape') {
                                      setEditingTagId(null);
                                    }
                                  }}
                                  onBlur={() => {
                                    if (editingTagName.trim() && editingTagName.trim() !== d.name) {
                                      handleQuickLabelUpdate(label._id, { name: editingTagName.trim() });
                                    }
                                    setEditingTagId(null);
                                  }}
                                />
                              ) : (
                                <span
                                  className="tag-name-text"
                                  style={{ cursor: 'pointer' }}
                                  title="Click to edit name"
                                  onClick={() => {
                                    setEditingTagId(label._id);
                                    setEditingTagName(d.name);
                                  }}
                                >
                                  {d.name}
                                </span>
                              )}
                            </div>

                            {/* Color */}
                            <div className="tag-color-cell">
                              <label className="tag-color-pill-inline" title="Change tag color">
                                <span className="tag-color-square" style={{ backgroundColor: d.color || '#2563eb' }} />
                                <span className="tag-color-hex-text">{d.color ? d.color.toUpperCase() : '#2563EB'}</span>
                                <input
                                  type="color"
                                  value={d.color || '#2563eb'}
                                  style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
                                  onChange={e => {
                                    handleQuickLabelUpdate(label._id, { color: e.target.value });
                                  }}
                                />
                              </label>
                            </div>

                            {/* High Potential Checkbox */}
                            <div className="tag-table-check-cell">
                              <input
                                type="checkbox"
                                checked={d.isHighPotential}
                                className="tag-table-checkbox"
                                onChange={e => handleQuickLabelUpdate(label._id, { isHighPotential: e.target.checked })}
                              />
                            </div>

                            {/* Available to Team Checkbox */}
                            <div className="tag-table-check-cell">
                              <input
                                type="checkbox"
                                checked={d.isActive}
                                className="tag-table-checkbox"
                                onChange={e => handleQuickLabelUpdate(label._id, { isActive: e.target.checked })}
                              />
                            </div>

                            {/* Leads count */}
                            <div className="tag-leads-cell">
                              <span className="tag-leads-text">0</span>
                            </div>

                            {/* Created by */}
                            <div className="tag-creator-cell">
                              <span className="tag-creator-text">Admin</span>
                            </div>

                            {/* Actions: Edit & Delete buttons */}
                            <div className="tag-actions-cell">
                              <button
                                type="button"
                                className={`btn-tag-action-pill edit ${editingTagId === label._id ? 'active' : ''}`}
                                title={editingTagId === label._id ? 'Save tag name' : 'Edit tag'}
                                onClick={() => {
                                  if (editingTagId === label._id) {
                                    if (editingTagName.trim() && editingTagName.trim() !== d.name) {
                                      handleQuickLabelUpdate(label._id, { name: editingTagName.trim() });
                                    }
                                    setEditingTagId(null);
                                  } else {
                                    setEditingTagId(label._id);
                                    setEditingTagName(d.name);
                                  }
                                }}
                              >
                                {editingTagId === label._id ? <Check size={13} /> : <Pencil size={13} />}
                              </button>
                              <button
                                type="button"
                                className="btn-tag-action-pill delete"
                                title="Delete tag"
                                onClick={() => handleDeleteLabel(label._id, label.name)}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============ FIELDS ============ */}
        <article className="settings-panel wide" data-settings-panel="fields" hidden={activeCategory !== 'fields'}>
          <div className="fields-builder-container">
            <div className="fields-builder-header">
              <div className="fields-builder-title">
                <h3>{terminology.leadSingular} form fields ({visibleFieldOrder.length})</h3>
                <p>Customize the data points captured for every {terminology.leadSingular.toLowerCase()} or client.</p>
              </div>
              <div className="fields-builder-actions">
                {visibleFieldOrder.length === 0 && (
                  <button
                    type="button"
                    className="btn-seed-fields"
                    onClick={handleSeedDefaultFields}
                    disabled={seedingFields}
                  >
                    <Sparkles size={15} />
                    {seedingFields ? 'Loading standard fields...' : 'Load Standard CRM Fields'}
                  </button>
                )}
                <button
                  type="button"
                  className="btn-add-field-main"
                  onClick={() => setShowAddFieldRow(!showAddFieldRow)}
                >
                  <Plus size={16} />
                  {showAddFieldRow ? 'Cancel' : 'Add custom field'}
                </button>
              </div>
            </div>

            <div className="fields-list-wrapper">
              {/* Inline Add Field Row */}
              {showAddFieldRow && (
                <form onSubmit={handleAddField} className="field-row-lux add-row">
                  <span className="drag-handle" style={{ opacity: 0.4 }}>+</span>
                  <div className="field-icon-badge" style={{ background: 'rgba(234, 88, 12, 0.15)', color: '#ea580c' }}>
                    <Plus size={18} strokeWidth={2.5} />
                  </div>
                  <div className="field-info-cell">
                    <input
                      className="field-name-input"
                      placeholder="Field Name (e.g. Budget Range)"
                      required
                      autoFocus
                      value={newFieldLabel}
                      onChange={e => setNewFieldLabel(e.target.value)}
                    />
                    <span className="field-subtitle">Enter field name to appear on lead forms</span>
                  </div>
                  <div className="field-col-stack">
                    <span className="field-col-label">Field type</span>
                    <select
                      className="field-select-lux"
                      value={newFieldType}
                      onChange={e => setNewFieldType(e.target.value as FieldType)}
                    >
                      {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="field-col-stack">
                    <span className="field-col-label">{newFieldType === 'select' ? 'Dropdown choices (comma-separated)' : 'Format / Placeholder'}</span>
                    <input
                      className="field-input-lux"
                      placeholder={newFieldType === 'select' ? 'Under 25k, 25k-50k, 50k+' : 'e.g. Placeholder text'}
                      value={newFieldOptions}
                      onChange={e => setNewFieldOptions(e.target.value)}
                    />
                  </div>
                  <div className="field-col-stack field-col-center">
                    <span className="field-col-label">Required</span>
                    <label className="stage-switch" title="Required">
                      <input
                        type="checkbox"
                        checked={newFieldRequired}
                        onChange={e => setNewFieldRequired(e.target.checked)}
                      />
                      <span className="stage-switch-slider" />
                    </label>
                  </div>
                  <div className="field-col-stack field-col-center">
                    <span className="field-col-label">Include on form</span>
                    <label className="stage-switch" title="Include on form">
                      <input type="checkbox" checked={true} disabled />
                      <span className="stage-switch-slider" />
                    </label>
                  </div>
                  <div className="field-actions-cell">
                    <button
                      type="submit"
                      className="btn-field-save-new"
                      disabled={addingField || !newFieldLabel.trim()}
                    >
                      {addingField ? 'Adding...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className="btn-field-action"
                      onClick={() => setShowAddFieldRow(false)}
                      title="Cancel"
                    >
                      ✕
                    </button>
                  </div>
                </form>
              )}

              {/* Field Rows */}
              {visibleFieldOrder.map(field => {
                const d = fd(field);
                const iconInfo = getFieldIconInfo(field);
                const IconComp = iconInfo.icon;
                return (
                  <div
                    key={field._id}
                    data-field-id={field._id}
                    className="field-row-lux"
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
                  >
                    {/* 1. Drag Handle */}
                    <span className="drag-handle" title="Drag to reorder">⋮⋮</span>

                    {/* 2. Custom Icon Badge */}
                    <div className="field-icon-badge" style={{ background: iconInfo.bg, color: iconInfo.color }}>
                      <IconComp size={16} strokeWidth={2.2} />
                    </div>

                    {/* 3. Field Info (Name & Subtitle) */}
                    <div className="field-info-cell">
                      <input
                        className="field-name-input"
                        value={d.label}
                        required
                        placeholder="Field Name"
                        onChange={e => setFieldDrafts(prev => ({ ...prev, [field._id]: { ...d, label: e.target.value } }))}
                        onBlur={() => handleUpdateField(field._id)}
                      />
                      <span className="field-subtitle">
                        {d.type === 'select' ? 'Choose from dropdown options' : d.type === 'date' ? 'Date selector' : d.type === 'number' ? 'Numeric value / counter' : 'Text input'}
                      </span>
                    </div>

                    {/* 4. Field Type Stack */}
                    <div className="field-col-stack">
                      <span className="field-col-label">Field type</span>
                      <select
                        className="field-select-lux"
                        value={d.type}
                        onChange={e => handleQuickFieldUpdate(field._id, { type: e.target.value })}
                      >
                        {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>

                    {/* 5. Options / Placeholder Stack */}
                    <div className="field-col-stack">
                      <span className="field-col-label">{d.type === 'select' ? 'Options' : 'Format / Placeholder'}</span>
                      <input
                        className="field-input-lux"
                        value={d.options}
                        placeholder={d.type === 'select' ? 'Option 1, Option 2, Option 3' : d.type === 'date' ? 'YYYY-MM-DD' : d.type === 'number' ? 'e.g. 123' : 'e.g. Placeholder text'}
                        onChange={e => setFieldDrafts(prev => ({ ...prev, [field._id]: { ...d, options: e.target.value } }))}
                        onBlur={() => handleUpdateField(field._id)}
                      />
                    </div>

                    {/* 6. Required Switch Stack */}
                    <div className="field-col-stack field-col-center">
                      <span className="field-col-label">Required</span>
                      <label className="stage-switch" title="Field is required">
                        <input
                          type="checkbox"
                          checked={d.required}
                          onChange={e => handleQuickFieldUpdate(field._id, { required: e.target.checked })}
                        />
                        <span className="stage-switch-slider" />
                      </label>
                    </div>

                    {/* 7. Include on form Switch Stack */}
                    <div className="field-col-stack field-col-center">
                      <span className="field-col-label">Include on form</span>
                      <label className="stage-switch" title="Include field on form">
                        <input
                          type="checkbox"
                          checked={d.isActive}
                          onChange={e => handleQuickFieldUpdate(field._id, { isActive: e.target.checked })}
                        />
                        <span className="stage-switch-slider" />
                      </label>
                    </div>

                    {/* 8. Actions Cell */}
                    <div className="field-actions-cell">
                      <button
                        type="button"
                        className="btn-field-action"
                        title="Save changes"
                        onClick={() => handleUpdateField(field._id)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn-field-action danger"
                        title="Delete Field"
                        onClick={() => handleDeleteField(field._id, field.label)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {visibleFieldOrder.length === 0 && !showAddFieldRow && (
                <div className="field-empty-hero">
                  <div className="field-empty-icon">
                    <FileEdit size={32} />
                  </div>
                  <h4>No custom fields configured yet</h4>
                  <p>Capture extra details like Expected Budget, Start Date, Project Type, and Lead Source on your {terminology.leadSingular.toLowerCase()} forms.</p>
                  <div className="field-empty-btn-group">
                    <button
                      type="button"
                      className="btn-seed-fields large"
                      onClick={handleSeedDefaultFields}
                      disabled={seedingFields}
                    >
                      <Sparkles size={16} />
                      {seedingFields ? 'Loading standard fields...' : 'Load Standard CRM Fields'}
                    </button>
                    <button
                      type="button"
                      className="btn-add-field-main"
                      onClick={() => setShowAddFieldRow(true)}
                    >
                      <Plus size={16} />
                      Create from scratch
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </article>

        {/* ============ WORKSPACE IDENTITY ============ */}
        {isAdmin && activeCategory === 'org' && (
          <div className="terminology-manager-container">
            <div className="terminology-edit-card">
              <div className="terminology-card-header">
                <div className="terminology-card-titles">
                  <h3 className="terminology-card-title">Workspace identity</h3>
                  <p className="terminology-card-subtitle">
                    The name and heading that appear across your brand — in the sidebar, browser tab, login screen, auth pages, analytics and report headers.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveOrganization} className="terminology-form">
                <div className="terminology-fields-grid">
                  <div className="term-field-group full-width">
                    <label className="term-field-label">
                      <Building2 size={15} />
                      <span>Workspace name</span>
                    </label>
                    <input
                      type="text"
                      className="term-input-text"
                      value={orgForm.name}
                      required
                      placeholder="e.g. Acme Agency"
                      onChange={e => setOrgForm({ ...orgForm, name: e.target.value })}
                    />
                    <span className="term-field-hint">Shown in the sidebar brand, browser tab and report headers.</span>
                  </div>

                  <div className="term-field-group full-width">
                    <label className="term-field-label">
                      <BarChart3 size={15} />
                      <span>Analytics heading</span>
                    </label>
                    <input
                      type="text"
                      className="term-input-text"
                      value={orgForm.analyticsHeading}
                      maxLength={60}
                      placeholder="e.g. Digital Insights"
                      onChange={e => setOrgForm({ ...orgForm, analyticsHeading: e.target.value })}
                    />
                    <span className="term-field-hint">Suffix shown next to your workspace name on the Analytics page (default: Digital Insights).</span>
                  </div>

                  <div className="term-field-group">
                    <label className="term-field-label">
                      <IndianRupee size={15} />
                      <span>Currency</span>
                    </label>
                    <input
                      type="text"
                      className="term-input-text"
                      value={orgForm.currency}
                      maxLength={8}
                      placeholder="e.g. INR"
                      onChange={e => setOrgForm({ ...orgForm, currency: e.target.value })}
                    />
                    <span className="term-field-hint">Default currency code for leads, deals and reports.</span>
                  </div>

                  <div className="term-field-group">
                    <label className="term-field-label">
                      <Globe size={15} />
                      <span>Locale</span>
                    </label>
                    <input
                      type="text"
                      className="term-input-text"
                      value={orgForm.locale}
                      maxLength={12}
                      placeholder="e.g. en-IN"
                      onChange={e => setOrgForm({ ...orgForm, locale: e.target.value })}
                    />
                    <span className="term-field-hint">Formatting locale used for numbers and dates (e.g. en-IN).</span>
                  </div>
                </div>

                <div className="terminology-form-actions">
                  <button type="submit" className="btn-save-term-names" disabled={savingOrg}>
                    <Check size={16} />
                    <span>{savingOrg ? 'Saving...' : 'Save workspace'}</span>
                  </button>
                </div>
              </form>
            </div>

            <div className="terminology-side-column">
              <div className="terminology-why-card">
                <div className="terminology-why-header">
                  <div className="terminology-why-bulb-badge">
                    <Sparkles size={16} />
                  </div>
                  <h4>What this controls</h4>
                </div>
                <ul className="terminology-why-list">
                  <li><span className="term-why-check"><Check size={12} strokeWidth={3} /></span><span>Your brand name, everywhere it is shown</span></li>
                  <li><span className="term-why-check"><Check size={12} strokeWidth={3} /></span><span>A tailor-made analytics heading</span></li>
                  <li><span className="term-why-check"><Check size={12} strokeWidth={3} /></span><span>Currency and locale for reporting</span></li>
                  <li><span className="term-why-check"><Check size={12} strokeWidth={3} /></span><span>Changes apply instantly to every user</span></li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ============ TERMINOLOGY / CRM NAMES ============ */}
        {isAdmin && activeCategory === 'terminology' && (
          <div className="terminology-manager-container">
            {/* Left Card: Edit CRM names */}
            <div className="terminology-edit-card">
              <div className="terminology-card-header">
                <div className="terminology-card-titles">
                  <h3 className="terminology-card-title">Edit CRM names</h3>
                  <p className="terminology-card-subtitle">
                    Change the terminology used across your workspace. These updates apply instantly and only to this company.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-terminology-reset"
                  onClick={handleResetTerminology}
                  title="Reset terminology to defaults"
                >
                  <RotateCcw size={13} />
                  <span>Reset to default</span>
                </button>
              </div>

              <form onSubmit={handleSaveTerminology} className="terminology-form">
                <div className="terminology-fields-grid">
                  {/* Pair 1: One lead & Many leads */}
                  <div className="term-field-group">
                    <label className="term-field-label">
                      <User size={15} />
                      <span>One lead</span>
                    </label>
                    <input
                      type="text"
                      className="term-input-text"
                      value={termForm.leadSingular}
                      required
                      placeholder="e.g. Lead"
                      onChange={e => setTermForm({ ...termForm, leadSingular: e.target.value })}
                    />
                    <span className="term-field-hint">Singular name for a lead (e.g. Lead, Prospect, Enquiry)</span>
                  </div>

                  <div className="term-field-group">
                    <label className="term-field-label">
                      <Users size={15} />
                      <span>Many leads</span>
                    </label>
                    <input
                      type="text"
                      className="term-input-text"
                      value={termForm.leadPlural}
                      required
                      placeholder="e.g. Leads"
                      onChange={e => setTermForm({ ...termForm, leadPlural: e.target.value })}
                    />
                    <span className="term-field-hint">Plural name for leads (e.g. Leads, Prospects, Enquiries)</span>
                  </div>

                  {/* Pair 2: One client & Many clients */}
                  <div className="term-field-group">
                    <label className="term-field-label">
                      <Building2 size={15} />
                      <span>One client</span>
                    </label>
                    <input
                      type="text"
                      className="term-input-text"
                      value={termForm.recordSingular}
                      required
                      placeholder="e.g. Client"
                      onChange={e => setTermForm({ ...termForm, recordSingular: e.target.value })}
                    />
                    <span className="term-field-hint">Singular name for a client (e.g. Client, Customer, Guest)</span>
                  </div>

                  <div className="term-field-group">
                    <label className="term-field-label">
                      <Building2 size={15} />
                      <span>Many clients</span>
                    </label>
                    <input
                      type="text"
                      className="term-input-text"
                      value={termForm.recordPlural}
                      required
                      placeholder="e.g. Clients"
                      onChange={e => setTermForm({ ...termForm, recordPlural: e.target.value })}
                    />
                    <span className="term-field-hint">Plural name for clients (e.g. Clients, Customers, Guests)</span>
                  </div>

                  {/* Pair 3: Pipeline name (Full width) */}
                  <div className="term-field-group full-width">
                    <label className="term-field-label">
                      <Workflow size={15} />
                      <span>Pipeline name</span>
                    </label>
                    <input
                      type="text"
                      className="term-input-text"
                      value={termForm.pipelineName}
                      required
                      placeholder="e.g. Sales pipeline"
                      onChange={e => setTermForm({ ...termForm, pipelineName: e.target.value })}
                    />
                    <span className="term-field-hint">Name for your pipeline (e.g. Sales pipeline, Admission pipeline)</span>
                  </div>
                </div>

                <div className="terminology-form-actions">
                  <button
                    type="button"
                    className="btn-term-preview-action"
                    onClick={() => {
                      document.getElementById('terminology-live-preview')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    <Eye size={15} />
                    <span>Preview changes</span>
                  </button>

                  <button
                    type="submit"
                    className="btn-save-term-names"
                    disabled={savingTerms}
                  >
                    <Check size={16} />
                    <span>{savingTerms ? 'Saving...' : 'Save names'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column: Stacked Cards */}
            <div className="terminology-side-column" id="terminology-live-preview">
              {/* Card 1: Why customize these names? */}
              <div className="terminology-why-card">
                <div className="terminology-why-header">
                  <div className="terminology-why-bulb-badge">
                    <Lightbulb size={16} />
                  </div>
                  <h4>Why customize these names?</h4>
                </div>
                <ul className="terminology-why-list">
                  <li>
                    <span className="term-why-check"><Check size={12} strokeWidth={3} /></span>
                    <span>Use language that fits your business</span>
                  </li>
                  <li>
                    <span className="term-why-check"><Check size={12} strokeWidth={3} /></span>
                    <span>Make it easier for your team</span>
                  </li>
                  <li>
                    <span className="term-why-check"><Check size={12} strokeWidth={3} /></span>
                    <span>Keep your CRM consistent everywhere</span>
                  </li>
                  <li>
                    <span className="term-why-check"><Check size={12} strokeWidth={3} /></span>
                    <span>Changes apply instantly (no data is modified)</span>
                  </li>
                </ul>
              </div>

              {/* Card 2: Preview Card */}
              <div className="terminology-preview-card">
                <div className="terminology-preview-header">
                  <h4>Preview</h4>
                  <p>Here's how your terms will look across the workspace.</p>
                </div>

                <div className="terminology-preview-pills-grid">
                  <div className="term-preview-pill">
                    <User size={15} />
                    <span>{termForm.leadSingular || 'Lead'}</span>
                  </div>
                  <div className="term-preview-pill">
                    <Users size={15} />
                    <span>{termForm.leadPlural || 'Leads'}</span>
                  </div>
                  <div className="term-preview-pill">
                    <Building2 size={15} />
                    <span>{termForm.recordSingular || 'Client'}</span>
                  </div>
                  <div className="term-preview-pill">
                    <Building2 size={15} />
                    <span>{termForm.recordPlural || 'Clients'}</span>
                  </div>
                  <div className="term-preview-pill full-width">
                    <Workflow size={15} />
                    <span>{termForm.pipelineName || 'Sales pipeline'}</span>
                  </div>
                </div>

                <div className="terminology-preview-success-banner">
                  <CheckCircle2 size={16} className="term-success-icon" />
                  <span>These names will be used across menus, tables, forms and reports.</span>
                </div>
              </div>
            </div>
          </div>
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

function ThemeCardLux({ preset, active, onClick }: {
  preset: typeof THEME_PRESETS[number];
  active: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <div className={`theme-card-lux ${active ? 'active' : ''}`} onClick={onClick}>
      {active && (
        <div className="theme-card-badge">
          <Check size={11} strokeWidth={3.5} />
        </div>
      )}

      {/* Miniature CRM Window Frame */}
      <div
        className="theme-mockup-window"
        style={{
          background: preset.bg,
          borderColor: preset.type === 'dark' ? '#202a30' : '#e2e8f0',
        }}
      >
        {/* Mock Sidebar */}
        <div
          className="theme-mock-sidebar"
          style={{
            background: preset.surface,
            borderColor: preset.type === 'dark' ? '#202a30' : '#e2e8f0',
          }}
        >
          <div className="theme-mock-logo" style={{ background: preset.gold, color: '#000' }}>
            MD
          </div>
          <div className="theme-mock-nav-item" style={{ background: preset.gold }} />
          <div className="theme-mock-nav-item" style={{ background: preset.text, opacity: 0.2 }} />
          <div className="theme-mock-nav-item" style={{ background: preset.text, opacity: 0.2 }} />
          <div className="theme-mock-nav-item" style={{ background: preset.text, opacity: 0.2 }} />
        </div>

        {/* Mock Content */}
        <div className="theme-mock-content">
          <div
            className="theme-mock-topbar"
            style={{
              background: preset.surface,
              borderColor: preset.type === 'dark' ? '#202a30' : '#e2e8f0',
            }}
          >
            <div className="theme-mock-search" style={{ background: preset.text, opacity: 0.15 }} />
            <div className="theme-mock-top-icons">
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: preset.gold }} />
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: preset.text, opacity: 0.3 }} />
            </div>
          </div>
          <div className="theme-mock-body" style={{ background: preset.bg }}>
            <div
              className="theme-mock-card"
              style={{
                background: preset.surface,
                borderColor: preset.type === 'dark' ? '#202a30' : '#e2e8f0',
              }}
            >
              <div style={{ width: 14, height: 2.5, borderRadius: 1, background: preset.text, opacity: 0.3 }} />
              <div style={{ width: 22, height: 4, borderRadius: 1.5, background: preset.gold }} />
            </div>
            <div
              className="theme-mock-card"
              style={{
                background: preset.surface,
                borderColor: preset.type === 'dark' ? '#202a30' : '#e2e8f0',
              }}
            >
              <div style={{ width: 14, height: 2.5, borderRadius: 1, background: preset.text, opacity: 0.3 }} />
              <div style={{ width: 18, height: 4, borderRadius: 1.5, background: preset.teal }} />
            </div>
          </div>
        </div>
      </div>

      <div className="theme-card-meta">
        <span className="theme-card-title">{preset.name}</span>
        <span className="theme-card-sub">{preset.description}</span>
      </div>
    </div>
  );
}
