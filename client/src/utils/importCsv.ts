export const SCHEMA_OPTIONS = [
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

export function parseCsvRow(text: string): string[] {
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

export function parseCsv(text: string): string[][] {
  text = String(text || '').replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(value);
      if (row.some(cell => cell.trim() !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  if (inQuotes) throw new Error('CSV contains an unclosed quoted value.');
  row.push(value);
  if (row.some(cell => cell.trim() !== '')) rows.push(row);
  return rows;
}

export function suggestTarget(header: string): string {
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

type SheetJs = { read(data: ArrayBuffer, options: Record<string, unknown>): { SheetNames: string[]; Sheets: Record<string, unknown> }; utils: { sheet_to_csv(sheet: unknown, options: Record<string, unknown>): string } };
let sheetJsPromise: Promise<SheetJs> | null = null;
function loadSheetJs(): Promise<SheetJs> {
  const existing = (window as typeof window & { XLSX?: SheetJs }).XLSX;
  if (existing) return Promise.resolve(existing);
  if (sheetJsPromise) return sheetJsPromise;
  sheetJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    script.async = true;
    script.onload = () => {
      const loaded = (window as typeof window & { XLSX?: SheetJs }).XLSX;
      loaded ? resolve(loaded) : reject(new Error('Excel reader did not initialize.'));
    };
    script.onerror = () => reject(new Error('Excel reader could not load. Check your connection or save the sheet as CSV.'));
    document.head.appendChild(script);
  });
  return sheetJsPromise;
}

export async function importFileToCsv(file: File): Promise<string> {
  if (/\.csv$/i.test(file.name)) return file.text();
  if (!/\.xlsx?$/i.test(file.name)) throw new Error('Choose a .csv, .xlsx, or .xls file.');
  const XLSX = await loadSheetJs();
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const firstName = workbook.SheetNames[0];
  if (!firstName || !workbook.Sheets[firstName]) throw new Error('The Excel workbook has no readable worksheet.');
  return XLSX.utils.sheet_to_csv(workbook.Sheets[firstName], { dateNF: 'yyyy-mm-dd hh:mm' });
}
