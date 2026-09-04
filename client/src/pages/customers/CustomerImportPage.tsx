import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { customersApi } from '../../api/customers';
import { useAuth } from '../../contexts/AuthContext';
import Icon from '../../components/Icons';

const SCHEMA_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'company', label: 'Company' },
  { value: 'stage', label: 'Pipeline Stage' },
  { value: 'source', label: 'Source' },
  { value: 'value', label: 'Value' },
  { value: 'priority', label: 'Priority' },
  { value: 'leadScore', label: 'Lead Score' },
  { value: 'labels', label: 'Labels (Pipe | separated)' },
  { value: 'notes', label: 'Notes / Comments' },
  { value: 'campaign', label: 'Campaign' },
  { value: 'nextFollowUpAt', label: 'Next Follow-up Date & Time' },
  { value: 'followUpComment', label: 'Follow-up Comment' },
];

function parseCsvRow(text: string): string[] {
  const result: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
    else if (char === '"') { inQuotes = !inQuotes; }
    else if (char === ',' && !inQuotes) { result.push(cell); cell = ''; }
    else { cell += char; }
  }
  result.push(cell);
  return result.map(c => c.trim());
}

function suggestTarget(header: string): string {
  const key = header.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const aliases: Record<string, string> = {
    full_name: 'name', customer_name: 'name', lead_name: 'name', contact_name: 'name',
    email_id: 'email', email_address: 'email', mail_id: 'email',
    phone_number: 'phone', mobile: 'phone', mobile_number: 'phone', contact_number: 'phone', whatsapp_number: 'phone',
    current_status: 'stage', lead_status: 'stage', pipeline_stage: 'stage',
    comments: 'notes', comment: 'notes', remarks: 'notes', remark: 'notes',
    lead_source: 'source', deal_value: 'value', amount: 'value', tags: 'labels',
    course: 'campaign', course_name: 'campaign', program: 'campaign', batch: 'campaign'
  };
  const standard: Record<string, string> = { name: 'name', company: 'company', email: 'email', phone: 'phone', source: 'source', value: 'value', priority: 'priority', leadscore: 'leadScore', lead_score: 'leadScore', stage: 'stage', labels: 'labels', notes: 'notes', campaign: 'campaign' };
  if (standard[key]) return standard[key];
  if (aliases[key]) return aliases[key];
  if (/(^|_)e_?mail($|_)/.test(key)) return 'email';
  if (/^(phone|phone_number|mobile|mobile_no|mobile_number|whatsapp|whatsapp_number|contact_no|contact_number)$/.test(key)) return 'phone';
  if (/^(full|customer|lead|contact)_?name$/.test(key)) return 'name';
  return header;
}

export default function CustomerImportPage() {
  const navigate = useNavigate();
  const { crmTerms } = useAuth();
  const [csvData, setCsvData] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [duplicateRule, setDuplicateRule] = useState('update');
  const [defaultStageId, setDefaultStageId] = useState('');
  const [defaultAssignedToId, setDefaultAssignedToId] = useState('');
  const [defaultClientCompanyId, setDefaultClientCompanyId] = useState('');
  const [defaultNextFollowUpAt, setDefaultNextFollowUpAt] = useState('');
  const [defaultFollowUpComment, setDefaultFollowUpComment] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState('');
  const [fileStatus, setFileStatus] = useState('');
  const [stages, setStages] = useState<{ _id: string; name: string; isDefault?: boolean }[]>([]);
  const [users, setUsers] = useState<{ _id: string; name: string; role?: string }[]>([]);
  const [companies, setCompanies] = useState<{ _id: string; name: string }[]>([]);
  const [presetName, setPresetName] = useState('');
  const [presets, setPresets] = useState<Record<string, Record<string, string>>>(
    JSON.parse(localStorage.getItem('import-mapping-presets') || '{}')
  );

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
      setFileStatus('Invalid file type. Please select Excel or CSV.');
      return;
    }
    setCsvFileName(file.name);
    setFileStatus(`Reading ${Math.max(1, Math.round(file.size / 1024))} KB file...`);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = (e.target?.result as string) || '';
      setCsvData(content);
      const lines = content.split(/\r?\n/);
      const parsed = parseCsvRow(lines[0] || '');
      if (!parsed.length || !parsed[0]) {
        setFileStatus('No columns detected in file.');
        return;
      }
      setHeaders(parsed.filter(h => h.trim()));
      const initialMappings: Record<string, string> = {};
      parsed.filter(h => h.trim()).forEach(h => { initialMappings[h] = suggestTarget(h); });
      setMappings(initialMappings);
      setFileStatus(`${lines.length - 1} rows ready.`);
    };
    reader.readAsText(file);
  };

  const handlePreview = async () => {
    if (!csvData.trim()) return;
    try {
      setPreviewing(true);
      setError('');
      const res = await customersApi.importPreview({ csvData, csvFileName, duplicateRule });
      navigate('/customers/import/preview', {
        state: {
          preview: res.preview,
          csvData, csvFileName, duplicateRule, mappings,
          defaultStageId, defaultAssignedToId, defaultClientCompanyId,
          defaultNextFollowUpAt, defaultFollowUpComment,
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
          <Link className="btn secondary outline" to="/customers">Cancel</Link>
        </div>
      </section>

      {error && <div className="notice danger" style={{ margin: '0 0 1rem' }}>{error}</div>}

      <section className="team-card wide" style={{ marginBottom: '1.5rem' }}>
        <div className="panel-title-row">
          <div>
            <h2>Step 1: Upload Excel or CSV</h2>
            <p className="team-muted">Upload .xlsx, .xls, or .csv files.</p>
          </div>
        </div>
        <label className="csv-file-picker" style={{ border: '2px dashed var(--border)', padding: '2rem', textAlign: 'center', borderRadius: 8, cursor: 'pointer', background: 'var(--hover)', display: 'block', marginTop: '1rem' }}>
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
