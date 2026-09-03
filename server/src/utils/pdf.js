function escapePdfText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, '?');
}

function createSimpleReportPdf(title, subtitle, columns, rows) {
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 42;
  const lineHeight = 16;
  const colWidth = (pageWidth - margin * 2) / columns.length;
  const pages = [];
  let pageLines = [];

  function pushPage() {
    pages.push(pageLines);
    pageLines = [];
  }

  pageLines.push({ text: title, x: margin, y: pageHeight - margin, size: 16, bold: true });
  pageLines.push({ text: subtitle, x: margin, y: pageHeight - margin - 22, size: 9 });
  let y = pageHeight - margin - 54;

  const addHeader = () => {
    columns.forEach((column, index) => {
      pageLines.push({ text: column, x: margin + index * colWidth, y, size: 8, bold: true });
    });
    y -= lineHeight;
  };

  addHeader();

  rows.slice(0, 300).forEach(row => {
    if (y < margin + lineHeight) {
      pushPage();
      y = pageHeight - margin;
      addHeader();
    }

    columns.forEach((column, index) => {
      const text = String(row[column] === undefined || row[column] === null ? '' : row[column]).slice(0, 32);
      pageLines.push({ text, x: margin + index * colWidth, y, size: 7 });
    });
    y -= lineHeight;
  });

  if (!rows.length) {
    pageLines.push({ text: 'No rows found for this report.', x: margin, y, size: 9 });
  }
  pushPage();

  const objects = [];
  const pageRefs = [];

  function addObject(body) {
    objects.push(body);
    return objects.length;
  }

  const fontRegular = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const fontBold = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  pages.forEach(lines => {
    const content = lines.map(line => {
      const font = line.bold ? 'F2' : 'F1';
      return `BT /${font} ${line.size} Tf ${line.x} ${line.y} Td (${escapePdfText(line.text)}) Tj ET`;
    }).join('\n');
    const contentRef = addObject(`<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`);
    const pageRef = addObject(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentRef} 0 R >>`);
    pageRefs.push(pageRef);
  });

  const pagesRef = addObject(`<< /Type /Pages /Kids [${pageRefs.map(ref => `${ref} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`);
  pageRefs.forEach(ref => {
    objects[ref - 1] = objects[ref - 1].replace('/Parent 0 0 R', `/Parent ${pagesRef} 0 R`);
  });
  const catalogRef = addObject(`<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogRef} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

module.exports = { createSimpleReportPdf };
