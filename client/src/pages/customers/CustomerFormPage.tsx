import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { customersApi, CustomersListResponse } from '../../api/customers';
import { useAuth } from '../../contexts/AuthContext';
import { CustomerInput, CustomField } from '../../types';

type FormState = Required<Pick<CustomerInput, 'name' | 'company' | 'email' | 'phone' | 'source' | 'value' | 'priority' | 'stage' | 'assignedTo' | 'campaign' | 'notes'>> & {
  leadScore: number;
  labels: string[];
  customData: Record<string, unknown>;
};

const initialForm: FormState = {
  name: '', company: '', email: '', phone: '', source: 'Manual', value: 0,
  priority: 'medium', leadScore: 0, stage: '', labels: [], assignedTo: '', campaign: '', notes: '', customData: {}
};

export default function CustomerFormPage() {
  const navigate = useNavigate();
  const { crmTerms } = useAuth();
  const [options, setOptions] = useState<CustomersListResponse | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    customersApi.list({ pageSize: '1' }).then(result => {
      setOptions(result);
      const defaultStage = result.stages.find(stage => stage.isDefault && stage.isActive) || result.stages.find(stage => stage.isActive);
      setForm(current => ({ ...current, stage: defaultStage?._id || '' }));
    }).catch(caught => setError(caught instanceof Error ? caught.message : 'Failed to load form options'))
      .finally(() => setLoading(false));
  }, []);

  function change(event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = event.target;
    setForm(current => ({ ...current, [name]: name === 'value' || name === 'leadScore' ? Number(value) || 0 : value }));
  }

  function toggleLabel(id: string) {
    setForm(current => ({ ...current, labels: current.labels.includes(id) ? current.labels.filter(label => label !== id) : [...current.labels, id] }));
  }

  function customField(field: CustomField, value: string | boolean) {
    setForm(current => ({
      ...current,
      customData: { ...current.customData, [field.key]: field.type === 'number' ? (value === '' ? null : Number(value)) : value }
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return setError('Name is required.');
    if (!form.stage) return setError('An active CRM stage is required.');
    try {
      setSaving(true);
      setError('');
      const result = await customersApi.create(form);
      navigate(`/customers/${result.data._id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Failed to create ${crmTerms.leadSingular.toLowerCase()}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading">Loading form…</div>;
  if (!options) return <div className="alert alert-error" role="alert">{error || 'Form options are unavailable.'}</div>;

  return (
    <div className="page-container">
      <section className="page-head">
        <div><Link to="/customers" className="back-link">← Back to {crmTerms.leadPlural}</Link><h1>New {crmTerms.leadSingular}</h1></div>
      </section>
      <form className="form-card stack-form" onSubmit={submit}>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <div className="form-grid">
          <label>{crmTerms.recordSingular} name *<input required name="name" value={form.name} onChange={change} /></label>
          <label>Company / Brand<input name="company" value={form.company} onChange={change} /></label>
          <label>Phone<input name="phone" value={form.phone} onChange={change} /></label>
          <label>Email<input type="email" name="email" value={form.email} onChange={change} /></label>
          <label>{crmTerms.recordSingular} source<input name="source" value={form.source} onChange={change} /></label>
          <label>Deal value<input type="number" min="0" name="value" value={form.value} onChange={change} /></label>
          <label>Priority<select name="priority" value={form.priority} onChange={change}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
          <label>Lead score<input type="number" min="0" max="100" name="leadScore" value={form.leadScore} onChange={change} /></label>
          <label>Stage *<select required name="stage" value={form.stage} onChange={change}><option value="">Select stage</option>{options.stages.filter(stage => stage.isActive).map(stage => <option value={stage._id} key={stage._id}>{stage.name}</option>)}</select></label>
          <label>Campaign<select name="campaign" value={form.campaign} onChange={change}><option value="">No campaign</option>{options.campaigns.map(campaign => <option value={campaign._id} key={campaign._id}>{campaign.name}</option>)}</select></label>
          <label>Assigned owner<select name="assignedTo" value={form.assignedTo} onChange={change}><option value="">Assign to me</option>{options.users.map(user => <option value={user._id} key={user._id}>{user.name}</option>)}</select></label>
        </div>

        {options.labels.length > 0 && <fieldset><legend>Labels</legend><div className="check-grid">{options.labels.map(label => <label className="check-pill" key={label._id}><input type="checkbox" checked={form.labels.includes(label._id)} onChange={() => toggleLabel(label._id)} />{label.name}</label>)}</div></fieldset>}

        {options.fields.length > 0 && <fieldset><legend>Custom fields</legend><div className="form-grid">{options.fields.map(field => {
          const value = form.customData[field.key];
          if (field.type === 'select') return <label key={field._id}>{field.label}<select required={field.required} value={String(value || '')} onChange={event => customField(field, event.target.value)}><option value="">Select</option>{field.options.map(option => <option key={option}>{option}</option>)}</select></label>;
          if (field.type === 'checkbox') return <label className="inline-check" key={field._id}><input type="checkbox" checked={Boolean(value)} onChange={event => customField(field, event.target.checked)} />{field.label}</label>;
          return <label key={field._id}>{field.label}<input type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'} required={field.required} value={value == null ? '' : String(value)} onChange={event => customField(field, event.target.value)} /></label>;
        })}</div></fieldset>}

        <label>Internal notes<textarea name="notes" rows={6} value={form.notes} onChange={change} /></label>
        <div className="form-actions"><Link to="/customers" className="btn secondary">Cancel</Link><button className="btn primary" disabled={saving}>{saving ? 'Creating…' : `Create ${crmTerms.leadSingular}`}</button></div>
      </form>
    </div>
  );
}
