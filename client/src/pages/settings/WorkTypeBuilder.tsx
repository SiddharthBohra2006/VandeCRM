import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { settingsApi } from '../../api/settings';
import { WorkType } from '../../api/work';
import ConfirmDialog from '../../components/ConfirmDialog';
import {
  ChevronRight,
  ChevronDown,
  Check,
  Plus,
  Trash2,
  Settings,
  MoreHorizontal,
  GripVertical,
  Eye,
  Columns3,
  List as ListIcon,
  Calendar as CalendarIcon,
  Maximize2,
  Minimize2,
  X,
  Layers,
  Sparkles,
  SlidersHorizontal,
  SquareCheckBig,
  ClipboardList,
  Palette,
  Globe,
  Users,
  Building2,
  Megaphone,
  Target,
  FileText,
  Mail,
  Video,
  Phone,
  Briefcase,
  Tag,
  Flag,
  Clock,
  Shield,
} from 'lucide-react';

export interface StatusDraft {
  key: string;
  label: string;
  color: string;
  isTerminalWon?: boolean;
  isTerminalLost?: boolean;
}

export interface FieldDraft {
  key: string;
  label: string;
  type: string;
  options: string[];
  required: boolean;
  placeholder?: string;
  group?: string;
  min?: number | null;
  max?: number | null;
}

interface Props {
  workType: WorkType | null;
  onClose: () => void;
  onChanged: () => void;
}

const FIELD_TYPES = [
  'text', 'textarea', 'number', 'currency', 'percentage', 'date',
  'datetime', 'email', 'phone', 'select', 'checkbox', 'url',
  'user-picker', 'company-picker', 'customer-picker'
];

const ICON_MAP: Record<string, React.ElementType> = {
  'square-check-big': SquareCheckBig,
  'clipboard-list': ClipboardList,
  'layers': Layers,
  'palette': Palette,
  'globe': Globe,
  'users': Users,
  'building-2': Building2,
  'megaphone': Megaphone,
  'calendar': CalendarIcon,
  'target': Target,
  'file-text': FileText,
  'sparkles': Sparkles,
  'mail': Mail,
  'video': Video,
  'phone': Phone,
  'briefcase': Briefcase,
  'tag': Tag,
  'flag': Flag,
  'clock': Clock,
  'shield': Shield,
};

const ICON_OPTIONS = Object.keys(ICON_MAP);

const VIEWS = ['board', 'list', 'calendar'];
const CORE_FIELDS = ['title', 'assignedTo', 'collaborators', 'secondaryAssignee', 'relatedRecords', 'status', 'priority', 'deadline', 'startDate', 'deliveredAt', 'notes'];

function slugify(value: string) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const defaultStatuses: StatusDraft[] = [
  { key: 'pending', label: 'Pending', color: '#3b82f6' },
  { key: 'started', label: 'Started', color: '#10b981' },
  { key: 'in_progress', label: 'In Progress', color: '#f59e0b' },
  { key: 'review', label: 'Review', color: '#8b5cf6' },
  { key: 'completed', label: 'Completed', color: '#ef4444', isTerminalWon: true },
];

interface SampleCard {
  id: string;
  title: string;
  avatar: string;
  avatarBg: string;
  priority: 'High' | 'Medium' | 'Low';
  date: string;
}

function getSampleDataForModule(modName: string): Record<number, SampleCard[]> {
  const lower = (modName || '').toLowerCase();
  if (lower.includes('meet') || lower.includes('call') || lower.includes('calendar')) {
    return {
      0: [
        { id: '1', title: 'Q3 Strategy & Review Call', avatar: 'AK', avatarBg: 'linear-gradient(135deg, #0d9488, #14b8a6)', priority: 'High', date: '12 Sep' },
        { id: '2', title: 'Product Demo with Acme Corp', avatar: 'RK', avatarBg: 'linear-gradient(135deg, #e11d48, #f43f5e)', priority: 'Medium', date: '14 Sep' },
      ],
      1: [
        { id: '3', title: 'Client Onboarding Kickoff', avatar: 'VD', avatarBg: 'linear-gradient(135deg, #7c3aed, #a855f7)', priority: 'High', date: '16 Sep' },
      ],
      2: [
        { id: '4', title: 'Weekly Sprint Sync', avatar: 'AK', avatarBg: 'linear-gradient(135deg, #0d9488, #14b8a6)', priority: 'Medium', date: '18 Sep' },
        { id: '5', title: 'Monthly Executive Briefing', avatar: 'RK', avatarBg: 'linear-gradient(135deg, #e11d48, #f43f5e)', priority: 'Low', date: '20 Sep' },
      ],
      3: [
        { id: '6', title: 'Post-Meeting Debrief & Notes', avatar: 'AK', avatarBg: 'linear-gradient(135deg, #0d9488, #14b8a6)', priority: 'High', date: '24 Sep' },
      ],
    };
  }

  return {
    0: [
      { id: '1', title: 'Design launch thumbnail', avatar: 'AK', avatarBg: 'linear-gradient(135deg, #0d9488, #14b8a6)', priority: 'High', date: '12 Sep' },
      { id: '2', title: 'Setup database', avatar: 'RK', avatarBg: 'linear-gradient(135deg, #e11d48, #f43f5e)', priority: 'Medium', date: '14 Sep' },
    ],
    1: [
      { id: '3', title: 'Edit product video', avatar: 'VD', avatarBg: 'linear-gradient(135deg, #7c3aed, #a855f7)', priority: 'High', date: '16 Sep' },
    ],
    2: [
      { id: '4', title: 'Write blog content', avatar: 'AK', avatarBg: 'linear-gradient(135deg, #0d9488, #14b8a6)', priority: 'Medium', date: '18 Sep' },
      { id: '5', title: 'Update landing page', avatar: 'RK', avatarBg: 'linear-gradient(135deg, #e11d48, #f43f5e)', priority: 'Low', date: '20 Sep' },
      { id: '6', title: 'Social media plan', avatar: 'VD', avatarBg: 'linear-gradient(135deg, #7c3aed, #a855f7)', priority: 'Medium', date: '22 Sep' },
    ],
    3: [
      { id: '7', title: 'QA testing', avatar: 'AK', avatarBg: 'linear-gradient(135deg, #0d9488, #14b8a6)', priority: 'High', date: '24 Sep' },
    ],
  };
}

export default function WorkTypeBuilder({ workType, onClose, onChanged }: Props) {
  const isNew = !workType;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [previewView, setPreviewView] = useState<'board' | 'list' | 'calendar'>('board');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Module Details
  const [name, setName] = useState(workType?.name || (isNew ? 'New module' : 'Tasks'));
  const [icon, setIcon] = useState(workType?.icon || 'square-check-big');
  const [color, setColor] = useState(workType?.color || '#ea580c');
  const [order, setOrder] = useState<number>(workType?.order || 0);
  const [key, setKey] = useState(workType?.key || (isNew ? '' : 'tasks'));
  const [isActive, setIsActive] = useState(workType?.isActive !== false);

  // Statuses
  const [statuses, setStatuses] = useState<StatusDraft[]>(
    workType?.statuses?.length
      ? workType.statuses.map(s => ({
          key: s.key,
          label: s.label,
          color: s.color || '#64748b',
          isTerminalWon: s.isTerminalWon,
          isTerminalLost: s.isTerminalLost,
        }))
      : defaultStatuses
  );

  // Fields
  const [fields, setFields] = useState<FieldDraft[]>(
    workType?.fields?.length
      ? workType.fields.map(f => ({
          key: f.key,
          label: f.label,
          type: f.type,
          options: f.options || [],
          required: !!f.required,
          placeholder: f.placeholder,
          group: f.group,
          min: (f as any).min,
          max: (f as any).max,
        }))
      : []
  );

  const p = workType?.presentation || {};
  const [enabledViews, setEnabledViews] = useState<string[]>(p.enabledViews?.length ? p.enabledViews : ['board', 'list', 'calendar']);
  const [defaultView, setDefaultView] = useState(p.defaultView || 'board');
  const [calendarField, setCalendarField] = useState(p.calendarField || 'deadline');
  const [listColumns, setListColumns] = useState<string[]>(p.listColumns?.length ? p.listColumns : ['title', 'assignedTo', 'status', 'deadline']);
  const [boardFields, setBoardFields] = useState<string[]>(p.boardFields?.length ? p.boardFields : ['assignedTo', 'priority', 'deadline']);
  const [filterFields, setFilterFields] = useState<string[]>(p.filterFields?.length ? p.filterFields : ['status', 'assignedTo', 'priority']);

  // Modals & Popups
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isFullscreenPreview, setIsFullscreenPreview] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  // Sync state when workType prop changes
  useEffect(() => {
    if (workType) {
      setName(workType.name || '');
      setIcon(workType.icon || 'square-check-big');
      setColor(workType.color || '#ea580c');
      setOrder(workType.order || 0);
      setKey(workType.key || '');
      setIsActive(workType.isActive !== false);
      if (workType.statuses?.length) {
        setStatuses(workType.statuses.map(s => ({
          key: s.key,
          label: s.label,
          color: s.color || '#64748b',
          isTerminalWon: s.isTerminalWon,
          isTerminalLost: s.isTerminalLost,
        })));
      }
      if (workType.fields?.length) {
        setFields(workType.fields.map(f => ({
          key: f.key,
          label: f.label,
          type: f.type,
          options: f.options || [],
          required: !!f.required,
          placeholder: f.placeholder,
          group: f.group,
        })));
      }
    }
  }, [workType]);

  const customFieldKeys = fields.map(f => `custom:${f.key}`);
  const allSelectable = [...CORE_FIELDS, ...customFieldKeys];
  const dateFields = ['deadline', 'startDate', 'deliveredAt', ...fields.filter(f => ['date', 'datetime'].includes(f.type)).map(f => `custom:${f.key}`)];

  const fieldLabel = (keyName: string) => {
    const known: Record<string, string> = {
      title: 'Title',
      assignedTo: 'Owner',
      collaborators: 'Collaborators',
      secondaryAssignee: 'Secondary assignee',
      relatedRecords: 'Related records',
      status: 'Status',
      priority: 'Priority',
      deadline: 'Deadline',
      startDate: 'Start date',
      deliveredAt: 'Delivered at',
      notes: 'Notes',
    };
    if (known[keyName]) return known[keyName];
    if (keyName.startsWith('custom:')) {
      const f = fields.find(x => `custom:${x.key}` === keyName);
      return f ? f.label : keyName.replace('custom:', '');
    }
    return keyName;
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a module name.');
      setShowSettingsModal(true);
      return;
    }
    setSaving(true);
    setError('');

    const payload = {
      name: name.trim(),
      key: key.trim() || slugify(name),
      icon,
      color,
      order,
      isActive: isActive ? 'on' : false,
      statuses: JSON.stringify(
        statuses.map(s => ({
          key: s.key || slugify(s.label),
          label: s.label,
          color: s.color,
          isTerminalWon: !!s.isTerminalWon,
          isTerminalLost: !!s.isTerminalLost,
        }))
      ),
      fields: JSON.stringify(
        fields.map(f => ({
          key: f.key || slugify(f.label),
          label: f.label,
          type: f.type,
          options: f.type === 'select' && !f.options.length ? ['Option 1'] : f.options,
          required: f.required,
          placeholder: f.placeholder,
        }))
      ),
      presentation: JSON.stringify({
        enabledViews,
        defaultView,
        calendarField,
        listColumns,
        boardFields,
        filterFields,
      }),
    };

    try {
      if (isNew) {
        await settingsApi.createWorkType(payload);
      } else if (workType) {
        await settingsApi.updateWorkType(workType._id, payload);
      }
      onChanged();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not save module');
    } finally {
      setSaving(false);
    }
  };

  const executeDelete = async () => {
    if (!workType) return;
    setSaving(true);
    setError('');
    try {
      await settingsApi.deleteWorkType(workType._id);
      onChanged();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not delete module');
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
    }
  };

  const addStatus = () => {
    const defaultColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
    const chosenColor = defaultColors[statuses.length % defaultColors.length];
    setStatuses([...statuses, { key: `stage_${statuses.length + 1}`, label: `Stage ${statuses.length + 1}`, color: chosenColor }]);
  };

  const addField = () => {
    setFields([...fields, { key: '', label: '', type: 'text', options: ['Option 1'], required: false }]);
  };

  const ModuleIconComponent = ICON_MAP[icon] || SquareCheckBig;
  const sampleMap = getSampleDataForModule(name);
  const allSampleCards = statuses.flatMap((_, idx) => sampleMap[idx] || []);

  return createPortal(
    <div className="module-builder-viewport-overlay">
      <div className="module-builder-inner-wrap">
        {/* Top Breadcrumb Navigation */}
        <div className="customization-breadcrumbs" style={{ marginBottom: '1.25rem' }}>
          <button type="button" className="bc-link-btn" onClick={onClose}>
            Settings
          </button>
          <ChevronRight size={13} className="bc-sep" />
          <button type="button" className="bc-link-btn" onClick={onClose}>
            Custom modules
          </button>
          <ChevronRight size={13} className="bc-sep" />
          <span className="bc-current">{name || 'Tasks'}</span>
        </div>

        {/* Header Bar */}
        <div className="mod-customizer-head">
          <div className="mod-customizer-identity">
            <div
              className="mod-customizer-icon-badge"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--gold) 12%, var(--panel, #ffffff))',
                borderColor: 'color-mix(in srgb, var(--gold) 35%, transparent)',
                color: 'var(--gold)',
              }}
            >
              <ModuleIconComponent size={24} />
            </div>
            <div className="mod-customizer-title-text">
              <span className="mod-customizer-cat-tag">Customize module</span>
              <h1>{name || 'Tasks'}</h1>
              <p>Configure the board stages, fields and views for your team.</p>
            </div>
          </div>

          <div className="mod-customizer-actions">
            {/* 3 dots menu */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn-mod-action-icon"
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                title="More options"
              >
                <MoreHorizontal size={17} />
              </button>
              {showMoreMenu && (
                <>
                  <div className="auto-dropdown-backdrop" onClick={() => setShowMoreMenu(false)} />
                  <div className="mod-action-dropdown-menu">
                    <button
                      type="button"
                      className="mod-dropdown-item"
                      onClick={() => {
                        setShowMoreMenu(false);
                        setStatuses(defaultStatuses);
                      }}
                    >
                      <Sparkles size={14} />
                      <span>Reset to default stages</span>
                    </button>
                    {!isNew && (
                      <button
                        type="button"
                        className="mod-dropdown-item danger"
                        onClick={() => {
                          setShowMoreMenu(false);
                          setShowDeleteConfirm(true);
                        }}
                      >
                        <Trash2 size={14} />
                        <span>Delete module</span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Module settings button */}
            <button
              type="button"
              className="btn-mod-action-outline"
              onClick={() => setShowSettingsModal(true)}
            >
              <Settings size={15} />
              <span>Module settings</span>
            </button>

            {/* Save changes button */}
            <button
              type="button"
              className="btn-mod-save-primary"
              disabled={saving}
              onClick={() => handleSave()}
            >
              <Check size={16} strokeWidth={2.5} />
              <span>{saving ? 'Saving...' : 'Save changes'}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="notice danger" style={{ marginTop: '1rem', borderRadius: '10px' }}>
            {error}
          </div>
        )}

        {/* 3-Step Wizard Chevron Nav */}
        <div className="mod-stepper-bar">
          {/* Step 1 */}
          <button
            type="button"
            className={`mod-step-tab ${step === 1 ? 'active' : ''}`}
            onClick={() => setStep(1)}
          >
            <span className="mod-step-num">1</span>
            <div className="mod-step-labels">
              <span className="mod-step-title">Board stages</span>
              <span className="mod-step-sub">Set up your columns</span>
            </div>
            <div className="mod-step-arrow-point" />
          </button>

          {/* Step 2 */}
          <button
            type="button"
            className={`mod-step-tab ${step === 2 ? 'active' : ''}`}
            onClick={() => setStep(2)}
          >
            <span className="mod-step-num">2</span>
            <div className="mod-step-labels">
              <span className="mod-step-title">Form fields</span>
              <span className="mod-step-sub">Add and manage fields</span>
            </div>
            <div className="mod-step-arrow-point" />
          </button>

          {/* Step 3 */}
          <button
            type="button"
            className={`mod-step-tab ${step === 3 ? 'active' : ''}`}
            onClick={() => setStep(3)}
          >
            <span className="mod-step-num">3</span>
            <div className="mod-step-labels">
              <span className="mod-step-title">Overview & views</span>
              <span className="mod-step-sub">See it in action</span>
            </div>
          </button>
        </div>

        {/* Two-Column Workspace */}
        <div className="mod-builder-grid">
          {/* LEFT COLUMN: Controls per step */}
          <div className="mod-builder-left-col">
            {/* STEP 1: Board stages */}
            {step === 1 && (
              <div className="customization-card">
                <div className="customization-card-header">
                  <div className="customization-header-left">
                    <div className="header-icon-box stage-box">
                      <SlidersHorizontal size={18} />
                    </div>
                    <div className="header-text-group">
                      <h3>Board stages</h3>
                      <p>These stages will appear as columns in your board.</p>
                    </div>
                  </div>
                  <button type="button" className="btn-add-item" onClick={addStatus}>
                    <Plus size={15} />
                    <span>Add stage</span>
                  </button>
                </div>

                {/* Stage Rows with HTML5 Drag & Drop */}
                <div className="mod-stage-rows-list">
                  {statuses.map((st, idx) => {
                    const sampleCards = sampleMap[idx] || [];
                    return (
                      <div
                        key={idx}
                        className={`mod-stage-row-item ${dragIndex === idx ? 'dragging' : ''}`}
                        draggable
                        onDragStart={() => setDragIndex(idx)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => {
                          if (dragIndex === null || dragIndex === idx) return;
                          const next = [...statuses];
                          const [dragged] = next.splice(dragIndex, 1);
                          next.splice(idx, 0, dragged);
                          setStatuses(next);
                          setDragIndex(null);
                        }}
                      >
                        <span className="mod-stage-drag-handle" title="Drag to reorder">
                          <GripVertical size={16} />
                        </span>

                        {/* Clickable Color Dot with Hidden Color Input */}
                        <label className="mod-stage-color-dot-wrap" title="Change stage color">
                          <span
                            className="mod-stage-color-dot"
                            style={{ backgroundColor: st.color || '#64748b' }}
                          />
                          <input
                            type="color"
                            value={st.color}
                            className="mod-hidden-color-input"
                            onChange={e => {
                              const next = [...statuses];
                              next[idx] = { ...next[idx], color: e.target.value };
                              setStatuses(next);
                            }}
                          />
                        </label>

                        {/* Label Input */}
                        <div className="mod-stage-name-wrap">
                          <input
                            type="text"
                            value={st.label}
                            className="mod-stage-name-input"
                            placeholder="Stage name"
                            onChange={e => {
                              const next = [...statuses];
                              next[idx] = {
                                ...next[idx],
                                label: e.target.value,
                                key: next[idx].key || slugify(e.target.value),
                              };
                              setStatuses(next);
                            }}
                          />
                        </div>

                        {/* Slug / Key Box */}
                        <div className="mod-stage-key-wrap">
                          <input
                            type="text"
                            value={st.key}
                            className="mod-stage-key-input"
                            placeholder="key"
                            onChange={e => {
                              const next = [...statuses];
                              next[idx] = { ...next[idx], key: slugify(e.target.value) };
                              setStatuses(next);
                            }}
                          />
                        </div>

                        {/* Count Badge */}
                        <span className="mod-stage-count-badge">{sampleCards.length}</span>

                        {/* Row Actions */}
                        <div className="mod-stage-action-btns">
                          <button
                            type="button"
                            className="btn-mod-row-icon danger"
                            title="Delete stage"
                            onClick={() => {
                              if (statuses.length <= 1) {
                                setError('A module must have at least one stage.');
                                return;
                              }
                              setStatuses(statuses.filter((_, i) => i !== idx));
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Advanced options accordion */}
                <div className="mod-advanced-accordion">
                  <button
                    type="button"
                    className="mod-advanced-accordion-toggle"
                    onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                  >
                    <ChevronDown
                      size={15}
                      style={{
                        transform: showAdvancedOptions ? 'rotate(0deg)' : 'rotate(-90deg)',
                        transition: 'transform 0.2s ease',
                      }}
                    />
                    <span>Advanced options</span>
                  </button>

                  {showAdvancedOptions && (
                    <div className="mod-advanced-accordion-content">
                      <p className="mod-accordion-hint">
                        Configure pipeline outcome flags for automated reporting.
                      </p>
                      <div className="mod-advanced-stage-flags-list">
                        {statuses.map((st, idx) => (
                          <div key={idx} className="mod-advanced-stage-flag-row">
                            <span className="flag-stage-title" style={{ color: st.color }}>
                              ● {st.label || 'Untitled'}
                            </span>
                            <div className="flag-checks-group">
                              <label className="mod-checkbox-label">
                                <input
                                  type="checkbox"
                                  checked={!!st.isTerminalWon}
                                  onChange={e => {
                                    const next = [...statuses];
                                    next[idx] = {
                                      ...next[idx],
                                      isTerminalWon: e.target.checked,
                                      isTerminalLost: e.target.checked ? false : next[idx].isTerminalLost,
                                    };
                                    setStatuses(next);
                                  }}
                                />
                                <span>Completed / Won</span>
                              </label>
                              <label className="mod-checkbox-label">
                                <input
                                  type="checkbox"
                                  checked={!!st.isTerminalLost}
                                  onChange={e => {
                                    const next = [...statuses];
                                    next[idx] = {
                                      ...next[idx],
                                      isTerminalLost: e.target.checked,
                                      isTerminalWon: e.target.checked ? false : next[idx].isTerminalWon,
                                    };
                                    setStatuses(next);
                                  }}
                                />
                                <span>Cancelled / Lost</span>
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 2: Form fields */}
            {step === 2 && (
              <div className="customization-card">
                <div className="customization-card-header">
                  <div className="customization-header-left">
                    <div className="header-icon-box stage-box">
                      <Layers size={18} />
                    </div>
                    <div className="header-text-group">
                      <h3>Form fields</h3>
                      <p>Add and manage custom fields captured for each record.</p>
                    </div>
                  </div>
                  <button type="button" className="btn-add-item" onClick={addField}>
                    <Plus size={15} />
                    <span>Add field</span>
                  </button>
                </div>

                <div className="mod-stage-rows-list">
                  {fields.map((f, idx) => (
                    <div key={idx} className="mod-field-card-item">
                      <div className="mod-field-top-row">
                        <div className="mod-field-input-group">
                          <label>Field Label</label>
                          <input
                            type="text"
                            value={f.label}
                            placeholder="e.g. Budget Range"
                            className="mod-field-input"
                            onChange={e => {
                              const next = [...fields];
                              next[idx] = {
                                ...next[idx],
                                label: e.target.value,
                                key: next[idx].key || slugify(e.target.value),
                              };
                              setFields(next);
                            }}
                          />
                        </div>

                        <div className="mod-field-input-group">
                          <label>Field Type</label>
                          <select
                            value={f.type}
                            className="mod-field-select"
                            onChange={e => {
                              const next = [...fields];
                              const newType = e.target.value;
                              next[idx] = {
                                ...next[idx],
                                type: newType,
                                options: newType === 'select' && !next[idx].options.length ? ['Option 1'] : next[idx].options,
                              };
                              setFields(next);
                            }}
                          >
                            {FIELD_TYPES.map(t => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          type="button"
                          className="btn-mod-row-icon danger"
                          style={{ alignSelf: 'flex-end', height: '36px' }}
                          title="Delete field"
                          onClick={() => setFields(fields.filter((_, i) => i !== idx))}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {f.type === 'select' && (
                        <div className="mod-field-options-row">
                          <label>Options (comma-separated)</label>
                          <input
                            type="text"
                            value={f.options.join(', ')}
                            placeholder="Under 25k, 25k-50k, 50k-1L, 1L+"
                            className="mod-field-input"
                            onChange={e => {
                              const next = [...fields];
                              next[idx] = {
                                ...next[idx],
                                options: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                              };
                              setFields(next);
                            }}
                          />
                        </div>
                      )}

                      <div className="mod-field-bottom-meta">
                        <label className="mod-checkbox-label">
                          <input
                            type="checkbox"
                            checked={f.required}
                            onChange={e => {
                              const next = [...fields];
                              next[idx] = { ...next[idx], required: e.target.checked };
                              setFields(next);
                            }}
                          />
                          <span>Required field</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Placeholder text"
                          value={f.placeholder || ''}
                          className="mod-field-input small"
                          style={{ maxWidth: '200px' }}
                          onChange={e => {
                            const next = [...fields];
                            next[idx] = { ...next[idx], placeholder: e.target.value };
                            setFields(next);
                          }}
                        />
                      </div>
                    </div>
                  ))}

                  {fields.length === 0 && (
                    <div className="mod-empty-hint-card">
                      <p>No custom fields yet. Click <b>+ Add field</b> to capture custom data.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 3: Overview & views */}
            {step === 3 && (
              <div className="customization-card">
                <div className="customization-card-header">
                  <div className="customization-header-left">
                    <div className="header-icon-box stage-box">
                      <Columns3 size={18} />
                    </div>
                    <div className="header-text-group">
                      <h3>Overview & views</h3>
                      <p>Configure default views, columns, and visible fields.</p>
                    </div>
                  </div>
                </div>

                <div className="mod-view-settings-stack">
                  {/* Enabled Views */}
                  <div className="mod-settings-subcard">
                    <h4>1. Enabled Views</h4>
                    <p>Select the views available to your team:</p>
                    <div className="mod-checkbox-pill-grid">
                      {VIEWS.map(v => (
                        <label
                          key={v}
                          className={`mod-pill-checkbox ${enabledViews.includes(v) ? 'active' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={enabledViews.includes(v)}
                            onChange={e => {
                              const on = e.target.checked;
                              let next = on
                                ? [...new Set([...enabledViews, v])]
                                : enabledViews.filter(item => item !== v);
                              if (next.length === 0) next = [v];
                              setEnabledViews(next);
                              if (!next.includes(defaultView)) setDefaultView(next[0]);
                            }}
                          />
                          <span style={{ textTransform: 'capitalize' }}>{v}</span>
                        </label>
                      ))}
                    </div>

                    <div style={{ marginTop: '1rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                      <div className="mod-field-input-group" style={{ flex: 1, minWidth: '180px' }}>
                        <label>Default View</label>
                        <select
                          value={defaultView}
                          className="mod-field-select"
                          onChange={e => setDefaultView(e.target.value)}
                        >
                          {enabledViews.map(v => (
                            <option key={v} value={v}>
                              {v.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="mod-field-input-group" style={{ flex: 1, minWidth: '180px' }}>
                        <label>Calendar Date Field</label>
                        <select
                          value={calendarField}
                          className="mod-field-select"
                          onChange={e => setCalendarField(e.target.value)}
                        >
                          {dateFields.map(df => (
                            <option key={df} value={df}>
                              {fieldLabel(df)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* List View Columns */}
                  <div className="mod-settings-subcard">
                    <h4>2. List View Columns</h4>
                    <p>Choose columns visible in table view:</p>
                    <div className="mod-checkbox-pill-grid">
                      {allSelectable.map(keyName => (
                        <label
                          key={keyName}
                          className={`mod-pill-checkbox ${listColumns.includes(keyName) ? 'active' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={listColumns.includes(keyName)}
                            onChange={e =>
                              setListColumns(
                                e.target.checked
                                  ? [...listColumns, keyName]
                                  : listColumns.filter(x => x !== keyName)
                              )
                            }
                          />
                          <span>{fieldLabel(keyName)}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Board Card Badges */}
                  <div className="mod-settings-subcard">
                    <h4>3. Board Card Details</h4>
                    <p>Details displayed on Kanban cards:</p>
                    <div className="mod-checkbox-pill-grid">
                      {allSelectable
                        .filter(name => name !== 'status')
                        .map(keyName => (
                          <label
                            key={keyName}
                            className={`mod-pill-checkbox ${boardFields.includes(keyName) ? 'active' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={boardFields.includes(keyName)}
                              onChange={e =>
                                setBoardFields(
                                  e.target.checked
                                    ? [...boardFields, keyName]
                                    : boardFields.filter(x => x !== keyName)
                                )
                              }
                            />
                            <span>{fieldLabel(keyName)}</span>
                          </label>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Interactive Live Preview */}
          <div className="mod-builder-right-col">
            <div className="customization-card mod-live-preview-card">
              <div className="customization-card-header">
                <div className="customization-header-left">
                  <div
                    className="header-icon-box"
                    style={{
                      background: 'color-mix(in srgb, var(--gold) 14%, var(--panel, #ffffff))',
                      color: 'var(--gold)',
                      borderRadius: '50%',
                    }}
                  >
                    <Eye size={17} />
                  </div>
                  <div className="header-text-group">
                    <h3>Live preview</h3>
                    <p>See how your module will look to your team.</p>
                  </div>
                </div>

                <div className="mod-preview-header-controls">
                  <div className="mod-preview-view-pills">
                    <button
                      type="button"
                      className={`btn-preview-view-tab ${previewView === 'board' ? 'active' : ''}`}
                      onClick={() => setPreviewView('board')}
                    >
                      <Columns3 size={14} />
                      <span>Board</span>
                    </button>
                    <button
                      type="button"
                      className={`btn-preview-view-tab ${previewView === 'list' ? 'active' : ''}`}
                      onClick={() => setPreviewView('list')}
                    >
                      <ListIcon size={14} />
                      <span>List</span>
                    </button>
                    <button
                      type="button"
                      className={`btn-preview-view-tab ${previewView === 'calendar' ? 'active' : ''}`}
                      onClick={() => setPreviewView('calendar')}
                    >
                      <CalendarIcon size={14} />
                      <span>Calendar</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    className="btn-mod-expand-icon"
                    title="Fullscreen preview"
                    onClick={() => setIsFullscreenPreview(true)}
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>
              </div>

              {/* LIVE BOARD PREVIEW */}
              {previewView === 'board' && (
                <div className="mod-live-board-container">
                  <div className="mod-live-board-scroll">
                    {statuses.map((st, idx) => {
                      const sampleCards = sampleMap[idx] || [];
                      return (
                        <div key={idx} className="mod-preview-kanban-col">
                          {/* Column Header */}
                          <div className="mod-preview-col-head">
                            <div className="mod-preview-col-head-left">
                              <span
                                className="mod-preview-col-dot"
                                style={{ backgroundColor: st.color || '#64748b' }}
                              />
                              <span className="mod-preview-col-title">{st.label || 'Stage'}</span>
                              <span className="mod-preview-col-badge">{sampleCards.length}</span>
                            </div>
                            <button type="button" className="btn-preview-col-plus" title="Add record">
                              <Plus size={13} />
                            </button>
                          </div>

                          {/* Cards List */}
                          <div className="mod-preview-col-cards">
                            {sampleCards.map(c => (
                              <div key={c.id} className="mod-preview-kanban-card">
                                <div className="mod-preview-card-title">{c.title}</div>
                                <div className="mod-preview-card-footer">
                                  <div
                                    className="mod-preview-avatar-circle"
                                    style={{ background: c.avatarBg }}
                                  >
                                    {c.avatar}
                                  </div>
                                  <span
                                    className="mod-preview-priority-badge"
                                    style={{
                                      backgroundColor:
                                        c.priority === 'High'
                                          ? '#ffedd5'
                                          : c.priority === 'Medium'
                                          ? '#e0f2fe'
                                          : '#dcfce7',
                                      color:
                                        c.priority === 'High'
                                          ? '#ea580c'
                                          : c.priority === 'Medium'
                                          ? '#0284c7'
                                          : '#16a34a',
                                    }}
                                  >
                                    {c.priority}
                                  </span>
                                </div>
                                <div className="mod-preview-card-date">
                                  <CalendarIcon size={12} />
                                  <span>{c.date}</span>
                                </div>
                              </div>
                            ))}

                            <button type="button" className="btn-preview-add-task">
                              <Plus size={13} />
                              <span>Add task</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* LIVE LIST PREVIEW */}
              {previewView === 'list' && (
                <div className="mod-live-list-container">
                  <table className="mod-preview-table">
                    <thead>
                      <tr>
                        {listColumns.slice(0, 5).map(col => (
                          <th key={col}>{fieldLabel(col)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allSampleCards.slice(0, 6).map((c, i) => (
                        <tr key={i}>
                          {listColumns.slice(0, 5).map(col => (
                            <td key={col}>
                              {col === 'title' ? (
                                <span className="mod-table-title">{c.title}</span>
                              ) : col === 'assignedTo' ? (
                                <div className="mod-table-user">
                                  <span className="mod-mini-avatar" style={{ background: c.avatarBg }}>
                                    {c.avatar}
                                  </span>
                                  <span>{c.avatar === 'AK' ? 'Aisha Khan' : c.avatar === 'RK' ? 'Rahul Kumar' : 'Vikram D'}</span>
                                </div>
                              ) : col === 'status' ? (
                                <span
                                  className="mod-table-status-pill"
                                  style={{
                                    backgroundColor: (statuses[i % statuses.length]?.color || '#64748b') + '1a',
                                    color: statuses[i % statuses.length]?.color || '#64748b',
                                    borderColor: statuses[i % statuses.length]?.color || '#64748b',
                                  }}
                                >
                                  {statuses[i % statuses.length]?.label || 'Open'}
                                </span>
                              ) : col === 'priority' ? (
                                <span className="mod-table-priority">{c.priority}</span>
                              ) : col === 'deadline' ? (
                                <span className="mod-table-date">{c.date}</span>
                              ) : (
                                '—'
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* LIVE CALENDAR PREVIEW */}
              {previewView === 'calendar' && (
                <div className="mod-live-calendar-container">
                  <div className="mod-cal-header-bar">
                    <span>September 2026</span>
                  </div>
                  <div className="mod-cal-grid">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                      <div key={d} className="mod-cal-day-head">{d}</div>
                    ))}
                    {Array.from({ length: 14 }).map((_, i) => (
                      <div key={i} className="mod-cal-cell">
                        <span className="mod-cal-day-num">{10 + i}</span>
                        {i === 2 && (
                          <div className="mod-cal-event" style={{ borderLeftColor: statuses[0]?.color || '#ea580c' }}>
                            Design launch
                          </div>
                        )}
                        {i === 4 && (
                          <div className="mod-cal-event" style={{ borderLeftColor: statuses[1]?.color || '#10b981' }}>
                            Edit video
                          </div>
                        )}
                        {i === 6 && (
                          <div className="mod-cal-event" style={{ borderLeftColor: statuses[2]?.color || '#f59e0b' }}>
                            Blog content
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Module Settings Modal */}
      {showSettingsModal && (
        <div className="auto-modal-overlay">
          <div className="auto-modal-backdrop" onClick={() => setShowSettingsModal(false)} />
          <div className="auto-modal-card" style={{ maxWidth: '480px' }}>
            <div className="auto-modal-header">
              <div className="auto-modal-header-titles">
                <span className="auto-modal-badge">CONFIGURATION</span>
                <h3>Module Settings</h3>
                <p>Customize the module identity, icon, and sidebar options.</p>
              </div>
              <button
                type="button"
                className="btn-auto-modal-close"
                onClick={() => setShowSettingsModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="auto-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Module Name */}
              <div className="mod-field-input-group">
                <label>Module Name *</label>
                <input
                  type="text"
                  value={name}
                  required
                  placeholder="e.g. Tasks, Projects, Video Production"
                  className="mod-field-input"
                  onChange={e => {
                    setName(e.target.value);
                    if (isNew && !key) setKey(slugify(e.target.value));
                  }}
                />
              </div>

              {/* URL Key */}
              <div className="mod-field-input-group">
                <label>URL Slug / Key</label>
                <input
                  type="text"
                  value={key}
                  placeholder="tasks"
                  readOnly={!isNew}
                  className="mod-field-input"
                  onChange={e => setKey(slugify(e.target.value))}
                />
                <span className="mod-accordion-hint">Used in URLs: /work/{key || 'module-key'}</span>
              </div>

              {/* Icon & Color Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {/* Icon selector */}
                <div className="mod-field-input-group">
                  <label>Icon</label>
                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      className="mod-field-input"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                      onClick={() => setIconPickerOpen(!iconPickerOpen)}
                    >
                      <ModuleIconComponent size={16} style={{ color }} />
                      <span style={{ fontSize: '0.85rem' }}>{icon}</span>
                    </button>

                    {iconPickerOpen && (
                      <div className="mod-icon-picker-popover">
                        {ICON_OPTIONS.map(ic => {
                          const IconComp = ICON_MAP[ic] || SquareCheckBig;
                          return (
                            <button
                              key={ic}
                              type="button"
                              className={`mod-icon-grid-btn ${ic === icon ? 'active' : ''}`}
                              onClick={() => {
                                setIcon(ic);
                                setIconPickerOpen(false);
                              }}
                            >
                              <IconComp size={16} />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Color */}
                <div className="mod-field-input-group">
                  <label>Brand Color</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="color"
                      value={color}
                      className="mod-stage-color-dot"
                      style={{ width: '38px', height: '38px', padding: '2px', cursor: 'pointer', borderRadius: '8px' }}
                      onChange={e => setColor(e.target.value)}
                    />
                    <input
                      type="text"
                      value={color}
                      className="mod-field-input"
                      style={{ flex: 1 }}
                      onChange={e => setColor(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Sidebar Order & Active */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'center' }}>
                <div className="mod-field-input-group">
                  <label>Sidebar Position Order</label>
                  <input
                    type="number"
                    value={order}
                    className="mod-field-input"
                    onChange={e => setOrder(Number(e.target.value) || 0)}
                  />
                </div>

                <label className="mod-checkbox-label" style={{ marginTop: '1.25rem' }}>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={e => setIsActive(e.target.checked)}
                  />
                  <span>Show in CRM Sidebar</span>
                </label>
              </div>
            </div>

            <div className="auto-modal-footer">
              <button
                type="button"
                className="btn-auto-modal-secondary"
                onClick={() => setShowSettingsModal(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn-auto-modal-primary"
                onClick={() => setShowSettingsModal(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Live Preview Modal */}
      {isFullscreenPreview && (
        <div className="mod-fullscreen-preview-overlay">
          <div className="mod-fullscreen-preview-backdrop" onClick={() => setIsFullscreenPreview(false)} />
          <div className="mod-fullscreen-preview-content">
            <div className="mod-fullscreen-preview-header">
              <div className="mod-preview-head-info">
                <span className="mod-preview-dot" style={{ backgroundColor: color }} />
                <span className="mod-preview-name">{name || 'Tasks'}</span>
                <span className="mod-preview-badge">LIVE INTERACTIVE PREVIEW</span>
              </div>
              <div className="mod-preview-head-controls">
                <div className="mod-preview-view-tabs">
                  <button
                    type="button"
                    className={`btn-preview-view-tab ${previewView === 'board' ? 'active' : ''}`}
                    onClick={() => setPreviewView('board')}
                  >
                    <Columns3 size={14} />
                    <span>Board</span>
                  </button>
                  <button
                    type="button"
                    className={`btn-preview-view-tab ${previewView === 'list' ? 'active' : ''}`}
                    onClick={() => setPreviewView('list')}
                  >
                    <ListIcon size={14} />
                    <span>List</span>
                  </button>
                  <button
                    type="button"
                    className={`btn-preview-view-tab ${previewView === 'calendar' ? 'active' : ''}`}
                    onClick={() => setPreviewView('calendar')}
                  >
                    <CalendarIcon size={14} />
                    <span>Calendar</span>
                  </button>
                </div>
                <button
                  type="button"
                  className="btn-auto-modal-close"
                  title="Close fullscreen preview"
                  onClick={() => setIsFullscreenPreview(false)}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="mod-fullscreen-preview-body">
              {previewView === 'board' && (
                <div className="mod-live-board-container" style={{ minHeight: '600px', height: '100%' }}>
                  <div className="mod-live-board-scroll">
                    {statuses.map((st, idx) => {
                      const sampleCards = sampleMap[idx] || [];
                      return (
                        <div key={idx} className="mod-preview-kanban-col">
                          <div className="mod-preview-col-head">
                            <div className="mod-preview-col-head-left">
                              <span className="mod-preview-col-dot" style={{ backgroundColor: st.color || '#64748b' }} />
                              <span className="mod-preview-col-title">{st.label || 'Stage'}</span>
                              <span className="mod-preview-col-badge">{sampleCards.length}</span>
                            </div>
                            <button type="button" className="btn-preview-col-plus" title="Add record">
                              <Plus size={13} />
                            </button>
                          </div>
                          <div className="mod-preview-col-cards">
                            {sampleCards.map(c => (
                              <div key={c.id} className="mod-preview-kanban-card">
                                <div className="mod-preview-card-title">{c.title}</div>
                                <div className="mod-preview-card-footer">
                                  <div className="mod-preview-avatar-circle" style={{ background: c.avatarBg }}>
                                    {c.avatar}
                                  </div>
                                  <span
                                    className="mod-preview-priority-badge"
                                    style={{
                                      backgroundColor: c.priority === 'High' ? '#ffedd5' : c.priority === 'Medium' ? '#e0f2fe' : '#dcfce7',
                                      color: c.priority === 'High' ? '#ea580c' : c.priority === 'Medium' ? '#0284c7' : '#16a34a',
                                    }}
                                  >
                                    {c.priority}
                                  </span>
                                </div>
                                <div className="mod-preview-card-date">
                                  <CalendarIcon size={12} />
                                  <span>{c.date}</span>
                                </div>
                              </div>
                            ))}
                            <button type="button" className="btn-preview-add-task">
                              <Plus size={13} />
                              <span>Add record</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {previewView === 'list' && (
                <div className="mod-live-list-container" style={{ minHeight: '600px' }}>
                  <table className="mod-preview-table">
                    <thead>
                      <tr>
                        {listColumns.slice(0, 6).map(col => (
                          <th key={col}>{fieldLabel(col)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allSampleCards.map((c, i) => (
                        <tr key={i}>
                          {listColumns.slice(0, 6).map(col => (
                            <td key={col}>
                              {col === 'title' ? (
                                <span className="mod-table-title">{c.title}</span>
                              ) : col === 'assignedTo' ? (
                                <div className="mod-table-user">
                                  <span className="mod-mini-avatar" style={{ background: c.avatarBg }}>{c.avatar}</span>
                                  <span>{c.avatar === 'AK' ? 'Aisha Khan' : c.avatar === 'RK' ? 'Rahul Kumar' : 'Vikram D'}</span>
                                </div>
                              ) : col === 'status' ? (
                                <span
                                  className="mod-table-status-pill"
                                  style={{
                                    backgroundColor: (statuses[i % statuses.length]?.color || '#64748b') + '1a',
                                    color: statuses[i % statuses.length]?.color || '#64748b',
                                    borderColor: statuses[i % statuses.length]?.color || '#64748b',
                                  }}
                                >
                                  {statuses[i % statuses.length]?.label || 'Open'}
                                </span>
                              ) : col === 'priority' ? (
                                <span className="mod-table-priority">{c.priority}</span>
                              ) : col === 'deadline' ? (
                                <span className="mod-table-date">{c.date}</span>
                              ) : (
                                '—'
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {previewView === 'calendar' && (
                <div className="mod-live-calendar-container" style={{ minHeight: '600px' }}>
                  <div className="mod-cal-header-bar">
                    <span>September 2026</span>
                  </div>
                  <div className="mod-cal-grid">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                      <div key={d} className="mod-cal-day-head">{d}</div>
                    ))}
                    {Array.from({ length: 14 }).map((_, i) => (
                      <div key={i} className="mod-cal-cell" style={{ minHeight: '100px' }}>
                        <span className="mod-cal-day-num">{10 + i}</span>
                        {i === 2 && (
                          <div className="mod-cal-event" style={{ borderLeftColor: statuses[0]?.color || '#ea580c' }}>
                            Sample Card 1
                          </div>
                        )}
                        {i === 4 && (
                          <div className="mod-cal-event" style={{ borderLeftColor: statuses[1]?.color || '#10b981' }}>
                            Sample Card 2
                          </div>
                        )}
                        {i === 6 && (
                          <div className="mod-cal-event" style={{ borderLeftColor: statuses[2]?.color || '#f59e0b' }}>
                            Sample Card 3
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Module"
        message={`Are you sure you want to delete module "${workType?.name || name}" and all of its associated records? This action cannot be undone.`}
        confirmText="Delete Module"
        variant="danger"
        loading={saving}
        onConfirm={executeDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>,
    document.body
  );
}
