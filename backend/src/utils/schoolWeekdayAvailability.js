export const SCHOOL_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export function schoolBasedFocus(value) {
  return String(value || '').split(/[;,\n]/).some(label => /^school[ -]based(?: counseling| therapy| services)?$/i.test(label.trim()) || /^school$/i.test(label.trim()) || /^school\s*(?:&|and)\s*office[ -]based(?: counseling)?$/i.test(label.trim()));
}
export function excludedFromSchoolRoster(person) {
  let flags = person.agency_feature_flags;
  if (typeof flags === 'string') { try { flags = JSON.parse(flags); } catch { flags = {}; } }
  return [true,1,'1'].includes(person.is_demo) || flags?.qaSandbox?.syntheticOnly === true || String(person.agency_slug || '').startsWith('auricwell-qa-demo');
}
export function schoolWeekdayRecord(details, agencyId) {
  if (typeof details === 'string') { try { details = JSON.parse(details); } catch { details = {}; } }
  return details?.schoolWeekdaysByAgency?.[String(agencyId)] || {};
}
export function schoolWeekdayContext(person, assignments, agencyId) {
  const record = schoolWeekdayRecord(person.public_details_json, agencyId);
  const eligible = schoolBasedFocus(person.service_focus) && !excludedFromSchoolRoster(person);
  return { eligible, requestedAt: record.requestedAt || null, updatedAt: record.updatedAt || null,
    pending: !!record.requestedAt && (!record.updatedAt || record.requestedAt > record.updatedAt),
    days: SCHOOL_WEEKDAYS.map(day => {
      const schools = assignments.filter(s => s.days?.includes(day));
      const available = record.days?.[day] !== false;
      return { day, available: schools.length ? true : available, status: schools.length ? 'assigned' : eligible && available ? 'available' : 'unavailable', schools };
    }) };
}
