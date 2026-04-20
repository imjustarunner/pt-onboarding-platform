import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Renders a "ticket"-style registration confirmation as the first page(s) of
 * the intake packet. Returns a Buffer of PDF bytes, or null when the
 * submission has no registration selections (so non-registration intakes
 * don't get a confusing blank ticket).
 *
 * Style choices:
 *   - Letter portrait (matches the rest of the intake bundle).
 *   - Helvetica + Helvetica-Bold (only fonts pdf-lib ships standard).
 *   - Navy header bar + accent stripes for the "ticket stub" feel.
 *   - One ticket per submission. Multi-child submissions list every
 *     registered participant on the same ticket — this matches how
 *     registrations themselves work today (submission-wide, not per-child;
 *     see enrollClientsInCompanyEvent).
 *
 * Inputs are intentionally permissive: callers pass whatever metadata they've
 * already loaded for the completion email (event placeholders, receipt url,
 * org/agency context). Anything missing is rendered as "—" or skipped.
 */

const NAVY = rgb(0.07, 0.18, 0.36);          // #122E5C
const NAVY_DARK = rgb(0.05, 0.13, 0.27);     // #0C2245
const GRAY_TEXT = rgb(0.36, 0.40, 0.45);     // #5C6673
const GRAY_LIGHT = rgb(0.93, 0.94, 0.96);    // #EDEFF4
const GRAY_BORDER = rgb(0.82, 0.84, 0.88);   // #D2D6E0
const ACCENT = rgb(0.93, 0.36, 0.20);        // #ED5C33 (warm orange for the type badge)
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0);

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

const ENTITY_TYPE_LABEL = {
  company_event: 'EVENT',
  event: 'EVENT',
  class: 'CLASS',
  program_event: 'PROGRAM EVENT',
  program: 'PROGRAM',
  manual: 'REGISTRATION'
};

const ENTITY_TYPE_BADGE_COLOR = {
  company_event: ACCENT,
  event: ACCENT,
  class: rgb(0.20, 0.55, 0.40),
  program_event: rgb(0.30, 0.42, 0.78),
  program: rgb(0.30, 0.42, 0.78),
  manual: GRAY_TEXT
};

// pdf-lib's standard fonts only encode WinAnsi (Windows-1252). Any user-typed
// character outside that set will throw at draw time and abort the entire
// finalize. Sanitize defensively: map common unicode to ASCII equivalents and
// replace anything we can't represent with '?'.
const ASCII_SUBSTITUTIONS = {
  '\u2192': '->',  // rightwards arrow
  '\u2190': '<-',  // leftwards arrow
  '\u2194': '<->',
  '\u21D2': '=>',
  '\u00B7': '*',   // middle dot
  '\u2026': '...', // ellipsis (in WinAnsi but render explicit)
  '\u00A0': ' ',   // nbsp -> space
  '\uFEFF': '',    // BOM
  '\u200B': '',    // zero-width space
  '\u200C': '',
  '\u200D': '',
  '\u2028': ' ',   // line separator
  '\u2029': ' ',   // paragraph separator
  '\u2713': 'v',   // check mark
  '\u2717': 'x',   // ballot x
  '\u2715': 'x',
  '\u00D7': 'x'    // multiplication sign
};
// WinAnsi (Windows-1252) printable + common high-bit chars we know are safe.
// Built once: 0x20-0x7E (basic Latin), 0xA0-0xFF (Latin-1 supplement) plus
// the codepoints in 0x80-0x9F that Windows-1252 maps to printable glyphs.
const WIN_ANSI_HIGH_BIT_PRINTABLE = new Set([
  0x20AC, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6,
  0x2030, 0x0160, 0x2039, 0x0152, 0x017D, 0x2018, 0x2019, 0x201C,
  0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A,
  0x0153, 0x017E, 0x0178
]);
const sanitizeForWinAnsi = (raw) => {
  const s = String(raw == null ? '' : raw);
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    const code = ch.charCodeAt(0);
    if (code === 0x09) { out += ' '; continue; }                  // tab -> space
    if (code === 0x0A || code === 0x0D) { out += '\n'; continue; } // newlines preserved for caller
    if (code >= 0x20 && code <= 0x7E) { out += ch; continue; }    // basic Latin
    if (code >= 0xA0 && code <= 0xFF) { out += ch; continue; }    // Latin-1 supplement
    if (WIN_ANSI_HIGH_BIT_PRINTABLE.has(code)) { out += ch; continue; }
    if (Object.prototype.hasOwnProperty.call(ASCII_SUBSTITUTIONS, ch)) {
      out += ASCII_SUBSTITUTIONS[ch];
      continue;
    }
    out += '?';
  }
  return out;
};

const wrapText = (text, font, size, width) => {
  const words = sanitizeForWinAnsi(text).replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (!words.length) return [''];
  const out = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) {
      cur = next;
    } else {
      if (cur) out.push(cur);
      cur = word;
    }
  }
  if (cur) out.push(cur);
  return out;
};

const formatScheduleBlock = (block) => {
  if (!block || typeof block !== 'object') return '';
  const label = String(block.label || '').trim();
  const start = String(block.startTime || block.start || '').trim();
  const end = String(block.endTime || block.end || '').trim();
  const startDate = String(block.startDate || '').trim();
  const endDate = String(block.endDate || '').trim();
  let timeStr = '';
  if (start && end) timeStr = `${start} – ${end}`;
  else if (start) timeStr = start;
  let dateStr = '';
  if (startDate && endDate && startDate !== endDate) dateStr = `${startDate} - ${endDate}`;
  else if (startDate) dateStr = startDate;
  const seqRaw = block.sequenceDays;
  let seq = '';
  if (Array.isArray(seqRaw) && seqRaw.length) seq = seqRaw.join(', ');
  else if (Number.isFinite(Number(seqRaw)) && Number(seqRaw) > 1) seq = `${seqRaw} sessions`;
  const parts = [label, dateStr, timeStr, seq && `(${seq})`].filter(Boolean);
  return parts.join(' • ');
};

const dollars = (val) => {
  if (val == null) return '';
  const n = Number(val);
  if (!Number.isFinite(n)) return '';
  return `$${n.toFixed(2)}`;
};

const buildSelectionDisplay = (sel, eventPlaceholders) => {
  const entityType = String(sel?.entityType || '').trim().toLowerCase();
  const typeLabel = ENTITY_TYPE_LABEL[entityType] || 'REGISTRATION';
  const badgeColor = ENTITY_TYPE_BADGE_COLOR[entityType] || GRAY_TEXT;

  // Title preference: explicit label from the picker UI, then the event
  // placeholder title (when it's a company_event), then a generic fallback.
  const isEvent = entityType === 'company_event' || entityType === 'event';
  const title = String(sel?.label || '').trim()
    || (isEvent && String(eventPlaceholders?.EVENT_TITLE || '').trim())
    || (sel?.entityId ? `${typeLabel} #${sel.entityId}` : typeLabel);

  const description = String(sel?.description || '').trim();

  const dateLine = isEvent
    ? [eventPlaceholders?.EVENT_DATES, eventPlaceholders?.EVENT_REPORT_TIME]
        .map((s) => String(s || '').trim()).filter(Boolean).join(' • ')
    : '';
  const location = isEvent ? String(eventPlaceholders?.EVENT_ADDRESS || '').trim() : '';
  const duration = isEvent ? String(eventPlaceholders?.EVENT_DURATION || '').trim() : '';

  const scheduleBlocks = Array.isArray(sel?.scheduleBlocks)
    ? sel.scheduleBlocks.map(formatScheduleBlock).filter(Boolean)
    : [];

  const payerType = String(sel?.payerType || sel?.payer_type || '').trim();
  const payerLabel = payerType
    ? payerType.charAt(0).toUpperCase() + payerType.slice(1).replace(/_/g, ' ')
    : '';

  const selfPay = sel?.selfPay && typeof sel.selfPay === 'object' ? sel.selfPay : null;
  const cost = selfPay?.costDollars != null ? dollars(selfPay.costDollars) : '';
  const paymentLinkUrl = String(selfPay?.paymentLinkUrl || '').trim();

  const videoJoinUrl = String(sel?.videoJoinUrl || '').trim();
  const frequency = String(sel?.frequencyLabel || '').trim();
  const terms = String(sel?.termsSummary || '').trim();

  return {
    typeLabel,
    badgeColor,
    title,
    description,
    dateLine,
    location,
    duration,
    scheduleBlocks,
    payerLabel,
    cost,
    paymentLinkUrl,
    videoJoinUrl,
    frequency,
    terms
  };
};

const formatIssuedAt = (submission) => {
  const raw = submission?.submitted_at || submission?.updated_at || submission?.created_at || new Date();
  try {
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  } catch {
    return '';
  }
};

const collectParticipantNames = (intakeData) => {
  const clients = Array.isArray(intakeData?.clients) ? intakeData.clients : [];
  const names = clients
    .map((c) => {
      const full = String(c?.fullName || '').trim();
      if (full) return full;
      const first = String(c?.firstName || '').trim();
      const last = String(c?.lastName || '').trim();
      return [first, last].filter(Boolean).join(' ').trim();
    })
    .filter(Boolean);
  // Deduplicate while preserving order so multi-child submissions don't
  // show the same kid twice if the picker happened to push duplicates.
  const seen = new Set();
  return names.filter((n) => {
    const k = n.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

export async function buildRegistrationTicketPdf({
  intakeData,
  submission,
  link,
  eventPlaceholders = null,
  registrationReceiptUrl = '',
  organization = null,
  agency = null
}) {
  const rawSelections = intakeData?.responses?.submission?.registrationSelections;
  const selections = Array.isArray(rawSelections) ? rawSelections.filter((s) => s && typeof s === 'object') : [];
  if (!selections.length) return null;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H;

  const newPage = () => {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H;
  };

  const ensureRoom = (need) => {
    if (y - need < MARGIN + 60) newPage();
  };

  // ------------------------------------------------------------------ Header
  const headerHeight = 96;
  page.drawRectangle({
    x: 0, y: PAGE_H - headerHeight,
    width: PAGE_W, height: headerHeight,
    color: NAVY
  });
  // Thin accent stripe just under the header for the "ticket" vibe.
  page.drawRectangle({
    x: 0, y: PAGE_H - headerHeight - 6,
    width: PAGE_W, height: 6,
    color: ACCENT
  });

  const orgName = sanitizeForWinAnsi(String(organization?.name || agency?.name || link?.organization_name || '').trim());
  if (orgName) {
    page.drawText(orgName.slice(0, 60), {
      x: MARGIN, y: PAGE_H - 36, size: 12, font: fontBold, color: WHITE
    });
  }
  const headerTitle = 'REGISTRATION CONFIRMATION';
  const headerTitleSize = 22;
  const headerTitleW = fontBold.widthOfTextAtSize(headerTitle, headerTitleSize);
  page.drawText(headerTitle, {
    x: (PAGE_W - headerTitleW) / 2,
    y: PAGE_H - 70,
    size: headerTitleSize,
    font: fontBold,
    color: WHITE
  });

  const tagText = 'TICKET';
  page.drawText(tagText, {
    x: PAGE_W - MARGIN - fontBold.widthOfTextAtSize(tagText, 11),
    y: PAGE_H - 36,
    size: 11,
    font: fontBold,
    color: WHITE
  });

  y = PAGE_H - headerHeight - 30;

  // -------------------------------------------------- Confirmation # block
  const confBoxH = 56;
  page.drawRectangle({
    x: MARGIN, y: y - confBoxH,
    width: CONTENT_W, height: confBoxH,
    color: GRAY_LIGHT,
    borderColor: GRAY_BORDER,
    borderWidth: 1
  });
  const confLabelY = y - 18;
  page.drawText('CONFIRMATION #', {
    x: MARGIN + 14, y: confLabelY, size: 8, font: fontBold, color: GRAY_TEXT
  });
  const confValue = `INTAKE-${submission?.id || '—'}`;
  page.drawText(confValue, {
    x: MARGIN + 14, y: confLabelY - 18, size: 18, font: fontBold, color: NAVY_DARK
  });
  const issuedLabelX = MARGIN + CONTENT_W - 14 - 200;
  page.drawText('ISSUED', {
    x: issuedLabelX, y: confLabelY, size: 8, font: fontBold, color: GRAY_TEXT
  });
  const issuedAt = formatIssuedAt(submission);
  if (issuedAt) {
    page.drawText(issuedAt, {
      x: issuedLabelX, y: confLabelY - 18, size: 12, font, color: NAVY_DARK
    });
  }
  y -= confBoxH + 18;

  // -------------------------------------------------------- Registrant info
  const registrant = sanitizeForWinAnsi(String(submission?.signer_name || intakeData?.signerName || '').trim());
  const registrantEmail = sanitizeForWinAnsi(String(submission?.signer_email || intakeData?.signerEmail || '').trim());
  if (registrant || registrantEmail) {
    page.drawText('REGISTERED BY', {
      x: MARGIN, y, size: 8, font: fontBold, color: GRAY_TEXT
    });
    y -= 14;
    if (registrant) {
      page.drawText(registrant, { x: MARGIN, y, size: 13, font: fontBold, color: BLACK });
      y -= 16;
    }
    if (registrantEmail) {
      page.drawText(registrantEmail, { x: MARGIN, y, size: 11, font, color: GRAY_TEXT });
      y -= 16;
    }
    y -= 6;
  }

  // ---------------------------------------------------- Participants block
  const participantNames = collectParticipantNames(intakeData);
  if (participantNames.length) {
    page.drawText(participantNames.length === 1 ? 'PARTICIPANT' : `PARTICIPANTS (${participantNames.length})`, {
      x: MARGIN, y, size: 8, font: fontBold, color: GRAY_TEXT
    });
    y -= 14;
    for (const name of participantNames) {
      ensureRoom(20);
      // Bullet + name
      page.drawCircle({ x: MARGIN + 4, y: y + 4, size: 2.5, color: NAVY });
      page.drawText(sanitizeForWinAnsi(name), { x: MARGIN + 14, y, size: 12, font, color: BLACK });
      y -= 16;
    }
    y -= 6;
  }

  // ---------------------------------------------------------- Divider
  ensureRoom(40);
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + CONTENT_W, y },
    thickness: 0.5,
    color: GRAY_BORDER
  });
  y -= 18;

  // ----------------------------------------------- Registration cards
  page.drawText(selections.length === 1 ? 'REGISTRATION DETAILS' : `REGISTRATION DETAILS (${selections.length})`, {
    x: MARGIN, y, size: 10, font: fontBold, color: NAVY_DARK
  });
  y -= 20;

  for (const sel of selections) {
    const display = buildSelectionDisplay(sel, eventPlaceholders);

    // Estimate card height before drawing so we can page-break cleanly.
    const titleLines = wrapText(display.title, fontBold, 14, CONTENT_W - 28 - 70);
    const descLines = display.description
      ? wrapText(display.description, font, 10, CONTENT_W - 28)
      : [];
    const detailRows = [];
    if (display.dateLine) detailRows.push(['When', display.dateLine]);
    if (display.duration) detailRows.push(['Duration', display.duration]);
    if (display.location) detailRows.push(['Location', display.location]);
    if (display.scheduleBlocks.length) {
      display.scheduleBlocks.forEach((b, idx) => {
        detailRows.push([idx === 0 ? 'Schedule' : '', b]);
      });
    }
    if (display.frequency) detailRows.push(['Frequency', display.frequency]);
    if (display.terms) detailRows.push(['Terms', display.terms]);
    if (display.payerLabel) detailRows.push(['Paid by', display.payerLabel]);
    if (display.cost) detailRows.push(['Cost', display.cost]);
    if (display.paymentLinkUrl) detailRows.push(['Payment', display.paymentLinkUrl]);
    if (display.videoJoinUrl) detailRows.push(['Join URL', display.videoJoinUrl]);

    // Pre-wrap detail values to estimate height accurately.
    const detailRowsWrapped = detailRows.map(([label, value]) => ({
      label,
      lines: wrapText(value, font, 10, CONTENT_W - 28 - 80)
    }));

    const cardHeight = 14   // top padding
      + 18                  // badge row
      + 10                  // gap
      + titleLines.length * 17
      + (descLines.length ? 6 + descLines.length * 13 : 0)
      + 8                   // gap before details
      + detailRowsWrapped.reduce((acc, r) => acc + r.lines.length * 13, 0)
      + 14;                 // bottom padding

    ensureRoom(cardHeight + 14);

    const cardTop = y;
    const cardBottom = y - cardHeight;
    page.drawRectangle({
      x: MARGIN, y: cardBottom,
      width: CONTENT_W, height: cardHeight,
      color: WHITE,
      borderColor: GRAY_BORDER,
      borderWidth: 0.75
    });
    // Left accent bar tinted by entity type.
    page.drawRectangle({
      x: MARGIN, y: cardBottom,
      width: 4, height: cardHeight,
      color: display.badgeColor
    });

    // Badge in top-right
    const badgeText = display.typeLabel;
    const badgeTextW = fontBold.widthOfTextAtSize(badgeText, 8);
    const badgeW = badgeTextW + 14;
    const badgeH = 14;
    const badgeX = MARGIN + CONTENT_W - 14 - badgeW;
    const badgeY = cardTop - 14 - badgeH + 2;
    page.drawRectangle({
      x: badgeX, y: badgeY,
      width: badgeW, height: badgeH,
      color: display.badgeColor
    });
    page.drawText(badgeText, {
      x: badgeX + 7, y: badgeY + 4,
      size: 8, font: fontBold, color: WHITE
    });

    // Title
    let lineY = cardTop - 30;
    for (const line of titleLines) {
      page.drawText(line, { x: MARGIN + 14, y: lineY, size: 14, font: fontBold, color: BLACK });
      lineY -= 17;
    }

    // Description
    if (descLines.length) {
      lineY -= 6;
      for (const line of descLines) {
        page.drawText(line, { x: MARGIN + 14, y: lineY, size: 10, font, color: GRAY_TEXT });
        lineY -= 13;
      }
    }

    // Details (label / value rows)
    lineY -= 8;
    for (const row of detailRowsWrapped) {
      if (row.label) {
        page.drawText(`${row.label}:`, {
          x: MARGIN + 14, y: lineY, size: 10, font: fontBold, color: GRAY_TEXT
        });
      }
      let valueY = lineY;
      for (const valueLine of row.lines) {
        page.drawText(valueLine, {
          x: MARGIN + 14 + 70, y: valueY, size: 10, font, color: BLACK
        });
        valueY -= 13;
      }
      lineY -= row.lines.length * 13;
    }

    y = cardBottom - 14;
  }

  // ----------------------------------------------------- Footer / receipt URL
  ensureRoom(80);
  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + CONTENT_W, y },
    thickness: 0.5,
    color: GRAY_BORDER,
    dashArray: [2, 3]
  });
  y -= 18;

  page.drawText('Save this confirmation for your records.', {
    x: MARGIN, y, size: 10, font: fontBold, color: NAVY_DARK
  });
  y -= 14;
  page.drawText('Bring it (or have it on your phone) to check-in if applicable.', {
    x: MARGIN, y, size: 9, font, color: GRAY_TEXT
  });
  y -= 18;

  if (registrationReceiptUrl) {
    page.drawText('View live receipt online:', {
      x: MARGIN, y, size: 9, font: fontBold, color: GRAY_TEXT
    });
    y -= 12;
    const urlLines = wrapText(registrationReceiptUrl, font, 9, CONTENT_W);
    for (const line of urlLines) {
      page.drawText(line, { x: MARGIN, y, size: 9, font, color: NAVY });
      y -= 12;
    }
    y -= 4;
  }

  const agencyName = sanitizeForWinAnsi(String(agency?.name || '').trim());
  const agencyEmail = sanitizeForWinAnsi(String(agency?.contact_email || '').trim());
  const footerLine = [agencyName, agencyEmail].filter(Boolean).join(' • ');
  if (footerLine) {
    page.drawText(`Issued by ${footerLine}`, {
      x: MARGIN, y, size: 9, font, color: GRAY_TEXT
    });
  }

  return Buffer.from(await pdfDoc.save());
}

export default { buildRegistrationTicketPdf };
