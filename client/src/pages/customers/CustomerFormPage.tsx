import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isClientScope = searchParams.get('scope') === 'client' || location.pathname.startsWith('/clients');
  const isEdit = Boolean(id);

  const navigate = useNavigate();
  const { crmTerms } = useAuth();
  const [options, setOptions] = useState<CustomersListResponse | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      customersApi.list({ pageSize: '1' }),
      id ? customersApi.get(id) : null,
    ]).then(([result, detailRes]) => {
      setOptions(result);
      if (detailRes?.data) {
        const d = detailRes.data;
        setForm({
          name: d.name || '',
          company: d.company || '',
          email: d.email || '',
          phone: d.phone || '',
          source: d.source || 'Manual',
          value: d.value || 0,
          priority: (d.priority as any) || 'medium',
          leadScore: d.leadScore || 0,
          stage: typeof d.stage === 'object' ? (d.stage as any)?._id : d.stage || '',
          labels: Array.isArray(d.labels) ? d.labels.map((l: any) => l._id || l) : [],
          assignedTo: typeof d.assignedTo === 'object' ? (d.assignedTo as any)?._id : d.assignedTo || '',
          campaign: typeof d.campaign === 'object' ? (d.campaign as any)?._id : d.campaign || '',
          notes: d.notes || '',
          customData: d.customData ? (typeof (d.customData as any).toObject === 'function' ? (d.customData as any).toObject() : d.customData) : {},
        });
      } else {
        const availableStages = isClientScope
          ? result.stages.filter(s => s.isActive && s.isWon).length
            ? result.stages.filter(s => s.isActive && s.isWon)
            : result.stages.filter(s => s.isActive)
          : result.stages.filter(s => s.isActive);
        const defaultStage = availableStages.find(stage => stage.isDefault) || availableStages[0];
        setForm(current => ({ ...current, stage: defaultStage?._id || '' }));
      }
    }).catch(caught => setError(caught instanceof Error ? caught.message : 'Failed to load form options'))
      .finally(() => setLoading(false));
  }, [id, isClientScope]);

  function change(event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = event.target;
    setForm(current => ({ ...current, [name]: name === 'value' || name === 'leadScore' ? Number(value) || 0 : value }));
  }

  function toggleLabel(labelId: string) {
    setForm(current => ({ ...current, labels: current.labels.includes(labelId) ? current.labels.filter(l => l !== labelId) : [...current.labels, labelId] }));
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
      if (isEdit && id) {
        await customersApi.update(id, form);
        navigate(`${isClientScope ? '/clients' : '/customers'}/${id}`);
      } else {
        const result = await customersApi.create(form);
        navigate(`${isClientScope ? '/clients' : '/customers'}/${result.data._id}`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Failed to save ${isClientScope ? crmTerms.recordSingular.toLowerCase() : crmTerms.leadSingular.toLowerCase()}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading">Loading form…</div>;
  if (!options) return <div className="alert alert-error" role="alert">{error || 'Form options are unavailable.'}</div>;

  const backUrl = isClientScope ? '/clients' : '/customers';
  const displayStages = isClientScope && !isEdit
    ? (options.stages.filter(s => s.isActive && s.isWon).length ? options.stages.filter(s => s.isActive && s.isWon) : options.stages.filter(s => s.isActive))
    : options.stages.filter(s => s.isActive);

  return (
    <div className="page-container">
      <section className="page-head">
        <div>
          <Link to={backUrl} className="back-link">← Back to {isClientScope ? crmTerms.recordPlural : crmTerms.leadPlural}</Link>
          <h1>{isEdit ? `Edit ${form.name || crmTerms.leadSingular}` : isClientScope ? `New ${crmTerms.recordSingular}` : `New ${crmTerms.leadSingular}`}</h1>
        </div>
      </section>
      <form className="form-card stack-form" onSubmit={submit}>
        {error && <div className="alert alert-error" role="alert">{error}</div>}

        {/* Primary Contact & Source Intake */}
        <div className="form-section-head" style={{ marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '0.92rem', fontWeight: 700, margin: '0 0 2px 0' }}>Primary Contact & Source</h3>
          <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--muted)' }}>Essential details needed to log and reach out to this {isClientScope ? 'client' : 'lead'}.</p>
        </div>

        <div className="form-grid">
          <label>{isClientScope ? crmTerms.recordSingular : crmTerms.leadSingular} name *<input required name="name" placeholder="e.g. Rahul Sharma" value={form.name} onChange={change} /></label>
          <label>{isClientScope ? crmTerms.recordSingular : crmTerms.leadSingular} source<input name="source" placeholder="e.g. Instagram, Referral, Website" value={form.source} onChange={change} /></label>
          <label>Campaign<select name="campaign" value={form.campaign} onChange={change}><option value="">No campaign / Organic</option>{options.campaigns.map(campaign => <option value={campaign._id} key={campaign._id}>{campaign.name}</option>)}</select></label>
          <label>Stage *<select required name="stage" value={form.stage} onChange={change}><option value="">Select stage</option>{displayStages.map(stage => <option value={stage._id} key={stage._id}>{stage.name}</option>)}</select></label>
          <label>Phone<input name="phone" placeholder="+91 98765 43210" value={form.phone} onChange={change} /></label>
          <label>Email<input type="email" name="email" placeholder="name@company.com" value={form.email} onChange={change} /></label>
          <label>Company / Brand<input name="company" placeholder="e.g. Acme Media" value={form.company} onChange={change} /></label>
          <label>Assigned owner<select name="assignedTo" value={form.assignedTo} onChange={change}><option value="">Assign to me</option>{options.users.map(user => <option value={user._id} key={user._id}>{user.name}</option>)}</select></label>
        </div>

        {/* First Call / Conversation Summary Note */}
        <div style={{ marginTop: '1.25rem', marginBottom: '1.25rem' }}>
          <label>
            <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>Call Summary / Conversation Notes</span>
            <small style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)', marginTop: '2px', marginBottom: '6px' }}>Summary of the initial conversation, client requirements, or next action steps.</small>
            <textarea name="notes" rows={4} placeholder="e.g. Spoke with Rahul. Interested in video production package. Scheduled discovery call for Tuesday..." value={form.notes} onChange={change} />
          </label>
        </div>

        {/* Optional Deal & Qualification Details */}
        <details className="optional-panel" open={isEdit || Boolean(form.value) || form.labels.length > 0} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px', background: 'var(--panel-muted)' }}>
          <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <strong style={{ fontSize: '0.85rem' }}>Deal, Budget & Qualification Details</strong>
              <small style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)', marginTop: '2px' }}>Services, budget range, and custom fields (can be completed after qualification call)</small>
            </div>
            <span style={{ fontSize: '0.76rem', color: 'var(--gold)', fontWeight: 650 }}>{isEdit ? 'Show/Hide' : '+ Add details'}</span>
          </summary>

          <div style={{ marginTop: '1rem', display: 'grid', gap: '1rem' }}>
            <div className="form-grid">
              <label>Estimated deal value (₹)<input type="number" min="0" name="value" placeholder="0" value={form.value || ''} onChange={change} /></label>
              <label>Priority<select name="priority" value={form.priority} onChange={change}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
              <label>Lead qualification score (0-100)<input type="number" min="0" max="100" name="leadScore" value={form.leadScore} onChange={change} /></label>
            </div>

            {options.labels.length > 0 && (
              <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                <legend style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--sub)', marginBottom: '6px' }}>Labels / Tags</legend>
                <div className="check-grid">
                  {options.labels.map(label => (
                    <label className="check-pill" key={label._id}>
                      <input type="checkbox" checked={form.labels.includes(label._id)} onChange={() => toggleLabel(label._id)} />
                      {label.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {options.fields.length > 0 && (
              <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                <legend style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--sub)', marginBottom: '6px' }}>Custom CRM Fields</legend>
                <div className="form-grid">
                  {options.fields.map(field => {
                    const value = form.customData[field.key];
                    if (field.type === 'select') return <label key={field._id}>{field.label}<select required={field.required} value={String(value || '')} onChange={event => customField(field, event.target.value)}><option value="">Select</option>{field.options.map(option => <option key={option}>{option}</option>)}</select></label>;
                    if (field.type === 'checkbox') return <label className="inline-check" key={field._id}><input type="checkbox" checked={Boolean(value)} onChange={event => customField(field, event.target.checked)} />{field.label}</label>;
                    return <label key={field._id}>{field.label}<input type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'} required={field.required} value={value == null ? '' : String(value)} onChange={event => customField(field, event.target.value)} /></label>;
                  })}
                </div>
              </fieldset>
            )}
          </div>
        </details>

        <div className="form-actions" style={{ marginTop: '1.5rem' }}>
          <Link to={backUrl} className="btn secondary">Cancel</Link>
          <button className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : isClientScope ? `Create ${crmTerms.recordSingular}` : `Create ${crmTerms.leadSingular}`}
          </button>
        </div>
      </form>
    </div>
  );
}
