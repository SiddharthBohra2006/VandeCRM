import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../../api/auth';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.resetPassword(token, password, confirmPassword);
      setMessage(res.message);
    } catch (err: any) {
      setError(err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="login-panel-head" style={{ textAlign: 'center' }}>
        <span className="auth-lock" aria-hidden="true" style={{ borderColor: 'var(--red, #ef4444)', color: 'var(--red, #ef4444)' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        </span>
        <h2>Invalid reset link</h2>
        <p style={{ marginTop: '0.5rem' }}>This password reset link is invalid or has expired.</p>
        <Link to="/auth/forgot-password" className="btn primary auth-submit" style={{ marginTop: '1.25rem', textDecoration: 'none' }}>
          Request new reset link
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="login-panel-head">
        <span className="auth-lock" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
        </span>
        <span className="auth-kicker">Security update</span>
        <h2>Set new password</h2>
        <p>Choose a secure password with at least 8 characters.</p>
      </div>

      {error && <div className="auth-error" role="alert">{error}</div>}
      {message && (
        <div className="notice success" style={{ marginBottom: '1.25rem', padding: '12px 16px', borderRadius: '10px', fontSize: '0.85rem' }}>
          {message}
          <div style={{ marginTop: '0.75rem' }}>
            <Link to="/auth/login" className="btn primary auth-submit" style={{ textDecoration: 'none' }}>Proceed to sign in</Link>
          </div>
        </div>
      )}

      {!message && (
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            New password
            <span className="password-toggle-field auth-input-field">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="password-toggle-btn"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword(v => !v)}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </span>
          </label>

          <label>
            Confirm new password
            <span className="auth-input-field">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
              <input
                type="password"
                name="confirmPassword"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Repeat new password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
              />
            </span>
          </label>

          <button className="btn primary auth-submit" type="submit" disabled={loading || !token}>
            {loading ? 'Resetting password…' : 'Update password'}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </form>
      )}

      <div className="auth-divider"><span>Remembered your password?</span></div>
      <Link to="/auth/login" className="auth-create">
        Back to sign in
      </Link>
    </>
  );
}
