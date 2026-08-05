/**
 * Parse structured notes from school schedule-adjustment requests.
 * Mirrors frontend/src/utils/schoolRequestNotes.js for server-side validation.
 */

export function parseSchoolRequestNotes(notes) {
  const raw = String(notes || '').trim();
  const out = {
    school: '',
    provider: '',
    day: '',
    currentSlots: '',
    requestedSlots: '',
    slotsDelta: '',
    currentHours: '',
    requestedHours: '',
    note: '',
    raw
  };
  if (!raw) return out;

  const parts = raw.includes(' | ')
    ? raw.split(/\s*\|\s*/)
    : raw.split(/\n+/);

  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (!value) continue;
    if (key === 'school') out.school = value;
    else if (key === 'provider') out.provider = value.replace(/\s*\(user_id=\d+\)\s*$/i, '').trim();
    else if (key === 'day') out.day = value;
    else if (key === 'current slots') out.currentSlots = value;
    else if (key.startsWith('requested slots')) {
      out.requestedSlots = value.replace(/\s*\(delta[^)]*\)\s*$/i, '').trim();
      const dm = value.match(/delta\s*([+-]?\d+)/i);
      if (dm) out.slotsDelta = dm[1];
    } else if (key === 'current hours') out.currentHours = value;
    else if (key === 'requested hours') out.requestedHours = value;
    else if (key === 'note' || key === 'hoping to accomplish') out.note = value;
  }

  if (!out.school) {
    const m = raw.match(/Schedule adjustment request for (.+?)(?:\s*\||$)/i);
    if (m) out.school = m[1].trim();
  }

  return out;
}

export function extractSlotTotal(slotsText) {
  const s = String(slotsText || '').trim();
  if (!s || s === '—') return null;
  const totalMatch = s.match(/(\d+)\s*total/i);
  if (totalMatch) return Number(totalMatch[1]);
  const slashMatch = s.match(/\/\s*(\d+)/);
  if (slashMatch) return Number(slashMatch[1]);
  const plainMatch = s.match(/^(\d+)$/);
  if (plainMatch) return Number(plainMatch[1]);
  const anyMatch = s.match(/(\d+)/);
  return anyMatch ? Number(anyMatch[1]) : null;
}

export function normalizeHoursText(hoursText) {
  return String(hoursText || '')
    .trim()
    .toLowerCase()
    .replace(/\s+to\s+/g, '–')
    .replace(/\s*[–-]\s*/g, '–')
    .replace(/\s+/g, ' ');
}

export function hoursChanged(parsed) {
  const a = normalizeHoursText(parsed?.currentHours);
  const b = normalizeHoursText(parsed?.requestedHours);
  if (!a || !b || a === '—' || b === '—') return false;
  return a !== b;
}

export function slotsChanged(parsed) {
  const current = extractSlotTotal(parsed?.currentSlots);
  const requested = extractSlotTotal(parsed?.requestedSlots);
  if (current != null && requested != null) return current !== requested;
  const delta = Number(parsed?.slotsDelta);
  return Number.isFinite(delta) && delta !== 0;
}

export function scheduleAdjustmentHasChanges(parsed) {
  if (!parsed) return false;
  if (slotsChanged(parsed)) return true;
  if (hoursChanged(parsed)) return true;
  return false;
}

function parseAmPmTimeToHHMM(t) {
  const s = String(t || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) {
    const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m24) return null;
    return `${String(parseInt(m24[1], 10)).padStart(2, '0')}:${m24[2]}:00`;
  }
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}:00`;
}

/** Parse display ranges like "10:00 AM–12:00 PM" into DB time strings. */
export function parseHoursRangeToTimes(hoursText) {
  const s = String(hoursText || '').trim();
  if (!s || s === '—') return { startTime: null, endTime: null };
  const parts = s.split(/[–-]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { startTime: null, endTime: null };
  return {
    startTime: parseAmPmTimeToHHMM(parts[0]),
    endTime: parseAmPmTimeToHHMM(parts[1])
  };
}
