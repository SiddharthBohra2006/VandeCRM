import { useEffect, useState } from 'react';
import {
  Users, Package, Zap, Plus, ArrowRight, Lightbulb, ChevronUp, ChevronDown,
  UserPlus, Mail, ArrowRightLeft, Calendar, Trash2,
  CheckCircle2, X, Sparkles
} from 'lucide-react';
import { settingsApi, AutomationRule } from '../../api/settings';
import { Stage, Label } from '../../types';
import { WorkType } from '../../api/work';
import ConfirmDialog from '../../components/ConfirmDialog';
import '../../styles/settings/automations-customization.css';

interface Props {
  stages: Stage[];
  labels: Label[];
  workTypes: WorkType[];
  users: { _id: string; name: string; role: string }[];
  automations: AutomationRule[];
  leadSingular: string;
  onChanged: () => void;
}

export default function AutomationsTab({
  stages,
  labels,
  workTypes,
  users,
  automations,
  leadSingular,
  onChanged
}: Props) {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  // Collapse / Expand cards
  const [leadCardOpen, setLeadCardOpen] = useState(true);
  const [modCardOpen, setModCardOpen] = useState(true);

  // Examples modal state
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [exampleType, setExampleType] = useState<'lead' | 'module'>('lead');

  // Lead Pipeline Form
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

  // Custom Module Form
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

  const activeWorkTypes = workTypes.filter(w => w.isActive !== false);
  const selectedMod = activeWorkTypes.find(w => w._id === modWorkType);

  useEffect(() => {
    const first = activeWorkTypes[0];
    if (first && !modWorkType) {
      setModWorkType(first._id);
      const firstStatus = first.statuses[0];
      if (firstStatus && !modStatus) setModStatus(firstStatus.key);
    }
  }, [activeWorkTypes, modWorkType, modStatus]);

  function resetLead() {
    setLeadName('');
    setLeadStage('');
    setLeadCondField('');
    setLeadCondValue('');
    setLeadTargetUser('');
    setLeadTargetLabel('');
    setLeadTargetWorkType('');
    setLeadPriority('high');
  }

  function resetMod() {
    setModName('');
    setModStatus('');
    setModCondField('');
    setModCondValue('');
    setModTargetUser('');
    setModPriority('high');
    setModTargetStatus('');
    setModActionField('');
    setModFieldValue('');
  }

  // Pre-fill templates
  function applyTemplate(type: 'assign' | 'email' | 'move' | 'followup') {
    if (type === 'assign') {
      setLeadName('Assign new leads');
      setLeadTrigger('lead_created');
      setLeadCondField('');
      setLeadAction('assign_user');
      if (users[0]) setLeadTargetUser(users[0]._id);
      setLeadCardOpen(true);
    } else if (type === 'email') {
      setLeadName('Send email notification');
      setLeadTrigger('lead_created');
      setLeadCondField('');
      setLeadAction('assign_user');
      setLeadCardOpen(true);
    } else if (type === 'move') {
      setLeadName('Move stage on qualification');
      setLeadTrigger('stage_changed');
      if (stages[0]) setLeadStage(stages[0]._id);
      setLeadAction('set_priority');
      setLeadPriority('high');
      setLeadCardOpen(true);
    } else if (type === 'followup') {
      setLeadName('Create follow-up task');
      setLeadTrigger('lead_created');
      setLeadAction('create_record');
      const taskMod = activeWorkTypes.find(w => w.name.toLowerCase().includes('task')) || activeWorkTypes[0];
      if (taskMod) setLeadTargetWorkType(taskMod._id);
      setLeadCardOpen(true);
    }
    setSuccess('Template loaded into rule builder.');
    document.getElementById('lead-pipeline-builder')?.scrollIntoView({ behavior: 'smooth' });
  }

  function applyRecipe(recipe: {
    type: 'lead' | 'module';
    name: string;
    trigger: string;
    stage?: string;
    condField?: string;
    condValue?: string;
    action: string;
    targetUser?: string;
    targetLabel?: string;
    targetWorkType?: string;
    priority?: string;
  }) {
    if (recipe.type === 'lead') {
      setLeadName(recipe.name);
      setLeadTrigger(recipe.trigger);
      setLeadStage(recipe.stage || '');
      setLeadCondField(recipe.condField || '');
      setLeadCondValue(recipe.condValue || '');
      setLeadAction(recipe.action);
      if (recipe.targetUser) setLeadTargetUser(recipe.targetUser);
      if (recipe.targetLabel) setLeadTargetLabel(recipe.targetLabel);
      if (recipe.targetWorkType) setLeadTargetWorkType(recipe.targetWorkType);
      if (recipe.priority) setLeadPriority(recipe.priority);
      setLeadCardOpen(true);
      document.getElementById('lead-pipeline-builder')?.scrollIntoView({ behavior: 'smooth' });
    }
    setExamplesOpen(false);
    setSuccess(`Recipe "${recipe.name}" loaded.`);
  }

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    if (!leadName.trim()) {
      setError('Please provide a rule name');
      return;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    const payload: Record<string, any> = {
      entityType: 'lead',
      name: leadName.trim(),
      trigger: leadTrigger,
      action: leadAction,
      conditionField: leadCondField,
      conditionValue: leadCondField ? leadCondValue : '',
    };
    if (leadTrigger === 'stage_changed' && leadStage) payload.stage = leadStage;
    if (leadAction === 'assign_user') payload.targetUserId = leadTargetUser || (users[0]?._id || '');
    if (['add_label', 'remove_label'].includes(leadAction)) payload.targetLabelId = leadTargetLabel || (labels[0]?._id || '');
    if (leadAction === 'set_priority') payload.priority = leadPriority;
    if (leadAction === 'create_record') payload.targetWorkTypeId = leadTargetWorkType || (activeWorkTypes[0]?._id || '');

    try {
      await settingsApi.createAutomation(payload);
      setSuccess('Pipeline automation rule created successfully.');
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
    if (!modName.trim()) {
      setError('Please provide a rule name');
      return;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    const payload: Record<string, any> = {
      entityType: 'module',
      name: modName.trim(),
      workType: modWorkType || activeWorkTypes[0]?._id,
      trigger: modTrigger,
      action: modAction,
      conditionField: modCondField,
      conditionValue: modCondField ? modCondValue : '',
    };
    if (modTrigger === 'status_changed' && modStatus) payload.status = modStatus;
    if (modAction === 'assign_user') payload.targetUserId = modTargetUser || (users[0]?._id || '');
    if (modAction === 'set_priority') payload.priority = modPriority;
    if (modAction === 'set_status') payload.targetStatus = modTargetStatus;
    if (modAction === 'set_field') {
      payload.actionField = modActionField;
      payload.fieldValue = modFieldValue;
    }
    try {
      await settingsApi.createAutomation(payload);
      setSuccess('Module automation rule created successfully.');
      resetMod();
      onChanged();
    } catch (err: any) {
      setError(err.message || 'Could not create module rule');
    } finally {
      setBusy(false);
    }
  }

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

  async function toggleRule(id: string) {
    try {
      await settingsApi.toggleAutomation(id);
      onChanged();
    } catch (err: any) {
      setError(err.message || 'Could not update rule');
    }
  }

  function deleteRule(id: string) {
    setConfirmState({
      open: true,
      title: 'Delete Automation Rule',
      message: 'Delete this automation rule? It will no longer trigger on future events.',
      action: async () => {
        try {
          await settingsApi.deleteAutomation(id);
          onChanged();
        } catch (err: any) {
          setError(err.message || 'Could not delete rule');
        } finally {
          setConfirmState(prev => ({ ...prev, open: false }));
        }
      },
    });
  }

  return (
    <div className="automations-manager-container">
      {error && <div className="notice danger" style={{ margin: '0 0 1rem', color: '#ef4444' }}>{error}</div>}
      {success && <div className="notice success" style={{ margin: '0 0 1rem', color: '#16a34a' }}>{success}</div>}

      {/* Card 1: Lead Pipeline Automation Builder */}
      <div className="auto-section-card" id="lead-pipeline-builder">
        <div className="auto-card-header">
          <div className="auto-header-left">
            <div className="auto-icon-badge lead">
              <Users size={18} />
            </div>
            <div className="auto-header-titles">
              <h3 className="auto-card-title">Lead pipeline</h3>
              <p className="auto-card-subtitle">Automate {leadSingular.toLowerCase()}s as they move through your pipeline.</p>
            </div>
          </div>
          <div className="auto-header-right">
            <button
              type="button"
              className="btn-auto-examples"
              onClick={() => {
                setExampleType('lead');
                setExamplesOpen(true);
              }}
            >
              <Lightbulb size={14} />
              <span>View examples</span>
            </button>
            <button
              type="button"
              className="btn-auto-collapse"
              onClick={() => setLeadCardOpen(!leadCardOpen)}
              title={leadCardOpen ? 'Collapse' : 'Expand'}
            >
              {leadCardOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>

        {leadCardOpen && (
          <form onSubmit={submitLead} className="auto-flow-form">
            <div className="auto-flow-row">
              {/* 1. Rule Name */}
              <div className="auto-flow-step name-step">
                <label className="auto-step-label">Rule name</label>
                <input
                  type="text"
                  className="auto-input-lux"
                  placeholder="e.g. Assign new leads"
                  value={leadName}
                  required
                  onChange={e => setLeadName(e.target.value)}
                />
              </div>

              <div className="auto-flow-arrow">
                <ArrowRight size={14} />
              </div>

              {/* 2. When */}
              <div className="auto-flow-step">
                <label className="auto-step-label">When</label>
                <select
                  className="auto-select-lux"
                  value={leadTrigger}
                  onChange={e => setLeadTrigger(e.target.value)}
                >
                  <option value="lead_created">When lead is created</option>
                  <option value="stage_changed">When stage changes</option>
                  <option value="owner_changed">When owner changes</option>
                </select>
              </div>

              {leadTrigger === 'stage_changed' && (
                <>
                  <div className="auto-flow-arrow">
                    <ArrowRight size={14} />
                  </div>
                  <div className="auto-flow-step">
                    <label className="auto-step-label">At stage</label>
                    <select
                      className="auto-select-lux"
                      value={leadStage}
                      onChange={e => setLeadStage(e.target.value)}
                    >
                      <option value="">Any stage</option>
                      {stages.map(s => (
                        <option key={s._id} value={s._id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div className="auto-flow-arrow">
                <ArrowRight size={14} />
              </div>

              {/* 3. Only when */}
              <div className="auto-flow-step">
                <label className="auto-step-label">Only when</label>
                <select
                  className="auto-select-lux"
                  value={leadCondField}
                  onChange={e => setLeadCondField(e.target.value)}
                >
                  <option value="">No condition</option>
                  <option value="source">Source matches</option>
                  <option value="priority">Priority matches</option>
                </select>
              </div>

              {leadCondField && (
                <div className="auto-flow-step">
                  <label className="auto-step-label">Value</label>
                  <input
                    type="text"
                    className="auto-input-lux"
                    placeholder={leadCondField === 'source' ? 'Website' : 'High'}
                    value={leadCondValue}
                    onChange={e => setLeadCondValue(e.target.value)}
                  />
                </div>
              )}

              <div className="auto-flow-arrow">
                <ArrowRight size={14} />
              </div>

              {/* 4. Then */}
              <div className="auto-flow-step">
                <label className="auto-step-label">Then</label>
                <select
                  className="auto-select-lux"
                  value={leadAction}
                  onChange={e => setLeadAction(e.target.value)}
                >
                  <option value="assign_user">Assign to team member</option>
                  <option value="add_label">Add tag</option>
                  <option value="remove_label">Remove tag</option>
                  <option value="set_priority">Set priority</option>
                  <option value="create_record">Create record in module</option>
                </select>
              </div>

              <div className="auto-flow-arrow">
                <ArrowRight size={14} />
              </div>

              {/* 5. Assign to / Target */}
              <div className="auto-flow-step">
                <label className="auto-step-label">
                  {leadAction === 'assign_user' ? 'Assign to' :
                   ['add_label', 'remove_label'].includes(leadAction) ? 'Choose tag' :
                   leadAction === 'set_priority' ? 'Priority' : 'Module'}
                </label>

                {leadAction === 'assign_user' && (
                  <select
                    className="auto-select-lux"
                    value={leadTargetUser}
                    onChange={e => setLeadTargetUser(e.target.value)}
                  >
                    <option value="">Choose team member…</option>
                    {users.map(u => (
                      <option key={u._id} value={u._id}>{u.name}</option>
                    ))}
                  </select>
                )}

                {['add_label', 'remove_label'].includes(leadAction) && (
                  <select
                    className="auto-select-lux"
                    value={leadTargetLabel}
                    onChange={e => setLeadTargetLabel(e.target.value)}
                  >
                    <option value="">Choose tag…</option>
                    {labels.map(l => (
                      <option key={l._id} value={l._id}>{l.name}</option>
                    ))}
                  </select>
                )}

                {leadAction === 'set_priority' && (
                  <select
                    className="auto-select-lux"
                    value={leadPriority}
                    onChange={e => setLeadPriority(e.target.value)}
                  >
                    <option value="high">High priority</option>
                    <option value="medium">Medium priority</option>
                    <option value="low">Low priority</option>
                  </select>
                )}

                {leadAction === 'create_record' && (
                  <select
                    className="auto-select-lux"
                    value={leadTargetWorkType}
                    onChange={e => setLeadTargetWorkType(e.target.value)}
                  >
                    <option value="">Choose module…</option>
                    {activeWorkTypes.map(w => (
                      <option key={w._id} value={w._id}>{w.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Submit Button */}
              <div className="auto-flow-action">
                <button
                  type="submit"
                  className="btn-create-auto-rule"
                  disabled={busy}
                >
                  {busy ? 'Creating...' : 'Create rule'}
                </button>
              </div>
            </div>

            {/* Sub-action bar */}
            <div
              className="auto-add-another-bar"
              onClick={() => {
                resetLead();
                const el = document.querySelector('.auto-input-lux') as HTMLInputElement;
                el?.focus();
              }}
            >
              <Plus size={14} />
              <span>Add another pipeline rule</span>
            </div>
          </form>
        )}
      </div>

      {/* Card 2: Custom Module Automation Builder */}
      {activeWorkTypes.length > 0 && (
        <div className="auto-section-card">
          <div className="auto-card-header">
            <div className="auto-header-left">
              <div className="auto-icon-badge module">
                <Package size={18} />
              </div>
              <div className="auto-header-titles">
                <h3 className="auto-card-title">Custom module</h3>
                <p className="auto-card-subtitle">Automate records in one of your custom business modules.</p>
              </div>
            </div>
            <div className="auto-header-right">
              <button
                type="button"
                className="btn-auto-examples"
                onClick={() => {
                  setExampleType('module');
                  setExamplesOpen(true);
                }}
              >
                <Lightbulb size={14} />
                <span>View examples</span>
              </button>
              <button
                type="button"
                className="btn-auto-collapse"
                onClick={() => setModCardOpen(!modCardOpen)}
                title={modCardOpen ? 'Collapse' : 'Expand'}
              >
                {modCardOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
          </div>

          {modCardOpen && (
            <form onSubmit={submitModule} className="auto-flow-form">
              <div className="auto-flow-row">
                {/* 1. Rule Name */}
                <div className="auto-flow-step name-step">
                  <label className="auto-step-label">Rule name</label>
                  <input
                    type="text"
                    className="auto-input-lux"
                    placeholder="e.g. Notify on shortlist"
                    value={modName}
                    required
                    onChange={e => setModName(e.target.value)}
                  />
                </div>

                <div className="auto-flow-arrow">
                  <ArrowRight size={14} />
                </div>

                {/* 2. Module */}
                <div className="auto-flow-step">
                  <label className="auto-step-label">Module</label>
                  <select
                    className="auto-select-lux"
                    value={modWorkType}
                    onChange={e => {
                      setModWorkType(e.target.value);
                      const w = activeWorkTypes.find(x => x._id === e.target.value);
                      if (w && w.statuses[0]) setModStatus(w.statuses[0].key);
                    }}
                  >
                    {activeWorkTypes.map(w => (
                      <option key={w._id} value={w._id}>{w.name}</option>
                    ))}
                  </select>
                </div>

                <div className="auto-flow-arrow">
                  <ArrowRight size={14} />
                </div>

                {/* 3. When */}
                <div className="auto-flow-step">
                  <label className="auto-step-label">When</label>
                  <select
                    className="auto-select-lux"
                    value={modTrigger}
                    onChange={e => setModTrigger(e.target.value)}
                  >
                    <option value="record_created">When record is created</option>
                    <option value="status_changed">When status changes</option>
                    <option value="owner_changed">When owner changes</option>
                  </select>
                </div>

                {modTrigger === 'status_changed' && (
                  <>
                    <div className="auto-flow-arrow">
                      <ArrowRight size={14} />
                    </div>
                    <div className="auto-flow-step">
                      <label className="auto-step-label">At status</label>
                      <select
                        className="auto-select-lux"
                        value={modStatus}
                        onChange={e => setModStatus(e.target.value)}
                      >
                        <option value="">Any status</option>
                        {selectedMod?.statuses.map(s => (
                          <option key={s.key} value={s.key}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <div className="auto-flow-arrow">
                  <ArrowRight size={14} />
                </div>

                {/* 4. Only when */}
                <div className="auto-flow-step">
                  <label className="auto-step-label">Only when</label>
                  <select
                    className="auto-select-lux"
                    value={modCondField}
                    onChange={e => setModCondField(e.target.value)}
                  >
                    <option value="">No condition</option>
                    <option value="title">Title matches</option>
                    <option value="status">Status matches</option>
                    <option value="priority">Priority matches</option>
                    {selectedMod?.fields.map(f => (
                      <option key={f.key} value={`custom:${f.key}`}>{f.label} matches</option>
                    ))}
                  </select>
                </div>

                {modCondField && (
                  <div className="auto-flow-step">
                    <label className="auto-step-label">Value</label>
                    <input
                      type="text"
                      className="auto-input-lux"
                      placeholder="Match value"
                      value={modCondValue}
                      onChange={e => setModCondValue(e.target.value)}
                    />
                  </div>
                )}

                <div className="auto-flow-arrow">
                  <ArrowRight size={14} />
                </div>

                {/* 5. Then */}
                <div className="auto-flow-step">
                  <label className="auto-step-label">Then</label>
                  <select
                    className="auto-select-lux"
                    value={modAction}
                    onChange={e => setModAction(e.target.value)}
                  >
                    <option value="assign_user">Assign to team member</option>
                    <option value="set_priority">Set priority</option>
                    <option value="set_status">Set status</option>
                    <option value="set_field">Set custom field</option>
                  </select>
                </div>

                <div className="auto-flow-arrow">
                  <ArrowRight size={14} />
                </div>

                {/* 6. Action Target */}
                <div className="auto-flow-step">
                  <label className="auto-step-label">
                    {modAction === 'assign_user' ? 'Assign to' :
                     modAction === 'set_status' ? 'Status' :
                     modAction === 'set_priority' ? 'Priority' : 'Field'}
                  </label>

                  {modAction === 'assign_user' && (
                    <select
                      className="auto-select-lux"
                      value={modTargetUser}
                      onChange={e => setModTargetUser(e.target.value)}
                    >
                      <option value="">Choose team member…</option>
                      {users.map(u => (
                        <option key={u._id} value={u._id}>{u.name}</option>
                      ))}
                    </select>
                  )}

                  {modAction === 'set_priority' && (
                    <select
                      className="auto-select-lux"
                      value={modPriority}
                      onChange={e => setModPriority(e.target.value)}
                    >
                      <option value="high">High priority</option>
                      <option value="medium">Medium priority</option>
                      <option value="low">Low priority</option>
                    </select>
                  )}

                  {modAction === 'set_status' && (
                    <select
                      className="auto-select-lux"
                      value={modTargetStatus}
                      onChange={e => setModTargetStatus(e.target.value)}
                    >
                      <option value="">Choose status…</option>
                      {selectedMod?.statuses.map(s => (
                        <option key={s.key} value={s.key}>{s.label}</option>
                      ))}
                    </select>
                  )}

                  {modAction === 'set_field' && (
                    <select
                      className="auto-select-lux"
                      value={modActionField}
                      onChange={e => setModActionField(e.target.value)}
                    >
                      <option value="">Choose field…</option>
                      {selectedMod?.fields.map(f => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Submit Button */}
                <div className="auto-flow-action">
                  <button
                    type="submit"
                    className="btn-create-auto-rule"
                    disabled={busy}
                  >
                    {busy ? 'Creating...' : 'Create module rule'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Card 3: Popular Automation Templates */}
      <div className="auto-section-card templates-card">
        <div className="auto-card-header">
          <div className="auto-header-left">
            <div className="auto-icon-badge zap">
              <Zap size={18} />
            </div>
            <div className="auto-header-titles">
              <h3 className="auto-card-title">Popular automation templates</h3>
              <p className="auto-card-subtitle">Get started quickly with pre-built automation rules.</p>
            </div>
          </div>
          <div className="auto-header-right">
            <button
              type="button"
              className="btn-auto-link-browse"
              onClick={() => applyTemplate('assign')}
            >
              <span>Browse all templates</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>

        <div className="auto-templates-grid">
          {/* Template 1 */}
          <div className="auto-template-item" onClick={() => applyTemplate('assign')}>
            <div className="auto-template-icon-wrap mint">
              <UserPlus size={18} />
            </div>
            <div className="auto-template-info">
              <h4>Assign new leads</h4>
              <p>Automatically assign new leads to your team.</p>
            </div>
          </div>

          {/* Template 2 */}
          <div className="auto-template-item" onClick={() => applyTemplate('email')}>
            <div className="auto-template-icon-wrap purple">
              <Mail size={18} />
            </div>
            <div className="auto-template-info">
              <h4>Send email notification</h4>
              <p>Notify your team when a lead is created.</p>
            </div>
          </div>

          {/* Template 3 */}
          <div className="auto-template-item" onClick={() => applyTemplate('move')}>
            <div className="auto-template-icon-wrap blue">
              <ArrowRightLeft size={18} />
            </div>
            <div className="auto-template-info">
              <h4>Move stage</h4>
              <p>Move leads to a stage when a condition is met.</p>
            </div>
          </div>

          {/* Template 4 */}
          <div className="auto-template-item" onClick={() => applyTemplate('followup')}>
            <div className="auto-template-icon-wrap rose">
              <Calendar size={18} />
            </div>
            <div className="auto-template-info">
              <h4>Create a follow-up</h4>
              <p>Automatically create a follow-up task for new leads.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Existing Rules List */}
      {automations.length > 0 && (
        <div className="auto-section-card existing-rules-card">
          <div className="auto-card-header">
            <div className="auto-header-left">
              <div className="auto-icon-badge check">
                <CheckCircle2 size={18} />
              </div>
              <div className="auto-header-titles">
                <h3 className="auto-card-title">Active automation rules ({automations.length})</h3>
                <p className="auto-card-subtitle">Manage, toggle or remove running CRM automation rules.</p>
              </div>
            </div>
          </div>

          <div className="auto-rules-list">
            {automations.map(rule => {
              const workTypeId = typeof rule.workType === 'string' ? rule.workType : rule.workType?._id;
              const stageId = typeof rule.stage === 'string' ? rule.stage : rule.stage?._id;
              const wt = workTypes.find(w => w._id === workTypeId);
              const userName = users.find(u => u._id === rule.targetId)?.name;
              const labelName = labels.find(l => l._id === rule.targetId)?.name;
              const stageName = stages.find(s => s._id === stageId)?.name;
              const targetName = rule.action === 'assign_user' ? userName : labelName;

              return (
                <div key={rule._id} className="auto-rule-row-lux">
                  <div className="auto-rule-info">
                    <div className="auto-rule-title-row">
                      <strong className="auto-rule-name">{rule.name}</strong>
                      <span className={`auto-rule-status-badge ${rule.isActive !== false ? 'active' : 'paused'}`}>
                        {rule.isActive !== false ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <div className="auto-rule-summary-pills">
                      <span className="rule-pill entity">{rule.entityType === 'module' ? (wt?.name || 'Module') : leadSingular}</span>
                      <span className="rule-pill trigger">{rule.trigger.replace(/_/g, ' ')}</span>
                      {stageName && <span className="rule-pill stage">{stageName}</span>}
                      <span className="rule-pill action">{rule.action.replace(/_/g, ' ')}</span>
                      {targetName && <span className="rule-pill target">{targetName}</span>}
                      <span className="rule-pill runs">{rule.runCount || 0} run{rule.runCount === 1 ? '' : 's'}</span>
                    </div>
                  </div>

                  <div className="auto-rule-actions">
                    <button
                      type="button"
                      className={`btn-auto-toggle ${rule.isActive !== false ? 'active' : 'paused'}`}
                      onClick={() => void toggleRule(rule._id)}
                    >
                      {rule.isActive !== false ? 'Pause' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      className="btn-auto-delete"
                      title="Delete rule"
                      onClick={() => deleteRule(rule._id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modern In-App Examples Modal */}
      {examplesOpen && (
        <div className="auto-modal-overlay" onClick={() => setExamplesOpen(false)}>
          <div className="auto-modal-card" onClick={e => e.stopPropagation()}>
            <div className="auto-modal-header">
              <div className="auto-modal-header-titles">
                <div className="auto-modal-badge">
                  <Sparkles size={16} />
                  <span>Automation Recipes</span>
                </div>
                <h3>{exampleType === 'lead' ? 'Lead Pipeline Examples' : 'Custom Module Examples'}</h3>
                <p>Click any recipe to automatically populate the flow builder.</p>
              </div>
              <button
                type="button"
                className="btn-auto-modal-close"
                onClick={() => setExamplesOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="auto-modal-recipes-grid">
              {exampleType === 'lead' ? (
                <>
                  <div
                    className="auto-recipe-card"
                    onClick={() => applyRecipe({
                      type: 'lead',
                      name: 'Assign inbound leads to sales rep',
                      trigger: 'lead_created',
                      action: 'assign_user',
                      targetUser: users[0]?._id,
                    })}
                  >
                    <div className="auto-recipe-badge orange">Lead Ingestion</div>
                    <h4>Round-robin lead assignment</h4>
                    <p>When a lead is created → Assign immediately to active sales team member.</p>
                    <div className="auto-recipe-flow-preview">
                      <span>Created</span>
                      <ArrowRight size={12} />
                      <span>Assign rep</span>
                    </div>
                  </div>

                  <div
                    className="auto-recipe-card"
                    onClick={() => applyRecipe({
                      type: 'lead',
                      name: 'Tag high-potential deals',
                      trigger: 'stage_changed',
                      stage: stages[0]?._id,
                      action: 'set_priority',
                      priority: 'high',
                    })}
                  >
                    <div className="auto-recipe-badge blue">Qualification</div>
                    <h4>Escalate qualified stage</h4>
                    <p>When stage advances → Automatically set lead priority to High.</p>
                    <div className="auto-recipe-flow-preview">
                      <span>Stage change</span>
                      <ArrowRight size={12} />
                      <span>High priority</span>
                    </div>
                  </div>

                  <div
                    className="auto-recipe-card"
                    onClick={() => applyRecipe({
                      type: 'lead',
                      name: 'Create onboarding deliverable on deal close',
                      trigger: 'lead_created',
                      condField: 'source',
                      condValue: 'Website',
                      action: 'create_record',
                      targetWorkType: activeWorkTypes[0]?._id,
                    })}
                  >
                    <div className="auto-recipe-badge purple">Full Cycle</div>
                    <h4>Auto-create project for web leads</h4>
                    <p>When source is "Website" → Create a new deliverable record in Custom Modules.</p>
                    <div className="auto-recipe-flow-preview">
                      <span>Website source</span>
                      <ArrowRight size={12} />
                      <span>New module record</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="auto-recipe-card"
                    onClick={() => {
                      setModName('High priority for urgent tasks');
                      setModTrigger('record_created');
                      setModCondField('priority');
                      setModCondValue('High');
                      setModAction('set_priority');
                      setModPriority('high');
                      setModCardOpen(true);
                      setExamplesOpen(false);
                      setSuccess('Recipe loaded into module builder.');
                    }}
                  >
                    <div className="auto-recipe-badge purple">Task Triage</div>
                    <h4>High-priority escalation</h4>
                    <p>When record priority is marked urgent → Assign to team lead automatically.</p>
                  </div>

                  <div
                    className="auto-recipe-card"
                    onClick={() => {
                      setModName('Assign project owner on review');
                      setModTrigger('status_changed');
                      setModAction('assign_user');
                      if (users[0]) setModTargetUser(users[0]._id);
                      setModCardOpen(true);
                      setExamplesOpen(false);
                      setSuccess('Recipe loaded into module builder.');
                    }}
                  >
                    <div className="auto-recipe-badge blue">Workflow Hand-off</div>
                    <h4>Status hand-off assignment</h4>
                    <p>When status moves to In Review → Reassign to client manager.</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmText="Delete Rule"
        variant="danger"
        onConfirm={confirmState.action}
        onCancel={() => setConfirmState(prev => ({ ...prev, open: false }))}
      />
    </div>
  );
}
