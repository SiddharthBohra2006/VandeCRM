import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { customersApi } from '../../api/customers';
import ConfirmDialog from '../../components/ConfirmDialog';
import Icon from '../../components/Icons';

export default function CustomerImportResultsPage() {
  const location = useLocation();
  const { crmTerms } = useAuth();
  const [reverting, setReverting] = useState(false);
  const [revertedMessage, setRevertedMessage] = useState('');
  const [revertError, setRevertError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const state = (location.state || {}) as {
    imported?: number;
    updated?: number;
    skipped?: number;
    batchId?: string;
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

  const handleRevert = async () => {
    if (!state.batchId) return;
    try {
      setReverting(true);
      setRevertError('');
      const res = await customersApi.revertImport(state.batchId);
      setRevertedMessage(res.message || `Import batch reverted: ${res.deletedCount} created records removed, ${res.restoredCount} updated records restored.`);
    } catch (err: any) {
      setRevertError(err.message || 'Failed to revert import');
    } finally {
      setReverting(false);
      setShowConfirm(false);
    }
  };

  return (
    <div className="page-container">
      <section className="page-head">
        <div>
          <p className="eyebrow">Database</p>
          <h1>Import Results Report</h1>
          <p className="page-subtitle">Summary of the import completed.</p>
        </div>
        <div className="actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {state.batchId && !revertedMessage && (
            <button
              type="button"
              className="btn small outline"
              style={{
                color: 'var(--red, #ef4444)',
                borderColor: 'rgba(239, 68, 68, 0.35)',
                background: 'rgba(239, 68, 68, 0.08)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontWeight: 650,
                borderRadius: 8
              }}
              disabled={reverting}
              onClick={() => setShowConfirm(true)}
            >
              <RotateCcw size={14} />
              Revert this import
            </button>
          )}
          <Link className="btn primary" to={directoryPath}>View {crmTerms.recordPlural} Directory</Link>
        </div>
      </section>

      {revertedMessage && (
        <div className="notice success" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>✓</span>
          <span>{revertedMessage}</span>
        </div>
      )}

      {revertError && (
        <div className="notice danger" style={{ marginBottom: '1.5rem' }}>
          {revertError}
        </div>
      )}

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
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link className="btn primary" to="/">Go to Dashboard</Link>
          <Link className="btn secondary outline" to={directoryPath}>View {crmTerms.recordPlural} Directory</Link>
          <Link className="btn secondary outline" to={importHref}>Import Another CSV</Link>
        </div>
      </section>

      <ConfirmDialog
        open={showConfirm}
        title="Revert CSV Import"
        message={`Are you sure you want to revert this import batch? This will permanently delete the ${imported} newly created record(s) and restore any modified records to their previous values.`}
        confirmText="Yes, revert import"
        variant="danger"
        loading={reverting}
        onConfirm={() => void handleRevert()}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
