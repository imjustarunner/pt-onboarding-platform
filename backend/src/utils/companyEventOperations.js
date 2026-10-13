import { STAFF_ROLES } from './staffEligibility.js';

export const EVENT_STAFF_ROLES = [...new Set([...STAFF_ROLES, 'intern_plus', 'club_manager'])];
// Static roles owned by the application, never values supplied by a request.
export const EVENT_STAFF_ROLES_SQL = EVENT_STAFF_ROLES.map(role => `'${role}'`).join(',');

const DEFAULTS = Object.freeze({
  requiresPayment: false, paymentAmount: null, paymentPaid: false, paymentNotes: '',
  paymentPaidAt: null, paymentPaidByUserId: null,
  publicRegistrationEnabled: false, attendeeSmsEnabled: false, attendeeCheckInEnabled: false, countsTowardOutreachCommitment: false, staffAudienceScope: 'audience', coordinatorUserIds: []
});
export function readEventOperations(row = {}) {
  let stored = row.operations_json;
  if (typeof stored === 'string') { try { stored = JSON.parse(stored); } catch { stored = {}; } }
  const value = { ...DEFAULTS, staffAudienceScope: String(row.event_type || '').startsWith('school_') ? 'outreach_due' : 'audience', ...(stored && typeof stored === 'object' ? stored : {}) };
  for (const key of ['requiresPayment', 'paymentPaid', 'publicRegistrationEnabled', 'attendeeSmsEnabled', 'attendeeCheckInEnabled', 'countsTowardOutreachCommitment']) {
    value[key] = [true, 1, '1', 'true'].includes(value[key]);
  }
  return value;
}
const invalid = (message) => Object.assign(new Error(message), { status: 400, statusCode: 400 });
export function normalizeEventOperations(body = {}, existing = {}, { actorUserId = null, now = new Date() } = {}) {
  const next = { ...DEFAULTS, ...existing };
  if (body.staffAudienceScope !== undefined) {
    if (!['audience', 'outreach_due'].includes(body.staffAudienceScope)) throw invalid('Select an event staff audience');
    next.staffAudienceScope = body.staffAudienceScope;
  }
  for (const key of ['requiresPayment', 'paymentPaid', 'publicRegistrationEnabled', 'attendeeSmsEnabled', 'attendeeCheckInEnabled', 'countsTowardOutreachCommitment']) {
    if (body[key] !== undefined) {
      if (![true, false, 0, 1, '0', '1', 'true', 'false'].includes(body[key])) throw invalid(`${key} must be a checkbox value`);
      next[key] = [true, 1, '1', 'true'].includes(body[key]);
    }
  }
  if (body.paymentAmount !== undefined) {
    const value = body.paymentAmount;
    if (value === null || value === '') next.paymentAmount = null;
    else {
      if (!/^\d{1,8}(\.\d{1,2})?$/.test(String(value)) || !Number.isFinite(Number(value))) throw invalid('Event fee must be a nonnegative amount with at most two decimal places');
      next.paymentAmount = Number(value);
    }
  }
  if (body.paymentNotes !== undefined) {
    if (typeof body.paymentNotes !== 'string' || body.paymentNotes.length > 4000) throw invalid('Payment notes must be 4,000 characters or fewer');
    next.paymentNotes = body.paymentNotes.trim();
  }
  if (body.coordinatorUserIds !== undefined) {
    if (!Array.isArray(body.coordinatorUserIds) || body.coordinatorUserIds.length > 50 || body.coordinatorUserIds.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) throw invalid('Select valid event coordinators');
    next.coordinatorUserIds = [...new Set(body.coordinatorUserIds.map(Number))].sort((a,b) => a-b);
  }
  if (!next.requiresPayment) next.paymentPaid = false;
  if (next.paymentPaid && !existing.paymentPaid) {
    next.paymentPaidAt = now.toISOString(); next.paymentPaidByUserId = actorUserId;
  } else if (!next.paymentPaid) {
    next.paymentPaidAt = null; next.paymentPaidByUserId = null;
  }
  return next;
}
export function mapEventOperations(row = {}) {
  const operations = readEventOperations(row);
  const base = String(process.env.FRONTEND_URL || process.env.FRONTEND_BASE_URL || '').replace(/\/$/, '');
  return { ...operations,
    paymentOutstanding: !!operations.requiresPayment && !operations.paymentPaid,
    publicPageUrl: `${base}/company-events/${Number(row.id)}`,
    staffPageUrl: row.staff_link_token ? `${base}/company-events/${Number(row.id)}/staff/${row.staff_link_token}` : null
  };
}
export function assertEventRegistrationOpen(row, now = new Date()) {
  const operations = readEventOperations(row);
  if (!row || !row.is_active || row.school_event_status === 'canceled' || !operations.publicRegistrationEnabled) throw Object.assign(new Error('Event registration is not available'), { status: 404 });
  if (row.public_registration_status && row.public_registration_status !== 'open') throw invalid('Registration for this event is closed');
  if (row.rsvp_deadline && new Date(row.rsvp_deadline) < now) throw invalid('The RSVP deadline has passed');
  if (row.ends_at && new Date(row.ends_at) < now) throw invalid('This event has ended');
}
