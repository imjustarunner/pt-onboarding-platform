const numericFields = new Set(['organization_id', 'agency_id', 'client_status_id', 'provider_id', 'provider_user_id']);
const calendarFields = new Set(['submission_date', 'doc_date', 'roi_expires_at']);

export function clientChangeValue(field, value) {
  if (value === null || value === undefined || value === '') return null;
  if (calendarFields.has(field)) {
    if (value instanceof Date) return Number.isFinite(+value) ? value.toISOString().slice(0, 10) : null;
    const raw = String(value).trim().replace(/^"|"$/g, '');
    if (/^\d{4}-\d{2}-\d{2}(?:$|[ T])/.test(raw)) return raw.slice(0, 10);
    const parsed = new Date(raw);
    return Number.isFinite(+parsed) ? parsed.toISOString().slice(0, 10) : raw;
  }
  const raw = String(value).trim();
  if (numericFields.has(field) && Number.isFinite(Number(raw))) return String(Number(raw));
  return raw || null;
}

export const clientChangeIsNoop = (field, before, after) => clientChangeValue(field, before) === clientChangeValue(field, after);
