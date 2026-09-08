import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, UserPlus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-form-card">
      <div className="auth-card-head">
        <span className="auth-kicker-badge">WELCOME BACK</span>
        <h1 className="auth-card-title">Sign in to VandeCRM</h1>
        <p className="auth-card-desc">Your clients, teams and next big win are waiting.</p>
      </div>

      {error && <div className="auth-error-banner" role="alert">{error}</div>}

      <form className="auth-minimal-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <label htmlFor="login-email">Email</label>
          <div className="auth-field-input-box">
            <Mail size={18} className="auth-field-icon" aria-hidden="true" />
            <input
              id="login-email"
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

        <div className="auth-field">
          <label htmlFor="login-password">Password</label>
          <div className="auth-field-input-box">
            <Lock size={18} className="auth-field-icon" aria-hidden="true" />
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              required
              minLength={8}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="auth-field-toggle"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword(v => !v)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div className="auth-options-row">
          <label className="auth-checkbox-label">
            <input
              type="checkbox"
              checked={keepSignedIn}
              onChange={e => setKeepSignedIn(e.target.checked)}
            />
            <span>Keep me signed in</span>
          </label>
          <Link to="/auth/forgot-password" className="auth-link">
            Forgot password?
          </Link>
        </div>

        <button className="auth-btn-primary" type="submit" disabled={loading}>
          <span>{loading ? 'Signing in…' : 'Sign in'}</span>
          <ArrowRight size={18} />
        </button>
      </form>

      <div className="auth-divider">
        <span>New to VandeCRM?</span>
      </div>

      <Link to="/auth/signup" className="auth-btn-secondary">
        <UserPlus size={18} />
        <span>Create first admin account</span>
      </Link>
    </div>
  );
}
