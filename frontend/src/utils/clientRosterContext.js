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
  if (contexts.length) return contexts.map(row => `${serviceNames[row.service_kind] || row.label || row.service_kind}${row.agency_name ? ` · ${row.agency_name}` : ''}`).join('; ');
  return ({ clinical: 'Counseling', school: 'Counseling', learning: 'Tutoring', tutoring: 'Tutoring' })[client.client_type] || 'Service not specified';
}
export function rosterOrganizationLabel(client = {}) {
  return [...new Set([client.organization_name, ...rosterServiceContexts(client).map(row => row.organization_name)].filter(Boolean))].join(' · ') || '—';
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
