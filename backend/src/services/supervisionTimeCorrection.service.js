import pool from '../config/database.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import { hasActiveMeetingMembership, canJoinSupervision } from './meetingJoinPolicy.service.js';
import { withSupervisorTimeLock, assertNoReviewTimeOverlap } from './supervisionReviewTime.service.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const sqlDate = date => date.toISOString().slice(0, 19).replace('T', ' ');
const instant = value => value instanceof Date ? value : new Date(`${String(value).replace(' ', 'T')}${/[zZ]|[+-]\d{2}:\d{2}$/.test(String(value)) ? '' : 'Z'}`);

export function validateSupervisionTimeCorrection(input, now = new Date()) {
  if (![input.startAt, input.endAt].every(v => /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v || ''))) fail('Times must include a timezone.');
  const start = new Date(input.startAt), end = new Date(input.endAt), minutes = Number(input.minutes);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start || end > now || end - start > 8 * 3600000) fail('Enter actual past attendance within an eight-hour window.');
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 480 || minutes * 60000 > end - start) fail('Attended minutes must be between 1 and the elapsed time, excluding breaks.');
  const reason = String(input.reason || '').trim();
  if (reason.length < 10 || reason.length > 2000) fail('Give a reason for this correction (10–2,000 characters).');
  if (!['PLATFORM_VIDEO', 'PHONE', 'IN_PERSON', 'EXTERNAL_VIDEO', 'MIXED'].includes(input.modality)) fail('Choose how this supervision took place.');
  if (input.attested !== true) fail('Confirm these are the actual attendance times.');
  if (!/^[\w-]{8,80}$/.test(input.requestKey || '')) fail('A submission identifier is required.');
  const userIds = [...new Set((Array.isArray(input.userIds) ? input.userIds : []).map(Number))];
  if (!userIds.length || userIds.some(id => !Number.isSafeInteger(id) || id < 1)) fail('Select the people whose attendance needs correcting.');
  return { startAt: sqlDate(start), endAt: sqlDate(end), totalSeconds: minutes * 60, reason, modality: input.modality, userIds, requestKey: input.requestKey };
}

export async function supervisionRecordAccess(sessionId, actor) {
  if (!Number.isSafeInteger(Number(sessionId)) || Number(sessionId) < 1) fail('Invalid session.');
  const session = await SupervisionSession.findById(Number(sessionId));
  if (!session) fail('Session not found.', 404);
  const admin = ['super_admin', 'superadmin', 'admin', 'support', 'clinical_practice_assistant'].includes(String(actor.role).toLowerCase())
    && await hasActiveMeetingMembership(session.agency_id, actor.id);
  const participant = await canJoinSupervision(session, actor.id);
  if (!admin && !participant) fail('Access denied.', 403);
  const canManage = admin || (participant && [session.supervisor_user_id, session.co_facilitator_user_id].some(id => Number(id) === Number(actor.id)));
  return { session, canManage };
}

async function recordParticipants(session, db = pool) {
  const [rows] = await db.execute(`SELECT u.id AS userId, CONCAT_WS(' ',COALESCE(NULLIF(TRIM(u.preferred_name),''),u.first_name),u.last_name) AS name,
    IF(u.id IN (?,?), 'Supervisor', 'Supervisee') AS role,
    r.total_seconds AS totalSeconds,r.first_joined_at AS firstJoinedAt,r.last_left_at AS lastLeftAt,r.manual_correction_id AS correctionId
    FROM users u LEFT JOIN supervision_session_attendance_rollups r ON r.user_id=u.id AND r.session_id=?
    WHERE u.id IN (?,?,?) OR EXISTS (SELECT 1 FROM supervision_session_attendees a WHERE a.session_id=? AND a.user_id=u.id AND a.status NOT IN ('REMOVED','WITHDRAWN'))
    ORDER BY role,u.last_name,u.first_name`, [session.supervisor_user_id, session.co_facilitator_user_id, session.id,
    session.supervisor_user_id, session.co_facilitator_user_id, session.supervisee_user_id, session.id]);
  return rows;
}

export async function getSupervisionRecord(sessionId, actor) {
  const { session, canManage } = await supervisionRecordAccess(sessionId, actor);
  const participants = await recordParticipants(session);
  const [credits] = await pool.execute(`SELECT user_id,individual_hours,group_hours,total_seconds,source_json
    FROM supervision_session_hour_credits WHERE session_id=?`, [session.id]);
  const hourCredits = credits.filter(c => (canManage || Number(c.user_id) === Number(actor.id))
    && participants.some(p => Number(p.userId) === Number(c.user_id))).map(c => {
    let source = c.source_json;
    if (typeof source === 'string') { try { source = JSON.parse(source); } catch { source = {}; } }
    return { userId:Number(c.user_id), individualHours:Number(c.individual_hours), groupHours:Number(c.group_hours),
      totalSeconds:Number(c.total_seconds), countable:source?.countable !== false, effectiveStartDate:source?.effectiveStartDate || null };
  });
  const [[agency]] = await pool.execute('SELECT name FROM agencies WHERE id=?',[session.agency_id]);
  const [corrections] = await pool.execute(`SELECT c.*,CONCAT_WS(' ',COALESCE(NULLIF(TRIM(u.preferred_name),''),u.first_name),u.last_name) AS requestedByName
    FROM supervision_time_corrections c JOIN users u ON u.id=c.requested_by_user_id
    WHERE c.session_id=? AND (?=1 OR c.user_id=?) ORDER BY c.id DESC`, [session.id, canManage ? 1 : 0, actor.id]);
  const [events] = await pool.execute(`SELECT user_id AS userId,event_type AS eventType,event_at AS at
    FROM supervision_session_attendance_events WHERE session_id=? ORDER BY event_at,id`, [session.id]);
  return { session: { id: session.id, agencyId:session.agency_id, sessionType:session.session_type, agencyName: agency?.name || '', startAt: session.start_at, endAt: session.end_at, status: session.status,
    finalizedAt: session.finalized_at, endedAt: session.live_ended_at }, participants, events, corrections, hourCredits,
    canManage, actorUserId: Number(actor.id), canCorrect: instant(session.end_at) < new Date() && !['CANCELLED','RESCHEDULED','MANUAL_RECORDING','MANUAL_PENDING'].includes(String(session.status).toUpperCase()) };
}

async function assertCorrectionWindow(db, session, input) {
  if (instant(session.end_at) > new Date() || ['CANCELLED','RESCHEDULED','MANUAL_RECORDING','MANUAL_PENDING'].includes(String(session.status).toUpperCase())) fail('Correct attendance after this session has ended.', 409);
  // A correction belongs to this occurrence, not a new meeting on another date.
  if (Math.abs(instant(input.startAt) - instant(session.start_at)) > 24 * 3600000) fail('Use the original session’s date. Record a separate session for another day.');
  const [live] = await db.execute('SELECT 1 FROM supervision_session_join_presence WHERE session_id=? AND left_at IS NULL AND last_seen_at >= DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 MINUTE) LIMIT 1', [session.id]);
  if (live.length) fail('End the live meeting before correcting attendance.', 409);
  for (const uid of input.userIds) {
    const [overlap] = await db.execute(`SELECT r.session_id FROM supervision_session_attendance_rollups r
      JOIN supervision_sessions s ON s.id=r.session_id WHERE r.user_id=? AND r.session_id<>? AND r.total_seconds>0
      AND s.status NOT IN ('CANCELLED','RESCHEDULED') AND r.first_joined_at<? AND r.last_left_at>? LIMIT 1`, [uid,session.id,input.endAt,input.startAt]);
    if (overlap.length) fail('This overlaps another recorded supervision. Review it before counting the time twice.', 409);
  }
  await assertNoReviewTimeOverlap(db, input.userIds, input.startAt, input.endAt);
}

async function applyCorrection(db, session, correction, actorId) {
  const [[previous]] = await db.execute('SELECT * FROM supervision_session_attendance_rollups WHERE session_id=? AND user_id=? FOR UPDATE', [session.id, correction.user_id]);
  await db.execute(`UPDATE supervision_time_corrections SET previous_record_json=?,status='approved',reviewed_by_user_id=?,reviewed_at=UTC_TIMESTAMP() WHERE id=?`, [JSON.stringify(previous || null),actorId,correction.id]);
  await db.execute(`INSERT INTO supervision_session_attendance_rollups (session_id,user_id,first_joined_at,last_left_at,total_seconds,segment_count,is_finalized,manual_correction_id)
    VALUES (?,?,?,?,?,1,1,?) ON DUPLICATE KEY UPDATE first_joined_at=VALUES(first_joined_at),last_left_at=VALUES(last_left_at),total_seconds=VALUES(total_seconds),is_finalized=1,manual_correction_id=VALUES(manual_correction_id)`,
    [session.id,correction.user_id,correction.start_at,correction.end_at,correction.total_seconds,correction.id]);
}

async function completeRecord(db, session, actorId) {
  await db.execute(`UPDATE supervision_sessions SET status='FINALIZED',finalized_at=COALESCE(finalized_at,UTC_TIMESTAMP()),
    finalized_by_user_id=COALESCE(finalized_by_user_id,?),finalize_source=COALESCE(finalize_source,'time_correction'),
    final_total_seconds=(SELECT COALESCE(SUM(total_seconds),0) FROM supervision_session_attendance_rollups WHERE session_id=?) WHERE id=?`, [actorId,session.id,session.id]);
}

// Separate from finalization: a correction never sends another meeting email or regenerates notes.
export async function syncSupervisionTimeCorrections(sessionId, actor) {
  const { session, canManage } = await supervisionRecordAccess(sessionId, actor);
  if (!canManage) fail('Only a supervisor or authorized administrator can reconcile corrections.',403);
  return withSupervisorTimeLock([session.supervisor_user_id,session.supervisee_user_id], async db => {
    const [pending] = await db.execute("SELECT id,user_id FROM supervision_time_corrections WHERE session_id=? AND status='approved' AND sync_status<>'complete'", [session.id]);
    if (!pending.length) return { synced: true };
    const { creditSuperviseeHoursFromFinalizedSession, createSupervisorSupervisionTimeClaim } = await import('./supervisionFinalizePipeline.service.js');
    const rollups = await SupervisionSession.listAttendanceRollupsForSession(session.id);
    await creditSuperviseeHoursFromFinalizedSession({ session, rollups, actorUserId: actor.id });
    if (pending.some(row => Number(row.user_id) === Number(session.supervisor_user_id))) {
      const claim = await createSupervisorSupervisionTimeClaim({ session, rollups, actorUserId: actor.id });
      if (claim?.ok === false) return { synced: false, message: 'Attendance saved. Payroll reconciliation needs review; retry from this record.' };
    }
    await db.execute(`UPDATE supervision_time_corrections SET sync_status='complete' WHERE id IN (${pending.map(() => '?').join(',')})`, pending.map(row => row.id));
    return { synced: true };
  });
}

export async function submitSupervisionTimeCorrection(sessionId, actor, body) {
  const input = validateSupervisionTimeCorrection(body);
  const { session, canManage } = await supervisionRecordAccess(sessionId, actor);
  const participants = await recordParticipants(session);
  if (input.userIds.some(id => !participants.some(p => Number(p.userId) === id) || (!canManage && id !== Number(actor.id)))) fail('You may correct only authorized participants.',403);
  await withSupervisorTimeLock([...input.userIds, session.supervisor_user_id], async db => {
    await db.beginTransaction();
    try {
      const [[current]] = await db.execute('SELECT * FROM supervision_sessions WHERE id=? FOR UPDATE',[session.id]);
      await assertCorrectionWindow(db,current,input);
      for (const userId of input.userIds) {
        const [[existing]] = await db.execute('SELECT id,start_at,end_at,total_seconds,reason,modality FROM supervision_time_corrections WHERE session_id=? AND user_id=? AND request_key=?',[session.id,userId,input.requestKey]);
        if (existing) {
          if (+instant(existing.start_at) !== +instant(input.startAt) || +instant(existing.end_at) !== +instant(input.endAt)
            || Number(existing.total_seconds) !== input.totalSeconds || existing.reason !== input.reason || existing.modality !== input.modality) fail('This submission was already saved with different values. Reload this record before making another correction.',409);
          continue;
        }
        const [result] = await db.execute(`INSERT INTO supervision_time_corrections (session_id,user_id,requested_by_user_id,request_key,start_at,end_at,total_seconds,reason,modality) VALUES (?,?,?,?,?,?,?,?,?)`,
          [session.id,userId,actor.id,input.requestKey,input.startAt,input.endAt,input.totalSeconds,input.reason,input.modality]);
        if (canManage) await applyCorrection(db,current,{ id:result.insertId,user_id:userId,start_at:input.startAt,end_at:input.endAt,total_seconds:input.totalSeconds },actor.id);
      }
      if (canManage) await completeRecord(db,current,actor.id);
      await db.commit();
    } catch (error) { await db.rollback(); throw error; }
  });
  if (!canManage) return { status: 'pending', message: 'Time correction submitted for supervisor review.' };
  let sync;
  try { sync = await syncSupervisionTimeCorrections(sessionId,actor); }
  catch { sync = { synced:false,message:'Attendance saved. Hours/payroll reconciliation is pending; retry from this record.' }; }
  return { status:'approved', ...sync };
}

export async function reviewSupervisionTimeCorrection(sessionId, correctionId, actor, decision) {
  const { session, canManage } = await supervisionRecordAccess(sessionId,actor);
  if (!canManage) fail('Only a supervisor or authorized administrator can review time corrections.',403);
  if (!['approve','reject'].includes(decision)) fail('Choose approve or reject.');
  const [[request]] = await pool.execute('SELECT * FROM supervision_time_corrections WHERE id=? AND session_id=?',[correctionId,session.id]);
  if (!request) fail('Correction not found.',404);
  await withSupervisorTimeLock([request.user_id,session.supervisor_user_id],async db => {
    await db.beginTransaction();
    try {
      const [[current]] = await db.execute('SELECT * FROM supervision_sessions WHERE id=? FOR UPDATE',[session.id]);
      const [[locked]] = await db.execute('SELECT * FROM supervision_time_corrections WHERE id=? FOR UPDATE',[request.id]);
      if (locked.status !== 'pending') fail('This correction has already been reviewed.',409);
      if (decision === 'approve') {
        const [newer] = await db.execute("SELECT id FROM supervision_time_corrections WHERE session_id=? AND user_id=? AND id>? AND status='approved' LIMIT 1",[session.id,locked.user_id,locked.id]);
        if (newer.length) fail('A newer correction has already been saved. Review the current time and submit a fresh correction.',409);
        await assertCorrectionWindow(db,current,{startAt:locked.start_at,endAt:locked.end_at,userIds:[locked.user_id]});
        await applyCorrection(db,current,locked,actor.id);
        await completeRecord(db,current,actor.id);
      } else await db.execute("UPDATE supervision_time_corrections SET status='rejected',reviewed_by_user_id=?,reviewed_at=UTC_TIMESTAMP() WHERE id=?",[actor.id,locked.id]);
      await db.commit();
    } catch(error) { await db.rollback(); throw error; }
  });
  if (decision === 'approve') {
    try { return await syncSupervisionTimeCorrections(sessionId,actor); }
    catch { return {synced:false,message:'Correction approved. Hours/payroll reconciliation is pending; retry from this record.'}; }
  }
  return {status:'rejected'};
}
