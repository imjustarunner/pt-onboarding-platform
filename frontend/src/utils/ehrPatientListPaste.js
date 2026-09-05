/**
 * Parse EHR "Patient List" paste (TherapyNotes-style TSV).
 *
 * Keep: full name, DOB, phone.
 * Skip: Last/Next Appt, Payer, Clinicians, reminder/todo counts,
 *       and broken follow-on lines like "None" / "MiMe".
 */

const HEADER_RE = /patient\s*name|phone\s*number|last\s*appt|next\s*appt|^dob$/i;
const DOB_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;
const PHONE_RE = /^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/;
const REMINDER_RE = /^\d{1,3}$/;
const NONE_RE = /^none$/i;
/** Short clinician token like MiMe / JoSm (no spaces). */
const CLINICIAN_TOKEN_RE = /^[A-Z][a-z]{0,3}[A-Z][a-z]{0,3}$/;

export function normalizeEhrDob(raw) {
  const s = String(raw || '').trim();
  const m = s.match(DOB_RE);
  if (!m) return null;
  const mm = String(m[1]).padStart(2, '0');
  const dd = String(m[2]).padStart(2, '0');
  let yyyy = String(m[3]);
  if (yyyy.length === 2) yyyy = `20${yyyy}`;
  return `${yyyy}-${mm}-${dd}`;
}

export function normalizeEhrPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  const trimmed = String(raw || '').trim();
  return trimmed || null;
}

function looksLikeDob(raw) {
  return DOB_RE.test(String(raw || '').trim());
}

function looksLikePhone(raw) {
  const s = String(raw || '').trim();
  if (!s) return false;
  return PHONE_RE.test(s) || /^\d{10,11}$/.test(s.replace(/\D/g, ''));
}

function isSkippableNoiseLine(line) {
  const s = String(line || '').trim();
  if (!s) return true;
  if (REMINDER_RE.test(s)) return true;
  if (NONE_RE.test(s)) return true;
  if (CLINICIAN_TOKEN_RE.test(s)) return true;
  if (HEADER_RE.test(s) && !looksLikeDob(s.split(/\t/)[1] || '')) return true;
  // Header row often has tabs: "Patient Name\tDOB\tPhone…"
  if (/^patient\s*name\b/i.test(s)) return true;
  return false;
}

function parseTabRow(line) {
  const parts = String(line || '').split(/\t/).map((p) => p.trim());
  if (parts.length < 2) return null;
  const fullName = parts[0];
  if (!fullName || !/[A-Za-z]/.test(fullName)) return null;
  if (HEADER_RE.test(fullName) && !looksLikeDob(parts[1])) return null;

  const dateOfBirth = looksLikeDob(parts[1]) ? normalizeEhrDob(parts[1]) : null;
  if (!dateOfBirth) return null;

  let phone = null;
  if (parts.length >= 3 && looksLikePhone(parts[2])) {
    phone = normalizeEhrPhone(parts[2]);
  } else if (parts.length >= 3 && !parts[2]) {
    phone = null;
  }

  return {
    fullName: fullName.replace(/\s+/g, ' ').trim(),
    dateOfBirth,
    phone,
    rawLine: line
  };
}

/**
 * Fallback for space-ish pastes without clean tabs:
 * "Sheldon Baron 12/11/1982 (218) 556-0827 …"
 */
function parseLooseRow(line) {
  const s = String(line || '').trim();
  if (!s || isSkippableNoiseLine(s)) return null;
  const dobMatch = s.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/);
  if (!dobMatch) return null;
  const before = s.slice(0, dobMatch.index).trim();
  if (!before || before.split(/\s+/).length < 2) return null;
  if (/^patient\s*name$/i.test(before)) return null;
  const after = s.slice(dobMatch.index + dobMatch[0].length).trim();
  const phoneMatch = after.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  return {
    fullName: before.replace(/\s+/g, ' ').trim(),
    dateOfBirth: normalizeEhrDob(dobMatch[1]),
    phone: phoneMatch ? normalizeEhrPhone(phoneMatch[0]) : null,
    rawLine: line
  };
}

/**
 * @param {string} text
 * @returns {{ items: Array<{fullName:string,dateOfBirth:string,phone:string|null}>, skipped: Array<{line:string,reason:string}>, unparsed: number }}
 */
export function parseEhrPatientListPaste(text) {
  const items = [];
  const skipped = [];
  let unparsed = 0;
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');

  const seen = new Set();

  for (const raw of lines) {
    const line = String(raw || '').trim();
    if (!line) continue;
    if (isSkippableNoiseLine(line)) {
      skipped.push({ line, reason: 'noise' });
      continue;
    }

    let row = null;
    if (line.includes('\t')) {
      row = parseTabRow(line);
    }
    if (!row) {
      row = parseLooseRow(line);
    }
    if (!row?.fullName || !row?.dateOfBirth) {
      unparsed += 1;
      skipped.push({ line, reason: 'unparsed' });
      continue;
    }

    const key = `${row.fullName.toLowerCase()}|${row.dateOfBirth}`;
    if (seen.has(key)) {
      skipped.push({ line, reason: 'duplicate' });
      continue;
    }
    seen.add(key);
    items.push({
      fullName: row.fullName,
      dateOfBirth: row.dateOfBirth,
      phone: row.phone || null
    });
  }

  return { items, skipped, unparsed };
}
