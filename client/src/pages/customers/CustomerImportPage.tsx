import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { customersApi } from '../../api/customers';
import { useAuth } from '../../contexts/AuthContext';
import Icon from '../../components/Icons';
import { SCHEMA_OPTIONS, importFileToCsv, parseCsvRow, suggestTarget } from '../../utils/importCsv';

export default function CustomerImportPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isClientScope = searchParams.get('scope') === 'client' || location.pathname.startsWith('/clients') || (location.state as any)?.scope === 'clients';
  const scope = isClientScope ? 'clients' : undefined;
  const stateDraft = (location.state || {}) as any;
  const { crmTerms, user } = useAuth();
  const [csvData, setCsvData] = useState(stateDraft.csvData || '');
  const [csvFileName, setCsvFileName] = useState(stateDraft.csvFileName || '');
  const [headers, setHeaders] = useState<string[]>(() => {
    if (stateDraft.csvData) {
      const firstLine = stateDraft.csvData.split(/\r?\n/)[0] || '';
      return parseCsvRow(firstLine).filter(Boolean);
    }
    return [];
  });
  const [mappings, setMappings] = useState<Record<string, string>>(stateDraft.mappings || {});
  const [duplicateRule, setDuplicateRule] = useState(stateDraft.duplicateRule || 'update');
  const [defaultStageId, setDefaultStageId] = useState(stateDraft.defaultStageId || '');
  const [defaultAssignedToId, setDefaultAssignedToId] = useState(stateDraft.defaultAssignedToId || '');
  const [defaultClientCompanyId, setDefaultClientCompanyId] = useState(stateDraft.defaultClientCompanyId || '');
  const [defaultNextFollowUpAt, setDefaultNextFollowUpAt] = useState(stateDraft.defaultNextFollowUpAt || '');
  const [defaultFollowUpComment, setDefaultFollowUpComment] = useState(stateDraft.defaultFollowUpComment || '');
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState('');
  const [fileStatus, setFileStatus] = useState(stateDraft.csvData ? 'File loaded from draft.' : '');
  const [stages, setStages] = useState<{ _id: string; name: string; isDefault?: boolean; isWon?: boolean; isActive?: boolean }[]>([]);
  const [users, setUsers] = useState<{ _id: string; name: string; role?: string }[]>([]);
  const [companies, setCompanies] = useState<{ _id: string; name: string }[]>([]);
  const [presetName, setPresetName] = useState('');
  const [presets, setPresets] = useState<Record<string, Record<string, string>>>(
    JSON.parse(localStorage.getItem('import-mapping-presets') || '{}')
  );

  useEffect(() => {
    customersApi.list({ pageSize: '1' }).then(res => {
      if (res.stages) {
        setStages(res.stages);
        if (isClientScope && !defaultStageId) {
          const won = res.stages.find((s: any) => s.isWon && s.isActive) || res.stages.find((s: any) => s.isWon);
          if (won) setDefaultStageId(won._id);
        }
      }
      if (res.users) setUsers(res.users);
      if (res.companies) setCompanies(res.companies);
    }).catch(() => {});
  }, []);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setCsvFileName(file.name);
    setFileStatus(`Reading ${Math.max(1, Math.round(file.size / 1024))} KB file...`);
    try {
      const content = await importFileToCsv(file);
      setCsvData(content);
      const lines = content.split(/\r?\n/);
      const parsed = parseCsvRow(lines[0] || '').filter(h => h.trim());
      if (!parsed.length) throw new Error('No columns detected in file.');
      setHeaders(parsed);
      setMappings(Object.fromEntries(parsed.map(header => [header, suggestTarget(header)])));
      setFileStatus(`${Math.max(0, lines.length - 1)} rows ready from the first worksheet.`);
    } catch (caught) {
      setCsvData(''); setHeaders([]); setMappings({});
      setFileStatus(caught instanceof Error ? caught.message : 'Failed to read import file.');
    }
  };

  const handlePreview = async () => {
    if (!csvData.trim()) return;
    try {
      setPreviewing(true);
      setError('');
      const res = await customersApi.importPreview({
        csvData,
        csvFileName,
        duplicateRule,
        mappings,
        defaultStageId,
        defaultAssignedToId,
        defaultClientCompanyId,
        defaultNextFollowUpAt,
        defaultFollowUpComment,
        scope
      });
      navigate('/customers/import/preview', {
        state: {
          preview: res.preview,
          csvData, csvFileName, duplicateRule, mappings,
          defaultStageId, defaultAssignedToId, defaultClientCompanyId,
          defaultNextFollowUpAt, defaultFollowUpComment,
          scope,
        }
      });
    } catch (err: any) {
      setError(err.message || 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  };

  const loadPreset = (name: string) => {
    const p = presets[name];
    if (p) {
      const updated = { ...mappings };
      Object.entries(p).forEach(([header, target]) => { updated[header] = target; });
      setMappings(updated);
    }
  };

  const savePreset = () => {
    if (!presetName.trim()) return;
    const updated = { ...presets, [presetName.trim()]: { ...mappings } };
    setPresets(updated);
    localStorage.setItem('import-mapping-presets', JSON.stringify(updated));
    setPresetName('');
  };

  return (
    <div className="page-container">
      <section className="page-head">
        <div>
          <p className="eyebrow">Database</p>
          <h1>{crmTerms.recordSingular} Import Wizard</h1>
          <p className="page-subtitle">Map columns, configure rules, and preview your import.</p>
        </div>
        <div className="actions">
          <Link className="btn secondary outline" to={isClientScope ? '/clients' : '/customers'}>Cancel</Link>
        </div>
      </section>

      {error && <div className="notice danger" style={{ margin: '0 0 1rem' }}>{error}</div>}

      <section className="team-card wide" style={{ marginBottom: '1.5rem' }}>
        <div className="panel-title-row">
          <div>
            <h2>Step 1: Upload Excel or CSV</h2>
            <p className="team-muted">Upload .xlsx, .xls, or .csv. Excel files use the first worksheet.</p>
          </div>
        </div>
        <label
          className="csv-file-picker"
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={e => {
            e.preventDefault();
            e.stopPropagation();
            handleFile(e.dataTransfer?.files?.[0]);
          }}
          style={{ border: '2px dashed var(--border)', padding: '2rem', textAlign: 'center', borderRadius: 8, cursor: 'pointer', background: 'var(--hover)', display: 'block', marginTop: '1rem' }}
        >
          <span style={{ fontSize: '0.95rem', color: 'var(--text)', display: 'block', marginBottom: '0.5rem', fontWeight: 700 }}>Drag and drop Excel or CSV here, or click to browse</span>
          <input type="file" accept=".xlsx,.xls,.csv,text/csv" style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files?.[0])} />
          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--gold)' }}>
            {csvFileName || 'No file selected'}
          </span>
        </label>
        {fileStatus && <p className="team-muted" style={{ marginTop: '0.5rem', fontSize: '0.78rem' }}>{fileStatus}</p>}
      </section>

      {headers.length > 0 && (
        <>
          <section className="team-card wide" style={{ marginBottom: '1.5rem' }}>
            <div className="panel-title-row">
              <div>
                <h2>Step 2: Match Columns to CRM Fields</h2>
                <p className="team-muted">Match each CSV header to a field. Unmatched headers can be ignored or created as custom fields.</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <select className="form-control" style={{ width: 180, padding: '0.4rem', fontSize: '0.8rem' }}
                  value="" onChange={e => { if (e.target.value) loadPreset(e.target.value); }}>
                  <option value="">-- Load Preset --</option>
                  {Object.keys(presets).map(name => <option key={name} value={name}>{name}</option>)}
                </select>
                <input type="text" className="form-control" placeholder="Preset name" style={{ width: 140, padding: '0.4rem', fontSize: '0.8rem' }}
                  value={presetName} onChange={e => setPresetName(e.target.value)} />
                <button type="button" className="btn secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={savePreset}>Save Preset</button>
              </div>
            </div>
            <div className="import-mapping-grid" style={{ marginTop: '1.5rem' }}>
              {headers.map(header => (
                <label key={header} className="mapping-control-row" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text)' }}><Icon name="help-circle" size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />{header}</span>
                  <select className="form-control" style={{ width: '100%', padding: '0.5rem' }}
                    value={mappings[header] || header}
                    onChange={e => setMappings(prev => ({ ...prev, [header]: e.target.value }))}>
                    {SCHEMA_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                    <option value={header}>New custom field</option>
                    <option value="__ignore">Ignore column</option>
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section className="team-card wide" style={{ marginBottom: '1.5rem' }}>
            <div className="panel-title-row">
              <div>
                <h2>Step 3: Import Rules & Defaults</h2>
                <p className="team-muted">Define how duplicate leads are handled and set fallback values.</p>
              </div>
            </div>
            <div className="form-grid" style={{ marginTop: '1.5rem' }}>
              <label>
                <span>Duplicate Handling Rule</span>
                <select value={duplicateRule} onChange={e => setDuplicateRule(e.target.value)} required>
                  <option value="update">Update existing records (Match by email or phone)</option>
                  <option value="skip">Skip duplicates</option>
                  <option value="create">Create new records anyway</option>
                </select>
              </label>
              <label>
                <span>Default Pipeline Stage</span>
                <select value={defaultStageId} onChange={e => setDefaultStageId(e.target.value)}>
                  <option value="">Default CRM Stage</option>
                  {stages.map(stage => (
                    <option key={stage._id} value={stage._id}>{stage.name} {stage.isDefault ? '(Default)' : ''}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Default Lead Owner</span>
                <select value={defaultAssignedToId} onChange={e => setDefaultAssignedToId(e.target.value)}>
                  <option value="">Current User ({user?.name || 'Me'})</option>
                  {users.map(u => (
                    <option key={u._id} value={u._id}>{u.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Default follow-up date & time (optional)</span>
                <input type="datetime-local" value={defaultNextFollowUpAt} onChange={e => setDefaultNextFollowUpAt(e.target.value)} />
              </label>
              <label>
                <span>Default follow-up comment (optional)</span>
                <input maxLength={1000} placeholder="Why and what should happen next" value={defaultFollowUpComment} onChange={e => setDefaultFollowUpComment(e.target.value)} />
              </label>
            </div>
          </section>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn primary" style={{ padding: '0.75rem 2rem', fontSize: '0.95rem' }}
              disabled={previewing} onClick={handlePreview}>
              {previewing ? 'Loading preview…' : 'Next: Preview Import →'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
