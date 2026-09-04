import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { customersApi } from '../../api/customers';
import Icon from '../../components/Icons';
import ConfirmDialog from '../../components/ConfirmDialog';

interface DuplicateCustomer {
  _id: string;
  name: string;
  company?: string;
  source?: string;
  email?: string;
  phone?: string;
  stage?: { _id: string; name: string };
  value?: number;
  updatedAt: string;
}

interface DuplicateGroup {
  key: string;
  reason: string;
  customers: DuplicateCustomer[];
}

export default function DuplicatesPage() {
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [mergeGroupKey, setMergeGroupKey] = useState<string | null>(null);

  // Selected merge targets per group: groupKey -> { primaryId, duplicateId }
  const [mergeSelections, setMergeSelections] = useState<Record<string, { primaryId: string; duplicateId: string }>>({});

  useEffect(() => {
    loadDuplicates();
  }, []);

  async function loadDuplicates() {
    try {
      setLoading(true);
      setError('');
      const res = await customersApi.getDuplicates();
      const groups = res.duplicateGroups || [];
      setDuplicateGroups(groups);

      const initialSelections: Record<string, { primaryId: string; duplicateId: string }> = {};
      groups.forEach(g => {
        initialSelections[g.key] = {
          primaryId: g.customers[0]?._id || '',
          duplicateId: g.customers[1]?._id || g.customers[0]?._id || '',
        };
      });
      setMergeSelections(initialSelections);
    } catch (err: any) {
      setError(err.message || 'Failed to load duplicates');
    } finally {
      setLoading(false);
    }
  }

  async function handleMerge(groupKey: string, e: React.FormEvent) {
    e.preventDefault();
    const sel = mergeSelections[groupKey];
    if (!sel || !sel.primaryId || !sel.duplicateId) return;
    if (sel.primaryId === sel.duplicateId) {
      setError('Choose two different leads to merge.');
      return;
    }
    setMergeGroupKey(groupKey);
  }

  async function handleConfirmMerge() {
    if (!mergeGroupKey) return;
    const groupKey = mergeGroupKey;
    setMergeGroupKey(null);
    const sel = mergeSelections[groupKey];
    if (!sel) return;

    try {
      setMerging(true);
      setError('');
      await customersApi.mergeDuplicate(sel.primaryId, sel.duplicateId);
      setSuccess('Duplicate lead merged successfully.');
      await loadDuplicates();
    } catch (err: any) {
      setError(err.message || 'Failed to merge leads');
    } finally {
      setMerging(false);
    }
  }

  if (loading && duplicateGroups.length === 0) {
    return <div className="loading" style={{ padding: '3rem', textAlign: 'center' }}>Scanning for duplicate leads…</div>;
  }

  return (
    <div className="page-container">
      <section className="page-head" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <p className="eyebrow">Data Quality</p>
          <h1 style={{ margin: '0 0 0.2rem', fontSize: '1.45rem', fontWeight: 800 }}>Duplicate Leads</h1>
          <p className="page-subtitle" style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>
            Review leads that share the same email or phone number, then merge duplicates into the strongest profile.
          </p>
        </div>
        <div className="actions">
          <Link className="btn small" to="/customers">← Back to Leads</Link>
        </div>
      </section>

      {error && <div className="notice danger" style={{ marginBottom: '1rem' }}>{error}</div>}
      {success && <div className="notice success" style={{ marginBottom: '1rem' }}>{success}</div>}

      {duplicateGroups.length === 0 ? (
        <section className="empty-state" style={{ padding: '3rem', textAlign: 'center', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--green, #10b981)', marginBottom: '1rem' }}>
            <Icon name="check" size={28} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.5rem' }}>No duplicates found</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            There are no leads sharing the same email or phone number right now.
          </p>
          <Link className="btn primary" to="/customers">Open Leads Database</Link>
        </section>
      ) : (
        <div className="duplicate-review-list" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {duplicateGroups.map(group => {
            const currentSel = mergeSelections[group.key] || { primaryId: '', duplicateId: '' };
            return (
              <section
                key={group.key}
                className="profile-panel duplicate-review-group"
                style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--panel)' }}
              >
                <div className="section-title-row" style={{ marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
                  <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.15rem' }}>{group.reason}</h2>
                  <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.82rem' }}>
                    {group.customers.length} matching leads found for <strong style={{ color: 'var(--text)' }}>{group.key.replace(/^email:|^phone:/, '')}</strong>
                  </p>
                </div>

                <div
                  className="duplicate-card-grid"
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}
                >
                  {group.customers.map(customer => (
                    <article
                      key={customer._id}
                      className="duplicate-card"
                      style={{
                        padding: '1rem',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        background: 'var(--bg-soft, rgba(255,255,255,0.02))',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.65rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <strong style={{ fontSize: '0.95rem', display: 'block' }}>{customer.name}</strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                            {customer.company || customer.source || 'No company'}
                          </span>
                        </div>
                        <Link className="btn small outline" to={`/customers/${customer._id}`} target="_blank" rel="noreferrer">
                          Open ↗
                        </Link>
                      </div>

                      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px', fontSize: '0.78rem' }}>
                        <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Email</dt>
                        <dd style={{ margin: 0 }}>{customer.email || 'N/A'}</dd>
                        <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Phone</dt>
                        <dd style={{ margin: 0 }}>{customer.phone || 'N/A'}</dd>
                        <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Stage</dt>
                        <dd style={{ margin: 0 }}>{customer.stage ? customer.stage.name : 'Unassigned'}</dd>
                        <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Value</dt>
                        <dd style={{ margin: 0, color: 'var(--teal)', fontWeight: 700 }}>₹{(customer.value || 0).toLocaleString('en-IN')}</dd>
                        <dt style={{ color: 'var(--muted)', fontWeight: 700 }}>Updated</dt>
                        <dd style={{ margin: 0 }}>{new Date(customer.updatedAt).toLocaleDateString('en-IN')}</dd>
                      </dl>
                    </article>
                  ))}
                </div>

                <form
                  onSubmit={e => handleMerge(group.key, e)}
                  className="duplicate-merge-form"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr)) auto',
                    gap: '1rem',
                    alignItems: 'flex-end',
                    background: 'var(--panel-muted, rgba(255,255,255,0.03))',
                    padding: '1rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                  }}
                >
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                    Keep Primary Lead
                    <select
                      required
                      value={currentSel.primaryId}
                      onChange={e => setMergeSelections({
                        ...mergeSelections,
                        [group.key]: { ...currentSel, primaryId: e.target.value },
                      })}
                      style={{ padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)' }}
                    >
                      {group.customers.map((c, idx) => (
                        <option key={c._id} value={c._id}>
                          {c.name} ({c.email || c.phone || `Lead #${idx + 1}`})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--muted)' }}>
                    Merge This Duplicate Into Primary
                    <select
                      required
                      value={currentSel.duplicateId}
                      onChange={e => setMergeSelections({
                        ...mergeSelections,
                        [group.key]: { ...currentSel, duplicateId: e.target.value },
                      })}
                      style={{ padding: '0.45rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--text)' }}
                    >
                      {group.customers.map((c, idx) => (
                        <option key={c._id} value={c._id}>
                          {c.name} ({c.email || c.phone || `Lead #${idx + 1}`})
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    className="btn primary"
                    type="submit"
                    disabled={merging || currentSel.primaryId === currentSel.duplicateId}
                    style={{ height: '38px', whiteSpace: 'nowrap' }}
                  >
                    {merging ? 'Merging…' : 'Merge Leads'}
                  </button>
                </form>
              </section>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={mergeGroupKey !== null}
        title="Merge Duplicate Lead?"
        message="Merge this duplicate lead? The duplicate profile will be removed, and its timeline will move to the primary lead. This action cannot be undone."
        confirmText="Merge"
        variant="primary"
        loading={merging}
        onConfirm={() => void handleConfirmMerge()}
        onCancel={() => setMergeGroupKey(null)}
      />
    </div>
  );
}
