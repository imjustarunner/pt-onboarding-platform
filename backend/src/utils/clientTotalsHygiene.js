// Reserved test mailboxes may appear anywhere in a submitted registration,
// including a secondary guardian or an emergency contact.
// One character before @ is enough to establish a mailbox. Avoid an unanchored
// variable-length local part: registrations can contain large signature images.
const exampleEmail = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]@example\.com(?![a-z0-9_.-])/i;
export function hasExampleRegistrationEmail(value) {
  if (typeof value === 'string') return exampleEmail.test(value);
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some(hasExampleRegistrationEmail);
}

export function isFall2026ColumbiaRegistration(client) {
  if (Number(client.agency_id) !== 2) return false;
  const school = `${client.organization_name || ''} ${client.organization_slug || ''}`;
  if (!Number(client.has_columbia_affiliation) && !/\bcolumbia\b/i.test(school)) return false;
  const anchor = client.submission_date || client.created_at;
  if (!anchor) return false;
  const day = anchor instanceof Date ? anchor.toISOString().slice(0, 10) : String(anchor).slice(0, 10);
  return day >= '2026-08-01' && day < '2027-01-01';
}

// Calendar months, clamped at month end (May 31 -> February 28/29).
export function threeMonthsBefore(now) {
  const cutoff = new Date(now);
  const day = cutoff.getUTCDate();
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 3);
  const end = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate();
  cutoff.setUTCDate(Math.min(day, end));
  return cutoff;
}

export function classifyClientTotals(client, { registrationHasExampleEmail = false, lastActivityAt, now = new Date() } = {}) {
  const demoReason = registrationHasExampleEmail ? 'registration_example_email'
    : isFall2026ColumbiaRegistration(client) ? 'columbia_fall_2026' : null;
  if (demoReason) return Number(client.is_demo) === 1 ? null : { action: 'demo', reason: demoReason };
  if (Number(client.is_demo) || Number(client.created_via_dev_fill) || client.compliance_archived_at
    || ['ARCHIVED','DECLINED'].includes(String(client.status).toUpperCase())
    || ['inactive','terminated','archived'].includes(String(client.client_status_key).toLowerCase())
    || Number(client.has_active_assignment)) return null;
  const activity = new Date(lastActivityAt || client.last_activity_at || client.created_at);
  if (!Number.isFinite(activity.getTime()) || activity >= threeMonthsBefore(now)) return null;
  return { action: 'inactive', reason: 'no_provider_assignment_and_over_three_months_without_activity' };
}
