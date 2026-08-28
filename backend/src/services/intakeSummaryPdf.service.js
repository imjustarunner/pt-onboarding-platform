import {
  buildPacketStyleBlock,
  buildPdfChromeTemplates,
  headerLogoDataUrl,
  footerMarkDataUrl,
  watermarkDataUrl,
  coverPageDataUrl
} from './schoolPrintablePacket.service.js';
import { OFFICE_PRINTABLE_PACKET_VERSION } from '../constants/officePrintablePacket.js';
import { buildCompletedIntakeRecord } from './completedIntakeRecord.service.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import DocumentSigningService from './documentSigning.service.js';
import { drawFullBleedCoverImage } from '../utils/fullBleedCover.js';

const SUMMARY_EXTRA_CSS = `
      .intake-summary-kicker {
        text-align: center;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin: 0 0 6px;
        color: #4b5563;
      }
      .intake-summary-brand {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 14px;
        margin: 0 0 16px;
      }
      .intake-summary-brand img {
        display: block;
        max-height: 56px;
        max-width: 180px;
        object-fit: contain;
      }
      .intake-summary-sign-card a { color: #1b3d2f; font-weight: 700; }
      .intake-summary-meta { text-align: center; margin: 0 0 18px; color: #374151; }
      .intake-summary-dl { margin: 0 0 16px; }
      .intake-summary-row {
        display: flex;
        gap: 12px;
        padding: 7px 0;
        border-bottom: 1px solid #d1d5db;
        page-break-inside: avoid;
      }
      .intake-summary-row dt { flex: 0 0 2.15in; font-weight: 700; }
      .intake-summary-row dd { margin: 0; flex: 1 1 auto; }
      .intake-summary-acks ul { margin: 0; padding-left: 1.1rem; }
      .intake-summary-foot { margin-top: 22px; font-size: 12px; color: #4b5563; }
      .intake-summary-sign {
        display: grid;
        gap: 10px;
        margin: 0 0 18px;
      }
      .intake-summary-sign-card {
        border: 1px solid #d1d5db;
        border-radius: 10px;
        padding: 10px 12px;
        page-break-inside: avoid;
      }
      .intake-summary-sign-card img {
        display: block;
        max-width: 220px;
        max-height: 72px;
        margin-top: 8px;
        background: #fff;
      }
      .intake-summary-sign-meta { font-size: 12px; color: #4b5563; margin: 4px 0 0; }
      .intake-summary-esign {
        border: 1px solid #1b3d2f;
        border-radius: 10px;
        padding: 12px 14px;
        margin: 18px 0;
        page-break-inside: avoid;
      }
      .intake-summary-esign p { margin: 0 0 10px; }
      .record-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 12px;
        align-items: center;
        margin: 0 0 16px;
        padding: 10px 12px;
        background: #f3f6f4;
        border: 1px solid #d7e3dc;
        border-radius: 10px;
        font-size: 13px;
      }
      .record-toolbar button {
        font: inherit;
        font-weight: 700;
        border: 0;
        border-radius: 8px;
        padding: 8px 12px;
        background: #1b3d2f;
        color: #fff;
        cursor: pointer;
      }
      @media print {
        .record-toolbar { display: none !important; }
      }
`;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatSubmittedAt(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
}

function renderRows(rows) {
  return (rows || [])
    .filter((row) => row?.label && row?.value)
    .map((row) => {
      const valueHtml = row.href
        ? `<a href="${escapeHtml(row.href)}">${escapeHtml(row.value)}</a>`
        : escapeHtml(row.value);
      return `
      <div class="intake-summary-row">
        <dt>${escapeHtml(row.label)}</dt>
        <dd>${valueHtml}</dd>
      </div>
    `;
    })
    .join('');
}

export function buildIntakeSummaryDocumentHtml({
  title,
  kicker,
  agencyName,
  brandLogoUrl = '',
  watermarkUrl = '',
  brand = null,
  metaLines = [],
  sections = [],
  acknowledgments = [],
  signatures = [],
  approvals = [],
  esign = null,
  footerNote,
  printable = false,
  pdfMode = ''
} = {}) {
  const watermark = watermarkUrl || brand?.watermarkDataUrl || (!brand || brand.useItscoChrome ? watermarkDataUrl() : null);
  const sectionHtml = (sections || [])
    .filter((section) => section?.title && (
      (Array.isArray(section.rows) && section.rows.length)
      || String(section.html || '').trim()
    ))
    .map((section) => `
      <h3 class="packet-section-title">${escapeHtml(section.title)}</h3>
      ${section.html
        ? `<div class="packet-section-html">${section.html}</div>`
        : `<dl class="intake-summary-dl">${renderRows(section.rows)}</dl>`}
    `)
    .join('');
  const ackHtml = (acknowledgments || []).length
    ? `
      <div class="intake-summary-acks">
        <h3 class="packet-section-title">You acknowledged</h3>
        <ul>${acknowledgments.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
      </div>
    `
    : '';
  const approvalHtml = (approvals || [])
    .filter((block) => block?.title && Array.isArray(block.rows) && block.rows.length)
    .map((block) => `
      <h3 class="packet-section-title">${escapeHtml(block.title)}</h3>
      <dl class="intake-summary-dl">${renderRows(block.rows)}</dl>
    `)
    .join('');
  const signatureHtml = (signatures || []).length
    ? `
      <h3 class="packet-section-title">Signatures</h3>
      <div class="intake-summary-sign">
        ${signatures.map((sig) => `
          <div class="intake-summary-sign-card">
            <strong>${escapeHtml(sig.documentName || 'Signed document')}</strong>
            ${sig.versionLabel ? `<p class="intake-summary-sign-meta">${escapeHtml(sig.versionLabel)}</p>` : ''}
            ${sig.signedAt ? `<p class="intake-summary-sign-meta">Signed ${escapeHtml(sig.signedAt)}${sig.signerName ? ` by ${escapeHtml(sig.signerName)}` : ''}</p>` : ''}
            ${sig.hash ? `<p class="intake-summary-sign-meta">Fingerprint ${escapeHtml(sig.hash)}</p>` : ''}
            ${sig.publicUrl ? `<p class="intake-summary-sign-meta"><a href="${escapeHtml(sig.publicUrl)}" target="_blank" rel="noopener">View this version</a></p>` : ''}
            ${sig.imageDataUrl ? `<img src="${escapeHtml(sig.imageDataUrl)}" alt="Signature for ${escapeHtml(sig.documentName || 'document')}" />` : '<p class="intake-summary-sign-meta">Signature captured electronically.</p>'}
          </div>
        `).join('')}
      </div>
    `
    : '';
  const esignHtml = esign?.statement
    ? `
      <div class="intake-summary-esign">
        <h3 class="packet-section-title">Electronic Signature Certificate</h3>
        <p>${escapeHtml(esign.statement)}</p>
        <dl class="intake-summary-dl">${renderRows(esign.rows || [])}</dl>
      </div>
    `
    : '';
  const toolbarHtml = printable && pdfMode !== 'body'
    ? `
      <div class="record-toolbar">
        <button type="button" onclick="window.print()">Print this packet</button>
        <span>This is your branded copy — answers, signatures, approvals, and e-sign details. Keep it private.</span>
      </div>
    `
    : '';
  const metaHtml = (metaLines || []).filter(Boolean).map((line) => escapeHtml(line)).join(' · ');
  const brandHtml = pdfMode === 'body'
    ? ''
    : `
        <div class="intake-summary-brand">
          ${brandLogoUrl ? `<img src="${escapeHtml(brandLogoUrl)}" alt="${escapeHtml(agencyName || 'Organization')}" />` : ''}
        </div>
      `;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title || 'Intake packet')}</title>
    <style>
${buildPacketStyleBlock(brand)}
${SUMMARY_EXTRA_CSS}
    </style>
  </head>
  <body>
    <div class="packet-body-wrap">
      ${watermark ? `<img class="packet-watermark" src="${watermark}" alt="" />` : ''}
      <div class="packet-body">
        ${toolbarHtml}
        ${brandHtml}
        ${kicker ? `<p class="intake-summary-kicker">${escapeHtml(kicker)}</p>` : ''}
        <h1>${escapeHtml(title || 'Intake packet')}</h1>
        ${agencyName ? `<p class="intake-summary-agency"><strong>${escapeHtml(agencyName)}</strong></p>` : ''}
        ${metaHtml ? `<p class="intake-summary-meta">${metaHtml}</p>` : ''}
        ${sectionHtml}
        ${approvalHtml}
        ${ackHtml}
        ${signatureHtml}
        ${esignHtml}
        ${footerNote ? `<p class="intake-summary-foot">${escapeHtml(footerNote)}</p>` : ''}
      </div>
    </div>
  </body>
</html>`;
}

function wrapPdfText(font, text, size, maxWidth) {
  const normalized = String(text || '')
    .normalize('NFC')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[·•]/g, ' - ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');

  const hardLines = normalized.split('\n');
  const lines = [];
  for (const hard of hardLines) {
    const words = hard.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      // Break oversized tokens (pasted cover letters without spaces).
      const chunks = [];
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        chunks.push(word);
      } else {
        let buf = '';
        for (const ch of word) {
          const next = buf + ch;
          if (font.widthOfTextAtSize(next, size) <= maxWidth) buf = next;
          else {
            if (buf) chunks.push(buf);
            buf = ch;
          }
        }
        if (buf) chunks.push(buf);
      }
      for (const chunk of chunks) {
        const next = current ? `${current} ${chunk}` : chunk;
        if (font.widthOfTextAtSize(next, size) <= maxWidth) {
          current = next;
        } else {
          if (current) lines.push(current);
          current = chunk;
        }
      }
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [''];
}

async function embedPngFromDataUrl(pdfDoc, dataUrl) {
  const raw = String(dataUrl || '').trim();
  const match = raw.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
  if (!match) return null;
  try {
    const bytes = Buffer.from(match[2], 'base64');
    if (/jpeg|jpg/i.test(match[1])) return pdfDoc.embedJpg(bytes);
    return pdfDoc.embedPng(bytes);
  } catch {
    return null;
  }
}

async function renderCoverOnlyPdf(spec = {}) {
  if (spec.skipCoverPage) return null;
  const coverUrl = spec.coverImageUrl
    || spec.brand?.coverDataUrl
    || (!spec.brand || spec.brand.useItscoChrome ? coverPageDataUrl() : null);
  if (!coverUrl) return null;
  const pdfDoc = await PDFDocument.create();
  const cover = await embedPngFromDataUrl(pdfDoc, coverUrl);
  if (!cover) return null;
  const page = pdfDoc.addPage([612, 792]);
  drawFullBleedCoverImage(page, cover, 612, 792);
  return Buffer.from(await pdfDoc.save());
}

async function mergeCoverAndBody(coverBytes, bodyBytes) {
  if (!coverBytes) return Buffer.isBuffer(bodyBytes) ? bodyBytes : Buffer.from(bodyBytes);
  const merged = await PDFDocument.create();
  const coverDoc = await PDFDocument.load(coverBytes);
  const bodyDoc = await PDFDocument.load(bodyBytes);
  const coverPages = await merged.copyPages(coverDoc, coverDoc.getPageIndices());
  coverPages.forEach((p) => merged.addPage(p));
  const bodyPages = await merged.copyPages(bodyDoc, bodyDoc.getPageIndices());
  bodyPages.forEach((p) => merged.addPage(p));
  return Buffer.from(await merged.save());
}

async function renderCompletedIntakePdfWithPuppeteer(spec = {}) {
  const { headerTemplate, footerTemplate } = buildPdfChromeTemplates({
    packetVersionLabel: spec.packetVersionLabel || spec.brand?.versionLabel || OFFICE_PRINTABLE_PACKET_VERSION,
    brand: spec.brand || null
  });
  const html = buildIntakeSummaryDocumentHtml({ ...spec, printable: false, pdfMode: 'body' });
  const bodyPdfBytes = await DocumentSigningService.convertHTMLToPDF(html, {
    printBackground: true,
    margin: { top: '0.75in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
    preferCSSPageSize: false,
    displayHeaderFooter: true,
    headerTemplate,
    footerTemplate,
    disableFallback: true
  });
  const coverBytes = await renderCoverOnlyPdf(spec);
  return mergeCoverAndBody(coverBytes, bodyPdfBytes);
}

async function renderCompletedIntakePdf(spec = {}) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.11, 0.24, 0.18);
  const gray = rgb(0.29, 0.33, 0.39);
  const black = rgb(0.07, 0.09, 0.11);
  const pageW = 612;
  const pageH = 792;
  const side = 36;
  const contentTop = 62;
  const contentBottom = 44;
  const maxWidth = pageW - side * 2;
  const versionLabel = String(spec.packetVersionLabel || spec.brand?.versionLabel || OFFICE_PRINTABLE_PACKET_VERSION);
  const cover = spec.skipCoverPage
    ? null
    : await embedPngFromDataUrl(
      pdfDoc,
      spec.coverImageUrl
        || spec.brand?.coverDataUrl
        || (!spec.brand || spec.brand.useItscoChrome ? coverPageDataUrl() : null)
    );
  if (cover) {
    const coverPage = pdfDoc.addPage([pageW, pageH]);
    drawFullBleedCoverImage(coverPage, cover, pageW, pageH);
  }
  let page = pdfDoc.addPage([pageW, pageH]);
  let y = pageH - contentTop;
  const logo = await embedPngFromDataUrl(
    pdfDoc,
    spec.brandLogoUrl
      || spec.brand?.headerImageDataUrl
      || spec.brand?.headerLogoDataUrl
      || (!spec.brand || spec.brand.useItscoChrome ? headerLogoDataUrl() : null)
  );
  const footerMark = await embedPngFromDataUrl(
    pdfDoc,
    spec.brand?.footerMarkDataUrl || (!spec.brand || spec.brand.useItscoChrome ? footerMarkDataUrl() : null)
  );
  const watermark = await embedPngFromDataUrl(
    pdfDoc,
    spec.watermarkUrl
      || spec.brand?.watermarkDataUrl
      || (!spec.brand || spec.brand.useItscoChrome ? watermarkDataUrl() : null)
  );
  const stampWatermark = (target) => {
    if (!watermark || !target) return;
    try {
      const width = 210;
      const height = (watermark.height / watermark.width) * width;
      target.drawImage(watermark, {
        x: pageW - width - 18,
        y: 36,
        width,
        height,
        opacity: 0.07
      });
    } catch {
      /* watermark is decorative */
    }
  };
  stampWatermark(page);

  const ensure = (need) => {
    if (y - need < contentBottom) {
      page = pdfDoc.addPage([pageW, pageH]);
      stampWatermark(page);
      y = pageH - contentTop;
    }
  };
  const drawLines = (lines, { size = 10, type = font, color = black, gap = 13 } = {}) => {
    for (const line of lines) {
      ensure(gap);
      page.drawText(String(line || ''), { x: side, y, size, font: type, color });
      y -= gap;
    }
  };

  drawLines([spec.agencyName || ''], { size: 11, type: bold, color: green, gap: 16 });
  drawLines([spec.title || 'Completed intake packet'], { size: 16, type: bold, gap: 18 });
  if (spec.metaLines?.length) {
    drawLines([spec.metaLines.filter(Boolean).join('  -  ')], { size: 9, color: gray, gap: 16 });
  }

  const drawRows = (rows) => {
    for (const row of rows || []) {
      if (!row?.label || !row?.value) continue;
      if (row.fullWidth) {
        const labelLines = wrapPdfText(bold, String(row.label), 9, maxWidth);
        const valueLines = wrapPdfText(font, String(row.value), 9, maxWidth);
        ensure(labelLines.length * 12 + valueLines.length * 12 + 10);
        labelLines.forEach((line, idx) => {
          page.drawText(line, { x: side, y: y - (idx * 12), size: 9, font: bold, color: black });
        });
        y -= labelLines.length * 12 + 2;
        valueLines.forEach((line, idx) => {
          page.drawText(line, { x: side, y: y - (idx * 12), size: 9, font, color: black });
        });
        y -= valueLines.length * 12 + 8;
        continue;
      }
      const labelLines = wrapPdfText(bold, `${row.label}:`, 9, 160);
      const valueLines = wrapPdfText(font, String(row.value), 9, maxWidth - 170);
      const used = Math.max(labelLines.length, valueLines.length);
      ensure(used * 12 + 6);
      page.drawText(labelLines[0], { x: side, y, size: 9, font: bold, color: black });
      valueLines.forEach((line, idx) => {
        page.drawText(line, { x: side + 170, y: y - (idx * 12), size: 9, font, color: black });
      });
      y -= used * 12 + 4;
    }
  };

  for (const section of spec.sections || []) {
    if (!section?.title || !section.rows?.length) continue;
    ensure(28);
    y -= 8;
    drawLines([section.title], { size: 12, type: bold, color: green, gap: 16 });
    drawRows(section.rows);
  }

  for (const block of spec.approvals || []) {
    if (!block?.title || !block.rows?.length) continue;
    ensure(28);
    y -= 8;
    drawLines([block.title], { size: 12, type: bold, color: green, gap: 16 });
    drawRows(block.rows);
  }

  if (spec.signatures?.length) {
    ensure(28);
    y -= 8;
    drawLines(['Signed documents'], { size: 12, type: bold, color: green, gap: 16 });
    for (const sig of spec.signatures) {
      ensure(70);
      drawLines([sig.documentName || 'Signed document'], { size: 10, type: bold, gap: 13 });
      const meta = [
        sig.versionLabel,
        sig.signedAt ? `Signed ${sig.signedAt}${sig.signerName ? ` by ${sig.signerName}` : ''}` : '',
        sig.hash ? `Fingerprint ${sig.hash}` : '',
        sig.publicUrl ? `View this version: ${sig.publicUrl}` : ''
      ].filter(Boolean);
      drawLines(meta, { size: 8, color: gray, gap: 11 });
      const image = await embedPngFromDataUrl(pdfDoc, sig.imageDataUrl);
      if (image) {
        const height = 36;
        const width = Math.min(180, (image.width / image.height) * height);
        ensure(height + 8);
        page.drawImage(image, { x: side, y: y - height, width, height });
        y -= height + 10;
      }
    }
  }

  if (spec.esign?.statement) {
    ensure(40);
    y -= 8;
    drawLines(['Electronic Signature Certificate'], { size: 12, type: bold, color: green, gap: 16 });
    drawLines(wrapPdfText(font, spec.esign.statement, 8, maxWidth), { size: 8, color: gray, gap: 11 });
    drawRows(spec.esign.rows || []);
  }
  if (spec.footerNote) {
    y -= 8;
    drawLines(wrapPdfText(font, spec.footerNote, 8, maxWidth), { size: 8, color: gray, gap: 11 });
  }

  const pages = pdfDoc.getPages();
  const bodyStart = cover ? 1 : 0;
  for (let i = bodyStart; i < pages.length; i += 1) {
    const target = pages[i];
    if (logo) {
      const height = 32;
      const width = Math.min(180, (logo.width / logo.height) * height);
      target.drawImage(logo, { x: (pageW - width) / 2, y: pageH - 46, width, height });
    }
    if (footerMark) {
      const height = 16;
      const width = (footerMark.width / footerMark.height) * height;
      target.drawImage(footerMark, { x: side, y: 14, width, height });
    }
    const versionText = `Version ${versionLabel}`;
    const versionWidth = bold.widthOfTextAtSize(versionText, 9);
    target.drawText(versionText, { x: (pageW - versionWidth) / 2, y: 16, size: 9, font: bold, color: black });
    const pageText = `PAGE ${i - bodyStart + 1}`;
    const pageWidth = bold.widthOfTextAtSize(pageText, 9);
    target.drawText(pageText, { x: pageW - side - pageWidth, y: 16, size: 9, font: bold, color: black });
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

export async function generateIntakeSummaryPdf(spec = {}) {
  try {
    return await renderCompletedIntakePdfWithPuppeteer(spec);
  } catch (err) {
    if (err?.code === 'PDF_RENDERER_UNAVAILABLE' || err?.statusCode === 503) {
      return renderCompletedIntakePdf(spec);
    }
    throw err;
  }
}

export function buildOfficeIntakeSummarySpec({
  agencyName,
  submission = {},
  guardian = {},
  clients = [],
  link = {},
  signedDocuments = []
} = {}) {
  return buildCompletedIntakeRecord({
    agency: { name: agencyName },
    link,
    submission,
    signedDocuments,
    guardian,
    clients
  });
}

export function buildQuickIntakeSummarySpec({
  agencyName,
  identifierCode,
  submittedAt,
  summary = {}
} = {}) {
  const s = summary && typeof summary === 'object' ? summary : {};
  const preferredDays = Array.isArray(s.preferredDays) ? s.preferredDays.filter(Boolean).join(', ') : '';
  const concerns = Array.isArray(s.concerns) ? s.concerns.filter(Boolean).join(', ') : '';
  const acknowledgments = Array.isArray(s.acknowledgments)
    ? s.acknowledgments.map((line) => String(line || '').trim()).filter(Boolean)
    : [];

  const sections = [
    {
      title: 'About you',
      rows: [
        s.whoForLabel ? { label: 'This is for', value: s.whoForLabel } : null,
        s.contactName ? { label: 'Contact', value: s.contactName } : null,
        s.contactEmail ? { label: 'Email', value: s.contactEmail } : null,
        s.contactPhone ? { label: 'Phone', value: s.contactPhone } : null,
        s.clientName && s.whoForLabel && s.whoForLabel !== 'Myself' ? { label: 'Client', value: s.clientName } : null,
        s.birthdate ? { label: 'Date of birth', value: s.birthdate } : null,
        s.homeAddress ? { label: 'Home address', value: s.homeAddress } : null
      ].filter(Boolean)
    },
    {
      title: 'Preferences',
      rows: [
        s.serviceType ? { label: 'Service', value: s.serviceType } : null,
        s.preferredProvider ? { label: 'Provider', value: s.preferredProvider } : null,
        s.preferredModality ? { label: 'Preferred format', value: s.preferredModality } : null,
        s.preferredTimeOfDay ? { label: 'Preferred time', value: s.preferredTimeOfDay } : null,
        preferredDays ? { label: 'Preferred days', value: preferredDays } : null,
        s.insuranceOrPayment ? { label: 'Insurance / payment', value: s.insuranceOrPayment } : null
      ].filter(Boolean)
    },
    {
      title: 'What you shared',
      rows: [
        concerns ? { label: 'Interests', value: concerns } : null,
        s.accomplishGoal ? { label: 'Goals', value: s.accomplishGoal } : null,
        s.notes ? { label: 'Additional notes', value: s.notes } : null
      ].filter(Boolean)
    }
  ].filter((section) => section.rows.length);

  return {
    title: 'Interest form confirmation',
    kicker: 'For your records',
    agencyName: agencyName || '',
    packetVersionLabel: OFFICE_PRINTABLE_PACKET_VERSION,
    metaLines: [
      identifierCode ? `Reference ${identifierCode}` : '',
      submittedAt ? `Submitted ${formatSubmittedAt(submittedAt)}` : ''
    ].filter(Boolean),
    sections,
    acknowledgments,
    footerNote: 'This confirmation is for your records. Your information is handled confidentially.'
  };
}

export function pdfFilename(parts, fallback = 'intake-summary.pdf') {
  const slug = parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join('-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return slug ? `${slug}.pdf` : fallback;
}

export function recordPdfFilename({ tenant, initials, dateOfBirth, fallback = 'intake-summary.pdf' } = {}) {
  const dob = String(dateOfBirth || '').replace(/[^0-9]/g, '');
  return pdfFilename([tenant, initials, dob], fallback);
}
