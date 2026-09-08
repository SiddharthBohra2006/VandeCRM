import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { settingsApi } from '../../api/settings';
import { WorkType } from '../../api/work';
import ConfirmDialog from '../../components/ConfirmDialog';
import Icon from '../../components/Icons';
import {
  X,
  Plus,
  Trash2,
  Settings,
  ChevronUp,
  ChevronDown,
  Search,
  Eye,
  Kanban,
  LayoutList,
  FileText,
  BarChart2,
  User,
  Clock,
  ArrowLeft,
  Maximize2,
  Minimize2,
  Calendar,
  Building2,
  CheckCircle2,
  Check,
  AlertCircle,
  Hash,
  Mail,
  Phone,
  Globe,
  Paperclip,
  GripVertical,
} from 'lucide-react';
import '../../styles/settings/work-type-builder.css';

export interface StatusDraft {
  key: string;
  label: string;
  color: string;
  isTerminalWon?: boolean;
  isTerminalLost?: boolean;
  requiresApproval?: boolean;
}

export interface FieldDraft {
  key: string;
  label: string;
  type: string;
  options: string[];
  required: boolean;
  placeholder?: string;
  group?: string;
  helpText?: string;
  defaultValue?: string;
  min?: number | null;
  max?: number | null;
}

interface Props {
  workType: WorkType | null;
  onClose: () => void;
  onChanged: () => void;
}

const SUPPORTED_FIELD_TYPES = [
  { id: 'text', label: 'Text' },
  { id: 'textarea', label: 'Long Text (Textarea)' },
  { id: 'number', label: 'Number' },
  { id: 'currency', label: 'Currency (₹)' },
  { id: 'percentage', label: 'Percentage (%)' },
  { id: 'date', label: 'Date' },
  { id: 'datetime', label: 'Date & Time' },
  { id: 'select', label: 'Dropdown (Select)' },
  { id: 'multi-select', label: 'Multi-select' },
  { id: 'checkbox', label: 'Checkbox' },
  { id: 'url', label: 'Website / Link (URL)' },
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone' },
  { id: 'user-picker', label: 'User / Team member' },
  { id: 'file', label: 'File / Attachment link' },
];

const BUSINESS_ICON_CATALOG: [string, string, string, string][] = [
  ['layout-dashboard','Dashboard','recommended','overview home workspace'],
  ['clipboard-list','Work items','recommended','tasks checklist module'],
  ['list-checks','Processes','recommended','workflow operations'],
  ['calendar-days','Schedule','recommended','calendar appointments'],
  ['folder-kanban','Projects','recommended','project delivery'],
  ['bar-chart-3','Analytics','recommended','reports performance'],
  ['users','Customers','recommended','people clients'],
  ['briefcase','Business','recommended','company work'],
  ['target','Goals','recommended','targets objectives'],
  ['settings','Operations','recommended','settings process'],

  ['handshake','Deals','sales','partnership sales agreement'],
  ['contact','Contacts','sales','customer people address book'],
  ['filter','Leads','sales','pipeline prospects'],
  ['badge-dollar-sign','Revenue','sales','money deal value'],
  ['shopping-cart','Orders','sales','purchase ecommerce'],
  ['file-signature','Proposals','sales','quote contract'],
  ['phone-call','Calls','sales','telephone followup'],
  ['map-pinned','Territories','sales','location region'],
  ['trophy','Targets','sales','achievement quota'],

  ['megaphone','Campaigns','marketing','advertising promotion'],
  ['send','Outreach','marketing','message campaign'],
  ['mail','Email marketing','marketing','newsletter inbox'],
  ['share-2','Social media','marketing','social sharing'],
  ['newspaper','Content','marketing','article editorial'],
  ['palette','Branding','marketing','design identity'],
  ['search','SEO research','marketing','search optimization'],

  ['landmark','Banking','finance','bank accounts'],
  ['wallet-cards','Payments','finance','wallet card'],
  ['receipt-text','Expenses','finance','receipt bill'],
  ['circle-dollar-sign','Billing','finance','invoice money'],
  ['calculator','Calculations','finance','accounting numbers'],
  ['piggy-bank','Budget','finance','savings'],

  ['scale','Legal matters','legal','law justice cases'],
  ['gavel','Court cases','legal','judge litigation'],
  ['file-lock','Compliance','legal','secure document regulation'],
  ['scroll-text','Contracts','legal','agreement document'],
  ['shield-check','Risk & compliance','legal','protection audit'],

  ['stethoscope','Medical care','healthcare','doctor clinic'],
  ['hospital','Hospital','healthcare','medical building'],
  ['heart-pulse','Patient health','healthcare','care wellness'],
  ['pill','Pharmacy','healthcare','medicine prescription'],
  ['clipboard-plus','Patient records','healthcare','medical file'],

  ['house','Properties','real-estate','home listings'],
  ['building-2','Commercial property','real-estate','office building'],
  ['key-round','Rentals','real-estate','key lease'],
  ['ruler','Floor plans','real-estate','measurement plan'],

  ['graduation-cap','Students','education','school learning'],
  ['school','Institution','education','college building'],
  ['book-open','Courses','education','learning lessons'],
  ['presentation','Training','education','class presentation'],

  ['hotel','Hotels','hospitality','rooms lodging'],
  ['bed-double','Bookings','hospitality','room reservation'],
  ['utensils','Restaurant','hospitality','food dining'],
  ['coffee','Cafe','hospitality','drink beverage'],

  ['store','Store','retail','shop business'],
  ['shopping-bag','Products','retail','shopping commerce'],
  ['package','Inventory','retail','stock product'],
  ['tags','Pricing','retail','price labels'],

  ['truck','Delivery','logistics','shipping vehicle'],
  ['container','Freight','logistics','cargo shipping'],
  ['warehouse','Warehouse','logistics','storage inventory'],
  ['plane','Air freight','logistics','flight travel'],

  ['hard-hat','Construction','construction','builder safety'],
  ['hammer','Contracting','construction','tool builder'],
  ['drafting-compass','Architecture','construction','design plan'],

  ['factory','Manufacturing','manufacturing','industry production'],
  ['wrench','Maintenance','manufacturing','repair tools'],
  ['workflow','Production line','manufacturing','factory process'],

  ['clapperboard','Video production','media','film reel'],
  ['video','Video','media','camera recording'],
  ['image','Design assets','media','picture gallery'],
  ['pen-line','Writing','media','copy content'],
  ['music','Music','media','song audio'],

  ['code-2','Development','technology','software coding'],
  ['monitor','Software','technology','computer app'],
  ['database','Data','technology','storage records'],
  ['cloud','Cloud services','technology','hosting online'],
  ['shield','Cybersecurity','technology','security protection'],

  ['user-check','Recruitment','people','hire employee'],
  ['users-round','Teams','people','staff group'],
  ['calendar-check','Attendance','people','schedule presence'],

  ['headphones','Customer support','support','help service'],
  ['message-square','Conversations','support','chat messages'],
  ['circle-help','Help desk','support','question assistance'],
  ['clock-3','Service SLA','support','time deadline'],
];

const ICON_CATEGORIES = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'sales', label: 'Sales & CRM' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'finance', label: 'Finance' },
  { id: 'legal', label: 'Legal' },
  { id: 'healthcare', label: 'Healthcare' },
  { id: 'real-estate', label: 'Real estate' },
  { id: 'education', label: 'Education' },
  { id: 'hospitality', label: 'Hospitality' },
  { id: 'retail', label: 'Retail' },
  { id: 'logistics', label: 'Logistics' },
  { id: 'construction', label: 'Construction' },
  { id: 'manufacturing', label: 'Manufacturing' },
  { id: 'media', label: 'Media & creative' },
  { id: 'technology', label: 'Technology' },
  { id: 'people', label: 'HR & people' },
  { id: 'support', label: 'Service & support' },
  { id: 'all', label: 'All icons' },
];

const DEFAULT_STATUSES: StatusDraft[] = [
  { key: 'backlog', label: 'Backlog', color: '#64748b' },
  { key: 'in_progress', label: 'In progress', color: '#f59e0b' },
  { key: 'review', label: 'Review', color: '#3b82f6' },
  { key: 'done', label: 'Done', color: '#16a34a', isTerminalWon: true },
];

const CORE_FIELDS = [
  { key: 'title', label: 'Title / Name' },
  { key: 'status', label: 'Stage / Status' },
  { key: 'assignedTo', label: 'Owner / Assignee' },
  { key: 'priority', label: 'Priority' },
  { key: 'deadline', label: 'Deadline / Due date' },
  { key: 'startDate', label: 'Start date' },
  { key: 'deliveredAt', label: 'Delivered date' },
  { key: 'customer', label: 'Business / Client' },
  { key: 'notes', label: 'Internal Notes' },
];

function slugify(value: string) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Pure generator for preview sample records distributed across configured statuses & fields
 */
function generatePreviewRecords(
  name: string,
  statuses: StatusDraft[],
  fields: FieldDraft[]
) {
  if (!statuses || statuses.length === 0) return [];
  const sampleTitles = [
    'Initial Consultation & Discovery',
    'Technical Scope & Requirements',
    'Milestone Sign-off & Delivery',
    'Customer Review & Approval',
    'Performance Audit & Sign-off',
    'Deployment & Verification',
  ];
  const sampleUsers = ['Alex Carter', 'Priya Sharma', 'David Miller', 'Elena Rostova'];
  const samplePriorities = ['high', 'normal', 'urgent', 'low'];
  const prefix = slugify(name || 'REC').toUpperCase() || 'MOD';

  const totalCount = Math.max(statuses.length, 3);
  const records = [];

  for (let i = 0; i < totalCount; i++) {
    const status = statuses[i % statuses.length];
    const recId = `#${prefix}-${String(101 + i)}`;
    const title = `Sample ${name || 'Item'} — ${sampleTitles[i % sampleTitles.length]}`;
    const user = sampleUsers[i % sampleUsers.length];
    const priority = samplePriorities[i % samplePriorities.length];

    const values: Record<string, any> = {
      title,
      status: status.label,
      assignedTo: user,
      priority,
      deadline: `In ${2 + i * 2} days`,
      startDate: `Oct ${10 + i}, 2026`,
      deliveredAt: `Nov ${15 + i}, 2026`,
      customer: i % 2 === 0 ? 'Acme Global' : 'Apex Dynamics',
      notes: 'Sample workflow notes and review checkpoints.',
    };

    fields.forEach((f, fIdx) => {
      const key = `custom:${f.key}`;
      if (f.type === 'currency') {
        values[key] = `₹${(15000 + (i + 1) * (fIdx + 1) * 8500).toLocaleString()}`;
      } else if (f.type === 'percentage') {
        values[key] = `${Math.min(100, (i + 1) * 25)}%`;
      } else if (f.type === 'number') {
        values[key] = `${(i + 1) * 15}`;
      } else if (f.type === 'date' || f.type === 'datetime') {
        values[key] = `2026-10-${String(12 + i * 2).padStart(2, '0')}`;
      } else if (f.type === 'select' || f.type === 'multi-select') {
        values[key] = f.options && f.options.length > 0 ? f.options[i % f.options.length] : 'Option 1';
      } else if (f.type === 'checkbox') {
        values[key] = i % 2 === 0 ? 'Yes' : 'No';
      } else if (f.type === 'email') {
        values[key] = `client.${i + 1}@example.com`;
      } else if (f.type === 'phone') {
        values[key] = `+91 98765 4321${i}`;
      } else if (f.type === 'url') {
        values[key] = `https://portal.client.com/${f.key}-${i + 1}`;
      } else if (f.type === 'user-picker') {
        values[key] = sampleUsers[(i + 1) % sampleUsers.length];
      } else if (f.type === 'file') {
        values[key] = `document_v${i + 1}.pdf`;
      } else {
        values[key] = `Sample ${f.label || f.key}`;
      }
    });

    records.push({
      id: recId,
      title,
      statusKey: status.key,
      statusLabel: status.label,
      statusColor: status.color || '#64748b',
      priority,
      user,
      values,
    });
  }

  return records;
}

export default function WorkTypeBuilder({ workType, onClose, onChanged }: Props) {
  const isNew = !workType;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewTab, setPreviewTab] = useState<'board' | 'form' | 'table' | 'overview'>('board');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Drag and Drop state
  const [draggedStatusIdx, setDraggedStatusIdx] = useState<number | null>(null);
  const [dragOverStatusIdx, setDragOverStatusIdx] = useState<number | null>(null);
  const [draggedFieldIdx, setDraggedFieldIdx] = useState<number | null>(null);
  const [dragOverFieldIdx, setDragOverFieldIdx] = useState<number | null>(null);

  // Module Identity
  const [name, setName] = useState(workType?.name || '');
  const [key, setKey] = useState(workType?.key || '');
  const [icon, setIcon] = useState(workType?.icon || 'clipboard-list');
  const [color, setColor] = useState(workType?.color || '#ea580c');
  const [order, setOrder] = useState<number>(workType?.order || 0);
  const [isActive, setIsActive] = useState(workType?.isActive !== false);

  // Icon Library Popover
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconCategory, setIconCategory] = useState('recommended');
  const [iconSearch, setIconSearch] = useState('');
  const iconPopoverRef = useRef<HTMLDivElement>(null);

  // Statuses (Step 1)
  const [statuses, setStatuses] = useState<StatusDraft[]>(
    workType?.statuses?.length
      ? workType.statuses.map(s => ({
          key: s.key,
          label: s.label,
          color: s.color || '#64748b',
          isTerminalWon: s.isTerminalWon,
          isTerminalLost: s.isTerminalLost,
          requiresApproval: s.requiresApproval,
        }))
      : DEFAULT_STATUSES
  );

  // Form Fields (Step 2)
  const [fields, setFields] = useState<FieldDraft[]>(
    workType?.fields?.length
      ? workType.fields.map(f => ({
          key: f.key,
          label: f.label,
          type: f.type,
          options: f.options || [],
          required: !!f.required,
          placeholder: f.placeholder || '',
          helpText: (f as any).helpText || '',
          defaultValue: (f as any).defaultValue || '',
          group: f.group,
        }))
      : []
  );

  // Presentation & Views (Step 3)
  const pres = workType?.presentation || {};
  const [enabledViews, setEnabledViews] = useState<string[]>(
    pres.enabledViews?.length ? pres.enabledViews : ['list', 'board', 'calendar']
  );
  const [defaultView, setDefaultView] = useState(pres.defaultView || 'list');
  const [calendarField, setCalendarField] = useState(pres.calendarField || 'deadline');
  const [listColumns, setListColumns] = useState<string[]>(
    pres.listColumns?.length ? pres.listColumns : ['title', 'assignedTo', 'status', 'deadline']
  );
  const [boardFields, setBoardFields] = useState<string[]>(
    pres.boardFields?.length ? pres.boardFields : ['assignedTo', 'priority', 'deadline']
  );
  const [filterFields, setFilterFields] = useState<string[]>(
    pres.filterFields?.length ? pres.filterFields : ['status', 'assignedTo', 'priority']
  );
  const [fieldLabels, setFieldLabels] = useState<Record<string, string>>(pres.fieldLabels || {});
  const [overviewGroupFields, setOverviewGroupFields] = useState<string[]>(pres.overviewGroupFields || []);
  const [overviewProgressFields, setOverviewProgressFields] = useState<string[]>(pres.overviewProgressFields || []);
  const [overviewCompleteValue, setOverviewCompleteValue] = useState(pres.overviewCompleteValue || 'Done');

  // Close icon popover on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (iconPickerOpen) {
          setIconPickerOpen(false);
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [iconPickerOpen]);

  // Sync state whenever workType prop changes
  useEffect(() => {
    setName(workType?.name || '');
    setKey(workType?.key || '');
    setIcon(workType?.icon || 'clipboard-list');
    setColor(workType?.color || '#ea580c');
    setOrder(workType?.order || 0);
    setIsActive(workType?.isActive !== false);
    setStatuses(
      workType?.statuses?.length
        ? workType.statuses.map(s => ({
            key: s.key,
            label: s.label,
            color: s.color || '#64748b',
            isTerminalWon: s.isTerminalWon,
            isTerminalLost: s.isTerminalLost,
            requiresApproval: s.requiresApproval,
          }))
        : DEFAULT_STATUSES
    );
    setFields(
      workType?.fields?.length
        ? workType.fields.map(f => ({
            key: f.key,
            label: f.label,
            type: f.type,
            options: f.options || [],
            required: !!f.required,
            placeholder: f.placeholder || '',
            helpText: (f as any).helpText || '',
            defaultValue: (f as any).defaultValue || '',
            group: f.group,
          }))
        : []
    );
    const p = workType?.presentation || {};
    setEnabledViews(p.enabledViews?.length ? p.enabledViews : ['list', 'board', 'calendar']);
    setDefaultView(p.defaultView || 'list');
    setCalendarField(p.calendarField || 'deadline');
    setListColumns(p.listColumns?.length ? p.listColumns : ['title', 'assignedTo', 'status', 'deadline']);
    setBoardFields(p.boardFields?.length ? p.boardFields : ['assignedTo', 'priority', 'deadline']);
    setFilterFields(p.filterFields?.length ? p.filterFields : ['status', 'assignedTo', 'priority']);
    setFieldLabels(p.fieldLabels || {});
    setOverviewGroupFields(p.overviewGroupFields || []);
    setOverviewProgressFields(p.overviewProgressFields || []);
    setOverviewCompleteValue(p.overviewCompleteValue || 'Done');
  }, [workType]);

  // Filtered icons
  const filteredIcons = useMemo(() => {
    const q = iconSearch.trim().toLowerCase();
    return BUSINESS_ICON_CATALOG.filter(([iconName, label, group, keywords]) => {
      const matchSearch = !q || `${iconName} ${label} ${keywords}`.toLowerCase().includes(q);
      const matchCat = iconCategory === 'all' || group === iconCategory || (q && iconCategory === 'recommended');
      return matchSearch && matchCat;
    });
  }, [iconSearch, iconCategory]);

  // All available fields for selection (core + custom)
  const allAttributes = useMemo(() => {
    const items = [
      ...CORE_FIELDS.map(c => ({ key: c.key, label: fieldLabels[c.key] || c.label, isCore: true })),
      ...fields.map(f => ({ key: `custom:${f.key}`, label: fieldLabels[`custom:${f.key}`] || f.label || f.key, isCore: false, type: f.type })),
    ];
    return items;
  }, [fields, fieldLabels]);

  const selectFields = useMemo<FieldDraft[]>(() => {
    return fields.filter(f => ['select', 'multi-select'].includes(f.type));
  }, [fields]);

  // Sample records generated dynamically as a pure function of builder state
  const sampleRecords = useMemo(() => {
    return generatePreviewRecords(name, statuses, fields);
  }, [name, statuses, fields]);

  function handleNameChange(val: string) {
    setName(val);
    if (isNew) {
      setKey(slugify(val));
    }
  }

  function addStatus() {
    const newIdx = statuses.length + 1;
    setStatuses([
      ...statuses,
      {
        key: `stage_${newIdx}`,
        label: `Stage ${newIdx}`,
        color: '#64748b',
        isTerminalWon: false,
        isTerminalLost: false,
        requiresApproval: false,
      },
    ]);
  }

  function moveStatus(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= statuses.length) return;
    const next = [...statuses];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setStatuses(next);
  }

  // Drag and Drop handlers for Statuses
  function handleStatusDragStart(e: React.DragEvent, index: number) {
    setDraggedStatusIdx(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }

  function handleStatusDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStatusIdx !== index) {
      setDragOverStatusIdx(index);
    }
  }

  function handleStatusDrop(e: React.DragEvent, targetIndex: number) {
    e.preventDefault();
    if (draggedStatusIdx === null || draggedStatusIdx === targetIndex) {
      setDraggedStatusIdx(null);
      setDragOverStatusIdx(null);
      return;
    }
    const next = [...statuses];
    const [moved] = next.splice(draggedStatusIdx, 1);
    next.splice(targetIndex, 0, moved);
    setStatuses(next);
    setDraggedStatusIdx(null);
    setDragOverStatusIdx(null);
  }

  function addField() {
    const newIdx = fields.length + 1;
    setFields([
      ...fields,
      {
        key: `field_${newIdx}`,
        label: `Field ${newIdx}`,
        type: 'text',
        options: [],
        required: false,
        placeholder: '',
      },
    ]);
  }

  function moveField(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setFields(next);
  }

  // Drag and Drop handlers for Custom Fields
  function handleFieldDragStart(e: React.DragEvent, index: number) {
    setDraggedFieldIdx(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }

  function handleFieldDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverFieldIdx !== index) {
      setDragOverFieldIdx(index);
    }
  }

  function handleFieldDrop(e: React.DragEvent, targetIndex: number) {
    e.preventDefault();
    if (draggedFieldIdx === null || draggedFieldIdx === targetIndex) {
      setDraggedFieldIdx(null);
      setDragOverFieldIdx(null);
      return;
    }
    const next = [...fields];
    const [moved] = next.splice(draggedFieldIdx, 1);
    next.splice(targetIndex, 0, moved);
    setFields(next);
    setDraggedFieldIdx(null);
    setDragOverFieldIdx(null);
  }

  function toggleArrayItem(arr: string[], item: string, minLength = 0): string[] {
    if (arr.includes(item)) {
      if (arr.length <= minLength) return arr;
      return arr.filter(x => x !== item);
    }
    return [...arr, item];
  }

  async function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a module name.');
      return;
    }
    if (statuses.length === 0) {
      setError('A module must have at least one board stage.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const cleanKey = slugify(key || name);
      const payload = {
        name: name.trim(),
        key: cleanKey,
        icon: icon || 'clipboard-list',
        color: color || '#ea580c',
        order: Number(order) || 0,
        isActive,
        statuses: statuses.map(s => ({
          key: s.key.trim() || slugify(s.label),
          label: s.label.trim() || 'Untitled',
          color: s.color || '#64748b',
          isTerminalWon: !!s.isTerminalWon,
          isTerminalLost: !!s.isTerminalLost,
          requiresApproval: !!s.requiresApproval,
        })),
        fields: fields.map(f => ({
          key: f.key.trim() || slugify(f.label),
          label: f.label.trim() || 'Field',
          type: f.type,
          options: f.options || [],
          required: !!f.required,
          placeholder: f.placeholder || '',
          helpText: f.helpText || '',
          defaultValue: f.defaultValue || '',
          group: f.group || '',
        })),
        presentation: {
          enabledViews,
          defaultView,
          calendarField,
          listColumns,
          boardFields,
          filterFields,
          fieldLabels,
          overviewGroupFields,
          overviewProgressFields,
          overviewCompleteValue,
        },
      };

      if (isNew) {
        await settingsApi.createWorkType(payload);
      } else {
        await settingsApi.updateWorkType(workType._id, payload);
      }

      onChanged();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save module.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!workType) return;
    try {
      setSaving(true);
      await settingsApi.deleteWorkType(workType._id);
      onChanged();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete module.');
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      className="module-builder-dialog-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="module-builder-dialog-heading"
    >
      <div className={`module-builder-dialog-card ${isFullscreen ? 'is-fullscreen' : ''}`}>
        {/* MODAL HEADER */}
        <header className="module-builder-dialog-header">
          <div className="module-builder-title">
            <small>{isNew ? 'New sidebar module' : 'Customize module'}</small>
            <h2 id="module-builder-dialog-heading">
              {isNew ? (name || 'Create work module') : (name || workType.name)}
            </h2>
          </div>

          <section className="module-builder-basics" aria-label="Module Identity and Accent">
            {/* ICON SELECTOR */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="icon-library-summary"
                title="Choose sidebar icon"
                aria-label={`Choose sidebar icon, currently selected: ${icon}`}
                aria-haspopup="dialog"
                aria-expanded={iconPickerOpen}
                onClick={() => setIconPickerOpen(!iconPickerOpen)}
                style={{ color: color || 'var(--gold)' }}
              >
                <Icon name={icon} size={20} />
              </button>

              {iconPickerOpen && (
                <div
                  ref={iconPopoverRef}
                  className="icon-library-popover"
                  onClick={e => e.stopPropagation()}
                  role="dialog"
                  aria-label="Icon Picker Library"
                >
                  <div className="icon-library-filters">
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <Search size={13} style={{ position: 'absolute', left: '8px', color: 'var(--muted)' }} />
                      <input
                        type="search"
                        placeholder="Search 1,700+ icons…"
                        value={iconSearch}
                        onChange={e => setIconSearch(e.target.value)}
                        aria-label="Search icons"
                        autoFocus
                      />
                    </div>
                    <select
                      value={iconCategory}
                      onChange={e => setIconCategory(e.target.value)}
                      aria-label="Filter icons by category"
                    >
                      {ICON_CATEGORIES.map(c => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Category Quick Pills */}
                  <div className="icon-category-pills" role="tablist" aria-label="Icon categories">
                    {ICON_CATEGORIES.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className={`icon-cat-pill ${iconCategory === c.id ? 'active' : ''}`}
                        onClick={() => setIconCategory(c.id)}
                        role="tab"
                        aria-selected={iconCategory === c.id}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>

                  <div className="icon-library-grid" role="listbox" aria-label="Available icons">
                    {filteredIcons.length === 0 ? (
                      <div className="preview-empty-state" style={{ gridColumn: '1 / -1', padding: '1.25rem' }}>
                        No matching icons found. Try another search.
                      </div>
                    ) : (
                      filteredIcons.map(([ic, label]) => (
                        <button
                          key={ic}
                          type="button"
                          className={icon === ic ? 'selected' : ''}
                          title={label}
                          aria-label={`Select icon ${label}`}
                          role="option"
                          aria-selected={icon === ic}
                          onClick={() => {
                            setIcon(ic);
                            setIconPickerOpen(false);
                          }}
                        >
                          <Icon name={ic} size={18} />
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* MODULE NAME */}
            <div className="module-name-field">
              <input
                type="text"
                value={name}
                placeholder="Module name"
                aria-label="Module name"
                onChange={e => handleNameChange(e.target.value)}
                required
              />
            </div>

            {/* COLOR PICKER */}
            <label className="module-color-field" title="Module accent color" style={{ background: color }}>
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                aria-label="Module accent color"
              />
            </label>
          </section>

          {/* HEADER ACTION CONTROLS */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* PREVIEW TOGGLE BUTTON */}
            <button
              type="button"
              className={`module-builder-preview-btn ${showPreview ? 'active' : ''}`}
              title={showPreview ? 'Exit Preview' : 'Live Preview Module'}
              aria-label={showPreview ? 'Exit live preview mode' : 'Enter live preview mode'}
              aria-pressed={showPreview}
              onClick={() => setShowPreview(!showPreview)}
            >
              <Eye size={15} />
              <span>{showPreview ? 'Edit Module' : 'Preview'}</span>
            </button>

            {/* ADVANCED SETTINGS */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="module-builder-advanced-btn"
                title="Advanced settings"
                aria-label="Advanced module settings"
                aria-haspopup="true"
                aria-expanded={showAdvanced}
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                <Settings size={18} />
              </button>

              {showAdvanced && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    zIndex: 1000,
                    width: '280px',
                    padding: '1rem',
                    background: 'var(--panel)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    boxShadow: '0 15px 40px rgba(0,0,0,0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}
                  role="region"
                  aria-label="Advanced Module Configuration"
                >
                  <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    Stable URL Key
                    <input
                      type="text"
                      value={key}
                      onChange={e => setKey(slugify(e.target.value))}
                      placeholder="e.g. graphic-posts"
                      aria-label="Stable URL key"
                      style={{ fontSize: '0.85rem', background: 'var(--input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px', height: '34px', padding: '0 8px' }}
                    />
                  </label>

                  <label style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    Sidebar Position Order
                    <input
                      type="number"
                      value={order}
                      onChange={e => setOrder(Number(e.target.value) || 0)}
                      aria-label="Sidebar position order"
                      style={{ fontSize: '0.85rem', background: 'var(--input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px', height: '34px', padding: '0 8px' }}
                    />
                  </label>

                  <label className="mini-check-label" style={{ marginTop: '4px' }}>
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={e => setIsActive(e.target.checked)}
                      aria-label="Show module in sidebar"
                    />
                    <span>Show in sidebar</span>
                  </label>
                </div>
              )}
            </div>
          </div>

          <div className="module-builder-window-controls">
            <button
              type="button"
              className={`module-builder-maximize-btn ${isFullscreen ? 'active' : ''}`}
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Exit full screen' : 'Full screen'}
              aria-label={isFullscreen ? 'Exit full screen mode' : 'Enter full screen mode'}
            >
              {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>

            <button
              type="button"
              className="module-builder-close-btn"
              onClick={onClose}
              aria-label="Close module builder dialog"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {error && (
          <div
            role="alert"
            aria-live="polite"
            style={{
              margin: '0.75rem 1.25rem 0',
              padding: '0.65rem 0.9rem',
              background: 'color-mix(in srgb, var(--red, #ef4444) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--red, #ef4444) 30%, transparent)',
              borderRadius: '8px',
              color: 'var(--red, #ef4444)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* LIVE PREVIEW WORKBENCH OR 3-STEP BUILDER */}
        {showPreview ? (
          <section className="module-builder-preview-wrapper" aria-label="Live Module Preview">
            <div className="module-builder-preview-topbar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="preview-meta-badge">
                  <Icon name={icon || 'clipboard-list'} size={15} style={{ color }} />
                  <span>{name || 'Custom Module'}</span>
                  <span className="preview-sample-badge">
                    LIVE PREVIEW
                  </span>
                </div>
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                  {statuses.length} {statuses.length === 1 ? 'stage' : 'stages'} • {fields.length} custom {fields.length === 1 ? 'field' : 'fields'}
                </span>
              </div>

              {/* View Switcher Tabs */}
              <div className="preview-view-pills" role="tablist" aria-label="Preview View Modes">
                <button
                  type="button"
                  id="preview-tab-board"
                  className={`preview-view-btn ${previewTab === 'board' ? 'active' : ''}`}
                  onClick={() => setPreviewTab('board')}
                  role="tab"
                  aria-selected={previewTab === 'board'}
                  aria-controls="preview-panel-board"
                >
                  <Kanban size={13} />
                  <span>Board View</span>
                </button>
                <button
                  type="button"
                  id="preview-tab-form"
                  className={`preview-view-btn ${previewTab === 'form' ? 'active' : ''}`}
                  onClick={() => setPreviewTab('form')}
                  role="tab"
                  aria-selected={previewTab === 'form'}
                  aria-controls="preview-panel-form"
                >
                  <FileText size={13} />
                  <span>Form & Record</span>
                </button>
                <button
                  type="button"
                  id="preview-tab-table"
                  className={`preview-view-btn ${previewTab === 'table' ? 'active' : ''}`}
                  onClick={() => setPreviewTab('table')}
                  role="tab"
                  aria-selected={previewTab === 'table'}
                  aria-controls="preview-panel-table"
                >
                  <LayoutList size={13} />
                  <span>List Table</span>
                </button>
                <button
                  type="button"
                  id="preview-tab-overview"
                  className={`preview-view-btn ${previewTab === 'overview' ? 'active' : ''}`}
                  onClick={() => setPreviewTab('overview')}
                  role="tab"
                  aria-selected={previewTab === 'overview'}
                  aria-controls="preview-panel-overview"
                >
                  <BarChart2 size={13} />
                  <span>Overview</span>
                </button>
              </div>

              <div>
                <button
                  type="button"
                  className="btn-builder-secondary"
                  onClick={() => setShowPreview(false)}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', padding: '4px 10px' }}
                >
                  <ArrowLeft size={13} />
                  <span>Back to Edit</span>
                </button>
              </div>
            </div>

            <div className="module-builder-preview-canvas" role="region" aria-label="Preview Content">
              {/* ================= 1. BOARD PREVIEW ================= */}
              {previewTab === 'board' && (
                <div id="preview-panel-board" role="tabpanel" aria-labelledby="preview-tab-board">
                  {statuses.length === 0 ? (
                    <div className="preview-empty-state">
                      <p>No pipeline stages configured yet. Add stages in Step 1 to preview your Kanban board.</p>
                    </div>
                  ) : (
                    <div className="preview-board-columns" role="list" aria-label="Kanban columns">
                      {statuses.map((st) => {
                        const colRecords = sampleRecords.filter(r => r.statusKey === st.key);
                        return (
                          <div key={st.key} className="preview-board-col" role="listitem">
                            <div className="preview-board-col-header">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: st.color, display: 'inline-block' }} />
                                <span style={{ color: 'var(--text)' }}>{st.label}</span>
                              </div>
                              <span style={{
                                fontSize: '0.72rem',
                                background: 'var(--input)',
                                padding: '2px 7px',
                                borderRadius: '10px',
                                color: 'var(--muted)',
                                border: '1px solid var(--border)',
                              }}>
                                {colRecords.length}
                              </span>
                            </div>

                            <div className="preview-board-col-cards">
                              {colRecords.length === 0 ? (
                                <div style={{
                                  padding: '1.25rem 0.5rem',
                                  textAlign: 'center',
                                  color: 'var(--muted)',
                                  fontSize: '0.74rem',
                                  border: '1px dashed var(--border)',
                                  borderRadius: '6px',
                                }}>
                                  No items in {st.label}
                                </div>
                              ) : (
                                colRecords.map((card) => (
                                  <div key={card.id} className="preview-mock-card">
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: color || 'var(--gold)' }}>
                                        {card.id}
                                      </span>
                                      <span className="preview-sample-badge">
                                        Sample
                                      </span>
                                    </div>

                                    <div className="preview-mock-card-title">
                                      {card.title}
                                    </div>

                                    {/* Configured Board Fields */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                                      {boardFields.map(fKey => {
                                        if (fKey === 'priority') {
                                          return (
                                            <div key={fKey} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                              <span className={`preview-priority-badge ${card.priority}`}>
                                                {card.priority}
                                              </span>
                                            </div>
                                          );
                                        }
                                        if (fKey === 'assignedTo') {
                                          return (
                                            <span key={fKey} className="preview-card-chip">
                                              <User size={11} /> {card.user}
                                            </span>
                                          );
                                        }
                                        if (fKey === 'deadline') {
                                          return (
                                            <span key={fKey} className="preview-card-chip">
                                              <Clock size={11} /> {card.values.deadline}
                                            </span>
                                          );
                                        }
                                        if (fKey === 'startDate') {
                                          return (
                                            <span key={fKey} className="preview-card-chip">
                                              <Calendar size={11} /> {card.values.startDate}
                                            </span>
                                          );
                                        }
                                        if (fKey === 'deliveredAt') {
                                          return (
                                            <span key={fKey} className="preview-card-chip">
                                              <CheckCircle2 size={11} /> {card.values.deliveredAt}
                                            </span>
                                          );
                                        }
                                        if (fKey === 'customer') {
                                          return (
                                            <span key={fKey} className="preview-card-chip">
                                              <Building2 size={11} /> {card.values.customer}
                                            </span>
                                          );
                                        }
                                        if (fKey.startsWith('custom:')) {
                                          const customKey = fKey.replace('custom:', '');
                                          const customF = fields.find(f => f.key === customKey);
                                          const customVal = card.values[fKey];
                                          if (!customVal) return null;
                                          return (
                                            <div key={fKey} className="preview-card-custom-field">
                                              <b>{fieldLabels[fKey] || customF?.label || customKey}:</b>
                                              <span>{customVal}</span>
                                            </div>
                                          );
                                        }
                                        return null;
                                      })}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ================= 2. FORM & RECORD PREVIEW ================= */}
              {previewTab === 'form' && (
                <div id="preview-panel-form" role="tabpanel" aria-labelledby="preview-tab-form" className="preview-form-container">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: color || 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                      <Icon name={icon || 'clipboard-list'} size={18} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 750, color: 'var(--text)' }}>
                        Create New {name || 'Record'}
                      </h3>
                      <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)' }}>
                        Interactive preview of the record entry form.
                      </p>
                    </div>
                  </div>

                  <div className="preview-form-grid">
                    {/* Record Title */}
                    <div className="preview-form-field full-width">
                      <label>
                        {fieldLabels['title'] || 'Record Title'} <span style={{ color: 'var(--red, #ef4444)' }}>*</span>
                      </label>
                      <input type="text" placeholder={`Enter ${name || 'record'} title…`} readOnly />
                    </div>

                    {/* Stage / Status */}
                    <div className="preview-form-field">
                      <label>{fieldLabels['status'] || 'Stage / Status'}</label>
                      <select defaultValue={statuses[0]?.key} disabled>
                        {statuses.map(s => (
                          <option key={s.key} value={s.key}>{s.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Priority (if configured) */}
                    {(boardFields.includes('priority') || filterFields.includes('priority') || listColumns.includes('priority')) && (
                      <div className="preview-form-field">
                        <label>{fieldLabels['priority'] || 'Priority'}</label>
                        <select defaultValue="normal" disabled>
                          <option value="low">Low</option>
                          <option value="normal">Normal</option>
                          <option value="high">High</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </div>
                    )}

                    {/* Assigned To (if configured) */}
                    {(boardFields.includes('assignedTo') || filterFields.includes('assignedTo') || listColumns.includes('assignedTo')) && (
                      <div className="preview-form-field">
                        <label>{fieldLabels['assignedTo'] || 'Assigned To'}</label>
                        <select disabled>
                          <option>Alex Carter (You)</option>
                          <option>Priya Sharma</option>
                          <option>David Miller</option>
                        </select>
                      </div>
                    )}

                    {/* Deadline (if configured) */}
                    {(boardFields.includes('deadline') || listColumns.includes('deadline')) && (
                      <div className="preview-form-field">
                        <label>{fieldLabels['deadline'] || 'Due Date / Deadline'}</label>
                        <input type="date" disabled defaultValue={new Date().toISOString().split('T')[0]} />
                      </div>
                    )}

                    {/* Customer / Client (if configured) */}
                    {(boardFields.includes('customer') || listColumns.includes('customer')) && (
                      <div className="preview-form-field">
                        <label>{fieldLabels['customer'] || 'Client / Customer'}</label>
                        <input type="text" placeholder="e.g. Acme Corp" readOnly />
                      </div>
                    )}

                    {/* Custom Fields Section */}
                    {fields.length > 0 && (
                      <div className="preview-form-field full-width" style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.85rem' }}>
                        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.84rem', fontWeight: 750, color: 'var(--gold, #ea580c)' }}>
                          Custom Fields ({fields.length})
                        </h4>
                      </div>
                    )}

                    {fields.map(f => (
                      <div key={f.key} className={`preview-form-field ${f.type === 'textarea' ? 'full-width' : ''}`}>
                        <label>
                          {fieldLabels[`custom:${f.key}`] || f.label || f.key}
                          {f.required && <span style={{ color: 'var(--red, #ef4444)', marginLeft: '3px' }}>*</span>}
                          <small style={{ color: 'var(--muted)', marginLeft: '6px', fontWeight: 500 }}>({f.type})</small>
                        </label>

                        {f.type === 'textarea' ? (
                          <textarea rows={3} placeholder={f.placeholder || `Enter ${f.label}…`} readOnly />
                        ) : f.type === 'select' || f.type === 'multi-select' ? (
                          <select disabled>
                            <option value="">{f.placeholder || `Select ${f.label}…`}</option>
                            {f.options.map((opt, i) => (
                              <option key={i} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : f.type === 'checkbox' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '6px' }}>
                            <input type="checkbox" disabled style={{ width: '16px', height: '16px' }} />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text)' }}>{f.placeholder || f.label}</span>
                          </div>
                        ) : f.type === 'number' || f.type === 'currency' || f.type === 'percentage' ? (
                          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            {f.type === 'currency' && (
                              <span style={{ position: 'absolute', left: '10px', color: 'var(--muted)', fontSize: '0.82rem', fontWeight: 700 }}>₹</span>
                            )}
                            <input
                              type="number"
                              placeholder={f.placeholder || (f.type === 'currency' ? '0.00' : '0')}
                              style={{ paddingLeft: f.type === 'currency' ? '24px' : undefined }}
                              readOnly
                            />
                            {f.type === 'percentage' && (
                              <span style={{ position: 'absolute', right: '10px', color: 'var(--muted)', fontSize: '0.82rem', fontWeight: 700 }}>%</span>
                            )}
                          </div>
                        ) : f.type === 'date' || f.type === 'datetime' ? (
                          <input type={f.type === 'datetime' ? 'datetime-local' : 'date'} disabled />
                        ) : f.type === 'user-picker' ? (
                          <select disabled>
                            <option>Alex Carter (You)</option>
                            <option>Priya Sharma</option>
                            <option>David Miller</option>
                          </select>
                        ) : (
                          <input type={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'text'} placeholder={f.placeholder || `Enter ${f.label}…`} readOnly />
                        )}

                        {f.helpText && (
                          <small className="preview-field-help">
                            {f.helpText}
                          </small>
                        )}
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                    <button type="button" className="btn-builder-secondary" disabled>Cancel</button>
                    <button type="button" className="btn-builder-primary" style={{ background: color, borderColor: color }} disabled>
                      Create {name || 'Record'}
                    </button>
                  </div>
                </div>
              )}

              {/* ================= 3. TABLE VIEW PREVIEW ================= */}
              {previewTab === 'table' && (
                <div id="preview-panel-table" role="tabpanel" aria-labelledby="preview-tab-table" className="preview-table-container">
                  <table className="preview-table">
                    <thead>
                      <tr>
                        {listColumns.map(colKey => {
                          const attr = allAttributes.find(a => a.key === colKey);
                          return (
                            <th key={colKey}>
                              {fieldLabels[colKey] || attr?.label || colKey}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {sampleRecords.map((rec) => (
                        <tr key={rec.id}>
                          {listColumns.map(colKey => {
                            if (colKey === 'title') {
                              return (
                                <td key={colKey}>
                                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                                    {rec.title}
                                  </span>
                                </td>
                              );
                            }
                            if (colKey === 'status') {
                              return (
                                <td key={colKey}>
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    background: `color-mix(in srgb, ${rec.statusColor} 18%, transparent)`,
                                    color: rec.statusColor,
                                  }}>
                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: rec.statusColor }} />
                                    {rec.statusLabel}
                                  </span>
                                </td>
                              );
                            }
                            if (colKey === 'priority') {
                              return (
                                <td key={colKey}>
                                  <span className={`preview-priority-badge ${rec.priority}`}>
                                    {rec.priority}
                                  </span>
                                </td>
                              );
                            }
                            if (colKey === 'assignedTo') {
                              return (
                                <td key={colKey}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <User size={12} style={{ color: 'var(--muted)' }} />
                                    {rec.user}
                                  </span>
                                </td>
                              );
                            }
                            if (colKey === 'deadline') {
                              return (
                                <td key={colKey} style={{ color: 'var(--muted)' }}>
                                  {rec.values.deadline}
                                </td>
                              );
                            }
                            return (
                              <td key={colKey}>
                                {rec.values[colKey] !== undefined ? (
                                  String(rec.values[colKey])
                                ) : (
                                  <span style={{ color: 'var(--muted)' }}>—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ================= 4. OVERVIEW PREVIEW ================= */}
              {previewTab === 'overview' && (
                <div id="preview-panel-overview" role="tabpanel" aria-labelledby="preview-tab-overview" className="preview-overview-container">
                  <div className="preview-stat-grid">
                    <div className="preview-stat-card">
                      <div className="preview-stat-card-label">Pipeline Stages</div>
                      <div className="preview-stat-card-value" style={{ color: color || 'var(--gold)' }}>
                        {statuses.length}
                      </div>
                      <div className="preview-stat-card-sub">
                        {statuses.map(s => s.label).slice(0, 3).join(', ')}{statuses.length > 3 ? '…' : ''}
                      </div>
                    </div>

                    <div className="preview-stat-card">
                      <div className="preview-stat-card-label">Custom Fields</div>
                      <div className="preview-stat-card-value">
                        {fields.length}
                      </div>
                      <div className="preview-stat-card-sub">
                        {fields.filter(f => f.required).length} marked required
                      </div>
                    </div>

                    <div className="preview-stat-card">
                      <div className="preview-stat-card-label">Active Views</div>
                      <div className="preview-stat-card-value" style={{ color: 'var(--blue, #3b82f6)' }}>
                        {enabledViews.length}
                      </div>
                      <div className="preview-stat-card-sub">
                        Default: {defaultView.toUpperCase()}
                      </div>
                    </div>

                    <div className="preview-stat-card">
                      <div className="preview-stat-card-label">Target Won Stage</div>
                      <div className="preview-stat-card-value" style={{ color: 'var(--green, #10b981)' }}>
                        {statuses.find(s => s.isTerminalWon)?.label || statuses[statuses.length - 1]?.label || 'None'}
                      </div>
                      <div className="preview-stat-card-sub">
                        Completion milestone
                      </div>
                    </div>
                  </div>

                  {/* Stage Distribution */}
                  <div className="preview-distribution-card">
                    <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 750, color: 'var(--text)' }}>
                      Pipeline Stage Distribution
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {statuses.length === 0 ? (
                        <div className="preview-empty-state">No stages defined.</div>
                      ) : (
                        statuses.map((st, i) => {
                          const pct = Math.round(100 / statuses.length);
                          return (
                            <div key={st.key || i} className="preview-distribution-row">
                              <div className="preview-distribution-header">
                                <span style={{ fontWeight: 650, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: st.color }} />
                                  {st.label}
                                </span>
                                <span style={{ color: 'var(--muted)' }}>{pct}%</span>
                              </div>
                              <div className="preview-distribution-track">
                                <div className="preview-distribution-fill" style={{ width: `${pct}%`, background: st.color }} />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Aggregation Settings Summary */}
                  <div className="preview-distribution-card">
                    <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 750, color: 'var(--text)' }}>
                      Overview Aggregations & Grouping
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.8rem' }}>
                      <div>
                        <strong style={{ color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Overview Group Fields</strong>
                        {overviewGroupFields.length === 0 ? (
                          <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>None configured</span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {overviewGroupFields.map(k => (
                              <span key={k} className="preview-sample-badge">{k.replace('custom:', '')}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <strong style={{ color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Progress Tracking Fields</strong>
                        {overviewProgressFields.length === 0 ? (
                          <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>None configured</span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {overviewProgressFields.map(k => (
                              <span key={k} className="preview-sample-badge">{k.replace('custom:', '')}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : (
          <>
            {/* 3-STEP TABS */}
            <nav className="module-builder-workspace-tabs" role="tablist" aria-label="Module Configuration Steps">
              <button
                type="button"
                id="step-tab-1"
                className={step === 1 ? 'active' : ''}
                onClick={() => setStep(1)}
                role="tab"
                aria-selected={step === 1}
                aria-controls="step-tabpanel-1"
              >
                <span>1</span>
                <b>Board stages</b>
                <small>Kanban columns</small>
              </button>

              <button
                type="button"
                id="step-tab-2"
                className={step === 2 ? 'active' : ''}
                onClick={() => setStep(2)}
                role="tab"
                aria-selected={step === 2}
                aria-controls="step-tabpanel-2"
              >
                <span>2</span>
                <b>Form fields</b>
                <small>Data your team enters</small>
              </button>

              <button
                type="button"
                id="step-tab-3"
                className={step === 3 ? 'active' : ''}
                onClick={() => setStep(3)}
                role="tab"
                aria-selected={step === 3}
                aria-controls="step-tabpanel-3"
              >
                <span>3</span>
                <b>Overview & views</b>
                <small>What each view shows</small>
              </button>
            </nav>

            {/* MODAL CONTENT BODY */}
            <div className="module-builder-content-wrap">
              {/* ================= STEP 1: BOARD STAGES ================= */}
              {step === 1 && (
                <div id="step-tabpanel-1" role="tabpanel" aria-labelledby="step-tab-1" className="module-builder-section-inner">
                  <div className="module-builder-section-head">
                    <h3>Overall record status</h3>
                    <button
                      type="button"
                      className="btn-builder-secondary"
                      onClick={addStatus}
                      aria-label="Add new pipeline stage"
                      style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Plus size={14} />
                      <span>Add stage</span>
                    </button>
                  </div>

                  <p>Drag to arrange or use arrow controls. These become columns on your Board.</p>

                  {/* Stage Flow Guide Pill */}
                  <div className="stage-flow-guide-bar" aria-label="Current stage progression flow">
                    <strong>Flow:</strong>
                    {statuses.map((st, i) => (
                      <React.Fragment key={i}>
                        <span style={{ color: st.color, fontWeight: 750, whiteSpace: 'nowrap' }}>{st.label || 'Stage'}</span>
                        {i < statuses.length - 1 && <i>→</i>}
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Status List Rows with Drag-and-Drop */}
                  <div className="module-builder-grid-rows" role="list" aria-label="Configured pipeline stages">
                    {statuses.map((st, idx) => (
                      <div
                        key={idx}
                        className={`module-builder-item-row status-builder-grid-row ${draggedStatusIdx === idx ? 'is-dragging' : ''} ${dragOverStatusIdx === idx ? 'is-drag-over' : ''}`}
                        role="listitem"
                        draggable
                        onDragStart={(e) => handleStatusDragStart(e, idx)}
                        onDragOver={(e) => handleStatusDragOver(e, idx)}
                        onDragEnd={() => { setDraggedStatusIdx(null); setDragOverStatusIdx(null); }}
                        onDrop={(e) => handleStatusDrop(e, idx)}
                      >
                        {/* Drag Handle */}
                        <div className="drag-handle-btn" title="Drag to reorder" aria-label="Drag to reorder stage">
                          <GripVertical size={15} />
                        </div>

                        {/* Stage Color Dot */}
                        <label className="status-color-circle-btn" title={`Change color for ${st.label}`} style={{ background: st.color }}>
                          <input
                            type="color"
                            value={st.color}
                            onChange={e => {
                              const next = [...statuses];
                              next[idx] = { ...next[idx], color: e.target.value };
                              setStatuses(next);
                            }}
                            aria-label={`Color for stage ${st.label}`}
                          />
                        </label>

                        {/* Stage Label */}
                        <input
                          type="text"
                          value={st.label}
                          placeholder="Stage label (e.g. In Progress)"
                          aria-label={`Label for stage ${idx + 1}`}
                          onChange={e => {
                            const next = [...statuses];
                            next[idx] = {
                              ...next[idx],
                              label: e.target.value,
                              key: isNew ? slugify(e.target.value) : next[idx].key || slugify(e.target.value),
                            };
                            setStatuses(next);
                          }}
                        />

                        {/* Won Flag */}
                        <label className="mini-check-label">
                          <input
                            type="checkbox"
                            checked={!!st.isTerminalWon}
                            onChange={e => {
                              const next = [...statuses];
                              next[idx] = { ...next[idx], isTerminalWon: e.target.checked, isTerminalLost: false };
                              setStatuses(next);
                            }}
                            aria-label={`Mark ${st.label} as Won / Completed stage`}
                          />
                          <span>Won / Completed</span>
                        </label>

                        {/* Lost Flag */}
                        <label className="mini-check-label">
                          <input
                            type="checkbox"
                            checked={!!st.isTerminalLost}
                            onChange={e => {
                              const next = [...statuses];
                              next[idx] = { ...next[idx], isTerminalLost: e.target.checked, isTerminalWon: false };
                              setStatuses(next);
                            }}
                            aria-label={`Mark ${st.label} as Lost / Cancelled stage`}
                          />
                          <span>Lost / Cancelled</span>
                        </label>

                        {/* Lock / Requires Approval Flag */}
                        <label className="mini-check-label">
                          <input
                            type="checkbox"
                            checked={!!st.requiresApproval}
                            onChange={e => {
                              const next = [...statuses];
                              next[idx] = { ...next[idx], requiresApproval: e.target.checked };
                              setStatuses(next);
                            }}
                            aria-label={`Lock ${st.label} - only managers can move it further`}
                          />
                          <span>Lock stage (Managers only)</span>
                        </label>

                        {/* Reorder & Delete */}
                        <div className="builder-row-btn-actions">
                          <button
                            type="button"
                            className="btn-move-row"
                            onClick={() => moveStatus(idx, -1)}
                            disabled={idx === 0}
                            title="Move stage up"
                            aria-label={`Move stage ${st.label} up`}
                          >
                            <ChevronUp size={13} />
                          </button>
                          <button
                            type="button"
                            className="btn-move-row"
                            onClick={() => moveStatus(idx, 1)}
                            disabled={idx === statuses.length - 1}
                            title="Move stage down"
                            aria-label={`Move stage ${st.label} down`}
                          >
                            <ChevronDown size={13} />
                          </button>
                          <button
                            type="button"
                            className="btn-delete-row"
                            onClick={() => setStatuses(statuses.filter((_, i) => i !== idx))}
                            disabled={statuses.length <= 1}
                            title="Remove stage"
                            aria-label={`Delete stage ${st.label}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ================= STEP 2: FORM FIELDS ================= */}
              {step === 2 && (
                <div id="step-tabpanel-2" role="tabpanel" aria-labelledby="step-tab-2" className="module-builder-section-inner">
                  <div className="module-builder-section-head">
                    <h3>Custom fields for this module</h3>
                    <button
                      type="button"
                      className="btn-builder-secondary"
                      onClick={addField}
                      aria-label="Add new custom field"
                      style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Plus size={14} />
                      <span>Add field</span>
                    </button>
                  </div>

                  <p>Drag to arrange or configure field types and options. These appear on your record forms.</p>

                  {fields.length === 0 ? (
                    <div className="preview-empty-state">
                      <p style={{ margin: '0 0 0.75rem' }}>No custom fields added yet.</p>
                      <button type="button" className="btn-builder-primary" onClick={addField}>
                        + Add first custom field
                      </button>
                    </div>
                  ) : (
                    <div className="module-builder-grid-rows" role="list" aria-label="Configured custom fields">
                      {fields.map((f, idx) => (
                        <div
                          key={idx}
                          className={`module-builder-item-row ${draggedFieldIdx === idx ? 'is-dragging' : ''} ${dragOverFieldIdx === idx ? 'is-drag-over' : ''}`}
                          style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
                          role="listitem"
                          draggable
                          onDragStart={(e) => handleFieldDragStart(e, idx)}
                          onDragOver={(e) => handleFieldDragOver(e, idx)}
                          onDragEnd={() => { setDraggedFieldIdx(null); setDragOverFieldIdx(null); }}
                          onDrop={(e) => handleFieldDrop(e, idx)}
                        >
                          <div className="field-builder-grid-row">
                            {/* Drag Handle */}
                            <div className="drag-handle-btn" title="Drag to reorder" aria-label="Drag to reorder field">
                              <GripVertical size={15} />
                            </div>

                            {/* Field Type Selector */}
                            <select
                              value={f.type}
                              onChange={e => {
                                const next = [...fields];
                                next[idx] = { ...next[idx], type: e.target.value };
                                setFields(next);
                              }}
                              aria-label={`Field type for ${f.label || 'field'}`}
                            >
                              {SUPPORTED_FIELD_TYPES.map(t => (
                                <option key={t.id} value={t.id}>{t.label}</option>
                              ))}
                            </select>

                            {/* Field Label */}
                            <input
                              type="text"
                              value={f.label}
                              placeholder="Field label (e.g. Design File URL)"
                              aria-label={`Label for field ${idx + 1}`}
                              onChange={e => {
                                const next = [...fields];
                                next[idx] = {
                                  ...next[idx],
                                  label: e.target.value,
                                  key: isNew ? slugify(e.target.value) : next[idx].key || slugify(e.target.value),
                                };
                                setFields(next);
                              }}
                            />

                            {/* Required Toggle */}
                            <label className="mini-check-label">
                              <input
                                type="checkbox"
                                checked={f.required}
                                onChange={e => {
                                  const next = [...fields];
                                  next[idx] = { ...next[idx], required: e.target.checked };
                                  setFields(next);
                                }}
                                aria-label={`Mark field ${f.label || 'field'} as required`}
                              />
                              <span>Required</span>
                            </label>

                            {/* Reorder & Delete Field */}
                            <div className="builder-row-btn-actions">
                              <button
                                type="button"
                                className="btn-move-row"
                                onClick={() => moveField(idx, -1)}
                                disabled={idx === 0}
                                title="Move field up"
                                aria-label={`Move field ${f.label} up`}
                              >
                                <ChevronUp size={13} />
                              </button>
                              <button
                                type="button"
                                className="btn-move-row"
                                onClick={() => moveField(idx, 1)}
                                disabled={idx === fields.length - 1}
                                title="Move field down"
                                aria-label={`Move field ${f.label} down`}
                              >
                                <ChevronDown size={13} />
                              </button>
                              <button
                                type="button"
                                className="btn-delete-row"
                                onClick={() => setFields(fields.filter((_, i) => i !== idx))}
                                title="Remove field"
                                aria-label={`Delete field ${f.label}`}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                          {/* Optional Dropdown Options editor */}
                          {['select', 'multi-select'].includes(f.type) && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', marginTop: '0.2rem', paddingLeft: '28px' }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--muted)', width: '80px', flexShrink: 0 }}>Options:</span>
                              <input
                                type="text"
                                value={(f.options || []).join(', ')}
                                placeholder="Option 1, Option 2, Option 3 (comma-separated)"
                                aria-label={`Options for ${f.label}`}
                                onChange={e => {
                                  const next = [...fields];
                                  next[idx] = {
                                    ...next[idx],
                                    options: e.target.value.split(',').map(o => o.trim()).filter(Boolean),
                                  };
                                  setFields(next);
                                }}
                                style={{ flex: 1 }}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ================= STEP 3: OVERVIEW & VIEWS ================= */}
              {step === 3 && (
                <div id="step-tabpanel-3" role="tabpanel" aria-labelledby="step-tab-3" className="module-builder-section-inner">
                  <div className="module-builder-section-head">
                    <h3>View Settings & Presentation</h3>
                  </div>

                  {/* 1. Enabled Views */}
                  <div style={{ padding: '1rem', background: 'var(--panel-muted)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                    <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.86rem', fontWeight: 750, color: 'var(--text)' }}>Enabled Views</h4>
                    <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Select the views available in this module's navigation.</p>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }} role="group" aria-label="Enabled views">
                      {[
                        { id: 'list', label: 'List Table' },
                        { id: 'board', label: 'Board (Kanban)' },
                        { id: 'calendar', label: 'Calendar' },
                      ].map(v => (
                        <label
                          key={v.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            background: enabledViews.includes(v.id) ? 'var(--gold-dim, rgba(234,88,12,0.18))' : 'var(--input)',
                            border: `1px solid ${enabledViews.includes(v.id) ? 'var(--gold)' : 'var(--border)'}`,
                            color: enabledViews.includes(v.id) ? 'var(--gold)' : 'var(--text)',
                            fontSize: '0.82rem',
                            fontWeight: 650,
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={enabledViews.includes(v.id)}
                            onChange={() => setEnabledViews(toggleArrayItem(enabledViews, v.id, 1))}
                            aria-label={`Enable ${v.label} view`}
                            style={{ display: 'none' }}
                          />
                          <span>{v.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 2. Grouping and Progress */}
                  <div style={{ padding: '1rem', background: 'var(--panel-muted)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                    <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.86rem', fontWeight: 750, color: 'var(--text)' }}>Overview & Aggregation</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div>
                        <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Overview Group Fields</label>
                        {selectFields.length === 0 ? (
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontStyle: 'italic' }}>No select/dropdown fields created in Step 2 yet.</div>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '4px' }}>
                            {selectFields.map(sf => (
                              <button
                                key={sf.key}
                                type="button"
                                className="btn-builder-secondary"
                                onClick={() => setOverviewGroupFields(toggleArrayItem(overviewGroupFields, `custom:${sf.key}`))}
                                aria-pressed={overviewGroupFields.includes(`custom:${sf.key}`)}
                                aria-label={`Toggle overview grouping by ${sf.label}`}
                                style={{
                                  background: overviewGroupFields.includes(`custom:${sf.key}`) ? 'var(--gold-dim, rgba(234,88,12,0.18))' : 'var(--input)',
                                  borderColor: overviewGroupFields.includes(`custom:${sf.key}`) ? 'var(--gold)' : 'var(--border)',
                                  color: overviewGroupFields.includes(`custom:${sf.key}`) ? 'var(--gold)' : 'var(--text)',
                                  fontSize: '0.75rem',
                                  padding: '3px 8px',
                                }}
                              >
                                {sf.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Overview Progress Tracking Fields</label>
                        {selectFields.length === 0 ? (
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontStyle: 'italic' }}>No select/dropdown fields created in Step 2 yet.</div>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '4px' }}>
                            {selectFields.map(sf => (
                              <button
                                key={sf.key}
                                type="button"
                                className="btn-builder-secondary"
                                onClick={() => setOverviewProgressFields(toggleArrayItem(overviewProgressFields, `custom:${sf.key}`))}
                                aria-pressed={overviewProgressFields.includes(`custom:${sf.key}`)}
                                aria-label={`Toggle progress tracking by ${sf.label}`}
                                style={{
                                  background: overviewProgressFields.includes(`custom:${sf.key}`) ? 'var(--gold-dim, rgba(234,88,12,0.18))' : 'var(--input)',
                                  borderColor: overviewProgressFields.includes(`custom:${sf.key}`) ? 'var(--gold)' : 'var(--border)',
                                  color: overviewProgressFields.includes(`custom:${sf.key}`) ? 'var(--gold)' : 'var(--text)',
                                  fontSize: '0.75rem',
                                  padding: '3px 8px',
                                }}
                              >
                                {sf.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 3. Table Columns & Board Cards */}
                  <div style={{
                    padding: '1rem',
                    background: 'var(--panel-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '1rem',
                  }}>
                    <div>
                      <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.86rem', fontWeight: 750, color: 'var(--text)' }}>List Columns</h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }} role="group" aria-label="Visible list columns">
                        {allAttributes.map(attr => (
                          <button
                            key={attr.key}
                            type="button"
                            className="btn-builder-secondary"
                            onClick={() => setListColumns(toggleArrayItem(listColumns, attr.key, 1))}
                            aria-pressed={listColumns.includes(attr.key)}
                            aria-label={`Toggle list column ${attr.label}`}
                            style={{
                              background: listColumns.includes(attr.key) ? 'var(--gold-dim, rgba(234,88,12,0.18))' : 'var(--input)',
                              borderColor: listColumns.includes(attr.key) ? 'var(--gold)' : 'var(--border)',
                              color: listColumns.includes(attr.key) ? 'var(--gold)' : 'var(--text)',
                              fontSize: '0.75rem',
                              padding: '3px 8px',
                            }}
                          >
                            {attr.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.86rem', fontWeight: 750, color: 'var(--text)' }}>Board Cards</h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }} role="group" aria-label="Visible board card fields">
                        {allAttributes.map(attr => (
                          <button
                            key={attr.key}
                            type="button"
                            className="btn-builder-secondary"
                            onClick={() => setBoardFields(toggleArrayItem(boardFields, attr.key))}
                            aria-pressed={boardFields.includes(attr.key)}
                            aria-label={`Toggle board card field ${attr.label}`}
                            style={{
                              background: boardFields.includes(attr.key) ? 'var(--gold-dim, rgba(234,88,12,0.18))' : 'var(--input)',
                              borderColor: boardFields.includes(attr.key) ? 'var(--gold)' : 'var(--border)',
                              color: boardFields.includes(attr.key) ? 'var(--gold)' : 'var(--text)',
                              fontSize: '0.75rem',
                              padding: '3px 8px',
                            }}
                          >
                            {attr.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* MODAL FOOTER */}
        <footer className="module-builder-dialog-footer">
          <div>
            {!isNew && (
              <button
                type="button"
                className="btn-builder-danger"
                onClick={() => setShowDeleteConfirm(true)}
                aria-label="Delete module"
              >
                Delete module
              </button>
            )}
          </div>

          <div className="module-builder-footer-nav-actions">
            {showPreview ? (
              <>
                <button
                  type="button"
                  className="btn-builder-secondary"
                  onClick={() => setShowPreview(false)}
                >
                  Back to editing
                </button>
                <button
                  type="button"
                  className="btn-builder-primary"
                  disabled={saving}
                  onClick={handleSave}
                >
                  {saving ? 'Saving…' : (isNew ? 'Create module' : 'Save changes')}
                </button>
              </>
            ) : (
              <>
                {step > 1 && (
                  <button
                    type="button"
                    className="btn-builder-secondary"
                    onClick={() => setStep((step - 1) as any)}
                  >
                    Previous
                  </button>
                )}

                {step < 3 ? (
                  <button
                    type="button"
                    className="btn-builder-primary"
                    onClick={() => setStep((step + 1) as any)}
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-builder-primary"
                    disabled={saving}
                    onClick={handleSave}
                  >
                    {saving ? 'Saving…' : (isNew ? 'Create module' : 'Save changes')}
                  </button>
                )}
              </>
            )}
          </div>
        </footer>
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Custom Module"
        message={`Are you sure you want to delete the "${name}" module? All records and workflow data for this module will be permanently removed.`}
        confirmText="Delete Module"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>,
    document.body
  );
}
