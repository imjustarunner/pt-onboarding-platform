import pool from '../config/database.js';
import PayrollTimeClaim from '../models/PayrollTimeClaim.model.js';
import PayrollRate from '../models/PayrollRate.model.js';
import PayrollUserIndirectServiceAssignment from '../models/PayrollUserIndirectServiceAssignment.model.js';
import { utcDateToZonedYmd } from '../utils/zonedWallTime.util.js';

import { JACQUELYNE_TIME_START, isJacquelyneTimeUser, isJacquelyneActivity } from '../utils/jacquelyneTimePolicy.js';
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

// A dated, employee-specific rate takes precedence over role/contract defaults.
export async function jacquelyneAdminRate({ agencyId, userId, asOf }) {
  const date = asOf instanceof Date ? asOf.toISOString().slice(0, 10) : String(asOf || '').slice(0, 10);
  if (!isJacquelyneTimeUser(agencyId, userId) || date < JACQUELYNE_TIME_START) return null;
  const rate = await PayrollRate.findBestRate({ agencyId: Number(agencyId), userId: Number(userId), serviceCode: 'Admin Time', asOf: date });
  return Number(rate?.rate_amount) > 0 ? Number(rate.rate_amount) : null;
}

export async function listJacquelyneHuddles({ agencyId, userId, db = pool }) {
  if (!isJacquelyneTimeUser(agencyId, userId)) return [];
  const [rows] = await db.execute(`SELECT e.id, e.title, e.start_at, e.end_at, e.event_timezone
    FROM provider_schedule_events e
    JOIN user_agencies ua ON ua.agency_id=e.agency_id AND ua.user_id=? AND COALESCE(ua.is_active,1)=1
    WHERE e.agency_id=? AND e.kind='HUDDLE' AND e.status NOT IN ('CANCELLED','DELETED')
      AND e.start_at >= ? AND e.start_at <= NOW()
      AND (e.provider_id=? OR EXISTS (SELECT 1 FROM provider_schedule_event_attendees a WHERE a.event_id=e.id AND a.user_id=?))
    ORDER BY e.start_at DESC LIMIT 250`, [userId, agencyId, JACQUELYNE_TIME_START, userId, userId]);
  return rows.map(row => ({ ...row, date: utcDateToZonedYmd(row.start_at, row.event_timezone || 'America/Denver') }));
}

// Called for both initial submissions and edits; client labels/buckets never grant access.
export async function validateJacquelyneTime({ agencyId, userId, claimDate, payload, claimId = 0, db = pool }) {
  const allocations = Array.isArray(payload.allocations) ? payload.allocations : [];
  const ids = allocations.map(a => Number(a.serviceTypeId)).filter(id => id > 0);
  const [types] = ids.length ? await db.execute(`SELECT id, agency_id, type_key, label, pay_bucket FROM payroll_indirect_service_types WHERE id IN (${ids.map(() => '?').join(',')})`, ids) : [[]];
  const privateTypes = types.filter(t => isJacquelyneActivity(t.type_key));
  const privateRequest = privateTypes.length || allocations.some(a => isJacquelyneActivity(a.serviceTypeKey));
  if (!privateRequest && !(isJacquelyneTimeUser(agencyId, userId) && payload.categoryGroup === 'admin_duties')) return;
  if (!isJacquelyneTimeUser(agencyId, userId)) fail(403, 'These activities are assigned only to Jacquelyne.');
  delete payload.amount; delete payload.amountExplicit; delete payload.payRateAmountOverride;
  if (claimDate < JACQUELYNE_TIME_START) fail(400, 'These duties and the Admin Time rate start October 29, 2026. Contact payroll about earlier work.');
  if (!allocations.length || privateTypes.length !== new Set(ids).size || allocations.some(a => !ids.includes(Number(a.serviceTypeId)))) fail(400, 'Select one of your assigned activity types.');
  if (!await PayrollUserIndirectServiceAssignment.hasEnabledAssignmentsForTypes({ agencyId, userId, serviceTypeIds: ids })) fail(403, 'This activity is not assigned to you.');
  for (const allocation of allocations) {
    const type = types.find(t => Number(t.id) === Number(allocation.serviceTypeId));
    if (!type || Number(type.agency_id) !== Number(agencyId)) fail(403, 'Select an activity from your organization.');
    const expected = type.pay_bucket === 'admin' ? 'admin_duties' : 'support_activity';
    if (payload.categoryGroup !== expected) fail(400, 'Submit this activity under its assigned pay category.');
    allocation.serviceTypeKey = type.type_key;
    allocation.serviceTypeLabel = type.label || allocation.serviceTypeLabel;
    allocation.payBucket = type.pay_bucket;
    if (String(allocation.note || '').trim().length < 5) fail(400, 'Add a short note describing the work performed.');
  }
  if (payload.categoryGroup === 'admin_duties') {
    payload.description = allocations.map(a => a.note).join('; ');
    payload.purpose = allocations.map(a => a.serviceTypeLabel || a.serviceTypeKey).join('; ');
  }
  if (privateTypes.some(t => t.type_key === 'jacquelyne_outreach') && String(payload.approvedBy || '').trim().length < 2) fail(400, 'Name the administrator who directed this outreach, and describe the Denver school and relationship purpose in your activity note.');
  if (!privateTypes.some(t => t.type_key === 'jacquelyne_onboarding')) {
    delete payload.scheduleEventId; delete payload.meetingTitle;
    return;
  }
  const meeting = (await listJacquelyneHuddles({ agencyId, userId, db })).find(m => Number(m.id) === Number(payload.scheduleEventId));
  if (!meeting || meeting.date !== claimDate) fail(400, 'Choose your scheduled onboarding huddle on the date worked.');
  const minutes = (new Date(meeting.end_at) - new Date(meeting.start_at)) / 60000;
  const requested = allocations.filter(a => a.serviceTypeKey === 'jacquelyne_onboarding').reduce((sum, a) => sum + Number(a.minutes || 0), 0);
  if (!(requested > 0) || requested > minutes) fail(400, 'Onboarding help cannot exceed the scheduled huddle duration.');
  const [existing] = await db.execute(`SELECT id FROM payroll_time_claims WHERE agency_id=? AND user_id=? AND id<>?
    AND status NOT IN ('withdrawn','rejected') AND CAST(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.scheduleEventId')) AS UNSIGNED)=? LIMIT 1`,
  [agencyId, userId, claimId, meeting.id]);
  if (existing.length) fail(409, 'This huddle already has a time record. Review it in My time records instead of submitting duplicate time.');
  payload.scheduleEventId = Number(meeting.id);
  payload.meetingTitle = meeting.title;
}

// Share the automatic meeting-sync lock so manual and automatic claims cannot race.
export async function persistJacquelyneTimeClaim(args, { existingClaimId = null, dbPool = pool } = {}) {
  const save = db => existingClaimId
    ? PayrollTimeClaim.resubmit({ id: existingClaimId, claimDate: args.claimDate, payload: args.payload, db })
    : PayrollTimeClaim.create({ ...args, db });
  const onboarding = isJacquelyneTimeUser(args.agencyId, args.userId)
    && args.payload?.allocations?.some(a => a.serviceTypeKey === 'jacquelyne_onboarding');
  if (!onboarding) return save(dbPool);
  const db = await dbPool.getConnection();
  const lock = `meeting-compensation:${Number(args.payload.scheduleEventId)}`;
  let acquired = false;
  try {
    const [[row]] = await db.execute('SELECT GET_LOCK(?, 5) acquired', [lock]);
    acquired = !!row?.acquired;
    if (!acquired) fail(409, 'This meeting is being recorded. Refresh My time records before submitting again.');
    await validateJacquelyneTime({ ...args, claimId: existingClaimId || 0, db });
    return await save(db);
  } finally {
    try { if (acquired) await db.execute('SELECT RELEASE_LOCK(?)', [lock]); }
    finally { db.release(); }
  }
}
