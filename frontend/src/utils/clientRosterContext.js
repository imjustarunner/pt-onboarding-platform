import { displaySchoolClientStatusLabel } from './schoolClientStatusDisplay.js';

export function hasSchoolRosterContext(client = {}) {
  const orgType = String(client.organization_type || client.organizationType || '').toLowerCase();
  return orgType === 'school' || (!orgType && client.client_type === 'school');
}

export function rosterServiceContexts(client = {}) {
  const rows = Array.isArray(client.service_contexts) ? client.service_contexts : [];
  const active = rows.filter(row => Number(row.is_active) === 1);
  const visible = active.length ? active : rows;
  return [...new Map(visible.map(row => [`${row.agency_id}:${row.service_kind}:${row.organization_name || ''}:${row.service_status}`, row])).values()];
}
const serviceNames = { counseling: 'Counseling', tutoring: 'Tutoring', consultation: 'Consultation', coaching: 'Coaching' };
export function rosterServiceLabel(client = {}) {
  const contexts = rosterServiceContexts(client);
  if (contexts.length) return [...new Set(contexts.map(row => `${serviceNames[row.service_kind] || row.label || row.service_kind}${row.agency_name ? ` · ${row.agency_name}` : ''}`))].join('; ');
  return ({ clinical: 'Counseling', school: 'Counseling', learning: 'Tutoring', tutoring: 'Tutoring' })[client.client_type] || 'Service not specified';
}
// These old clinical buckets are names for Counseling, not separate programs.
const genericCounselingProgram = name => /^(?:counseling(?:\s+and|\s*&)?\s+(?:psycho)?therapy|counseling)$/i.test(String(name || '').trim());
export function meaningfulProgram(name, type) {
  const kind = String(type || '').toLowerCase();
  if (!name || ['clinical','agency','tenant','consultant','life_coach'].includes(kind)) return false;
  if (kind === 'school' || kind === 'program') return true;
  return !genericCounselingProgram(name);
}
export function rosterOrganizationLabel(client = {}) {
  const names = [];
  if (meaningfulProgram(client.organization_name, client.organization_type || client.organizationType)) names.push(client.organization_name);
  for (const row of rosterServiceContexts(client)) if (meaningfulProgram(row.organization_name, row.organization_type)) names.push(row.organization_name);
  return [...new Set(names)].join(' · ') || '—';
}

/** School-year follow-up never becomes an office service status. Stored records remain unchanged. */
export function rosterStatusLabel(client = {}, { school = hasSchoolRosterContext(client) } = {}) {
  if (school) return displaySchoolClientStatusLabel(client);
  const key = String(client.client_status_key || client.status || '').toLowerCase();
  const label = String(client.client_status_label || '').trim();
  if (['terminated', 'archived', 'dead'].includes(key)) return label || key.replace(/\b\w/g, letter => letter.toUpperCase());
  const contexts = rosterServiceContexts(client);
  if (contexts.length) {
    const statuses = [...new Set(contexts.map(row => Number(row.is_active) === 1 ? 'Active services' : ({ completed: 'Completed services', terminated: 'Terminated services', canceled: 'Canceled services' })[row.service_status] || 'Discontinued services'))];
    return statuses.join(' · ');
  }
  if (['current', 'active', 'being_seen'].includes(key)) return 'Active services';
  if (/fall|spring|returning|confirmation_pending|continuation_unknown|needs_day_assignment/i.test(`${key} ${label}`)) return 'Review service status';
  return label || (key ? key.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : '—');
}
