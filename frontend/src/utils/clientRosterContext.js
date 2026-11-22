import { displaySchoolClientStatusLabel } from './schoolClientStatusDisplay.js';

export function hasSchoolRosterContext(client = {}) {
  const orgType = String(client.organization_type || client.organizationType || '').toLowerCase();
  return client.roster_selected_types?.includes('school') || (client.roster_organization_types ? client.roster_organization_types.includes('school') : orgType === 'school') ||
    (client.service_contexts || []).some(row => Number(row.is_active) === 1 && row.organization_type === 'school') ||
    (!client.roster_organization_types && !orgType && !client.roster_selected_types && client.client_type === 'school');
}

export function hasOfficeService(client = {}) {
  if (hasSchoolRosterContext(client)) return true;
  const officeTypes = ['clinical','learning','coaching','consulting'];
  if (client.roster_selected_types?.some(type => officeTypes.includes(type))) return true;
  const services = client.service_contexts || [];
  if (services.some(row => Number(row.is_active) === 1 && ['counseling','tutoring','coaching','consultation'].includes(row.service_kind))) return true;
  return (client.roster_organization_types ? client.roster_organization_types.some(type => officeTypes.includes(type)) : client.organization_type === 'clinical') || (!client.roster_selected_types && !services.length && officeTypes.includes(client.client_type));
}

export function rosterServiceContexts(client = {}) {
  const rows = Array.isArray(client.service_contexts) ? client.service_contexts : [];
  const active = rows.filter(row => Number(row.is_active) === 1);
  const visible = active.length ? active : rows;
  return [...new Map(visible.map(row => [`${row.agency_id}:${row.service_kind}:${row.organization_name || ''}:${row.service_status}`, row])).values()];
}
const serviceNames = { counseling:'Clinical', tutoring:'Learning', consultation:'Consulting', coaching:'Coaching' };
export function chartServiceLabel(kind, label) {
  const name = serviceNames[kind];
  const detail = String(label || '').trim();
  if (!name) return detail || kind;
  if (!detail || [name.toLowerCase(),kind].includes(detail.toLowerCase()) || (kind === 'counseling' && genericCounselingProgram(detail))) return name;
  return `${name} · ${detail}`;
}
export function chartOrganizationLabel(name, type) {
  return isLegacyClinicalOrganization(name, type) ? 'Clinical' : name;
}
export function isLegacyClinicalOrganization(name, type) {
  return String(type || '').toLowerCase() === 'clinical' && genericCounselingProgram(name);
}
export function rosterServiceLabel(client = {}) {
  const contexts = rosterServiceContexts(client);
  if (contexts.length) return [...new Set(contexts.map(row => `${serviceNames[row.service_kind] || row.label || row.service_kind}${row.agency_name ? ` · ${row.agency_name}` : ''}`))].join('; ');
  return ({ clinical: 'Clinical', school: 'Clinical', learning: 'Learning', tutoring: 'Learning' })[client.client_type] || 'Service not specified';
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

export function offersAssignmentService(provider, agencyId, kind) {
  if (!['counseling','tutoring'].includes(kind)) return true;
  return provider.assignmentServicesByAgency?.[agencyId]?.includes(kind) === true;
}
