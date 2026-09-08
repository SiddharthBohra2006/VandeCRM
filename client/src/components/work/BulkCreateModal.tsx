import React, { useState, useEffect } from 'react';
import { WorkType, workApi } from '../../api/work';
import CustomSelect from '../CustomSelect';
import DatePicker from '../DatePicker';
import Icon from '../Icons';

export interface BulkCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
  workTypes: WorkType[];
  users: { _id: string; name: string; email?: string }[];
  initialWorkTypeKey?: string;
  lockedWorkType?: boolean;
}

export default function BulkCreateModal({
  isOpen,
  onClose,
  onSuccess,
  workTypes,
  users,
  initialWorkTypeKey = '',
  lockedWorkType = false,
}: BulkCreateModalProps) {
  const [type, setType] = useState(initialWorkTypeKey || (workTypes[0]?.key || ''));
  const [titles, setTitles] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [deadline, setDeadline] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setType(initialWorkTypeKey || (workTypes[0]?.key || ''));
      setTitles('');
      setAssignedTo('');
      setPriority('medium');
      setDeadline('');
      setError('');
    }
  }, [isOpen, initialWorkTypeKey, workTypes]);

  if (!isOpen) return null;

  const currentWorkType = workTypes.find(wt => wt.key === type);
  const activeTypeName = currentWorkType?.name || type || 'Record';

  const lineCount = titles
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean).length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!type) {
      setError('Please select a work module');
      return;
    }
    const cleanTitles = titles.trim();
    if (!cleanTitles) {
      setError('Please enter at least one title');
      return;
    }

    try {
      setSaving(true);
      setError('');
      await workApi.bulkCreate(type, {
        titles: cleanTitles,
        assignedTo: assignedTo || undefined,
        priority,
        deadline: deadline || undefined,
      });
      await onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create records');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100050 }}>
      <div
        className="modal-card"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '560px', width: '90%', padding: '1.5rem', borderRadius: '14px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ margin: '0 0 0.2rem', fontSize: '1.2rem', fontWeight: 800 }}>
              Bulk Add {lockedWorkType ? activeTypeName : 'Work Records'}
            </h2>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)' }}>
              Quickly create multiple {activeTypeName.toLowerCase()}s by adding one title per line.
            </p>
          </div>
          <button
            type="button"
            className="btn small outline"
            onClick={onClose}
            style={{ padding: '4px 8px', borderRadius: '6px' }}
            aria-label="Close"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {error && (
          <div className="auth-error" style={{ marginBottom: '1rem', fontSize: '0.8rem', padding: '8px 12px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {!lockedWorkType && (
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--muted)', marginBottom: '4px' }}>
                Work Area / Module *
              </label>
              <CustomSelect
                value={type}
                onChange={val => setType(val)}
                placeholder="Choose work area"
                options={[
                  { value: '', label: 'Select work area…' },
                  ...workTypes.map(wt => ({ value: wt.key, label: wt.name })),
                ]}
              />
            </div>
          )}

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
              <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--muted)' }}>
                Titles (One per line) *
              </label>
              {lineCount > 0 && (
                <span style={{ fontSize: '0.72rem', color: 'var(--gold)', fontWeight: 700 }}>
                  {lineCount} {lineCount === 1 ? 'item' : 'items'} will be created
                </span>
              )}
            </div>
            <textarea
              required
              rows={6}
              value={titles}
              onChange={e => setTitles(e.target.value)}
              placeholder="Design landing page header\nRecord voiceover for demo\nExport final MP4 in 4K"
              style={{
                width: '100%',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                color: 'var(--text)',
                padding: '10px 12px',
                fontSize: '0.82rem',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                lineHeight: '1.4',
                resize: 'vertical',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--muted)', marginBottom: '4px' }}>
                Assign to
              </label>
              <CustomSelect
                placeholder="Assign all to…"
                value={assignedTo}
                onChange={val => setAssignedTo(val)}
                options={[
                  { value: '', label: 'Unassigned' },
                  ...users.map(m => ({ value: m._id, label: m.name })),
                ]}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--muted)', marginBottom: '4px' }}>
                Priority
              </label>
              <CustomSelect
                placeholder="Priority"
                value={priority}
                onChange={val => setPriority(val as any)}
                options={[
                  { value: 'low', label: 'Low priority' },
                  { value: 'medium', label: 'Medium priority' },
                  { value: 'high', label: 'High priority' },
                ]}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--muted)', marginBottom: '4px' }}>
                Deadline
              </label>
              <DatePicker
                placeholder="Deadline"
                value={deadline}
                onChange={val => setDeadline(val)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
            <button type="button" className="btn small outline" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn small primary" disabled={saving || !titles.trim() || !type}>
              {saving ? 'Creating…' : `Create ${lineCount > 0 ? `${lineCount} ` : ''}${activeTypeName}${lineCount === 1 ? '' : 's'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
