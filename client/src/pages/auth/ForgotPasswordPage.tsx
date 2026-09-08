import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowRight, ArrowLeft } from 'lucide-react';
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
    <div className="auth-form-card">
      <div className="auth-card-head">
        <span className="auth-kicker-badge">ACCOUNT RECOVERY</span>
        <h2 className="auth-card-title">Reset password</h2>
        <p className="auth-card-desc">Enter your email to receive recovery instructions.</p>
      </div>

      {error && <div className="auth-error-banner" role="alert">{error}</div>}
      {message && <div className="auth-success-banner">{message}</div>}

      {!message && (
        <form className="auth-minimal-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="recovery-email">Email Address</label>
            <div className="auth-field-input-box">
              <Mail size={16} className="auth-field-icon" aria-hidden="true" />
              <input
                id="recovery-email"
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@agency.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <button className="auth-btn-primary" type="submit" disabled={loading} style={{ marginTop: '4px' }}>
            <span>{loading ? 'Sending link…' : 'Send reset link'}</span>
            <ArrowRight size={17} />
          </button>
        </form>
      )}

      <div className="auth-divider">
        <span>Remembered password?</span>
      </div>

      <Link to="/auth/login" className="auth-btn-secondary">
        <ArrowLeft size={16} />
        <span>Back to sign in</span>
      </Link>
    </div>
  );
}
