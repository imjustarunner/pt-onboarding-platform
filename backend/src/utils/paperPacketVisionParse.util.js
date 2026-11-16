/**
 * Pure parsers for signed paper-packet Vision OCR text (no DB / GCS).
 */

export function normalizeVersionLabel(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(/(?:versi[oó]n|version|ver\.?|v\.?)?\s*(\d+\.\d+)\b/i);
  if (m) return m[1];
  const m2 = s.match(/\b(\d+\.\d+)\b/);
  return m2 ? m2[1] : null;
}

export function normalizeName(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{M}/gu,'')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Detect version label from OCR text (footer / acknowledgement wording). */
export function extractVersionLabelFromText(text) {
  const body = String(text || '').normalize('NFD').replace(/\p{M}/gu,'');
  const patterns = [
    /(?:(?:packet|paquete)\s+)?versi[oó]n(?:\s+del\s+paquete)?\s*[:=]?\s*(v\.?\s*)?(\d+\.\d+)\b/gi,
    /\bversi[oó]n\s+(\d+\.\d+)\b/gi,
    /\bv\.?\s*(\d+\.\d+)\b/gi
  ];
  const found = [];
  for (const re of patterns) {
    let m;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(body)) !== null) {
      const label = normalizeVersionLabel(m[0]);
      if (label) found.push(label);
    }
  }
  if (!found.length) return { label: null, confidence: 0 };
  const label = found[found.length - 1];
  const unique = new Set(found);
  const confidence = unique.size === 1 ? 0.9 : 0.75;
  return { label, confidence };
}

/** The packet's printed language is independent of a family's preferred language. */
export function detectPacketLanguage(text) {
  const body = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const spanish = ['sexo del dependiente', 'nombre del dependiente', 'fecha de nacimiento', 'consentimiento', 'firme aqui', 'su nombre', 'reconocimiento'].filter(label => body.includes(label)).length;
  const english = ["dependent's name", 'date of birth', 'acknowledgement', 'authorized school staff', 'sign here', 'your name'].filter(label => body.includes(label)).length;
  return spanish > english ? 'es' : english > spanish ? 'en' : null;
}

function calendarDate(value) {
  const raw = String(value || '');
  let match = raw.match(/\b(19\d{2}|20\d{2})-(\d{2})-(\d{2})\b/);
  let date = match ? `${match[1]}-${match[2]}-${match[3]}` : null;
  if (!date) {
    match = raw.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](19\d{2}|20\d{2})\b/);
    if (match) date = `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }
  return date && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date ? date : null;
}

function signatureBlocks(text) {
  const body = String(text || '');
  let markers = [...body.matchAll(/(?:sign here\s*[—\-–]?\s*required|firme aqu[ií](?:\s*[—\-–]?\s*(?:obligatorio|requerido))?)/gi)];
  if (!markers.length) markers = [...body.matchAll(/(?:client'?s?\s+or\s+responsible\s+party'?s?\s+signature|firma del (?:cliente|padre|tutor|responsable))/gi)];
  return markers.map((marker, i) => {
    const before = body.slice(0, marker.index).toLowerCase();
    const roi = Math.max(before.lastIndexOf('authorized school staff'), before.lastIndexOf('consent to release'), before.lastIndexOf('consentimiento para divulgar'), before.lastIndexOf('personal escolar autorizado'));
    const packet = Math.max(before.lastIndexOf('acknowledgement'), before.lastIndexOf('acknowledgment'), before.lastIndexOf('reconocimiento y consentimiento'), before.lastIndexOf('consentimiento del paquete'));
    const kind = packet > roi ? 'disclosure' : roi >= 0 ? 'roi' : i === 0 ? 'roi' : 'disclosure';
    const window = body.slice(marker.index, Math.min(marker.index + 900, markers[i + 1]?.index ?? body.length))
      .split(/acknowledg(?:e)?ment and consent summary|reconocimiento y consentimiento|pages\s+6\s+and\s+on/i)[0];
    return { kind, signedDate: calendarDate(window), index: marker.index };
  });
}

/** Date cues locate source evidence; staff still confirm the signature on the PDF. */
export function detectSignaturesFromText(text) {
  const blocks = signatureBlocks(text);
  return {
    roiSignatureDetected: blocks.some(block => block.kind === 'roi' && block.signedDate),
    disclosureSignatureDetected: blocks.some(block => block.kind === 'disclosure' && block.signedDate),
    signatureMarkerCount: blocks.length
  };
}

/** Never persist source OCR; retain only reviewable language/date/page suggestions. */
export function extractPaperPacketReviewHints(text, pages = []) {
  const hints = { locale: detectPacketLanguage(text), roi: {}, disclosure: {} };
  const sourcePages = Array.isArray(pages) && pages.length ? pages : [{ text, page: null }];
  for (const page of sourcePages) {
    for (const block of signatureBlocks(page.text)) {
      // Classify against the complete document when a continuation page has no heading.
      const prefix = sourcePages.slice(0, sourcePages.indexOf(page)).map(item => item.text).join('\n');
      const documentBlocks = signatureBlocks(`${prefix}\n${page.text}`);
      const kind = documentBlocks.findLast(item => item.index <= prefix.length + 1 + block.index)?.kind || block.kind;
      const existing = hints[kind];
      if (existing.signedDate) continue;
      hints[kind] = { ...(block.signedDate ? { signedDate: block.signedDate } : {}), ...(Number.isInteger(page.page) && page.page > 0 ? { page: page.page } : {}) };
    }
  }
  return hints;
}

/** Find staff with DENY checked next to their printed name. */
export function detectDenyStaffFromText(text, staffList = []) {
  const lines = String(text || '').normalize('NFD').replace(/\p{M}/gu,'').replace(/denegar|denegado/gi,'Deny')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const denyIds = [];
  const unmatchedDenyHints = [];

  const checkedDeny = (windowText) => {
    const w = String(windowText || '').trim();
    if (/^All listed staff are authorized unless Deny is checked\.?$/i.test(w)) return false;
    return (
      /[☑☒✔✅]|\[\s*[xX✓]\s*\]|\(\s*[xX✓]\s*\)/.test(w)
      || /\bdeny\b.{0,12}\b(checked|yes|x)\b/i.test(w)
      || /\b(x|✓|✔)\s*deny\b/i.test(w)
      || /\bdeny\s*[:=]?\s*[xX✓☑]/i.test(w)
    );
  };

  for (const staff of staffList) {
    const id = Number(staff.schoolStaffUserId || staff.id || 0);
    const full = normalizeName(staff.fullName || `${staff.firstName || ''} ${staff.lastName || ''}`);
    const last = normalizeName(staff.lastName || '');
    if (!id || !full) continue;

    for (let i = 0; i < lines.length; i += 1) {
      const nLine = normalizeName(lines[i]);
      const nameHit = nLine.includes(full)
        || (last.length >= 3 && nLine.includes(last) && nLine.includes(normalizeName(staff.firstName || '').slice(0, 3)));
      if (!nameHit) continue;
      // Only the staff row itself + the prior line (Deny box often precedes the name).
      // Do not include the next line — that is usually the following staff member.
      const windowText = [lines[i - 1], lines[i]].filter(Boolean).join(' ');
      if (checkedDeny(windowText) || checkedDeny(lines[i])) {
        denyIds.push(id);
        break;
      }
    }
  }

  for (const line of lines) {
    if (!checkedDeny(line)) continue;
    if (!/\bdeny\b/i.test(line)) continue;
    const hit = staffList.some((s) => {
      const full = normalizeName(s.fullName || `${s.firstName || ''} ${s.lastName || ''}`);
      return full && normalizeName(line).includes(full);
    });
    if (!hit) unmatchedDenyHints.push(line.slice(0, 120));
  }

  return {
    denyStaffUserIds: [...new Set(denyIds)],
    unmatchedDenyHints: unmatchedDenyHints.slice(0, 10)
  };
}
