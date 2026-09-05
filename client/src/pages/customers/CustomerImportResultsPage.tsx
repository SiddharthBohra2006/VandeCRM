import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Icon from '../../components/Icons';

export default function CustomerImportResultsPage() {
  const location = useLocation();
  const { crmTerms } = useAuth();
  const state = (location.state || {}) as {
    imported?: number;
    updated?: number;
    skipped?: number;
    totalRows?: number;
    warnings?: string[];
    fieldsCreated?: number;
    scope?: string;
  };

  const imported = state.imported || 0;
  const updated = state.updated || 0;
  const skipped = state.skipped || 0;
  const totalRows = state.totalRows || (imported + updated + skipped);
  const warnings = state.warnings || [];
  const fieldsCreated = state.fieldsCreated || 0;
  const isClientScope = state.scope === 'clients';
  const directoryPath = isClientScope ? '/clients' : '/customers';
  const importHref = `/customers/import${isClientScope ? '?scope=client' : ''}`;

  return (
    <div className="page-container">
      <section className="page-head">
        <div>
          <p className="eyebrow">Database</p>
          <h1>Import Results Report</h1>
          <p className="page-subtitle">Summary of the import completed.</p>
        </div>
        <div className="actions">
          <Link className="btn primary" to={directoryPath}>View {crmTerms.recordPlural} Directory</Link>
        </div>
      </section>

      <section className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: '1.5rem' }}>
        <div className="metric-card">
          <span>Total Rows Processed</span>
          <strong>{totalRows}</strong>
        </div>
        <div className="metric-card" style={{ '--metric-color': 'var(--teal)' } as any}>
          <span>New {crmTerms.recordPlural} Created</span>
          <strong>{imported}</strong>
        </div>
        <div className="metric-card" style={{ '--metric-color': 'var(--gold)' } as any}>
          <span>Existing {crmTerms.recordPlural} Updated</span>
          <strong>{updated}</strong>
        </div>
        <div className="metric-card" style={{ '--metric-color': 'var(--muted)' } as any}>
          <span>Rows Skipped / Ignored</span>
          <strong>{skipped}</strong>
        </div>
        {fieldsCreated > 0 && (
          <div className="metric-card">
            <span>Custom Fields Created</span>
            <strong>{fieldsCreated}</strong>
          </div>
        )}
      </section>

      {warnings.length > 0 && (
        <section className="team-card wide" style={{ marginBottom: '1.5rem', borderColor: 'var(--gold)' }}>
          <div className="panel-title-row">
            <div>
              <h2 style={{ color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Icon name="triangle-alert" size={20} />
                Import Warnings & Notices
              </h2>
              <p className="team-muted">Some rows had inconsistencies that were ignored or default-assigned.</p>
            </div>
          </div>
          <div style={{ marginTop: '1rem', maxHeight: 250, overflowY: 'auto', background: 'var(--hover)', padding: '1rem', borderRadius: 8, border: '1px solid var(--border)' }}>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {warnings.map((w, i) => (
                <li key={i} style={{ fontSize: '0.85rem', color: 'var(--text)' }}>{w}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="team-card wide">
        <div className="panel-title-row">
          <div>
            <h2>Import Complete</h2>
            <p className="team-muted">Your database has been updated. You can view all imported leads in the pipeline or search them in the directory.</p>
          </div>
        </div>
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
          <Link className="btn primary" to="/">Go to Dashboard</Link>
          <Link className="btn secondary outline" to={directoryPath}>View {crmTerms.recordPlural} Directory</Link>
          <Link className="btn secondary outline" to={importHref}>Import Another CSV</Link>
        </div>
      </section>
    </div>
  );
}
