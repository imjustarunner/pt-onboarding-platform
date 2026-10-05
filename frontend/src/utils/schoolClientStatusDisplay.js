import { resolveSchoolRosterDisplayStatus } from '../navigation/schoolLifecycle/schoolClientStatusDisplay.js';
import { needsFallReassignmentClearance as needsClearance } from '../navigation/schoolLifecycle/fallReadiness.js';

export function needsFallReassignmentClearance(client) {
  return needsClearance({ client, disposition: client });
}

export function displaySchoolClientStatusLabel(client, now = new Date()) {
  if (!client) return '—';
  if (client.school_status_resolved === true) return client.client_status_label || '—';
  const school = client.client_type === 'school' || Number(client.organization_id) > 0 || !!client.organization_name;
  if (!school && client.client_status_key !== 'current') return client.client_status_label || '—';
  return resolveSchoolRosterDisplayStatus(client, now).label;
}

export function assignedDayDisplay(client) {
  const raw = String(client?.service_day || '').trim();
  return !raw || raw.toLowerCase() === 'unknown' ? 'Not assigned' : raw;
}
