/**
 * Pure parsers for signed paper-packet Vision OCR text (no DB / GCS).
 */

export function normalizeVersionLabel(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(/(?:version|ver\.?|v\.?)?\s*(\d+\.\d+)\b/i);
  if (m) return m[1];
  const m2 = s.match(/\b(\d+\.\d+)\b/);
  return m2 ? m2[1] : null;
}

export function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Detect version label from OCR text (footer / acknowledgement wording). */
export function extractVersionLabelFromText(text) {
  const body = String(text || '');
  const patterns = [
    /(?:packet\s+)?version\s*[:=]?\s*(v\.?\s*)?(\d+\.\d+)\b/gi,
    /\bversion\s+(\d+\.\d+)\b/gi,
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

/**
 * Heuristic: two "Sign here" blocks; each looks signed if nearby date or dense ink-like OCR.
 */
export function detectSignaturesFromText(text) {
  const body = String(text || '');
  const lower = body.toLowerCase();
  const markers = [];
  const re = /sign here\s*[—\-–]?\s*required/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    markers.push(m.index);
  }
  if (markers.length < 2) {
    const re2 = /client'?s?\s+or\s+responsible\s+party'?s?\s+signature/gi;
    while ((m = re2.exec(body)) !== null) {
      markers.push(m.index);
    }
  }

  const dateNear = (start) => {
    const slice = body.slice(start, start + 450);
    return /\b(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/.test(slice)
      || /\bdate\s*[:=]?\s*\d/i.test(slice);
  };
  const inkNear = (start) => {
    const slice = body.slice(start, start + 450);
    const afterSig = slice.split(/signature/i)[1] || slice;
    const tokens = afterSig.split(/\s+/).filter((t) => t.length >= 3);
    const weird = tokens.filter((t) => /[^a-zA-Z0-9.,'/-]/.test(t) || (t.length >= 6 && /[A-Z]{2,}[a-z]+[A-Z]/.test(t)));
    return weird.length >= 1 || tokens.length >= 8;
  };

  const signedFlags = markers.slice(0, 4).map((idx) => dateNear(idx) || inkNear(idx));
  let roi = false;
  let disclosure = false;
  if (signedFlags.length >= 2) {
    roi = !!signedFlags[0];
    disclosure = !!signedFlags[1];
  } else if (signedFlags.length === 1) {
    roi = !!signedFlags[0];
    disclosure = false;
  } else {
    const roiIdx = lower.indexOf('authorized school staff');
    const ackIdx = lower.indexOf('acknowledgement and consent');
    if (roiIdx >= 0) roi = dateNear(roiIdx);
    if (ackIdx >= 0) disclosure = dateNear(ackIdx);
  }

  return {
    roiSignatureDetected: roi,
    disclosureSignatureDetected: disclosure,
    signatureMarkerCount: markers.length
  };
}

/** Find staff with DENY checked next to their printed name. */
export function detectDenyStaffFromText(text, staffList = []) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const denyIds = [];
  const unmatchedDenyHints = [];

  const checkedDeny = (windowText) => {
    const w = String(windowText || '');
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
