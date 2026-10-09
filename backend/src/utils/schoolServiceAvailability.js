export const SCHOOL_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export function hasSchoolServiceFocus(user) {
  return /\bschools?\b/i.test(String(user?.service_focus || user?.serviceFocus || ''));
}

export function schoolAvailabilityStep(user, saved, closed = false) {
  const applicable = hasSchoolServiceFocus(user);
  if (!saved && (closed || !applicable)) return null;
  return {
    key: 'school-availability', kind: 'school-availability', title: 'In-school service availability',
    required: applicable, complete: !!saved?.completedAt,
    values: saved?.value || { available: null, blocks: [], notes: '' }
  };
}

export function validateSchoolServiceAvailability(input) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!input || typeof input.available !== 'boolean') fail('Choose whether you are available for in-school services.');
  if (typeof input.notes !== 'string' || input.notes.length > 2000) fail('Keep availability notes under 2,000 characters.');
  if (!Array.isArray(input.blocks) || input.blocks.length > 5) fail('Choose up to five school weekdays.');
  if (!input.available) return { available: false, blocks: [], notes: input.notes.trim() };
  if (!input.blocks.length) fail('Choose at least one school weekday or select no current availability.');
  const seen = new Set();
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const blocks = input.blocks.map(block => {
    if (!block || !SCHOOL_WEEKDAYS.includes(block.dayOfWeek) || seen.has(block.dayOfWeek)) fail('Choose each school weekday only once.');
    if (typeof block.startTime !== 'string' || typeof block.endTime !== 'string' || !time.test(block.startTime) || !time.test(block.endTime) || block.endTime <= block.startTime) fail('Enter valid hours with the end after the start for each school day.');
    seen.add(block.dayOfWeek);
    return { dayOfWeek: block.dayOfWeek, startTime: block.startTime, endTime: block.endTime };
  }).sort((a, b) => SCHOOL_WEEKDAYS.indexOf(a.dayOfWeek) - SCHOOL_WEEKDAYS.indexOf(b.dayOfWeek));
  return { available: true, blocks, notes: input.notes.trim() };
}

export function schoolAvailabilitySummary(value) {
  const time = hhmm => {
    const [h, m] = hhmm.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a.m.' : 'p.m.'}`;
  };
  const hours = value.available
    ? value.blocks.map(b => `${b.dayOfWeek}: ${time(b.startTime)}–${time(b.endTime)}`).join('; ')
    : 'No current in-school availability';
  return `${hours}${value.notes ? `\nNotes: ${value.notes}` : ''}`;
}
