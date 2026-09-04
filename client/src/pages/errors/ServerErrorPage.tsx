import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icons';

export default function ServerErrorPage({ message }: { message?: string }) {
  return (
    <div className="page-container" style={{ minHeight: 'calc(100vh - 180px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '20px', padding: '48px 36px', maxWidth: '500px', width: '100%', textAlign: 'center', boxShadow: '0 12px 40px rgba(0,0,0,0.12)' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.12)', color: 'var(--red, #ef4444)', fontSize: '28px', marginBottom: '20px', fontWeight: 800 }}>
          <Icon name="triangle-alert" size={36} />
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)', margin: '0 0 10px' }}>Server error</h1>
        <p style={{ fontSize: '14px', color: 'var(--muted)', margin: '0 0 28px', lineHeight: 1.6 }}>
          {message || 'Something went wrong while processing your request. Please try again.'}
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/" className="btn primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="layout-dashboard" size={16} />
            <span>Back to pipeline</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
