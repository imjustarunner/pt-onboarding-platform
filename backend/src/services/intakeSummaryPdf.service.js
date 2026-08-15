import DocumentSigningService from './documentSigning.service.js';
import {
  buildPacketStyleBlock,
  buildPdfChromeTemplates,
  watermarkDataUrl
} from './schoolPrintablePacket.service.js';
import { OFFICE_PRINTABLE_PACKET_VERSION } from '../constants/officePrintablePacket.js';

const BODY_PDF_MARGIN = { top: '0.75in', right: '0.5in', bottom: '0.5in', left: '0.5in' };

const SKIP_KEYS = new Set([
  'insuranceInfo',
  'paymentInfo',
  'spanishClarification',
  'guardianWaiverIntake',
  'registrationSelections',
  'registrationSelectionIdsByStep',
  'registrationSelectionsByStep',
  'registrationParticipantByStep',
  'communicationPreferences'
]);

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
`;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseMaybeJson(value, fallback = {}) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function humanizeKey(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function flattenSummaryValue(value) {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map((item) => flattenSummaryValue(item)).filter(Boolean).join(', ');
  if (typeof value === 'object') return '';
  return String(value).trim();
}

function isSkippedKey(key) {
  const token = String(key || '');
  if (SKIP_KEYS.has(token) || token.startsWith('registration_')) return true;
  return /password|signature|preview|card_number|cvc|ssn/i.test(token);
}

function rowsFromBag(bag) {
  const rows = [];
  for (const [key, raw] of Object.entries(bag || {})) {
    if (isSkippedKey(key)) continue;
    const value = flattenSummaryValue(raw);
    if (!value || value.length > 400) continue;
    rows.push({ label: humanizeKey(key), value });
  }
  return rows;
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
  footerNote
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
  const metaHtml = (metaLines || []).filter(Boolean).map((line) => escapeHtml(line)).join(' · ');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title || 'Intake summary')}</title>
    <style>
${buildPacketStyleBlock()}
${SUMMARY_EXTRA_CSS}
    </style>
  </head>
  <body>
    <div class="packet-body-wrap">
      ${watermark ? `<img class="packet-watermark" src="${watermark}" alt="" />` : ''}
      <div class="packet-body">
        ${kicker ? `<p class="intake-summary-kicker">${escapeHtml(kicker)}</p>` : ''}
        <h1>${escapeHtml(title || 'Intake summary')}</h1>
        ${agencyName ? `<p class="intake-summary-agency"><strong>${escapeHtml(agencyName)}</strong></p>` : ''}
        ${metaHtml ? `<p class="intake-summary-meta">${metaHtml}</p>` : ''}
        ${sectionHtml}
        ${ackHtml}
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
  clients = []
} = {}) {
  const intakeData = parseMaybeJson(submission?.intake_data, {});
  const responses = intakeData?.responses && typeof intakeData.responses === 'object'
    ? intakeData.responses
    : {};
  const guardianBag = responses.guardian && typeof responses.guardian === 'object'
    ? responses.guardian
    : {};
  const submissionBag = responses.submission && typeof responses.submission === 'object'
    ? responses.submission
    : {};
  const clientBags = Array.isArray(responses.clients) ? responses.clients : [];
  const contactName = [guardian.firstName, guardian.lastName].filter(Boolean).join(' ').trim()
    || [guardianBag.firstName, guardianBag.lastName].filter(Boolean).join(' ').trim()
    || String(submission?.signer_name || '').trim();
  const contactEmail = String(guardian.email || guardianBag.email || submission?.signer_email || '').trim();
  const contactPhone = String(guardian.phone || guardian.phoneNumber || guardianBag.phone || guardianBag.phoneNumber || submission?.signer_phone || '').trim();
  const listedClients = (Array.isArray(clients) && clients.length ? clients : clientBags).map((client, index) => {
    const name = String(client?.fullName || `${client?.firstName || ''} ${client?.lastName || ''}`.trim() || `Client ${index + 1}`).trim();
    const dob = String(client?.dateOfBirth || client?.date_of_birth || '').trim();
    return { label: name, value: dob ? `Date of birth ${dob}` : 'Listed on this packet' };
  });
  const whoFor = String(submissionBag.whoFor || submissionBag.this_is_for || '').trim();

  const sections = [
    {
      title: 'Contact',
      rows: [
        contactName ? { label: 'Name', value: contactName } : null,
        contactEmail ? { label: 'Email', value: contactEmail } : null,
        contactPhone ? { label: 'Phone', value: contactPhone } : null,
        whoFor ? { label: 'This is for', value: humanizeKey(whoFor) } : null,
        ...rowsFromBag(guardianBag).filter((row) => !/^(First Name|Last Name|Email|Phone|Phone Number)$/i.test(row.label))
      ].filter(Boolean)
    },
    listedClients.length ? { title: 'Client(s)', rows: listedClients } : null,
    { title: 'Intake', rows: rowsFromBag(submissionBag) },
    ...clientBags.map((bag, index) => ({
      title: `Client ${index + 1} details`,
      rows: rowsFromBag(bag)
    }))
  ].filter((section) => section && section.rows?.length);

  const submittedAt = formatSubmittedAt(submission?.submitted_at);
  return {
    title: 'Intake packet summary',
    kicker: 'For your records',
    agencyName: agencyName || '',
    packetVersionLabel: OFFICE_PRINTABLE_PACKET_VERSION,
    metaLines: [
      submission?.id ? `Submission ${submission.id}` : '',
      submittedAt ? `Submitted ${submittedAt}` : ''
    ].filter(Boolean),
    sections,
    footerNote: 'Your care team has this packet. This summary is for your records.'
  };
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
