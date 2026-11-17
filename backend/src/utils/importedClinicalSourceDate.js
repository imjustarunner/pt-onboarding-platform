/** Only a labeled clinical date establishes service time; never use DOB or upload time. */
export function importedClinicalSourceDate(text) {
  const dates = [...String(text || '').matchAll(/(?:^|\n)\s*(Date of Service|Service Date|Intake Date|Assessment Date|Date of Assessment|Encounter Date|Appointment Date|Session Date|Date)\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})\b/gi)];
  const specific = dates.filter(match => match[1].toLowerCase() !== 'date');
  const candidates = specific.length ? specific : dates;
  const normalized = candidates.map(match => {
    const raw = match[2], parts = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    let iso;
    if (parts) iso = `${parts[3]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    else if (/^\d{4}-/.test(raw)) iso = raw;
    else { const parsed = new Date(raw); if (!Number.isFinite(parsed.getTime())) return null; iso = parsed.toISOString().slice(0, 10); }
    const parsed = new Date(`${iso}T12:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
  });
  return normalized.length && normalized.every(value => value && value === normalized[0]) ? normalized[0] : null;
}
