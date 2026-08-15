import DocumentSigningService from './documentSigning.service.js';
import {
  buildPacketStyleBlock,
  buildPdfChromeTemplates,
  watermarkDataUrl
} from './schoolPrintablePacket.service.js';
import { OFFICE_PRINTABLE_PACKET_VERSION } from '../constants/officePrintablePacket.js';
import { buildCompletedIntakeRecord } from './completedIntakeRecord.service.js';

const BODY_PDF_MARGIN = { top: '0.75in', right: '0.5in', bottom: '0.5in', left: '0.5in' };

const SUMMARY_EXTRA_CSS = `
      .intake-summary-kicker {
        text-align: center;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin: 0 0 6px;
        color: #4b5563;
      }
      .intake-summary-agency { text-align: center; margin: 0 0 4px; }
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
    .map((row) => `
      <div class="intake-summary-row">
        <dt>${escapeHtml(row.label)}</dt>
        <dd>${escapeHtml(row.value)}</dd>
      </div>
    `)
    .join('');
}

export function buildIntakeSummaryDocumentHtml({
  title,
  kicker,
  agencyName,
  metaLines = [],
  sections = [],
  acknowledgments = [],
  signatures = [],
  approvals = [],
  esign = null,
  footerNote,
  printable = false
} = {}) {
  const watermark = watermarkDataUrl();
  const sectionHtml = (sections || [])
    .filter((section) => section?.title && Array.isArray(section.rows) && section.rows.length)
    .map((section) => `
      <h3 class="packet-section-title">${escapeHtml(section.title)}</h3>
      <dl class="intake-summary-dl">${renderRows(section.rows)}</dl>
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
            ${sig.signedAt ? `<p class="intake-summary-sign-meta">Signed ${escapeHtml(sig.signedAt)}</p>` : ''}
            ${sig.hash ? `<p class="intake-summary-sign-meta">Document hash ${escapeHtml(sig.hash)}</p>` : ''}
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
  const toolbarHtml = printable
    ? `
      <div class="record-toolbar">
        <button type="button" onclick="window.print()">Print this packet</button>
        <span>This is your branded copy — answers, signatures, approvals, and e-sign details. Keep it private.</span>
      </div>
    `
    : '';
  const metaHtml = (metaLines || []).filter(Boolean).map((line) => escapeHtml(line)).join(' · ');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title || 'Intake packet')}</title>
    <style>
${buildPacketStyleBlock()}
${SUMMARY_EXTRA_CSS}
    </style>
  </head>
  <body>
    <div class="packet-body-wrap">
      ${watermark ? `<img class="packet-watermark" src="${watermark}" alt="" />` : ''}
      <div class="packet-body">
        ${toolbarHtml}
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

export async function generateIntakeSummaryPdf(spec = {}) {
  const html = buildIntakeSummaryDocumentHtml(spec);
  const { headerTemplate, footerTemplate } = buildPdfChromeTemplates({
    packetVersionLabel: spec.packetVersionLabel || OFFICE_PRINTABLE_PACKET_VERSION
  });
  const pdfBytes = await DocumentSigningService.convertHTMLToPDF(html, {
    printBackground: true,
    margin: BODY_PDF_MARGIN,
    preferCSSPageSize: false,
    displayHeaderFooter: true,
    headerTemplate,
    footerTemplate,
    disableFallback: true
  });
  return Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes);
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
