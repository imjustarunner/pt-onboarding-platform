import crypto from 'node:crypto';
import pool from '../config/database.js';
import { normalizeEventOperations, readEventOperations, EVENT_STAFF_ROLES_SQL } from '../utils/companyEventOperations.js';

export async function isEventCoordinator({ userId, agencyId, eventId = null }) {
  if (!Number(userId) || !Number(agencyId)) return false;
  const [rows] = await pool.execute(`SELECT 1 FROM company_event_coordinators c
    JOIN company_events e ON e.id = c.company_event_id
    JOIN user_agencies ua ON ua.user_id = c.user_id AND ua.agency_id = e.agency_id AND COALESCE(ua.is_active, 1) = 1
    JOIN users u ON u.id = c.user_id AND u.is_active = 1 AND COALESCE(u.is_archived, 0) = 0 AND u.terminated_at IS NULL
    WHERE c.user_id = ? AND e.agency_id = ? AND u.role IN (${EVENT_STAFF_ROLES_SQL}) ${eventId ? 'AND e.id = ?' : ''} LIMIT 1`,
  eventId ? [userId, agencyId, eventId] : [userId, agencyId]);
  return !!rows.length;
}

export async function validateEventOperations({ body, existing = {}, actorUserId, agencyId, canAssignCoordinators = false }) {
  const previous = readEventOperations({ event_type: body.eventType || (body.category ? `school_${body.category}` : ''), ...existing });
  const next = normalizeEventOperations(body, previous, { actorUserId });
  const internalFieldsChanged = ['requiresPayment', 'paymentAmount', 'paymentPaid', 'paymentNotes', 'publicRegistrationEnabled', 'attendeeSmsEnabled', 'attendeeCheckInEnabled', 'countsTowardOutreachCommitment', 'staffAudienceScope']
    .some(key => JSON.stringify(next[key]) !== JSON.stringify(previous[key]));
  if (internalFieldsChanged) {
    const [actors] = actorUserId ? await pool.execute(`SELECT u.id FROM users u WHERE u.id = ? AND u.is_active = 1
      AND COALESCE(u.is_archived, 0) = 0 AND u.terminated_at IS NULL AND u.role IN (${EVENT_STAFF_ROLES_SQL})
      AND (u.role = 'super_admin' OR EXISTS (SELECT 1 FROM user_agencies ua WHERE ua.user_id = u.id AND ua.agency_id = ? AND COALESCE(ua.is_active, 1) = 1)) LIMIT 1`, [actorUserId, agencyId]) : [[]];
    if (!actors.length) throw Object.assign(new Error('Only internal event staff can change payment, public registration, texting, or commitment settings'), { status: 403 });
  }
  const changed = JSON.stringify([...previous.coordinatorUserIds].sort((a,b)=>a-b)) !== JSON.stringify(next.coordinatorUserIds);
  if (changed && !canAssignCoordinators) throw Object.assign(new Error('Only agency event managers can assign coordinators'), { status: 403 });
  if (changed && next.coordinatorUserIds.length) {
    const [rows] = await pool.execute(`SELECT DISTINCT u.id FROM users u JOIN user_agencies ua ON ua.user_id = u.id
      WHERE ua.agency_id = ? AND COALESCE(ua.is_active, 1) = 1 AND u.id IN (${next.coordinatorUserIds.map(()=>'?').join(',')})
        AND u.is_active = 1 AND u.terminated_at IS NULL AND COALESCE(u.is_archived, 0) = 0 AND u.role IN (${EVENT_STAFF_ROLES_SQL})`, [agencyId, ...next.coordinatorUserIds]);
    if (rows.length !== next.coordinatorUserIds.length) throw Object.assign(new Error('Coordinators must be active staff in this agency'), { status: 400 });
  }
  return next;
}

export async function saveEventOperations({ eventId, agencyId, actorUserId, operations }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(`UPDATE company_events SET operations_json = ?,
      staff_link_token = COALESCE(staff_link_token, ?), updated_by_user_id = ? WHERE id = ? AND agency_id = ?`,
    [JSON.stringify(operations), crypto.randomBytes(24).toString('hex'), actorUserId || null, eventId, agencyId]);
    if (!result.affectedRows) throw Object.assign(new Error('Event not found'), { status: 404 });
    const [assigned] = await conn.execute('SELECT user_id FROM company_event_coordinators WHERE company_event_id = ? FOR UPDATE', [eventId]);
    const oldIds = new Set(assigned.map(row => Number(row.user_id)));
    const nextIds = new Set(operations.coordinatorUserIds);
    for (const userId of oldIds) if (!nextIds.has(userId)) await conn.execute(
      'DELETE FROM company_event_coordinators WHERE company_event_id = ? AND user_id = ?', [eventId, userId]);
    for (const userId of nextIds) if (!oldIds.has(userId)) {
      if (!actorUserId) throw Object.assign(new Error('A signed-in agency event manager must assign new coordinators'), { status: 403 });
      await conn.execute('INSERT INTO company_event_coordinators (company_event_id, user_id, assigned_by_user_id) VALUES (?, ?, ?)', [eventId, userId, actorUserId]);
    }
    await conn.commit();
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}
