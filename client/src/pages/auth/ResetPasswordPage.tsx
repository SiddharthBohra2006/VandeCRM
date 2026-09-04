import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../../api/auth';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
      <div className="auth-card">
        <h1 className="auth-title">Reset your password</h1>
        <div className="alert alert-error">This password reset link is invalid or has expired.</div>
        <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '.875rem' }}>
          <Link to="/auth/login">Back to login</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h1 className="auth-title">Choose a new password</h1>
      <p style={{ textAlign: 'center', fontSize: '.875rem', marginBottom: '1.25rem', color: 'var(--muted)' }}>
        Your reset link expires one hour after it was requested.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert" style={{ borderColor: 'var(--gold)', color: 'var(--accent-text)' }}>{message}</div>}
      {!message && (
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="password">New password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading || !token}>
            {loading ? 'Resetting...' : 'Reset password'}
          </button>
        </form>
      )}
      <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '.875rem' }}>
        <Link to="/auth/login">Back to login</Link>
      </p>
    </div>
  );
}
