import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <section className="login-shell">
      <div className="auth-workspace">
        {/* Left: story / marketing panel */}
        <section className="auth-story">
          <div className="brand auth-brand">
            <span className="brand-mark" aria-hidden="true">V</span>
            <span>Vande<span className="auth-gold">CRM</span></span>
          </div>

          <div className="auth-copy">
            <p className="eyebrow">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>
              Built for agencies. Designed for growth.
            </p>
            <h1>Shape your pipeline around how your agency <span className="auth-gold">actually sells.</span></h1>
            <p>Custom stages, labels, fields, CSV imports, and client activity in one focused workspace.</p>
          </div>

          {/* Pipeline preview mockup */}
          <div className="auth-preview" aria-hidden="true">
            <div className="preview-toolbar">
              <span /><span /><span />
              <small>Your pipeline, at a glance</small>
            </div>
            <div className="preview-grid">
              <div className="preview-column">
                <strong>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  New Lead <small>2</small>
                </strong>
                <div className="preview-card hot"><span>Website redesign</span><em>Rs. 85,000</em></div>
                <div className="preview-card"><span>SEO audit</span><em>Rs. 22,000</em></div>
              </div>
              <div className="preview-column">
                <strong>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  Proposal <small>1</small>
                </strong>
                <div className="preview-card warm"><span>Retainer plan</span><em>Rs. 1,20,000</em></div>
              </div>
              <div className="preview-column">
                <strong>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
                  Won <small>1</small>
                </strong>
                <div className="preview-card won"><span>Brand launch</span><em>Rs. 2,40,000</em></div>
              </div>
            </div>
          </div>

          <div className="auth-story-foot">
            <span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
              Your workflow. Your way.
            </span>
            <span>VandeCRM</span>
          </div>
        </section>

        {/* Right: form panel — each auth page renders inside here */}
        <div className="login-panel">
          <Outlet />
        </div>
      </div>
    </section>
  );
}
