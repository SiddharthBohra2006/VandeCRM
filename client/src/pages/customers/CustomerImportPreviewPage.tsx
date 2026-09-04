import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { customersApi, ImportPreviewRow } from '../../api/customers';
import { useAuth } from '../../contexts/AuthContext';

export default function CustomerImportPreviewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { crmTerms } = useAuth();
  const state = (location.state || {}) as {
    preview?: {
      headers: string[];
      totalRows: number;
      createCount: number;
      updateCount: number;
      skipCount: number;
      warningCount?: number;
      rows: ImportPreviewRow[];
    };
    csvData?: string;
    csvFileName?: string;
    duplicateRule?: string;
    mappings?: Record<string, string>;
    defaultStageId?: string;
    defaultAssignedToId?: string;
    defaultClientCompanyId?: string;
  };

  const [importing, setImporting] = useState(false);

  if (!state.preview || !state.csvData) {
    return (
      <div className="page-container">
        <section className="page-head">
          <div>
            <p className="eyebrow">Database</p>
            <h1>Preview {crmTerms.recordSingular} Import</h1>
          </div>
        </section>
        <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
          <p>No import data found. Start a new import.</p>
          <Link className="btn primary" to="/customers/import">Go to Import Wizard</Link>
        </div>
      </div>
    );
  }

  const { preview } = state;
  const rowSlice = preview.rows.slice(0, 50);

  const handleImport = async () => {
    try {
      setImporting(true);
      const res = await customersApi.import({
        csvData: state.csvData!,
        csvFileName: state.csvFileName,
        duplicateRule: state.duplicateRule,
        defaultStageId: state.defaultStageId,
        defaultAssignedToId: state.defaultAssignedToId,
      });
      navigate('/customers/import/results', {
        state: {
          imported: res.imported,
          updated: res.updated,
          skipped: res.skipped,
          totalRows: preview.totalRows,
          warnings: preview.rows.filter(r => r.messages.length > 0).map(r => `Row ${r.rowNumber}: ${r.messages.join('; ')}`),
        }
      });
    } catch (err: any) {
      alert(err.message || 'Import failed');
      setImporting(false);
    }
  };

  return (
    <div className="page-container">
      <section className="page-head">
        <div>
          <p className="eyebrow">Database</p>
          <h1>Preview {crmTerms.recordSingular} Import</h1>
          <p className="page-subtitle">Review column mappings, warnings, and matching rules before executing.</p>
        </div>
        <div className="actions" style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <Link className="btn secondary outline" to="/customers/import">Back to Mapping</Link>
          <button className="btn primary" disabled={preview.totalRows === 0 || importing} onClick={handleImport}>
            {importing ? 'Importing…' : `Import ${preview.totalRows} rows`}
          </button>
        </div>
      </section>

      <section className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: '1rem' }}>
        <div className="metric-card"><span>Total rows</span><strong>{preview.totalRows}</strong></div>
        <div className="metric-card" style={{ '--metric-color': 'var(--teal)' } as any}><span>Will create</span><strong>{preview.createCount}</strong></div>
        <div className="metric-card" style={{ '--metric-color': 'var(--gold)' } as any}><span>Will update</span><strong>{preview.updateCount}</strong></div>
        <div className="metric-card" style={{ '--metric-color': 'var(--muted)' } as any}><span>Will skip</span><strong>{preview.skipCount}</strong></div>
      </section>

      <section className="team-card wide" style={{ marginBottom: '1.5rem' }}>
        <div className="panel-title-row">
          <div>
            <h2>Applied Column Mapping</h2>
            <p className="team-muted">Matches applied to your CSV header columns.</p>
          </div>
        </div>
        <div className="import-mapping-grid" style={{ marginTop: '1rem', opacity: 0.85 }}>
          {preview.headers.map(header => (
            <div key={header} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', padding: '0.4rem 0' }}>
              <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text)' }}>{header}</span>
              <span className="pill" style={{ background: 'var(--hover)', fontSize: '0.74rem' }}>
                {state.mappings?.[header] === '__ignore' ? 'IGNORED' : (state.mappings?.[header] || header)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="table-card">
        {preview.rows.length > 50 && <p className="team-muted" style={{ padding: '0 1rem 1rem' }}>Showing the first 50 of {preview.rows.length} rows. All rows will be imported.</p>}
        <table>
          <thead>
            <tr>
              <th>Row</th>
              <th>Status</th>
              <th>{crmTerms.recordSingular}</th>
              <th>Contact</th>
              <th>Value</th>
              <th>Messages</th>
            </tr>
          </thead>
          <tbody>
            {rowSlice.length === 0 && (
              <tr><td colSpan={6} className="empty" style={{ textAlign: 'center', padding: '2rem' }}>No data rows were found.</td></tr>
            )}
            {rowSlice.map(row => (
              <tr key={row.rowNumber}>
                <td>{row.rowNumber}</td>
                <td>
                  <span className="pill" style={{ background: row.status === 'skip' ? 'var(--muted)' : row.status === 'update' ? 'var(--gold)' : 'var(--teal)' }}>
                    {row.status.toUpperCase()}
                  </span>
                </td>
                <td><strong>{row.name}</strong></td>
                <td>
                  <span style={{ display: 'block' }}>{row.phone || 'No phone'}</span>
                  <span style={{ display: 'block', color: 'var(--muted)', fontSize: '.75rem' }}>{row.email || 'No email'}</span>
                </td>
                <td>{(row as any).value ? `₹${Number((row as any).value || 0).toLocaleString('en-IN')}` : '—'}</td>
                <td>
                  {row.messages.length === 0 && <span style={{ color: 'var(--muted)' }}>Ready</span>}
                  {row.messages.map((msg, i) => (
                    <span key={i} style={{ display: 'block', color: 'var(--red)', fontWeight: 700 }}>{msg}</span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
