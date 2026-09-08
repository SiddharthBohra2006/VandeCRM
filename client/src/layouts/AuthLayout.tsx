import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import {
  Users,
  Check,
  BarChart2,
  User,
  FileText,
  Trophy,
  Sun,
  Moon,
  HelpCircle,
} from 'lucide-react';
import {
  THEME_PRESETS,
  getActiveThemePreset,
  changeThemeWithAnimation,
  applyThemePreset,
  ThemePreset,
} from '../theme';
import '../styles/auth.css';

export default function AuthLayout() {
  const [themePreset, setThemePreset] = useState<ThemePreset>(() => getActiveThemePreset());

  useEffect(() => {
    // Detect system default if no explicit saved theme
    const savedName = localStorage.getItem('theme-name');
    if (!savedName) {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const defaultPreset = THEME_PRESETS.find(p => p.type === (prefersDark ? 'dark' : 'light')) || THEME_PRESETS[0];
      applyThemePreset(defaultPreset);
      setThemePreset(defaultPreset);
    }

    const handleThemeChanged = (e: CustomEvent<ThemePreset>) => {
      if (e.detail) {
        setThemePreset(e.detail);
      }
    };

    window.addEventListener('crm-theme-changed', handleThemeChanged as EventListener);
    return () => window.removeEventListener('crm-theme-changed', handleThemeChanged as EventListener);
  }, []);

  function handleToggleTheme(e: React.MouseEvent) {
    const isDark = themePreset.type === 'dark';
    const nextType = isDark ? 'light' : 'dark';
    const nextPreset = THEME_PRESETS.find(p => p.type === nextType) || (nextType === 'dark' ? THEME_PRESETS[0] : THEME_PRESETS[2]);
    changeThemeWithAnimation(nextPreset, e);
    setThemePreset(nextPreset);
  }

  const isDark = themePreset.type === 'dark';

  return (
    <div className="login-shell">
      {/* Background Decorative Ambient Contour Rings */}
      <div className="auth-contour-top" aria-hidden="true">
        <svg width="480" height="480" viewBox="0 0 480 480" fill="none">
          <circle cx="360" cy="0" r="240" stroke="var(--gold, #F5A900)" strokeWidth="1.2" strokeOpacity={isDark ? 0.15 : 0.22} />
          <circle cx="360" cy="0" r="330" stroke="var(--gold, #F5A900)" strokeWidth="1.2" strokeOpacity={isDark ? 0.08 : 0.12} />
        </svg>
      </div>

      <div className="auth-contour-bottom" aria-hidden="true">
        <svg width="340" height="340" viewBox="0 0 340 340" fill="none">
          <circle cx="0" cy="340" r="180" stroke="var(--gold, #F5A900)" strokeWidth="1.2" strokeOpacity={isDark ? 0.15 : 0.18} />
          <circle cx="0" cy="340" r="260" stroke="var(--gold, #F5A900)" strokeWidth="1.2" strokeOpacity={isDark ? 0.08 : 0.1} />
        </svg>
      </div>

      <div className="auth-workspace">
        {/* Left: Storytelling panel */}
        <section className="auth-story">
          <div className="auth-story-inner">
            <div className="auth-story-top-group">
              {/* Brand Logo */}
              <div className="auth-brand">
                <div className="brand-mark-box" aria-hidden="true">
                  <span className="brand-mark-letter">V</span>
                </div>
                <span className="brand-name">
                  Vande<span className="gold-tag">CRM</span>
                </span>
              </div>

              {/* Tagline */}
              <div className="auth-tagline">
                BUILT FOR AGENCIES. DESIGNED FOR GROWTH.
              </div>

              {/* Main Headline */}
              <h1 className="auth-hero-title">
                Turn client<br />
                conversations into<br />
                <span className="auth-gold-highlight">
                  real growth.
                  <svg className="brush-underline" viewBox="0 0 240 14" fill="none" aria-hidden="true">
                    <path
                      d="M 2 8 C 50 1, 150 2, 238 6 C 160 12, 60 12, 2 8 Z"
                      fill="var(--accent, #F5A900)"
                      fillOpacity={isDark ? 0.75 : 0.85}
                    />
                    <path
                      d="M 8 9 C 60 4, 160 4, 230 7.5"
                      stroke="var(--accent-dark, #D97706)"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </h1>

              <p className="auth-hero-desc">
                Manage your leads, clients, projects, meetings and team — all in one focused workspace.
              </p>

              {/* 2-Column Hero: Features List & Flowing S-Curve Pipeline */}
              <div className="auth-hero-split">
                {/* Left: 3 Agency Value Pillars */}
                <div className="auth-features-list">
                  <div className="auth-feature-item">
                    <div className="auth-feature-icon amber">
                      <Users size={20} strokeWidth={2.2} />
                    </div>
                    <div className="auth-feature-text">
                      <strong>Track every lead</strong>
                      <span>From first touch to final deal</span>
                    </div>
                  </div>

                  <div className="auth-feature-item">
                    <div className="auth-feature-icon green">
                      <Check size={20} strokeWidth={2.5} />
                    </div>
                    <div className="auth-feature-text">
                      <strong>Stay aligned</strong>
                      <span>Tasks, meetings and team updates</span>
                    </div>
                  </div>

                  <div className="auth-feature-item">
                    <div className="auth-feature-icon purple">
                      <BarChart2 size={20} strokeWidth={2.2} />
                    </div>
                    <div className="auth-feature-text">
                      <strong>See the bigger picture</strong>
                      <span>Clear insights for smarter decisions</span>
                    </div>
                  </div>
                </div>

                {/* Right: Flowing Pipeline with Continuous S-Curve */}
                <div className="auth-pipeline-stage-area">
                  {/* Background Dot Matrix Accent */}
                  <div className="auth-pipeline-matrix" aria-hidden="true" />

                  {/* Single Smooth Continuous S-Curve SVG */}
                  <svg className="auth-continuous-svg" viewBox="0 0 260 320" width="260" height="320" fill="none" aria-hidden="true">
                    {/* Continuous Winding S-Path connecting the 4 stage markers */}
                    <path
                      d="M 28,0 C 28,14 48,12 48,26 C 48,54 16,66 16,80 C 16,94 48,92 48,106 C 48,134 16,146 16,160 C 16,174 48,172 48,186 C 48,214 16,226 16,240 C 16,254 48,252 48,266 C 48,284 28,296 28,315"
                      stroke={isDark ? 'rgba(255, 255, 255, 0.2)' : '#CBD5E1'}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />

                    {/* Amber Junction Node for New Lead */}
                    <circle cx="48" cy="26" r="5" fill="#F5A900" stroke={isDark ? '#080D1A' : '#FFFFFF'} strokeWidth="2" />

                    {/* Blue Junction Node for Qualified */}
                    <circle cx="48" cy="106" r="5" fill="#3B82F6" stroke={isDark ? '#080D1A' : '#FFFFFF'} strokeWidth="2" />

                    {/* Purple Junction Node for Proposal */}
                    <circle cx="48" cy="186" r="5" fill="#A855F7" stroke={isDark ? '#080D1A' : '#FFFFFF'} strokeWidth="2" />

                    {/* Green Junction Node for Won */}
                    <circle cx="48" cy="266" r="5" fill="#10B981" stroke={isDark ? '#080D1A' : '#FFFFFF'} strokeWidth="2" />
                  </svg>

                  {/* Card 1: New Lead */}
                  <div className="pipeline-node-card card-new-lead">
                    <div className="pipeline-sparks" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="pipeline-icon amber">
                      <User size={16} />
                    </div>
                    <div className="pipeline-text">
                      <strong>New Lead</strong>
                      <span>Capture opportunities</span>
                    </div>
                  </div>

                  {/* Card 2: Qualified */}
                  <div className="pipeline-node-card card-qualified">
                    <div className="pipeline-icon blue">
                      <FileText size={16} />
                    </div>
                    <div className="pipeline-text">
                      <strong>Qualified</strong>
                      <span>Move to next stage</span>
                    </div>
                  </div>

                  {/* Card 3: Proposal */}
                  <div className="pipeline-node-card card-proposal">
                    <div className="pipeline-icon purple">
                      <FileText size={16} />
                    </div>
                    <div className="pipeline-text">
                      <strong>Proposal</strong>
                      <span>Send and track</span>
                    </div>
                  </div>

                  {/* Card 4: Won */}
                  <div className="pipeline-node-card card-won">
                    <div className="pipeline-icon green">
                      <Trophy size={16} />
                    </div>
                    <div className="pipeline-text">
                      <strong>Won</strong>
                      <span>Grow your business</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Slogan */}
            <div className="auth-story-foot">
              <span className="auth-foot-bar" />
              <span className="auth-foot-text">YOUR WORKFLOW. YOUR WAY.</span>
            </div>
          </div>
        </section>

        {/* Right: Form Panel */}
        <section className="login-panel">
          <div className="login-panel-top">
            <button
              type="button"
              className="auth-theme-btn"
              onClick={handleToggleTheme}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <span className="auth-top-divider" aria-hidden="true" />
            <a href="#help" className="auth-help-link" onClick={e => e.preventDefault()}>
              <HelpCircle size={15} />
              <span>Need help?</span>
            </a>
          </div>

          <div className="login-panel-content">
            <Outlet />
          </div>

          <div className="login-panel-footer">
            <span className="login-footer-copy">
              © 2026 VandeCRM. Built for your next chapter.
            </span>
            <div className="login-footer-badge">
              <div className="footer-gold-dots" aria-hidden="true">
                <span className="dot dot-1" />
                <span className="dot dot-2" />
              </div>
              <span>More clients. Greater impact.</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
