import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { workApi } from '../../api/work';
import Icon from '../../components/Icons';

export default function WorkImportPreviewPage() {
  const { type } = useParams<{ type: string }>();
  const location = useLocation();
  const state = (location.state || {}) as {
    csvText?: string;
    headers?: string[];
    rows?: string[][];
    workTypeName?: string;
  };

  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [error, setError] = useState('');

  const handleImport = async () => {
    if (!state.csvText || !type) return;
    try {
      setImporting(true);
      setError('');
      const res = await workApi.importCsv(type, { csvText: state.csvText });
      setResult({ created: res.created, skipped: res.skipped });
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  if (!state.csvText || !state.headers) {
    return (
      <div className="page-container">
        <section className="page-head">
          <div>
            <p className="eyebrow">CSV import</p>
            <h1>Preview Work Import</h1>
          </div>
        </section>
        <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
          <p>No import data found. Go to the work list and start an import.</p>
          <Link className="btn primary" to={`/work/${type || ''}`}>Back to Work</Link>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="page-container">
        <section className="page-head">
          <div>
            <p className="eyebrow">CSV import</p>
            <h1>Import Complete</h1>
          </div>
        </section>
        <section className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: '1.5rem' }}>
          <div className="metric-card" style={{ '--metric-color': 'var(--teal)' } as any}>
            <span>Records Created</span>
            <strong>{result.created}</strong>
          </div>
          <div className="metric-card" style={{ '--metric-color': 'var(--muted)' } as any}>
            <span>Records Skipped</span>
            <strong>{result.skipped}</strong>
          </div>
        </section>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link className="btn primary" to={`/work/${type}`}>View Work Items</Link>
          <Link className="btn secondary outline" to="/work">Back to Work Center</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <section className="page-head">
        <div>
          <p className="eyebrow">CSV import</p>
          <h1>Preview {state.workTypeName || type}</h1>
          <p className="page-subtitle">Headers match title, status, assignedTo, priority, deadline, notes, and custom-field keys.</p>
        </div>
      </section>

      {error && <div className="notice danger" style={{ margin: '0 0 1rem' }}>{error}</div>}

      <section className="table-card" style={{ marginBottom: '1.5rem' }}>
        <table>
          <thead>
            <tr>
              {state.headers!.map(h => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {(state.rows || []).slice(0, 20).map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => <td key={j}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {(state.rows || []).length > 20 && (
          <p className="team-muted" style={{ padding: '0.5rem 1rem' }}>Showing first 20 of {state.rows!.length} rows.</p>
        )}
      </section>

      <div className="form-actions" style={{ display: 'flex', gap: '0.5rem' }}>
        <Link className="btn" to={`/work/${type}`}>Cancel</Link>
        <button className="btn primary" disabled={importing} onClick={handleImport}>
          <Icon name="upload" size={14} />
          {importing ? 'Importing…' : `Confirm import (${(state.rows || []).length} rows)`}
        </button>
      </div>
    </div>
  );
}
