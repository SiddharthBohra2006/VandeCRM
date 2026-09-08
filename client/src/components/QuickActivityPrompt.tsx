import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { customersApi } from '../api/customers';
import DatePicker from './DatePicker';
import CustomSelect from './CustomSelect';

const CHANNELS = [
  { key: 'call', label: '📞 Call' },
  { key: 'whatsapp', label: '💬 WhatsApp' },
  { key: 'meeting', label: '🤝 Meeting' },
  { key: 'email', label: '✉️ Email' },
  { key: 'note', label: '📝 Note' },
];

const FOLLOW_UP_TIMES = [
  { value: '09:30', label: '09:30 AM' },
  { value: '10:00', label: '10:00 AM' },
  { value: '11:00', label: '11:00 AM' },
  { value: '12:00', label: '12:00 PM' },
  { value: '14:00', label: '02:00 PM' },
  { value: '15:30', label: '03:30 PM' },
  { value: '17:00', label: '05:00 PM' },
  { value: '18:30', label: '06:30 PM' },
];

function getTomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export interface QuickActivityPromptProps {
  open: boolean;
  customerId: string;
  customerName?: string;
  targetStageId?: string;
  targetStageName?: string;
  currentStageName?: string;
  isTerminalStage?: boolean; // won or lost
  onClose: () => void;
  onSaved?: (result?: any) => void;
  onLogged?: () => void;
}

export default function QuickActivityPrompt({
  open,
  customerId,
  customerName,
  targetStageId,
  targetStageName,
  currentStageName,
  isTerminalStage = false,
  onClose,
  onSaved,
  onLogged,
}: QuickActivityPromptProps) {
  const [type, setType] = useState('call');
  const [note, setNote] = useState('');
  const [recordingUrl, setRecordingUrl] = useState('');

  // Follow-up scheduling
  const [scheduleFollowUp, setScheduleFollowUp] = useState(!isTerminalStage);
  const [followUpDate, setFollowUpDate] = useState(getTomorrowDate());
  const [followUpTime, setFollowUpTime] = useState('11:00');
  const [followUpAgenda, setFollowUpAgenda] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const isStageTransition = Boolean(targetStageId);

  useEffect(() => {
    if (!open) return;
    setType(isStageTransition ? 'call' : 'note');
    setNote('');
    setRecordingUrl('');
    setScheduleFollowUp(!isTerminalStage);
    setFollowUpDate(getTomorrowDate());
    setFollowUpTime('11:00');
    setFollowUpAgenda('');
    setError('');

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overlay = overlayRef.current;
    const parent = overlay?.parentElement;
    let inertTargets: HTMLElement[] = [];
    if (parent) {
      inertTargets = Array.from(parent.children).filter(
        (el): el is HTMLElement => el instanceof HTMLElement && el !== overlay
      );
      inertTargets.forEach((el) => el.setAttribute('inert', 'true'));
    }
    if (parent) document.body.style.overflow = 'hidden';

    // Focus textarea after opening
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!saving) handleSkip();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      inertTargets.forEach((el) => el.removeAttribute('inert'));
      document.body.style.overflow = '';
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, targetStageId]);

  async function handleSkip() {
    if (saving) return;
    // If it's a stage transition and user clicked skip, still apply the stage update without note
    if (isStageTransition && customerId && targetStageId) {
      try {
        setSaving(true);
        setError('');
        const res = await customersApi.updateStage(customerId, targetStageId);
        onSaved?.(res);
        onClose();
      } catch (caught: any) {
        setError(caught?.message || 'Failed to update stage');
      } finally {
        setSaving(false);
      }
    } else {
      onClose();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) return;

    let nextFollowUpAt: string | undefined;
    if (scheduleFollowUp && followUpDate) {
      try {
        const timePart = followUpTime || '10:00';
        const d = new Date(`${followUpDate}T${timePart}:00`);
        if (!Number.isNaN(d.getTime())) {
          nextFollowUpAt = d.toISOString();
        }
      } catch {
        // ignore date parse fallback
      }
    }

    try {
      setSaving(true);
      setError('');

      if (isStageTransition && targetStageId) {
        // Update stage with note and follow-up in single unified call
        const res = await customersApi.updateStage(customerId, {
          stageId: targetStageId,
          note: note.trim(),
          type,
          callRecordingUrl: recordingUrl.trim(),
          nextFollowUpAt,
          nextFollowUpNote: followUpAgenda.trim(),
        });
        onSaved?.(res);
        onLogged?.();
      } else {
        // Pure activity log
        const res = await customersApi.addActivity(customerId, {
          type,
          note: note.trim() || 'Activity logged.',
          callRecordingUrl: recordingUrl.trim(),
          nextFollowUpAt,
        });
        onSaved?.(res);
        onLogged?.();
      }
      onClose();
    } catch (caught: any) {
      setError(caught?.message || 'Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const dialog = (
    <div
      ref={overlayRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100060,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) handleSkip();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-activity-title"
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: '480px',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          padding: '1.4rem 1.6rem',
          animation: 'fadeIn 0.15s ease-out',
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
          <div>
            <h3 id="quick-activity-title" style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
              {isStageTransition ? (
                <>
                  <span>Move to:</span>
                  <span style={{ color: 'var(--gold)', background: 'color-mix(in srgb, var(--gold) 15%, var(--panel))', padding: '2px 8px', borderRadius: 6, fontSize: '0.95rem' }}>
                    {targetStageName}
                  </span>
                </>
              ) : (
                `Log Activity · ${customerName || 'Lead'}`
              )}
            </h3>
            {customerName && isStageTransition && (
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
                Lead: <strong>{customerName}</strong> {currentStageName ? `(from ${currentStageName})` : ''}
              </p>
            )}
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={handleSkip}
            disabled={saving}
            aria-label="Skip and Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--muted)',
              fontSize: '1.3rem',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '0.2rem',
            }}
          >
            &times;
          </button>
        </div>

        {/* 1. Channel Selector */}
        <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.85rem', overflowX: 'auto', paddingBottom: '0.2rem' }}>
          {CHANNELS.map((channel) => (
            <button
              key={channel.key}
              type="button"
              onClick={() => setType(channel.key)}
              style={{
                background: type === channel.key ? 'color-mix(in srgb, var(--gold) 18%, var(--panel))' : 'var(--panel-muted, transparent)',
                color: type === channel.key ? 'var(--gold)' : 'var(--text)',
                border: type === channel.key ? '1px solid var(--gold)' : '1px solid var(--border)',
                padding: '0.35rem 0.65rem',
                borderRadius: '7px',
                fontSize: '0.74rem',
                fontWeight: type === channel.key ? 750 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              {channel.label}
            </button>
          ))}
        </div>

        {/* 2. Notes / Outcome Textarea */}
        <div style={{ marginBottom: '0.85rem' }}>
          <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: 'var(--muted)', marginBottom: '0.3rem' }}>
            {type === 'call' ? 'Call Discussion & Outcome' :
             type === 'whatsapp' ? 'WhatsApp Chat Summary' :
             type === 'meeting' ? 'Meeting Minutes & Key Decisions' :
             type === 'email' ? 'Email Summary' : 'Activity / Transition Note'}
          </label>
          <textarea
            ref={textareaRef}
            rows={3}
            placeholder={
              type === 'call' ? 'What did the client say? What are their requirements or concerns?' :
              type === 'meeting' ? 'Demo shown, questions asked, agreed next steps...' :
              type === 'whatsapp' ? 'Shared brochure/quote, client will confirm by tomorrow...' :
              'Write conversation notes or reason for this stage update…'
            }
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{
              width: '100%',
              padding: '0.65rem 0.8rem',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'color-mix(in srgb, var(--bg) 40%, var(--panel))',
              color: 'var(--text)',
              fontSize: '0.82rem',
              resize: 'vertical',
              boxSizing: 'border-box',
              lineHeight: 1.45,
            }}
          />
        </div>

        {/* 3. Recording Link (if Call / Meeting) */}
        {(type === 'call' || type === 'meeting') && (
          <div style={{ marginBottom: '0.85rem' }}>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 750, color: 'var(--muted)', marginBottom: '0.25rem' }}>
              {type === 'call' ? 'Call recording / notes link (optional)' : 'Meeting recording / doc link (optional)'}
            </label>
            <input
              type="url"
              placeholder="https://drive.google.com/... or meet URL"
              value={recordingUrl}
              onChange={(e) => setRecordingUrl(e.target.value)}
              style={{ width: '100%', padding: '0.45rem 0.7rem', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', fontSize: '0.78rem', boxSizing: 'border-box' }}
            />
          </div>
        )}

        {/* 4. Schedule Next Follow-up Card */}
        <div style={{
          padding: '0.75rem 0.9rem',
          borderRadius: 10,
          background: 'color-mix(in srgb, var(--gold) 8%, var(--panel))',
          border: '1px solid color-mix(in srgb, var(--gold) 25%, var(--border))',
          marginBottom: '1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: scheduleFollowUp ? '0.6rem' : 0 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', cursor: 'pointer', fontWeight: 750, fontSize: '0.8rem', color: 'var(--text)' }}>
              <input
                type="checkbox"
                checked={scheduleFollowUp}
                onChange={(e) => setScheduleFollowUp(e.target.checked)}
                style={{ accentColor: 'var(--gold)', width: 15, height: 15, cursor: 'pointer' }}
              />
              <span>⏰ Schedule Next Follow-up</span>
            </label>
            {!scheduleFollowUp && (
              <small style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>No reminder set</small>
            )}
          </div>

          {scheduleFollowUp && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '0.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--muted)', marginBottom: '0.2rem' }}>Date</label>
                  <DatePicker
                    value={followUpDate}
                    onChange={setFollowUpDate}
                    placeholder="Follow-up date"
                    style={{ width: '100%', height: 32, fontSize: '0.78rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--muted)', marginBottom: '0.2rem' }}>Time</label>
                  <CustomSelect
                    value={followUpTime}
                    onChange={setFollowUpTime}
                    options={FOLLOW_UP_TIMES}
                    variant="compact"
                  />
                </div>
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Next call agenda (e.g. Discuss revised quotation & send invoice)"
                  value={followUpAgenda}
                  onChange={(e) => setFollowUpAgenda(e.target.value)}
                  style={{ width: '100%', padding: '0.45rem 0.7rem', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', fontSize: '0.78rem', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Error Alert */}
        {error && <div style={{ color: 'var(--red, #dc2626)', fontSize: '0.76rem', marginBottom: '0.75rem', fontWeight: 600 }}>{error}</div>}

        {/* Actions Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
          <button
            type="button"
            className="btn small outline"
            onClick={handleSkip}
            disabled={saving}
            style={{ fontSize: '0.78rem' }}
          >
            {isStageTransition ? 'Skip notes & Update' : 'Cancel'}
          </button>

          <button
            type="submit"
            className="btn small primary"
            disabled={saving}
            style={{ padding: '0.45rem 1.2rem', fontWeight: 750, fontSize: '0.8rem' }}
          >
            {saving ? 'Saving…' : isStageTransition ? 'Save & Update Stage' : 'Log Activity'}
          </button>
        </div>
      </form>
    </div>
  );

  return createPortal(dialog, document.body);
}
