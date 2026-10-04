import pool from '../config/database.js';
import { utcToZonedMysqlWall } from '../utils/officeEventDateTime.util.js';
import { ymd } from '../utils/officeSchedulingPolicy.js';
import OfficeScheduleMaterializer from '../services/officeScheduleMaterializer.service.js';
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const superadmin = user => ['super_admin', 'superadmin'].includes(String(user?.role).toLowerCase());
const requireSuper = req => { if (!superadmin(req.user)) throw fail('Superadmin access required.', 403); };
const agencyId = req => { const id = Number(req.params.agencyId); if (!Number.isSafeInteger(id) || id <= 0) throw fail('Choose an agency.'); return id; };
function parseDate(value) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) throw fail('Choose a valid transition date.');
  return value;
}
export async function listPolicies(req, res, next) {
  try {
    requireSuper(req);
    const [items] = await pool.execute(`SELECT a.id agencyId, a.name, DATE_FORMAT(p.transition_date, '%Y-%m-%d') transitionDate
      FROM agencies a LEFT JOIN office_scheduling_policies p ON p.agency_id = a.id
      WHERE a.organization_type = 'agency' ORDER BY a.name`);
    res.json({ items });
  } catch (e) { next(e); }
}
async function preview(id) {
  const [[counts]] = await pool.execute(`SELECT COUNT(*) assignmentCount,
    SUM(a.booking_agency_id IS NULL) missingAgencyCount FROM office_standing_assignments a WHERE a.booking_agency_id = ? AND a.is_active = TRUE`, [id]);
  const [offices] = await pool.execute(`SELECT DISTINCT l.id, l.name, l.timezone FROM office_locations l
    JOIN office_location_agencies la ON la.office_location_id = l.id WHERE la.agency_id = ?`, [id]);
  const [[unscoped]] = await pool.execute(`SELECT COUNT(DISTINCT a.id) count FROM office_standing_assignments a
    JOIN office_location_agencies la ON la.office_location_id = a.office_location_id
    WHERE la.agency_id = ? AND a.is_active = TRUE AND a.booking_agency_id IS NULL`, [id]);
  const [[sessions]] = await pool.execute(`SELECT COUNT(*) count FROM appointments WHERE agency_id = ? AND end_at >= UTC_TIMESTAMP()`, [id]);
  return { assignmentCount: Number(counts.assignmentCount), missingAgencyCount: Number(unscoped.count), protectedAppointmentCount: Number(sessions.count), offices };
}
export async function previewPolicy(req, res, next) {
  try { requireSuper(req); res.json(await preview(agencyId(req))); } catch (e) { next(e); }
}
export async function savePolicy(req, res, next) {
  let conn;
  try {
    requireSuper(req); const id = agencyId(req), date = parseDate(req.body.transitionDate);
    if (req.body.confirmed !== true) throw fail('Preview and confirm the transition first.');
    const report = await preview(id);
    if (date && report.missingAgencyCount) throw fail('Resolve assignments without an agency before scheduling the transition.', 409);
    const today = report.offices.map(o => utcToZonedMysqlWall(new Date(), o.timezone || 'America/Denver').slice(0, 10)).sort().at(-1) || new Date().toISOString().slice(0, 10);
    if (date && date <= today) throw fail('Choose a future date. Historical schedules cannot be converted.');
    conn = await pool.getConnection(); await conn.beginTransaction();
    await conn.execute('INSERT IGNORE INTO office_scheduling_policies (agency_id) VALUES (?)', [id]);
    const [[previous]] = await conn.execute('SELECT transition_date FROM office_scheduling_policies WHERE agency_id = ? FOR UPDATE', [id]);
    if (previous.transition_date && ymd(previous.transition_date) <= today) throw fail('This transition has already started. Contact support for a reviewed correction.', 409);
    await conn.execute('UPDATE office_scheduling_policies SET transition_date = ?, updated_by_user_id = ? WHERE agency_id = ?', [date, req.user.id, id]);
    await conn.execute('INSERT INTO office_scheduling_policy_audit (agency_id, actor_user_id, previous_date, transition_date) VALUES (?, ?, ?, ?)', [id, req.user.id, previous.transition_date, date]);
    await conn.commit();
    for (const office of report.offices) OfficeScheduleMaterializer.invalidateOffice(office.id);
    res.json({ ok: true, transitionDate: date });
  } catch (e) { if (conn) await conn.rollback(); next(e); } finally { conn?.release(); }
}
export async function listUsageReviews(req, res, next) {
  try {
    const admin = req.query.reviewAll === 'true';
    if (admin) requireSuper(req);
    const [items] = await pool.execute(`SELECT u.assignment_id id, u.status, DATE_FORMAT(u.deadline_date, '%Y-%m-%d') deadlineDate,
      a.provider_id providerId, a.booking_agency_id agencyId, a.weekday, a.hour, l.timezone, l.name officeName, r.name roomName,
      CONCAT(p.first_name, ' ', p.last_name) providerName
      FROM office_assignment_usage_reviews u JOIN office_standing_assignments a ON a.id = u.assignment_id
      JOIN office_locations l ON l.id = a.office_location_id JOIN office_rooms r ON r.id = a.room_id JOIN users p ON p.id = a.provider_id
      WHERE a.is_active = TRUE AND u.status IN ('warning', 'action_required', 'pending', 'protected_interior') ${admin ? '' : 'AND a.provider_id = ?'}
      ORDER BY u.deadline_date, a.weekday, a.hour`, admin ? [] : [req.user.id]);
    res.json({ items });
  } catch (e) { next(e); }
}
export async function requestKeepOffice(req, res, next) {
  let conn;
  try {
    conn = await pool.getConnection(); await conn.beginTransaction();
    const [[row]] = await conn.execute(`SELECT u.*, a.provider_id, a.is_active, l.timezone FROM office_assignment_usage_reviews u
      JOIN office_standing_assignments a ON a.id = u.assignment_id JOIN office_locations l ON l.id = a.office_location_id
      WHERE u.assignment_id = ? FOR UPDATE`, [Number(req.params.assignmentId)]);
    if (!row || Number(row.provider_id) !== Number(req.user.id)) throw fail('Assignment not found.', 404);
    const today = utcToZonedMysqlWall(new Date(), row.timezone || 'America/Denver').slice(0, 10);
    if (!row.is_active || !['action_required', 'pending'].includes(row.status) || (row.status !== 'pending' && today > ymd(row.deadline_date))) throw fail('The re-request window has ended or is not open. Request office time through My Schedule.', 409);
    await conn.execute("UPDATE office_assignment_usage_reviews SET status = 'pending', requested_at = COALESCE(requested_at, UTC_TIMESTAMP()) WHERE assignment_id = ?", [row.assignment_id]);
    await conn.commit(); res.json({ ok: true });
  } catch (e) { if (conn) await conn.rollback(); next(e); } finally { conn?.release(); }
}
export async function decideKeepOffice(req, res, next) {
  let conn;
  try {
    requireSuper(req);
    if (!['approve', 'deny'].includes(req.body.decision)) throw fail('Choose approve or deny.');
    conn = await pool.getConnection(); await conn.beginTransaction();
    const [[row]] = await conn.execute(`SELECT u.*, l.timezone FROM office_assignment_usage_reviews u JOIN office_standing_assignments a ON a.id = u.assignment_id
      JOIN office_locations l ON l.id = a.office_location_id WHERE u.assignment_id = ? AND a.is_active = TRUE FOR UPDATE`, [Number(req.params.assignmentId)]);
    if (!row || row.status !== 'pending') throw fail('This request is no longer pending.', 409);
    const today = utcToZonedMysqlWall(new Date(), row.timezone || 'America/Denver').slice(0, 10);
    // Denial receives a fresh notice and business-day deadline from the watchdog.
    await conn.execute(`UPDATE office_assignment_usage_reviews SET status = ?, cycle_start_date = ?, warned_at = NULL,
      action_required_at = NULL, deadline_date = NULL, requested_at = NULL, reviewed_at = UTC_TIMESTAMP(), reviewed_by_user_id = ? WHERE assignment_id = ?`,
    [req.body.decision === 'approve' ? 'monitoring' : 'action_required', req.body.decision === 'approve' ? today : row.cycle_start_date, req.user.id, row.assignment_id]);
    await conn.commit(); res.json({ ok: true });
  } catch (e) { if (conn) await conn.rollback(); next(e); } finally { conn?.release(); }
}
