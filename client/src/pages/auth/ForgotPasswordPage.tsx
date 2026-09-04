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
    <div className="auth-card">
      <h1 className="auth-title">Reset your password</h1>
      <p style={{ textAlign: 'center', fontSize: '.875rem', marginBottom: '1.25rem', color: 'var(--muted)' }}>
        Enter your email and we'll send a reset link if an active account matches it.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert" style={{ borderColor: 'var(--gold)', color: 'var(--accent-text)' }}>{message}</div>}
      {!message && (
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@agency.com"
            />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>
      )}
      <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '.875rem' }}>
        <Link to="/auth/login">Back to login</Link>
      </p>
    </div>
  );
}
