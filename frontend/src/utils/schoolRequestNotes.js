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

  // Legacy one-liner: "Schedule adjustment request for School Name | …"
  if (!out.school) {
    const m = raw.match(/Schedule adjustment request for (.+?)(?:\s*\||$)/i);
    if (m) out.school = m[1].trim();
  }

  return out;
}

export function hoursChanged(parsed) {
  const a = String(parsed?.currentHours || '').trim().toLowerCase();
  const b = String(parsed?.requestedHours || '').trim().toLowerCase();
  if (!a || !b || a === '—' || b === '—') return false;
  return a !== b;
}

export function slotsChanged(parsed) {
  const delta = Number(parsed?.slotsDelta);
  if (Number.isFinite(delta) && delta !== 0) return true;
  const a = String(parsed?.currentSlots || '');
  const b = String(parsed?.requestedSlots || '');
  if (!a || !b) return false;
  const aTotal = a.match(/(\d+)\s*total/i)?.[1] || a.match(/\/\s*(\d+)/)?.[1];
  return aTotal != null && String(aTotal) !== String(b).replace(/\D/g, '') && String(b) !== a;
}
