import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { customersApi } from '../../api/customers';
import { Stage } from '../../types';
import { api } from '../../api/client';

export default function CustomerFormPage() {
  const navigate = useNavigate();
  const [stages, setStages] = useState<Stage[]>([]);
  const [users, setUsers] = useState<{ _id: string; name: string }[]>([]);
  const [form, setForm] = useState<{
    name: string; company: string; email: string; phone: string; source: string;
    value: number; priority: 'low' | 'medium' | 'high'; stage: string; assignedTo: string;
    notes: string;
  }>({
    name: '', company: '', email: '', phone: '', source: '',
    value: 0, priority: 'medium', stage: '', assignedTo: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadFormOptions();
  }, []);

  async function loadFormOptions() {
    try {
      const [stagesRes, usersRes] = await Promise.all([
        api.get<{ ok: true; data: Stage[] }>('/customers?pageSize=1').then(() => api.get<{ ok: true; stages: Stage[] }>('/dashboard')),
        api.get<{ ok: true; data: { _id: string; name: string }[] }>('/team'),
      ]);
      // Simplified: just get stages from the list endpoint
    } catch {
      // Options will be empty, form still works
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: name === 'value' ? Number(value) || 0 : value,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    try {
      setSaving(true);
      await customersApi.create(form);
      navigate('/customers');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <Link to="/customers" className="back-link">← Back to Leads</Link>
          <h1>New Lead</h1>
        </div>
      </div>

      <div className="form-card">
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="name">Name *</label>
              <input id="name" name="name" value={form.name} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" value={form.email} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="phone">Phone</label>
              <input id="phone" name="phone" value={form.phone} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="company">Company</label>
              <input id="company" name="company" value={form.company} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="source">Source</label>
              <input id="source" name="source" value={form.source} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="value">Value (₹)</label>
              <input id="value" name="value" type="number" value={form.value} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="priority">Priority</label>
              <select id="priority" name="priority" value={form.priority} onChange={handleChange}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" value={form.notes} onChange={handleChange} rows={4} />
          </div>
          <div className="form-actions">
            <Link to="/customers" className="btn btn-secondary">Cancel</Link>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating...' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
