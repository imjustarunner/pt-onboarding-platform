export function formatContractDate(value) {
  const raw = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return value;
  const date = new Date(`${raw}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== raw) return value;
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
export function jobOfficeOptions(offices, job) {
  const cities = String(job?.city || '').split(/\s*(?:[&,;/]|\band\b|\bor\b)\s*/i).map(city => city.trim().toLowerCase()).filter(Boolean);
  const state = String(job?.state || '').trim().toLowerCase();
  const choices = offices.filter(office => (!cities.length || cities.includes(String(office.city || '').trim().toLowerCase()))
    && (!state || String(office.state || '').trim().toLowerCase() === state));
  return { offices: choices, multipleCities: cities.length > 1 };
}

export function jobLocationOffice(offices, job) {
  const options = jobOfficeOptions(offices, job);
  return !options.multipleCities && options.offices.length === 1 ? options.offices[0] : null;
}
