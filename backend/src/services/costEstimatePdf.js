import { readFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { ESTIMATE_ACKNOWLEDGMENT, estimatePresentation } from './costEstimatePolicy.js';

const pageWidth = 612;
const pageHeight = 792;
const margin = 40;
const width = pageWidth - 2 * margin;
const lowerEdge = 46;
const colors = {
  text: rgb(.1, .16, .21),
  muted: rgb(.28, .36, .41),
  rule: rgb(.69, .75, .77),
  light: rgb(.94, .97, .96),
  accent: rgb(.12, .30, .25)
};
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = cents => cents == null ? 'Pending' : currency.format(cents / 100);
const columns = [
  { heading: 'Service period', width: 94 },
  { heading: 'Code', width: 56 },
  { heading: 'Description', width: 166 },
  { heading: 'Qty', width: 44 },
  { heading: 'Unit charge', width: 84, align: 'right' },
  { heading: 'Estimated charge', width: 88, align: 'right' }
];

async function embedLogo(pdf, relativePath) {
  try {
    return await pdf.embedPng(await readFile(new URL(relativePath, import.meta.url)));
  } catch {
    // The organization name is printed even when an optional logo is unavailable.
    return null;
  }
}

export async function renderCostEstimatePdf(item) {
  const snapshot = item.snapshot || item;
  const { summaryLabel, servicePeriod, disclosures } = estimatePresentation(snapshot);
  const pdf = await PDFDocument.create();
  pdf.setTitle(snapshot.title);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const characters = new Set(normal.getCharacterSet());
  const portalLogo = await embedLogo(pdf, '../assets/auricwell/logo.png');
  const slug = String(snapshot.agency.slug || '').toLowerCase();
  const agencyLogoPath = slug === 'itsco' ? '../assets/providerActionPdf/itsco-logo.png'
    : ['nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up'].includes(slug) ? '../assets/costEstimates/nlu-logo.png' : null;
  const agencyLogo = agencyLogoPath ? await embedLogo(pdf, agencyLogoPath) : null;
  let page;
  let y;

  const display = value => [...String(value ?? '').normalize()].map(char =>
    characters.has(char.codePointAt(0)) ? char : char === '−' ? '-' : ' ').join('');
  function lines(value, maxWidth, font, size) {
    const result = [];
    let line = '';
    for (const word of display(value).trim().split(/\s+/).filter(Boolean)) {
      const combined = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(combined, size) <= maxWidth) {
        line = combined;
      } else {
        if (line) result.push(line);
        line = '';
        for (const char of word) {
          if (line && font.widthOfTextAtSize(line + char, size) > maxWidth) {
            result.push(line);
            line = '';
          }
          line += char;
        }
      }
    }
    if (line) result.push(line);
    return result.length ? result : [''];
  }
  function text(value, x, baseline, options = {}) {
    page.drawText(value, { x, y: baseline, font: normal, size: 10, color: colors.text, ...options });
  }
  function logo(image, x, baseline, maxWidth) {
    const scale = Math.min(maxWidth / image.width, 28 / image.height);
    page.drawImage(image, { x, y: baseline, width: image.width * scale, height: image.height * scale });
  }
  function nextPage() {
    page = pdf.addPage([pageWidth, pageHeight]);
    if (agencyLogo) logo(agencyLogo, margin, 736, 80);
    const brandX = margin + (agencyLogo ? Math.min(80, 28 * agencyLogo.width / agencyLogo.height) + 9 : 0);
    const agencyName = lines(snapshot.agency.name, 388 - brandX, bold, 13).slice(0, 2);
    agencyName.forEach((line, i) => text(line, brandX, 751 - 14 * i, { font: bold, size: 13, color: colors.accent }));
    if (portalLogo) logo(portalLogo, 461, 736, 28);
    text('AuricWell', 495, 747, { font: bold, size: 13, color: colors.accent });
    page.drawLine({ start: { x: margin, y: 725 }, end: { x: pageWidth - margin, y: 725 }, color: colors.rule, thickness: 1 });
    y = 705;
  }
  function ensureSpace(height) {
    if (y - height >= lowerEdge) return false;
    nextPage();
    return true;
  }
  function paragraph(value, { size = 10, font = normal, gap = 8, color = colors.text } = {}) {
    const height = size + 4;
    for (const line of lines(value, width, font, size)) {
      ensureSpace(height);
      text(line, margin, y - size, { font, size, color });
      y -= height;
    }
    y -= gap;
  }
  function fieldRow(fields) {
    const cellWidth = width / fields.length;
    const values = fields.map(([, value]) => lines(value || 'Review required', cellWidth - 16, normal, 10));
    const height = 28 + 14 * Math.max(...values.map(parts => parts.length));
    ensureSpace(height);
    for (const [index, [label]] of fields.entries()) {
      const x = margin + index * cellWidth;
      text(label, x, y - 10, { font: bold, size: 9, color: colors.muted });
      values[index].forEach((line, i) => text(line, x, y - 25 - 14 * i));
    }
    y -= height;
  }
  function tableRow(values, { header = false, total = false } = {}) {
    const size = header ? 9 : 10;
    const font = header || total ? bold : normal;
    const cells = columns.map((column, i) => lines(values[i], column.width - 12, font, size));
    const height = 14 * Math.max(...cells.map(parts => parts.length)) + 12;
    if (ensureSpace(height + (header ? 0 : 29)) && !header) tableRow(columns.map(column => column.heading), { header: true });
    let x = margin;
    for (const [i, column] of columns.entries()) {
      page.drawRectangle({
        x, y: y - height, width: column.width, height, borderWidth: .6, borderColor: colors.rule,
        ...(header || total ? { color: colors.light } : {})
      });
      cells[i].forEach((line, row) => {
        const start = column.align === 'right' ? x + column.width - 6 - font.widthOfTextAtSize(line, size) : x + 6;
        text(line, start, y - 17 - 14 * row, { font, size });
      });
      x += column.width;
    }
    y -= height;
  }

  nextPage();
  paragraph(snapshot.title || 'Good Faith Estimate', { size: 25, font: bold, gap: 9 });
  if (!item.status || item.status === 'draft') paragraph('Draft for billing review', { font: bold, color: colors.accent });
  paragraph('Estimate of what you could pay', { font: bold, size: 15, gap: 5 });
  fieldRow([
    ['Patient name', snapshot.patient.name],
    ['Date of birth', snapshot.patient.dateOfBirth],
    ['Assigned provider', snapshot.provider.name]
  ]);
  fieldRow([
    ['Service location', snapshot.location.address],
    ['Provider NPI', snapshot.provider.npi],
    ['Billing NPI / tax ID', [snapshot.agency.npi, snapshot.agency.taxId].filter(Boolean).join(' / ')]
  ]);
  ensureSpace(57);
  page.drawRectangle({ x: margin, y: y - 49, width, height: 49, color: colors.light, borderColor: colors.accent, borderWidth: 1 });
  text(summaryLabel, margin + 12, y - 20, { size: 13, font: bold, color: colors.accent });
  text(display(servicePeriod), margin + 12, y - 36, { size: 9, color: colors.muted });
  const total = money(snapshot.totalCents);
  text(total, pageWidth - margin - 12 - bold.widthOfTextAtSize(total, 18), y - 29, { font: bold, size: 18, color: colors.accent });
  y -= 65;

  ensureSpace(82);
  paragraph('More details about your total cost estimate', { font: bold, size: 15, gap: 3 });
  paragraph(`Expected frequency: ${snapshot.frequency}`, { gap: 3 });
  paragraph(`Diagnosis: ${snapshot.diagnosisCodes?.join(', ') || snapshot.diagnosisReason || 'Review required'}`, { gap: 9 });
  tableRow(columns.map(column => column.heading), { header: true });
  for (const line of snapshot.lines) {
    tableRow([servicePeriod, line.serviceCode, line.description, String(line.quantity), money(line.amountCents), money(line.totalCents)]);
  }
  tableRow(['', '', 'Total estimated cost', '', '', total], { total: true });
  y -= 14;
  if (snapshot.separatelyScheduled?.length) {
    ensureSpace(55);
    paragraph('Separately scheduled services', { font: bold, size: 12, gap: 3 });
    paragraph('Ask billing for a separate estimate for these services.');
    snapshot.separatelyScheduled.forEach(line => paragraph(line));
  }

  ensureSpace(65);
  paragraph('About this estimate and your rights', { font: bold, size: 12, gap: 3 });
  disclosures.forEach(line => paragraph(line, { size: 9, gap: 5 }));
  if (item.acknowledgment) {
    ensureSpace(65);
    paragraph('Receipt acknowledged', { font: bold, size: 12, gap: 3 });
    paragraph(`${item.acknowledgment.signatureName} | ${item.acknowledgment.signedAt}`);
    paragraph(item.acknowledgment.text || ESTIMATE_ACKNOWLEDGMENT);
  } else {
    paragraph('Receipt acknowledgment is optional.', { size: 9 });
  }
  const pages = pdf.getPages();
  for (const [index, p] of pages.entries()) {
    p.drawText(`Private client document | ${item.id ? `Estimate ${item.id} | ` : ''}Page ${index + 1} of ${pages.length}`,
      { x: margin, y: 24, size: 8, font: normal, color: colors.muted });
  }
  return Buffer.from(await pdf.save());
}
