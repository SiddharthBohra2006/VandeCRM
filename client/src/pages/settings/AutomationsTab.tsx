import { useEffect, useState } from 'react';
import { settingsApi, AutomationRule } from '../../api/settings';
import { Stage, Label } from '../../types';
import { WorkType } from '../../api/work';

interface Props {
  stages: Stage[];
  labels: Label[];
  workTypes: WorkType[];
  users: { _id: string; name: string; role: string }[];
  automations: AutomationRule[];
  leadSingular: string;
  onChanged: () => void;
}

const inputStyle: React.CSSProperties = { height: 38, padding: '4px 10px', fontSize: '0.82rem', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)', width: '100%' };

function RuleCard({ rule, users, labels, workTypes, stages, leadSingular, onToggle, onDelete }: {
  rule: AutomationRule;
  users: Props['users'];
  labels: Label[];
  workTypes: WorkType[];
  stages: Stage[];
  leadSingular: string;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const workTypeId = typeof rule.workType === 'string' ? rule.workType : rule.workType?._id;
  const stageId = typeof rule.stage === 'string' ? rule.stage : rule.stage?._id;
  const wt = workTypes.find(w => w._id === workTypeId);
  const userName = users.find(u => u._id === rule.targetId)?.name;
  const labelName = labels.find(l => l._id === rule.targetId)?.name;
  const stageName = stages.find(s => s._id === stageId)?.name;
  const targetName = rule.action === 'assign_user' ? userName : labelName;

  const parts: string[] = [];
  parts.push(rule.entityType === 'module' ? `${wt?.name || 'Module'}` : `${leadSingular}`);
  parts.push(rule.trigger.replace(/_/g, ' '));
  if (rule.entityType === 'module' && rule.status) parts.push(rule.status.replace(/_/g, ' '));
  if (rule.entityType === 'lead' && stageId) parts.push(`at stage: ${stageName || '?'}`);
  if (rule.conditionField) parts.push(`${rule.conditionField.replace('custom:', '')} = ${rule.conditionValue || 'any'}`);
  parts.push(rule.action.replace(/_/g, ' '));
  if (targetName) parts.push(targetName);
  parts.push(`run ${rule.runCount || 0} time${(rule.runCount || 0) === 1 ? '' : 's'}`);

  return (
    <div className="module-card" style={{ '--module-color': 'var(--gold)' } as React.CSSProperties}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <strong>{rule.name}</strong>
          <small style={{ display: 'block' }}>{parts.join(' · ')}</small>
        </div>
        <span className="module-state" style={rule.isActive === false ? { background: 'var(--panel)', color: 'var(--muted)' } : undefined}>
          {rule.isActive === false ? 'Paused' : 'Active'}
        </span>
        <div className="actions" style={{ display: 'flex', gap: '.35rem' }}>
          <button className="btn small" type="button" onClick={onToggle}>{rule.isActive === false ? 'Enable' : 'Pause'}</button>
          <button className="btn small danger" type="button" onClick={onDelete}>Delete</button>
        </div>
      </div>
    </div>
  );
}

export default function AutomationsTab({ stages, labels, workTypes, users, automations, leadSingular, onChanged }: Props) {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  // Lead form
  const [leadName, setLeadName] = useState('');
  const [leadTrigger, setLeadTrigger] = useState('lead_created');
  const [leadStage, setLeadStage] = useState('');
  const [leadCondField, setLeadCondField] = useState('');
  const [leadCondValue, setLeadCondValue] = useState('');
  const [leadAction, setLeadAction] = useState('assign_user');
  const [leadTargetUser, setLeadTargetUser] = useState('');
  const [leadTargetLabel, setLeadTargetLabel] = useState('');
  const [leadTargetWorkType, setLeadTargetWorkType] = useState('');
  const [leadPriority, setLeadPriority] = useState('high');

  // Module form
  const [modName, setModName] = useState('');
  const [modWorkType, setModWorkType] = useState('');
  const [modTrigger, setModTrigger] = useState('record_created');
  const [modStatus, setModStatus] = useState('');
  const [modCondField, setModCondField] = useState('');
  const [modCondValue, setModCondValue] = useState('');
  const [modAction, setModAction] = useState('assign_user');
  const [modTargetUser, setModTargetUser] = useState('');
  const [modPriority, setModPriority] = useState('high');
  const [modTargetStatus, setModTargetStatus] = useState('');
  const [modActionField, setModActionField] = useState('');
  const [modFieldValue, setModFieldValue] = useState('');

  useEffect(() => {
    const first = workTypes[0];
    if (first) {
      setModWorkType(first._id);
      const firstStatus = first.statuses[0];
      if (firstStatus && !modStatus) setModStatus(firstStatus.key);
    }
  }, [workTypes]); // eslint-disable-line

  const activeWorkTypes = workTypes.filter(w => w.isActive !== false);
  const selectedMod = activeWorkTypes.find(w => w._id === modWorkType);

  function resetLead() {
    setLeadName(''); setLeadStage(''); setLeadCondField(''); setLeadCondValue('');
    setLeadTargetUser(''); setLeadTargetLabel(''); setLeadTargetWorkType(''); setLeadPriority('high');
  }
  function resetMod() {
    setModName(''); setModStatus(''); setModCondField(''); setModCondValue('');
    setModTargetUser(''); setModPriority('high'); setModTargetStatus(''); setModActionField(''); setModFieldValue('');
  }

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setSuccess('');
    const payload: Record<string, any> = {
      entityType: 'lead', name: leadName, trigger: leadTrigger, action: leadAction,
      conditionField: leadCondField, conditionValue: leadCondField ? leadCondValue : '',
    };
    if (leadTrigger === 'stage_changed' && leadStage) payload.stage = leadStage;
    if (leadAction === 'assign_user') payload.targetUserId = leadTargetUser;
    if (['add_label', 'remove_label'].includes(leadAction)) payload.targetLabelId = leadTargetLabel;
    if (leadAction === 'set_priority') payload.priority = leadPriority;
    if (leadAction === 'create_record') payload.targetWorkTypeId = leadTargetWorkType;
    try {
      await settingsApi.createAutomation(payload);
      setSuccess('Automation rule created.');
      resetLead();
      onChanged();
    } catch (err: any) {
      setError(err.message || 'Could not create rule');
    } finally {
      setBusy(false);
    }
  }

  async function submitModule(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setSuccess('');
    const payload: Record<string, any> = {
      entityType: 'module', name: modName, workType: modWorkType, trigger: modTrigger, action: modAction,
      conditionField: modCondField, conditionValue: modCondField ? modCondValue : '',
    };
    if (modTrigger === 'status_changed' && modStatus) payload.status = modStatus;
    if (modAction === 'assign_user') payload.targetUserId = modTargetUser;
    if (modAction === 'set_priority') payload.priority = modPriority;
    if (modAction === 'set_status') payload.targetStatus = modTargetStatus;
    if (modAction === 'set_field') { payload.actionField = modActionField; payload.fieldValue = modFieldValue; }
    try {
      await settingsApi.createAutomation(payload);
      setSuccess('Module automation created.');
      resetMod();
      onChanged();
    } catch (err: any) {
      setError(err.message || 'Could not create module rule');
    } finally {
      setBusy(false);
    }
  }

  async function toggleRule(id: string) {
    try { await settingsApi.toggleAutomation(id); onChanged(); } catch (err: any) { setError(err.message || 'Could not update rule'); }
  }
  async function deleteRule(id: string) {
    if (!window.confirm('Delete this automation rule?')) return;
    try { await settingsApi.deleteAutomation(id); onChanged(); } catch (err: any) { setError(err.message || 'Could not delete rule'); }
  }

  return (
    <div>
      {error && <div className="notice danger" style={{ margin: '0 0 1rem', color: '#ef4444' }}>{error}</div>}
      {success && <div className="notice success" style={{ margin: '0 0 1rem', color: '#16a34a' }}>{success}</div>}

      <div className="module-settings-head" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div>
          <h3 style={{ margin: 0 }}>Lead pipeline</h3>
          <p className="page-subtitle" style={{ margin: '.3rem 0 0', color: 'var(--muted)' }}>Automate {leadSingular.toLowerCase()}s as they move through your pipeline.</p>
        </div>
      </div>
      <form onSubmit={submitLead} className="automation-form">
        <label>Rule name<input style={inputStyle} value={leadName} required placeholder="e.g. Assign new leads" onChange={e => setLeadName(e.target.value)} /></label>
        <label>When
          <select style={inputStyle} value={leadTrigger} onChange={e => setLeadTrigger(e.target.value)}>
            <option value="lead_created">A {leadSingular.toLowerCase()} is created</option>
            <option value="stage_changed">A stage changes</option>
            <option value="owner_changed">The owner changes</option>
          </select>
        </label>
        {leadTrigger === 'stage_changed' && (
          <label>At stage<select style={inputStyle} value={leadStage} onChange={e => setLeadStage(e.target.value)}><option value="">Any stage</option>{stages.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select></label>
        )}
        <label>Only when<select style={inputStyle} value={leadCondField} onChange={e => setLeadCondField(e.target.value)}><option value="">No extra condition</option><option value="source">Source matches</option><option value="priority">Priority matches</option></select></label>
        {leadCondField && <label>Condition value<input style={inputStyle} value={leadCondValue} placeholder={leadCondField === 'source' ? 'e.g. website' : 'high'} onChange={e => setLeadCondValue(e.target.value)} /></label>}
        <label>Then<select style={inputStyle} value={leadAction} onChange={e => setLeadAction(e.target.value)}><option value="assign_user">Assign to team member</option><option value="add_label">Add tag</option><option value="remove_label">Remove tag</option><option value="set_priority">Set priority</option><option value="create_record">Create record in module</option></select></label>
        {leadAction === 'assign_user' && <label>Assign to<select style={inputStyle} value={leadTargetUser} onChange={e => setLeadTargetUser(e.target.value)}><option value="">Choose…</option>{users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}</select></label>}
        {['add_label', 'remove_label'].includes(leadAction) && <label>Choose tag<select style={inputStyle} value={leadTargetLabel} onChange={e => setLeadTargetLabel(e.target.value)}><option value="">Choose…</option>{labels.map(l => <option key={l._id} value={l._id}>{l.name}</option>)}</select></label>}
        {leadAction === 'set_priority' && <label>Set priority<select style={inputStyle} value={leadPriority} onChange={e => setLeadPriority(e.target.value)}><option value="high">High priority</option><option value="medium">Medium priority</option><option value="low">Low priority</option></select></label>}
        {leadAction === 'create_record' && <label>Choose module<select style={inputStyle} value={leadTargetWorkType} onChange={e => setLeadTargetWorkType(e.target.value)}><option value="">Choose…</option>{activeWorkTypes.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}</select></label>}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create rule'}</button>
      </form>

      {activeWorkTypes.length > 0 && (
        <>
          <div className="module-settings-head" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' }}>
            <div>
              <h3 style={{ margin: 0 }}>Custom module</h3>
              <p className="page-subtitle" style={{ margin: '.3rem 0 0', color: 'var(--muted)' }}>Automate records in one of your custom business modules.</p>
            </div>
          </div>
          <form onSubmit={submitModule} className="automation-form">
            <label>Rule name<input style={inputStyle} value={modName} required placeholder="e.g. Notify on shortlist" onChange={e => setModName(e.target.value)} /></label>
            <label>Module<select style={inputStyle} value={modWorkType} onChange={e => { setModWorkType(e.target.value); const w = activeWorkTypes.find(x => x._id === e.target.value); if (w && w.statuses[0]) setModStatus(w.statuses[0].key); }}>
              {activeWorkTypes.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
            </select></label>
            <label>When<select style={inputStyle} value={modTrigger} onChange={e => setModTrigger(e.target.value)}><option value="record_created">A record is created</option><option value="status_changed">Its status changes</option><option value="owner_changed">Its owner changes</option></select></label>
            {modTrigger === 'status_changed' && (
              <label>At status<select style={inputStyle} value={modStatus} onChange={e => setModStatus(e.target.value)}><option value="">Any status</option>{selectedMod?.statuses.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
            )}
            <label>Only when<select style={inputStyle} value={modCondField} onChange={e => setModCondField(e.target.value)}><option value="">No extra condition</option><option value="title">Title matches</option><option value="status">Status matches</option><option value="priority">Priority matches</option>{selectedMod?.fields.map(f => <option key={f.key} value={`custom:${f.key}`}>{f.label} matches</option>)}</select></label>
            {modCondField && <label>Value to match<input style={inputStyle} value={modCondValue} onChange={e => setModCondValue(e.target.value)} /></label>}
            <label>Then<select style={inputStyle} value={modAction} onChange={e => setModAction(e.target.value)}><option value="assign_user">Assign to team member</option><option value="set_priority">Set priority</option><option value="set_status">Set status</option><option value="set_field">Set custom field</option></select></label>
            {modAction === 'assign_user' && <label>Assign to<select style={inputStyle} value={modTargetUser} onChange={e => setModTargetUser(e.target.value)}><option value="">Choose…</option>{users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}</select></label>}
            {modAction === 'set_priority' && <label>Set priority<select style={inputStyle} value={modPriority} onChange={e => setModPriority(e.target.value)}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>}
            {modAction === 'set_status' && <label>Set status<select style={inputStyle} value={modTargetStatus} onChange={e => setModTargetStatus(e.target.value)}><option value="">Choose…</option>{selectedMod?.statuses.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>}
            {modAction === 'set_field' && (
              <>
                <label>Custom field<select style={inputStyle} value={modActionField} onChange={e => setModActionField(e.target.value)}><option value="">Choose…</option>{selectedMod?.fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</select></label>
                <label>New value<input style={inputStyle} value={modFieldValue} placeholder="Value to set" onChange={e => setModFieldValue(e.target.value)} /></label>
              </>
            )}
            <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create module rule'}</button>
          </form>
        </>
      )}

      {automations.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h3 style={{ margin: '0 0 .75rem' }}>Existing rules ({automations.length})</h3>
          <div className="module-card-list">
            {automations.map(rule => (
              <RuleCard
                key={rule._id}
                rule={rule}
                users={users}
                labels={labels}
                stages={stages}
                workTypes={workTypes}
                leadSingular={leadSingular}
                onToggle={() => void toggleRule(rule._id)}
                onDelete={() => void deleteRule(rule._id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
