import { useState } from 'react';
import { settingsApi } from '../../api/settings';
import { WorkType, WorkTypeStatus } from '../../api/work';
import Icon from '../../components/Icons';

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

const FIELD_TYPES = ['text', 'textarea', 'number', 'currency', 'percentage', 'date', 'datetime', 'email', 'phone', 'select', 'checkbox', 'url', 'user-picker', 'company-picker', 'customer-picker', 'module-picker'];

const ICON_OPTIONS = ['clipboard-list', 'square-check-big', 'clapperboard', 'palette', 'globe', 'pen-line', 'check', 'users', 'building-2', 'megaphone', 'calendar', 'target', 'file-text', 'sparkles', 'mail', 'layout-grid'];

const VIEWS = ['overview', 'list', 'board', 'calendar'];

const CORE_FIELDS = ['title', 'assignedTo', 'collaborators', 'secondaryAssignee', 'relatedRecords', 'status', 'priority', 'deadline', 'startDate', 'deliveredAt', 'notes'];

function slugify(value: string) {
  return String(value || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const defaultStatuses: StatusDraft[] = [
  { key: 'open', label: 'Open', color: '#64748b' },
  { key: 'done', label: 'Done', color: '#16a34a', isTerminalWon: true },
];

export default function WorkTypeBuilder({ workType, onClose, onChanged }: Props) {
  const isNew = !workType;
  const [tab, setTab] = useState<'workflow' | 'fields' | 'display'>('workflow');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState(workType?.name || '');
  const [icon, setIcon] = useState(workType?.icon || 'clipboard-list');
  const [color, setColor] = useState(workType?.color || '#64748b');
  const [order, setOrder] = useState<number>(workType?.order || 0);
  const [key, setKey] = useState(workType?.key || '');
  const [isActive, setIsActive] = useState(workType?.isActive !== false);

  const [statuses, setStatuses] = useState<StatusDraft[]>(
    workType?.statuses?.length ? workType.statuses.map(s => ({ key: s.key, label: s.label, color: s.color || '#64748b', isTerminalWon: s.isTerminalWon, isTerminalLost: s.isTerminalLost })) : defaultStatuses
  );
  const [fields, setFields] = useState<FieldDraft[]>(
    workType?.fields?.length ? workType.fields.map(f => ({ key: f.key, label: f.label, type: f.type, options: f.options || [], required: !!f.required, placeholder: f.placeholder, group: f.group })) : []
  );

  const p = workType?.presentation || {};
  const [enabledViews, setEnabledViews] = useState<string[]>(p.enabledViews?.length ? p.enabledViews : ['list', 'board', 'calendar']);
  const [defaultView, setDefaultView] = useState(p.defaultView || 'list');
  const [calendarField, setCalendarField] = useState(p.calendarField || 'deadline');
  const [listColumns, setListColumns] = useState<string[]>(p.listColumns?.length ? p.listColumns : ['title', 'assignedTo', 'status', 'deadline']);
  const [boardFields, setBoardFields] = useState<string[]>(p.boardFields?.length ? p.boardFields : ['assignedTo', 'priority', 'deadline']);
  const [filterFields, setFilterFields] = useState<string[]>(p.filterFields?.length ? p.filterFields : ['status', 'assignedTo', 'priority']);
  const [overviewGroupFields, setOverviewGroupFields] = useState<string[]>(p.overviewGroupFields || []);
  const [overviewProgressFields, setOverviewProgressFields] = useState<string[]>(p.overviewProgressFields || []);
  const [overviewCompleteValue, setOverviewCompleteValue] = useState(p.overviewCompleteValue || 'Done');

  const customFieldKeys = fields.map(f => `custom:${f.key}`);
  const allSelectable = [...CORE_FIELDS, ...customFieldKeys];
  const dateFields = ['deadline', 'startDate', 'deliveredAt', ...fields.filter(f => ['date', 'datetime'].includes(f.type)).map(f => `custom:${f.key}`)];

  const fieldLabel = (keyName: string) => {
    const known: Record<string, string> = {
      title: 'Title', assignedTo: 'Owner', collaborators: 'Collaborators', secondaryAssignee: 'Secondary assignee',
      relatedRecords: 'Related records', status: 'Status', priority: 'Priority', deadline: 'Deadline',
      startDate: 'Start date', deliveredAt: 'Delivered at', notes: 'Notes',
    };
    if (known[keyName]) return known[keyName];
    if (keyName.startsWith('custom:')) {
      const f = fields.find(x => `custom:${x.key}` === keyName);
      return f ? f.label : keyName.replace('custom:', '');
    }
    return keyName;
  };

  function submit(method: 'create' | 'update') {
    return async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      setError('');
      const statusValue = statuses.map(({ key: k, label, color: c, isTerminalWon, isTerminalLost }) => ({ key: k, label, color: c, isTerminalWon, isTerminalLost }));
      const fieldValue = fields.map(({ key: k, label, type, options, required, placeholder, group, min, max }) => ({ key: k, label, type, options, required, placeholder, group, min, max: max ?? null }));
      const presentationValue = {
        enabledViews, defaultView, calendarField, listColumns, boardFields, filterFields,
        overviewGroupFields, overviewProgressFields, overviewCompleteValue,
        fieldLabels: {},
      };
      const payload = {
        name,
        key,
        icon,
        color,
        order,
        isActive: isActive ? 'on' : false,
        statuses: JSON.stringify(statusValue),
        fields: JSON.stringify(fieldValue),
        presentation: JSON.stringify(presentationValue),
      };
      try {
        if (method === 'create') {
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
  }

  async function handleDelete() {
    if (!workType) return;
    if (!window.confirm(`Delete module "${workType.name}" and all of its work records? This cannot be undone.`)) return;
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
    }
  }

  function addStatus() {
    setStatuses([...statuses, { key: '', label: '', color: '#64748b' }]);
  }
  function addField() {
    setFields([...fields, { key: '', label: '', type: 'text', options: [], required: false }]);
  }

  const inputStyle: React.CSSProperties = { height: 34, padding: '4px 10px', fontSize: '0.82rem', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)', width: '100%' };
  const errStyle: React.CSSProperties = { color: '#ef4444', fontSize: '.85rem', fontWeight: 600, margin: '0 1.5rem' };

  return (
    <div className="module-builder-dialog simple-dialog work-form-dialog" style={{ position: 'fixed', inset: 0, margin: 'auto', zIndex: 60, boxShadow: '0 24px 70px rgba(0,0,0,.35)' }}>
      <form className="work-type-builder" data-context-ready="true" onSubmit={e => e.preventDefault()}>
        <div className="modal-header module-builder-header" style={{ display: 'grid', gap: '1rem' }}>
          <div className="module-builder-title">
            <small>{isNew ? 'New sidebar module' : 'Customize module'}</small>
            <h2 style={{ margin: '.1rem 0' }}>{isNew ? 'Create work module' : workType?.name}</h2>
          </div>
          <section className="module-builder-basics" aria-label="Module identity">
            <label>
              <span>Icon</span>
              <span style={inputStyle as any}><Icon name={icon} size={18} /></span>
              <span className="sr-only" style={{ display: 'none' }} />
              <input type="hidden" value={icon} />
            </label>
            <label>
              Module name
              <input style={inputStyle} value={name} required placeholder="Module name" aria-label="Module name" onChange={e => { setName(e.target.value); if (isNew && !key) setKey(slugify(e.target.value)); }} />
            </label>
            <label>
              Color
              <input type="color" value={color} aria-label="Module color" style={{ height: 34, border: '1px solid var(--border)', borderRadius: 6, padding: 3, width: '100%' }} onChange={e => setColor(e.target.value)} />
            </label>
            <label>
              Sidebar order
              <input type="number" style={inputStyle} value={order} onChange={e => setOrder(Number(e.target.value) || 0)} />
            </label>
            <label className="wide">
              Stable URL key
              <input style={inputStyle} value={key} placeholder="created automatically" readOnly={!isNew} onChange={e => setKey(slugify(e.target.value))} />
            </label>
          </section>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {!isNew && (
              <label className="mini-check" style={{ display: 'inline-flex', gap: '.4rem', fontWeight: 650 }}>
                <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} /> Show in sidebar
              </label>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '.75rem', alignItems: 'center' }}>
              <select style={{ ...inputStyle, width: 'auto', height: 38 }} value={icon} onChange={e => setIcon(e.target.value)} aria-label="Icon">
                {ICON_OPTIONS.map(ic => (
                  <option key={ic} value={ic}>{ic.replace(/-/g, ' ')}</option>
                ))}
              </select>
              <button type="button" className="modal-close" onClick={onClose} aria-label="Close" style={{ fontSize: '1.4rem', background: 'transparent', border: 0, color: 'var(--muted)', cursor: 'pointer' }}>&times;</button>
            </div>
          </div>
        </div>

        {error && <div className="notice danger" style={errStyle}>{error}</div>}

        <div className="module-builder-workspace">
          <nav className="module-builder-tabs" aria-label="Module customization">
            <button className={tab === 'workflow' ? 'active' : ''} type="button" onClick={() => setTab('workflow')}><span>1</span><b>Board stages</b><small>Kanban columns</small></button>
            <button className={tab === 'fields' ? 'active' : ''} type="button" onClick={() => setTab('fields')}><span>2</span><b>Form fields</b><small>Data your team enters</small></button>
            <button className={tab === 'display' ? 'active' : ''} type="button" onClick={() => setTab('display')}><span>3</span><b>Overview & views</b><small>What each view shows</small></button>
          </nav>
          <main className="module-builder-content">

            {tab === 'workflow' && (
              <section className="module-builder-section" data-builder-panel="workflow">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <h3 style={{ margin: 0 }}>Overall record status</h3>
                  <span className="builder-heading-actions"><button className="btn small" type="button" onClick={addStatus}>+ Add stage</button></span>
                </div>
                <p>Arrange the journey from left to right. These stages become the columns on your Board.</p>
                <div className="module-builder-rows" data-status-rows style={{ marginTop: '1rem' }}>
                  {statuses.map((status, index) => (
                    <div className="module-builder-row status-builder-row" key={index}>
                      <input type="color" className="row-color" value={status.color} onChange={e => { const n = [...statuses]; n[index] = { ...n[index], color: e.target.value }; setStatuses(n); }} title="Stage color" />
                      <div style={{ display: 'grid', gap: '.35rem' }}>
                        <label style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--muted)' }}>Label</label>
                        <input type="text" value={status.label} required placeholder="e.g. In production" onChange={e => { const n = [...statuses]; n[index] = { ...n[index], label: e.target.value, key: slugify(e.target.value) || n[index].key }; setStatuses(n); }} />
                      </div>
                      <div style={{ display: 'grid', gap: '.35rem' }}>
                        <label style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--muted)' }}>Key</label>
                        <input type="text" value={status.key} readOnly placeholder="auto" style={{ opacity: .7 }} />
                      </div>
                      <div className="builder-row-actions">
                        <button type="button" className="btn small" disabled={index === 0} onClick={() => { const n = [...statuses]; [n[index - 1], n[index]] = [n[index], n[index - 1]]; setStatuses(n); }}>&uarr;</button>
                        <button type="button" className="btn small" disabled={index === statuses.length - 1} onClick={() => { const n = [...statuses]; [n[index + 1], n[index]] = [n[index], n[index + 1]]; setStatuses(n); }}>&darr;</button>
                        <button type="button" className="btn small danger" onClick={() => setStatuses(statuses.filter((_, i) => i !== index))}>&times;</button>
                      </div>
                      <div className="row-advanced-details">
                        <details>
                          <summary>Advanced</summary>
                          <div className="row-advanced">
                            <label className="mini-check"><input type="checkbox" checked={!!status.isTerminalWon} onChange={e => { const n = [...statuses]; n[index] = { ...n[index], isTerminalWon: e.target.checked, isTerminalLost: e.target.checked ? false : n[index].isTerminalLost }; setStatuses(n); }} /> Won deal</label>
                            <label className="mini-check"><input type="checkbox" checked={!!status.isTerminalLost} onChange={e => { const n = [...statuses]; n[index] = { ...n[index], isTerminalLost: e.target.checked, isTerminalWon: e.target.checked ? false : n[index].isTerminalWon }; setStatuses(n); }} /> Lost deal</label>
                          </div>
                        </details>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {tab === 'fields' && (
              <section className="module-builder-section" data-builder-panel="fields">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <h3 style={{ margin: 0 }}>Fields & names</h3>
                  <button className="btn small primary" type="button" onClick={addField}>+ Add custom field</button>
                </div>
                <p>Add fields for information unique to your workflow.</p>
                <h4 className="custom-fields-heading">Custom fields <small>Rename these directly below, or add another field</small></h4>
                <div className="module-builder-rows" data-field-rows style={{ marginTop: '1rem' }}>
                  {fields.map((field, index) => (
                    <div className="module-builder-row field-builder-row" key={index}>
                      <div style={{ display: 'grid', gap: '.35rem' }}>
                        <label style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--muted)' }}>Field name</label>
                        <input type="text" value={field.label} required placeholder="e.g. Video length" onChange={e => { const n = [...fields]; n[index] = { ...n[index], label: e.target.value, key: slugify(e.target.value) || n[index].key }; setFields(n); }} />
                      </div>
                      <div style={{ display: 'grid', gap: '.35rem' }}>
                        <label style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--muted)' }}>Type</label>
                        <select value={field.type} onChange={e => { const n = [...fields]; n[index] = { ...n[index], type: e.target.value }; setFields(n); }}>
                          {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="builder-row-actions">
                        <button type="button" className="btn small" disabled={index === 0} onClick={() => { const n = [...fields]; [n[index - 1], n[index]] = [n[index], n[index - 1]]; setFields(n); }}>&uarr;</button>
                        <button type="button" className="btn small" disabled={index === fields.length - 1} onClick={() => { const n = [...fields]; [n[index + 1], n[index]] = [n[index], n[index + 1]]; setFields(n); }}>&darr;</button>
                        <button type="button" className="btn small danger" onClick={() => setFields(fields.filter((_, i) => i !== index))}>&times;</button>
                      </div>
                      {field.type === 'select' && (
                        <div className="row-options-container">
                          <input type="text" placeholder="Options, comma-separated" value={field.options.join(', ')} onChange={e => { const n = [...fields]; n[index] = { ...n[index], options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }; setFields(n); }} />
                        </div>
                      )}
                      <div className="row-advanced-details">
                        <details>
                          <summary>Advanced</summary>
                          <div className="row-advanced">
                            <label className="mini-check"><input type="checkbox" checked={field.required} onChange={e => { const n = [...fields]; n[index] = { ...n[index], required: e.target.checked }; setFields(n); }} /> Required</label>
                            <label style={{ display: 'grid', gap: '.2rem', fontSize: '.7rem' }}>Placeholder
                              <input type="text" value={field.placeholder || ''} onChange={e => { const n = [...fields]; n[index] = { ...n[index], placeholder: e.target.value }; setFields(n); }} />
                            </label>
                          </div>
                        </details>
                      </div>
                    </div>
                  ))}
                  {fields.length === 0 && <p style={{ color: 'var(--muted)' }}>No custom fields yet. Add the data your team needs to enter.</p>}
                </div>
              </section>
            )}

            {tab === 'display' && (
              <section className="module-builder-section" data-builder-panel="display">
                <h3 style={{ margin: 0 }}>Overview & display</h3>
                <p>Decide where records appear and what information teammates see in each view.</p>
                <div className="module-display-settings" style={{ display: 'grid', gap: '.75rem', marginTop: '1rem' }}>
                  <details className="module-display-card" open>
                    <summary><b>1. Choose available views</b><small>Turn views on, then choose which one opens first</small></summary>
                    <div className="module-display-card-body">
                      <div className="check-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
                        {VIEWS.map(view => (
                          <label className="mini-check" key={view} style={{ display: 'inline-flex', gap: '.4rem', fontWeight: 650 }}>
                            <input type="checkbox" checked={enabledViews.includes(view)} onChange={e => {
                              const on = e.target.checked;
                              let next = on ? [...new Set([...enabledViews, view])] : enabledViews.filter(v => v !== view);
                              if (next.length === 0) next = [view];
                              setEnabledViews(next);
                              if (!next.includes(defaultView)) setDefaultView(next[0]);
                            }} /> {view}
                          </label>
                        ))}
                      </div>
                      <div className="module-display-pair" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginTop: '.75rem' }}>
                        <label>Open by default<select style={inputStyle} value={defaultView} onChange={e => setDefaultView(e.target.value)}>{enabledViews.map(v => <option key={v} value={v}>{v}</option>)}</select></label>
                        <label>Calendar places records using<select style={inputStyle} value={calendarField} onChange={e => setCalendarField(e.target.value)}>{dateFields.map(df => <option key={df} value={df}>{fieldLabel(df)}</option>)}</select></label>
                      </div>
                    </div>
                  </details>

                  <details className="module-display-card" open>
                    <summary><b>2. List view</b><small>Columns shown in the table</small></summary>
                    <div className="module-display-card-body">
                      <div className="check-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem', paddingTop: '.5rem' }}>
                        {allSelectable.map(name => (
                          <label className="mini-check" key={name} style={{ display: 'inline-flex', gap: '.4rem', fontWeight: 650 }}>
                            <input type="checkbox" checked={listColumns.includes(name)} onChange={e => setListColumns(e.target.checked ? [...listColumns, name] : listColumns.filter(x => x !== name))} /> {fieldLabel(name)}
                          </label>
                        ))}
                      </div>
                    </div>
                  </details>

                  <details className="module-display-card">
                    <summary><b>3. Board cards</b><small>Details shown on Kanban cards</small></summary>
                    <div className="module-display-card-body">
                      <div className="check-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem', paddingTop: '.5rem' }}>
                        {allSelectable.filter(name => name !== 'status').map(name => (
                          <label className="mini-check" key={name} style={{ display: 'inline-flex', gap: '.4rem', fontWeight: 650 }}>
                            <input type="checkbox" checked={boardFields.includes(name)} onChange={e => setBoardFields(e.target.checked ? [...boardFields, name] : boardFields.filter(x => x !== name))} /> {fieldLabel(name)}
                          </label>
                        ))}
                      </div>
                    </div>
                  </details>

                  <details className="module-display-card">
                    <summary><b>4. Filters</b><small>Ways your team can narrow records</small></summary>
                    <div className="module-display-card-body">
                      <div className="check-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem', paddingTop: '.5rem' }}>
                        {allSelectable.map(name => (
                          <label className="mini-check" key={name} style={{ display: 'inline-flex', gap: '.4rem', fontWeight: 650 }}>
                            <input type="checkbox" checked={filterFields.includes(name)} onChange={e => setFilterFields(e.target.checked ? [...filterFields, name] : filterFields.filter(x => x !== name))} /> {fieldLabel(name)}
                          </label>
                        ))}
                      </div>
                    </div>
                  </details>

                  <details className="module-display-card">
                    <summary><b>5. Overview</b><small>Group records into sections and show step-by-step progress</small></summary>
                    <div className="module-display-card-body">
                      <div className="overview-config-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                          <b>Group records into sections</b>
                          <div className="check-grid" style={{ display: 'grid', gap: '.4rem', paddingTop: '.5rem' }}>
                            {allSelectable.filter(name => !name.startsWith('custom:')).map(name => (
                              <label className="mini-check" key={name} style={{ display: 'inline-flex', gap: '.4rem', fontWeight: 650 }}>
                                <input type="checkbox" checked={overviewGroupFields.includes(name)} onChange={e => setOverviewGroupFields(e.target.checked ? [...overviewGroupFields, name] : overviewGroupFields.filter(x => x !== name))} /> {fieldLabel(name)}
                              </label>
                            ))}
                          </div>
                        </div>
                        <div>
                          <b>Show step-by-step progress</b>
                          <div className="check-grid" style={{ display: 'grid', gap: '.4rem', paddingTop: '.5rem' }}>
                            {fields.filter(f => f.type === 'select').map(f => {
                              const name = `custom:${f.key}`;
                              return (
                                <label className="mini-check" key={name} style={{ display: 'inline-flex', gap: '.4rem', fontWeight: 650 }}>
                                  <input type="checkbox" checked={overviewProgressFields.includes(name)} onChange={e => setOverviewProgressFields(e.target.checked ? [...overviewProgressFields, name] : overviewProgressFields.filter(x => x !== name))} /> {f.label}
                                </label>
                              );
                            })}
                          </div>
                          <label style={{ display: 'grid', gap: '.3rem', marginTop: '.75rem', fontSize: '.72rem' }}>Dropdown value that means complete
                            <input style={inputStyle} value={overviewCompleteValue} placeholder="Done" onChange={e => setOverviewCompleteValue(e.target.value)} />
                          </label>
                        </div>
                      </div>
                    </div>
                  </details>
                </div>
              </section>
            )}

          </main>
        </div>

        <div className="form-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
          {!isNew ? <button className="btn danger" type="button" onClick={() => void handleDelete()} disabled={saving}>Delete</button> : <span />}
          <span className="module-builder-nav-actions" style={{ display: 'flex', gap: '.5rem', marginLeft: 'auto' }}>
            <button className="btn" type="button" onClick={() => setTab(tab === 'workflow' ? 'workflow' : tab === 'fields' ? 'workflow' : 'fields')}>{tab !== 'workflow' ? 'Previous' : ''}</button>
            {tab !== 'display'
              ? <button className="btn primary" type="button" onClick={() => setTab(tab === 'workflow' ? 'fields' : 'display')}>Next</button>
              : <button className="btn primary" type="button" disabled={saving} onClick={submit(isNew ? 'create' : 'update')}>{saving ? 'Saving…' : isNew ? 'Create module' : 'Save changes'}</button>}
          </span>
        </div>
      </form>
    </div>
  );
}
