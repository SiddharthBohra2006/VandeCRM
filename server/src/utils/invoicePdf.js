const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 42;
const NAVY = [0.08, 0.11, 0.16];
const GOLD = [0.78, 0.59, 0.05];
const TEXT = [0.12, 0.16, 0.22];
const MUTED = [0.36, 0.41, 0.49];
const BORDER = [0.87, 0.89, 0.92];
const PALE = [0.97, 0.97, 0.95];
const GREEN = [0.08, 0.48, 0.31];
const GREEN_PALE = [0.90, 0.97, 0.93];

function clean(value) {
  const map = { '₹': 'Rs. ', '–': '-', '—': '-', '’': "'", '“': '"', '”': '"', '•': '-', '\u00a0': ' ', '\u2212': '-' };
  return String(value ?? '').replace(/[^\x20-\x7e]/g, char => map[char] || '?');
}

function wrap(value, maxChars) {
  const words = clean(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (let word of words) {
    while (word.length > maxChars) {
      if (line) { lines.push(line); line = ''; }
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if (line && `${line} ${word}`.length > maxChars) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function color(values) { return values.map(value => value.toFixed(3)).join(' '); }
function escape(value) { return clean(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }

function createInvoicePdf({ company, invoice, customer, total, paid, balance, status, discountAmount }) {
  const pages = [[]];
  let page = pages[0];
  let y = 0;
  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  const money = value => `Rs. ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatDate = value => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not set';

  function rect(x, top, width, height, fill, stroke = null) {
    const bottom = PAGE_HEIGHT - top - height;
    page.push(`q ${color(fill)} rg ${x} ${bottom} ${width} ${height} re f Q`);
    if (stroke) page.push(`q ${color(stroke)} RG 0.7 w ${x} ${bottom} ${width} ${height} re S Q`);
  }
  function line(x1, top, x2, stroke = BORDER, width = 0.7) {
    const py = PAGE_HEIGHT - top;
    page.push(`q ${color(stroke)} RG ${width} w ${x1} ${py} m ${x2} ${py} l S Q`);
  }
  function text(x, top, value, size = 9, fill = TEXT, bold = false, align = 'left') {
    const valueText = clean(value);
    const approxWidth = valueText.length * size * (bold ? 0.55 : 0.51);
    const tx = align === 'right' ? x - approxWidth : x;
    const baseline = PAGE_HEIGHT - top - size;
    page.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color(fill)} rg ${tx.toFixed(2)} ${baseline.toFixed(2)} Td (${escape(valueText)}) Tj ET`);
  }
  function startPage(continuation = false) {
    page = [];
    pages.push(page);
    rect(0, 0, PAGE_WIDTH, 6, GOLD);
    text(MARGIN, 22, clean(company.name || 'Company').slice(0, 48), 15, NAVY, true);
    text(PAGE_WIDTH - MARGIN, 22, `INVOICE ${invoice.invoiceNumber}`, 11, MUTED, true, 'right');
    line(MARGIN, 52, PAGE_WIDTH - MARGIN);
    text(MARGIN, 65, continuation ? 'Invoice details continued' : 'Invoice details', 10, NAVY, true);
    y = 94;
  }
  function ensureSpace(height) {
    if (y + height > PAGE_HEIGHT - 54) startPage(true);
  }
  function section(title) {
    ensureSpace(28);
    text(MARGIN, y, title.toUpperCase(), 8, MUTED, true);
    line(MARGIN, y + 17, PAGE_WIDTH - MARGIN);
    y += 23;
  }
  function row(label, value, options = {}) {
    ensureSpace(20);
    text(options.x ?? MARGIN, y, label, options.size ?? 9, options.labelColor ?? TEXT, options.boldLabel ?? false);
    text(options.right ?? PAGE_WIDTH - MARGIN, y, value, options.size ?? 9, options.valueColor ?? TEXT, options.boldValue ?? false, 'right');
    y += options.height ?? 21;
  }
  function paragraph(value, x, width, size = 8.5, fill = MUTED, maxChars = 94) {
    const lines = wrap(value, maxChars);
    for (const lineText of lines) {
      ensureSpace(14);
      text(x, y, lineText, size, fill);
      y += 12;
    }
  }

  rect(0, 0, PAGE_WIDTH, 120, NAVY);
  rect(0, 0, PAGE_WIDTH, 5, GOLD);
  text(MARGIN, 26, clean(company.name || 'Company').slice(0, 42), 19, GOLD, true);
  text(PAGE_WIDTH - MARGIN, 24, 'INVOICE', 25, [1, 1, 1], true, 'right');
  text(MARGIN, 57, [company.location, company.phone, company.email].filter(Boolean).join('  |  ').slice(0, 78), 8.5, [0.89, 0.91, 0.94]);
  text(MARGIN, 91, `Invoice ${invoice.invoiceNumber}`, 10, [1, 1, 1], true);
  text(PAGE_WIDTH - MARGIN, 91, `Issued ${formatDate(invoice.createdAt)}`, 9, [0.89, 0.91, 0.94], false, 'right');

  const panelTop = 137;
  rect(MARGIN, panelTop, 310, 91, PALE, BORDER);
  rect(365, panelTop, 205, 91, PALE, BORDER);
  text(MARGIN + 12, panelTop + 10, 'BILL TO', 8, MUTED, true);
  text(MARGIN + 12, panelTop + 27, customer.name || 'Client', 12, TEXT, true);
  let clientLineY = panelTop + 47;
  for (const detail of [customer.company, customer.email, customer.phone].filter(Boolean).slice(0, 3)) {
    text(MARGIN + 12, clientLineY, detail.slice(0, 50), 8, MUTED);
    clientLineY += 12;
  }
  text(377, panelTop + 10, 'INVOICE DETAILS', 8, MUTED, true);
  text(377, panelTop + 29, 'Due date', 8, MUTED);
  text(558, panelTop + 29, formatDate(invoice.dueDate), 8, TEXT, true, 'right');
  text(377, panelTop + 48, 'Status', 8, MUTED);
  text(558, panelTop + 48, String(status).toUpperCase(), 8, status === 'paid' ? GREEN : NAVY, true, 'right');
  text(377, panelTop + 67, 'Currency', 8, MUTED);
  text(558, panelTop + 67, 'INR', 8, TEXT, true, 'right');
  y = 248;

  section('Agreement');
  rect(MARGIN, y, contentWidth, 24, PALE);
  text(MARGIN + 12, y + 8, 'SERVICE / DESCRIPTION', 8, MUTED, true);
  text(PAGE_WIDTH - MARGIN - 12, y + 8, 'AGREED AMOUNT', 8, MUTED, true, 'right');
  y += 31;
  const descLines = wrap(invoice.description || 'Services', 66);
  for (const descLine of descLines) {
    ensureSpace(16);
    text(MARGIN + 12, y, descLine, 9, TEXT, true);
    y += 12;
  }
  text(PAGE_WIDTH - MARGIN - 12, y - descLines.length * 14, money(invoice.amount), 9, TEXT, true, 'right');
  y += 5;
  if (invoice.agreementTerms) {
    line(MARGIN, y, PAGE_WIDTH - MARGIN);
    y += 5;
    text(MARGIN + 12, y, 'AGREED TERMS / DELIVERABLES', 7.5, MUTED, true);
    y += 11;
    paragraph(invoice.agreementTerms, MARGIN + 12, contentWidth - 24, 8, MUTED, 104);
    y += 4;
  }
  line(MARGIN, y, PAGE_WIDTH - MARGIN);
  y += 12;

  const summaryWidth = 250;
  const summaryX = PAGE_WIDTH - MARGIN - summaryWidth;
  const subtotal = Number(invoice.amount || 0);
  const netRows = [
    ['Agreed amount', money(subtotal)],
    ...(Number(invoice.discount || 0) ? [[`Discount${invoice.discountType === 'percent' ? ` (${invoice.discount}%)` : ''}`, `-${money(discountAmount)}`]] : []),
    ['Total after discount', money(total)],
    ['Paid so far', money(paid)],
  ];
  const summaryHeight = netRows.length * 20 + 40;
  ensureSpace(summaryHeight);
  rect(summaryX, y, summaryWidth, summaryHeight, PALE, BORDER);
  let summaryY = y + 12;
  netRows.forEach(([label, value], index) => {
    const emphasized = index === 2;
    text(summaryX + 12, summaryY, label, emphasized ? 9 : 8.5, emphasized ? NAVY : MUTED, emphasized);
    text(summaryX + summaryWidth - 12, summaryY, value, emphasized ? 10 : 8.5, emphasized ? NAVY : TEXT, true, 'right');
    summaryY += 20;
    if (index === 1 || (index === 0 && netRows.length === 2)) line(summaryX + 12, summaryY - 3, summaryX + summaryWidth - 12);
  });
  rect(summaryX + 1, summaryY + 1, summaryWidth - 2, 30, balance <= 0 ? GREEN_PALE : [1, 0.96, 0.91]);
  text(summaryX + 12, summaryY + 9, balance <= 0 ? 'PAID IN FULL' : 'BALANCE DUE', 8, balance <= 0 ? GREEN : NAVY, true);
  text(summaryX + summaryWidth - 12, summaryY + 8, money(balance), 10, balance <= 0 ? GREEN : NAVY, true, 'right');
  y += summaryHeight + 12;

  const sortedInstallments = [...(invoice.installments || [])].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  if (sortedInstallments.length) {
    ensureSpace(78);
    section('Payment schedule');
    rect(MARGIN, y, contentWidth, 22, PALE);
    text(MARGIN + 10, y + 6, 'PAYMENT', 7.5, MUTED, true);
    text(MARGIN + 263, y + 6, 'DUE DATE', 7.5, MUTED, true);
    text(MARGIN + 355, y + 6, 'AMOUNT', 7.5, MUTED, true);
    text(PAGE_WIDTH - MARGIN - 10, y + 6, 'STATUS', 7.5, MUTED, true, 'right');
    y += 27;
    let paidLeft = Number(paid || 0);
    sortedInstallments.forEach((installment, index) => {
      ensureSpace(25);
      const allocated = Math.min(Number(installment.amount || 0), paidLeft);
      paidLeft = Math.max(0, paidLeft - allocated);
      const remaining = Math.max(0, Number(installment.amount || 0) - allocated);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const due = new Date(installment.dueDate); due.setHours(0, 0, 0, 0);
      const rowStatus = remaining === 0 ? 'Paid' : allocated > 0 ? 'Partially paid' : due < today ? 'Overdue' : 'Upcoming';
      if (index % 2 === 1) rect(MARGIN, y - 3, contentWidth, 22, [0.985, 0.988, 0.993]);
      text(MARGIN + 10, y, installment.name || `Payment ${index + 1}`, 8.5, TEXT, true);
      text(MARGIN + 263, y, formatDate(installment.dueDate), 8, MUTED);
      text(MARGIN + 355, y, money(installment.amount), 8.5, TEXT);
      text(PAGE_WIDTH - MARGIN - 10, y, rowStatus, 8, rowStatus === 'Paid' ? GREEN : MUTED, true, 'right');
      y += 19;
    });
    y += 4;
  } else if (invoice.monthlyRenewal) {
    section('Payment terms');
    paragraph('Monthly renewal. The next invoice is created only after you confirm Continue. No automatic charges.', MARGIN, contentWidth, 8.5, MUTED, 100);
    y += 7;
  }

  if ((invoice.payments || []).length) {
    // Keep the section title, column headings and first payment together.
    ensureSpace(76);
    section('Payments received');
    rect(MARGIN, y, contentWidth, 22, PALE);
    text(MARGIN + 10, y + 6, 'DATE', 7.5, MUTED, true);
    text(MARGIN + 130, y + 6, 'METHOD / REFERENCE', 7.5, MUTED, true);
    text(PAGE_WIDTH - MARGIN - 10, y + 6, 'AMOUNT', 7.5, MUTED, true, 'right');
    y += 27;
    [...invoice.payments].sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt)).forEach((payment, index) => {
      ensureSpace(24);
      if (index % 2 === 1) rect(MARGIN, y - 3, contentWidth, 22, [0.985, 0.988, 0.993]);
      text(MARGIN + 10, y, formatDate(payment.paidAt), 8, MUTED);
      text(MARGIN + 130, y, `${payment.method || 'Payment'}${payment.reference ? ` / ${payment.reference}` : ''}`.slice(0, 58), 8, TEXT);
      text(PAGE_WIDTH - MARGIN - 10, y, money(payment.amount), 8.5, TEXT, true, 'right');
      y += 19;
    });
  }

  pages.forEach((pageContent, index) => {
    const footer = `Invoice ${invoice.invoiceNumber}  |  Generated by ${clean(company.name || 'CRM')}  |  Page ${index + 1} of ${pages.length}`;
    pageContent.push(`BT /F1 7 Tf ${color(MUTED)} rg ${MARGIN} 25 Td (${escape(footer)}) Tj ET`);
    pageContent.push(`q ${color(BORDER)} RG 0.6 w ${MARGIN} 38 m ${PAGE_WIDTH - MARGIN} 38 l S Q`);
  });

  const objects = [];
  const addObject = body => { objects.push(body); return objects.length; };
  const regularFont = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const boldFont = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pageRefs = [];
  pages.forEach(pageContent => {
    const content = pageContent.join('\n');
    const streamRef = addObject(`<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`);
    pageRefs.push(addObject(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFont} 0 R /F2 ${boldFont} 0 R >> >> /Contents ${streamRef} 0 R >>`));
  });
  const pagesRef = addObject(`<< /Type /Pages /Kids [${pageRefs.map(ref => `${ref} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`);
  pageRefs.forEach(ref => { objects[ref - 1] = objects[ref - 1].replace('/Parent 0 0 R', `/Parent ${pagesRef} 0 R`); });
  const catalogRef = addObject(`<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => { offsets.push(Buffer.byteLength(pdf, 'utf8')); pdf += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogRef} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

module.exports = { createInvoicePdf };
