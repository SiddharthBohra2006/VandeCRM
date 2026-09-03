import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { customersApi } from '../../api/customers';
import { Customer, CustomField } from '../../types';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Customer>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) loadCustomer(id);
  }, [id]);

  async function loadCustomer(customerId: string) {
    try {
      setLoading(true);
      const result = await customersApi.get(customerId);
      setCustomer(result.data);
      setActivities(result.activities || []);
      setFields(result.fields || []);
      setForm(result.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!id) return;
    try {
      setSaving(true);
      await customersApi.update(id, {
        name: form.name,
        company: form.company,
        email: form.email,
        phone: form.phone,
        source: form.source,
        value: form.value,
        priority: form.priority,
        notes: form.notes,
      });
      setEditing(false);
      await loadCustomer(id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id || !confirm('Are you sure you want to delete this lead?')) return;
    try {
      await customersApi.delete(id);
      navigate('/customers');
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!customer) return <div className="empty-state">Lead not found.</div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <Link to="/customers" className="back-link">← Back to Leads</Link>
          <h1>{customer.name}</h1>
        </div>
        <div className="header-actions">
          {!editing ? (
            <button className="btn btn-secondary" onClick={() => setEditing(true)}>Edit</button>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => { setEditing(false); setForm(customer); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          )}
          <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-card">
          <h3>Details</h3>
          <div className="detail-fields">
            <div className="field-group">
              <label>Name</label>
              {editing ? <input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /> : <span>{customer.name}</span>}
            </div>
            <div className="field-group">
              <label>Email</label>
              {editing ? <input value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /> : <span>{customer.email}</span>}
            </div>
            <div className="field-group">
              <label>Phone</label>
              {editing ? <input value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /> : <span>{customer.phone}</span>}
            </div>
            <div className="field-group">
              <label>Company</label>
              {editing ? <input value={form.company || ''} onChange={e => setForm({ ...form, company: e.target.value })} /> : <span>{customer.company}</span>}
            </div>
            <div className="field-group">
              <label>Source</label>
              {editing ? <input value={form.source || ''} onChange={e => setForm({ ...form, source: e.target.value })} /> : <span>{customer.source}</span>}
            </div>
            <div className="field-group">
              <label>Value</label>
              {editing ? <input type="number" value={form.value || 0} onChange={e => setForm({ ...form, value: Number(e.target.value) })} /> : <span>₹{customer.value?.toLocaleString('en-IN')}</span>}
            </div>
            <div className="field-group">
              <label>Priority</label>
              {editing ? (
                <select value={form.priority || 'medium'} onChange={e => setForm({ ...form, priority: e.target.value as 'low' | 'medium' | 'high' })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              ) : <span>{customer.priority}</span>}
            </div>
            <div className="field-group">
              <label>Stage</label>
              <span className="stage-badge" style={{ backgroundColor: customer.stage?.color }}>{customer.stage?.name}</span>
            </div>
          </div>
        </div>

        <div className="detail-card">
          <h3>Activity Timeline</h3>
          <div className="activity-timeline">
            {activities.length === 0 && <p className="empty-state">No activity yet.</p>}
            {activities.map(activity => (
              <div key={activity._id} className="activity-item">
                <span className="activity-type">{activity.type}</span>
                <span className="activity-note">{activity.note}</span>
                <span className="activity-user">{activity.user?.name || 'System'}</span>
                <span className="activity-date">{new Date(activity.createdAt).toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
