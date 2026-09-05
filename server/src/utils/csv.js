function parseCsv(text) {
  text = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
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

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map(header => header.trim());
  return rows.slice(1).map(row => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = row[index] ? row[index].trim() : '';
    });
    return item;
  });
}

const customerAliases = {
    full_name: 'name', customer_name: 'name', lead_name: 'name', contact_name: 'name',
    email_id: 'email', email_address: 'email', mail_id: 'email',
    phone_number: 'phone', mobile: 'phone', mobile_number: 'phone', contact_number: 'phone', whatsapp_number: 'phone',
    current_status: 'stage', lead_status: 'stage', pipeline_stage: 'stage',
    comments: 'notes', comment: 'notes', remarks: 'notes', remark: 'notes',
    lead_source: 'source', deal_value: 'value', amount: 'value', tags: 'labels',
    course: 'campaign', course_name: 'campaign', pursuing_course: 'campaign', specialization_course: 'campaign', program: 'campaign', batch: 'campaign'
};

function suggestCustomerHeader(value) {
  const key = String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const standard = { name: 'name', company: 'company', email: 'email', phone: 'phone', source: 'source', value: 'value', priority: 'priority', leadscore: 'leadScore', lead_score: 'leadScore', stage: 'stage', labels: 'labels', notes: 'notes', campaign: 'campaign' };
  if (standard[key]) return standard[key];
  if (customerAliases[key]) return customerAliases[key];
  if (/(^|_)e_?mail($|_)/.test(key)) return 'email';
  if (/^(phone|phone_number|mobile|mobile_no|mobile_number|whatsapp|whatsapp_number|contact_no|contact_number)$/.test(key)) return 'phone';
  if (/^(full|customer|lead|contact)_?name$/.test(key)) return 'name';
  return value;
}

function normalizeCustomerCsv(rows, mappings = new Map()) {
  if (!rows.length) return rows;
  const keep = rows[0].map((header, index) => ({ index, header: mappings.get(header) || suggestCustomerHeader(header) })).filter(column => column.header !== '__ignore');
  return rows.map((row, rowIndex) => keep.map(column => rowIndex ? row[column.index] : column.header));
}

function escapeCsvValue(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(headers, rows) {
  const lines = [headers.map(escapeCsvValue).join(',')];
  rows.forEach(row => {
    lines.push(headers.map(header => escapeCsvValue(row[header])).join(','));
  });
  return lines.join('\r\n');
}

module.exports = { parseCsv, rowsToObjects, suggestCustomerHeader, normalizeCustomerCsv, toCsv };
