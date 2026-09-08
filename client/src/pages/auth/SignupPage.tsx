import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Building2, Mail, Lock, Eye, EyeOff, ArrowRight, LogIn } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', orgName: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signup(form);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-form-card">
      <div className="auth-card-head">
        <span className="auth-kicker-badge">GET STARTED</span>
        <h2 className="auth-card-title">Create your workspace</h2>
        <p className="auth-card-desc">Set up your agency CRM in 30 seconds.</p>
      </div>

      {error && <div className="auth-error-banner" role="alert">{error}</div>}

      <form className="auth-minimal-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <label htmlFor="signup-name">Full Name</label>
          <div className="auth-field-input-box">
            <User size={16} className="auth-field-icon" aria-hidden="true" />
            <input
              id="signup-name"
              type="text"
              name="name"
              required
              autoComplete="name"
              placeholder="e.g. Alex Sharma"
              value={form.name}
              onChange={handleChange}
              autoFocus
            />
          </div>
        </div>

        <div className="auth-field">
          <label htmlFor="signup-org">Company / Agency Name</label>
          <div className="auth-field-input-box">
            <Building2 size={16} className="auth-field-icon" aria-hidden="true" />
            <input
              id="signup-org"
              type="text"
              name="orgName"
              required
              autoComplete="organization"
              placeholder="e.g. Vande Digital Media"
              value={form.orgName}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="auth-field">
          <label htmlFor="signup-email">Email Address</label>
          <div className="auth-field-input-box">
            <Mail size={16} className="auth-field-icon" aria-hidden="true" />
            <input
              id="signup-email"
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@agency.com"
              value={form.email}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="auth-field">
          <label htmlFor="signup-password">Password (min 8 chars)</label>
          <div className="auth-field-input-box">
            <Lock size={16} className="auth-field-icon" aria-hidden="true" />
            <input
              id="signup-password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={handleChange}
            />
            <button
              type="button"
              className="auth-field-toggle"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword(v => !v)}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button className="auth-btn-primary" type="submit" disabled={loading} style={{ marginTop: '4px' }}>
          <span>{loading ? 'Creating workspace…' : 'Create workspace'}</span>
          <ArrowRight size={17} />
        </button>
      </form>

      <div className="auth-divider">
        <span>Already have an account?</span>
      </div>

      <Link to="/auth/login" className="auth-btn-secondary">
        <LogIn size={16} />
        <span>Sign in to existing account</span>
      </Link>
    </div>
  );
}
