/**
 * Parse structured notes from school schedule-adjustment / additional-hours requests.
 * Notes are often pipe-delimited key: value pairs from School Portal / year update.
 */

export function parseSchoolRequestNotes(notes) {
  const raw = String(notes || '').trim();
  const out = {
    school: '',
    provider: '',
    day: '',
    requestedDay: '',
    changeType: '',
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
    else if (key === 'requested day' || key === 'move to' || key === 'new day') out.requestedDay = value;
    else if (key === 'change type') out.changeType = value;
    else if (key === 'current slots') out.currentSlots = value;
    else if (key.startsWith('requested slots')) {
      out.requestedSlots = value.replace(/\s*\(delta[^)]*\)\s*$/i, '').trim();
      const dm = value.match(/delta\s*([+-]?\d+)/i);
      if (dm) out.slotsDelta = dm[1];
    } else if (key === 'current hours') out.currentHours = value;
    else if (key === 'requested hours') out.requestedHours = value;
    else if (key === 'note' || key === 'hoping to accomplish') out.note = value;
  }

  // Legacy one-liner: "Schedule adjustment request for School Name | …"
  if (!out.school) {
    const m = raw.match(/Schedule adjustment request for (.+?)(?:\s*\||$)/i);
    if (m) out.school = m[1].trim();
  }

  return out;
}

/** Extract numeric slot total from strings like "7", "7 total", or "3 assigned / 7 total". */
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

export function formatSlotsTotalDisplay(slotsText) {
  const total = extractSlotTotal(slotsText);
  if (total != null) return `${total} total`;
  return slotsText || '—';
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

export function dayMoved(parsed) {
  const from = String(parsed?.day || '').trim();
  const to = String(parsed?.requestedDay || '').trim();
  if (!from || !to) return false;
  return from.toLowerCase() !== to.toLowerCase();
}

/** True when parsed notes describe hours, slots, or a school-day move. */
export function scheduleAdjustmentHasChanges(parsed) {
  if (!parsed) return false;
  if (dayMoved(parsed)) return true;
  if (slotsChanged(parsed)) return true;
  if (hoursChanged(parsed)) return true;
  return false;
}
