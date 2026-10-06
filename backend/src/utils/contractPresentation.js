export function formatContractDate(value) {
  const raw = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return value;
  const date = new Date(`${raw}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== raw) return value;
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
export function jobLocationOffice(offices, job) {
  const city = String(job?.city || '').trim().toLowerCase();
  const state = String(job?.state || '').trim().toLowerCase();
  if (!city || !state) return null;
  const matches = offices.filter(o => String(o.city || '').trim().toLowerCase() === city && String(o.state || '').trim().toLowerCase() === state);
  return matches.length === 1 ? matches[0] : null;
}
