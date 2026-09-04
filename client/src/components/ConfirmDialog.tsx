import React, { useEffect } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title = 'Please Confirm',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          btnClass: 'btn small danger',
          iconColor: 'var(--red, #dc2626)',
          borderColor: 'rgba(220, 38, 38, 0.2)',
        };
      case 'warning':
        return {
          btnClass: 'btn small',
          iconColor: 'var(--gold, #d4af37)',
          borderColor: 'rgba(212, 175, 55, 0.2)',
        };
      case 'primary':
      default:
        return {
          btnClass: 'btn small primary',
          iconColor: 'var(--teal, #0f766e)',
          borderColor: 'rgba(15, 118, 110, 0.2)',
        };
    }
  };

  const currentVariant = getVariantStyles();

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onCancel();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          background: 'var(--panel, #1e293b)',
          border: `1px solid ${currentVariant.borderColor}`,
          borderRadius: '12px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)',
          overflow: 'hidden',
          padding: '1.5rem',
          animation: 'fadeIn 0.15s ease-out',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', marginBottom: '1rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'var(--bg-soft, rgba(255, 255, 255, 0.05))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: currentVariant.iconColor,
              flexShrink: 0,
              fontSize: '1.1rem',
            }}
          >
            {variant === 'danger' ? '⚠️' : variant === 'warning' ? '🔔' : 'ℹ️'}
          </div>
          <div>
            <h3
              id="confirm-dialog-title"
              style={{
                margin: '0 0 0.35rem 0',
                fontSize: '1.05rem',
                fontFamily: 'var(--font-display)',
                color: 'var(--text, #f8fafc)',
              }}
            >
              {title}
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: '0.82rem',
                color: 'var(--muted, #94a3b8)',
                lineHeight: 1.5,
                whiteSpace: 'pre-line',
              }}
            >
              {message}
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.65rem',
            marginTop: '1.5rem',
          }}
        >
          <button
            type="button"
            className="btn small outline"
            onClick={onCancel}
            disabled={loading}
            style={{ minWidth: '80px' }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={currentVariant.btnClass}
            onClick={onConfirm}
            disabled={loading}
            style={{ minWidth: '80px' }}
          >
            {loading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
