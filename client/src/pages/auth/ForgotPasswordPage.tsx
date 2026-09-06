import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../../api/auth';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.forgotPassword(email);
      setMessage(res.message);
    } catch (err: any) {
      setError(err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <Link to="/auth/login" className="auth-forgot" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.82rem' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back to login
        </Link>
      </div>

      <div className="login-panel-head">
        <span className="auth-lock" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        </span>
        <span className="auth-kicker">Account recovery</span>
        <h2>Reset your password</h2>
        <p>Enter your email address and we'll send you a password reset link if an active account matches it.</p>
      </div>

      {error && <div className="auth-error" role="alert">{error}</div>}
      {message && (
        <div className="notice success" style={{ marginBottom: '1.25rem', padding: '12px 16px', borderRadius: '10px', fontSize: '0.85rem' }}>
          {message}
        </div>
      )}

      {!message && (
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email address
            <span className="auth-input-field">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
              />
            </span>
          </label>

          <button className="btn primary auth-submit" type="submit" disabled={loading}>
            {loading ? 'Sending link…' : 'Send reset link'}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </form>
      )}

      <div style={{ marginTop: '1.5rem', padding: '12px 14px', borderRadius: '10px', background: 'var(--bg-soft, rgba(255,255,255,0.03))', border: '1px solid var(--border)', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <span style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.45 }}>
          If an active account matches that email, we'll send a password reset link. Check your inbox & spam folder.
        </span>
      </div>
    </>
  );
}
