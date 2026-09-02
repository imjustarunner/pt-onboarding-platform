/**
 * Treatment Summary printable PDF — body only (no cover), packet footer chrome
 * without versioning, provider + clinical supervisor signature lines.
 */
import DocumentSigningService from './documentSigning.service.js';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatSummaryBodyText(raw) {
  let text = String(raw || '').trim();
  if (!text) return '';
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      if (parsed.sections && typeof parsed.sections === 'object') {
        const parts = [];
        for (const [k, v] of Object.entries(parsed.sections)) {
          const body = String(v || '').trim();
          if (!body) continue;
          if (/^output$/i.test(k)) parts.push(body);
          else parts.push(`${k}\n${body}`);
        }
        text = parts.join('\n\n').trim() || text;
      } else if (parsed.text) {
        text = String(parsed.text);
      }
    }
  } catch {
    // plain text
  }
  return text;
}

function paragraphsToHtml(text) {
  const blocks = String(text || '')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (!blocks.length) return '<p></p>';
  return blocks
    .map((b) => {
      const withBreaks = escapeHtml(b).replace(/\n/g, '<br/>');
      return `<p>${withBreaks}</p>`;
    })
    .join('\n');
}

/**
 * Build printable HTML body (no cover). Signature lines for provider + supervisor.
 */
export function buildTreatmentSummaryHtml({
  title = 'Treatment Summary',
  bodyText = '',
  clientInitials = '',
  dateOfService = '',
  providerName = '',
  supervisorName = '',
  providerSignedAt = null,
  supervisorSignedAt = null
} = {}) {
  const body = paragraphsToHtml(formatSummaryBodyText(bodyText));
  const metaBits = [
    clientInitials ? `Client initials: ${escapeHtml(clientInitials)}` : null,
    dateOfService ? `As of: ${escapeHtml(dateOfService)}` : null
  ].filter(Boolean);

  const providerSig = providerSignedAt
    ? `<div class="sig-filled">Signed electronically by ${escapeHtml(providerName || 'Provider')} on ${escapeHtml(String(providerSignedAt).slice(0, 10))}</div>`
    : `<div class="sig-line"></div><div class="sig-label">Provider signature${providerName ? ` — ${escapeHtml(providerName)}` : ''}</div><div class="sig-date-line">Date</div>`;

  const supervisorSig = supervisorSignedAt
    ? `<div class="sig-filled">Signed electronically by ${escapeHtml(supervisorName || 'Clinical Supervisor')} on ${escapeHtml(String(supervisorSignedAt).slice(0, 10))}</div>`
    : `<div class="sig-line"></div><div class="sig-label">Clinical supervisor signature${supervisorName ? ` — ${escapeHtml(supervisorName)}` : ''}</div><div class="sig-date-line">Date</div>`;

  return `
<style>
  h1 { font-size: 18pt; margin: 0 0 12px; font-weight: 700; }
  .meta { font-size: 10pt; color: #333; margin-bottom: 16px; }
  .summary-body { font-size: 11pt; line-height: 1.45; }
  .summary-body p { margin: 0 0 10px; }
  .signature-box { margin-top: 36px; page-break-inside: avoid; }
  .sig-row { display: flex; gap: 24px; margin-top: 20px; }
  .sig-col { flex: 1; min-width: 0; }
  .sig-line { border-bottom: 1px solid #111; height: 36px; margin-bottom: 4px; }
  .sig-label { font-size: 9pt; color: #222; }
  .sig-date-line { margin-top: 18px; border-bottom: 1px solid #111; height: 28px; font-size: 9pt; color: #555; }
  .sig-filled { font-size: 10pt; padding: 8px 0; border-bottom: 1px solid #111; margin-bottom: 4px; }
</style>
<h1>${escapeHtml(title)}</h1>
${metaBits.length ? `<div class="meta">${metaBits.join(' · ')}</div>` : ''}
<div class="summary-body">${body}</div>
<div class="signature-box">
  <div class="sig-row">
    <div class="sig-col">${providerSig}</div>
    <div class="sig-col">${supervisorSig}</div>
  </div>
</div>
`.trim();
}

export async function generateTreatmentSummaryPdf({
  agencyId,
  bodyText,
  title,
  clientInitials,
  dateOfService,
  providerName,
  supervisorName,
  providerSignedAt,
  supervisorSignedAt
} = {}) {
  const html = buildTreatmentSummaryHtml({
    title,
    bodyText,
    clientInitials,
    dateOfService,
    providerName,
    supervisorName,
    providerSignedAt,
    supervisorSignedAt
  });
  const branded = await DocumentSigningService.applyPacketBrandChromeToHtml(html, {
    agencyId,
    includeVersion: false
  });
  return DocumentSigningService.convertHTMLToPDF(branded.html, {
    ...(branded.pdfOptions || {}),
    documentType: 'treatment_summary',
    branding: { agencyId }
  });
}

export function extractNotePayloadText(note) {
  if (!note) return '';
  const raw = maybeDecryptNotePayload(note.note_payload ?? note.notePayload ?? '');
  return formatSummaryBodyText(raw);
}

export default {
  buildTreatmentSummaryHtml,
  generateTreatmentSummaryPdf,
  extractNotePayloadText,
  formatSummaryBodyText
};
