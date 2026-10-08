import pool from '../config/database.js';
import { enabledSectionKeys } from '../constants/providerUpdateSections.js';
export const updateTimestamp = value => value instanceof Date ? value : new Date(typeof value === 'string' && /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d/.test(value) && !/(Z|[+-]\d\d:\d\d)$/.test(value) ? value.replace(' ','T')+'Z' : value);
const parse = value => typeof value === 'string' ? JSON.parse(value) : (value || {});
export function payableHeartbeatSeconds({ elapsedMs, reportedSeconds, owner, sequence, lastSequence }) {
  if (!owner || sequence <= lastSequence || elapsedMs < 0 || elapsedMs > 45000) return 0;
  return Math.max(0, Math.min(45, Math.ceil(elapsedMs / 1000), Math.floor(reportedSeconds)));
}
export async function recordUpdateTime(recipientId, input = {}) {
  const { sessionId, sequence, sectionKey = 'overview', activeSeconds = 0 } = input;
  if (!/^[a-f0-9-]{36}$/i.test(sessionId || '') || !Number.isSafeInteger(sequence) || sequence < 1 ||
      !Number.isFinite(activeSeconds) || activeSeconds < 0 || activeSeconds > 45) {
    throw Object.assign(new Error('Invalid update session.'), { status: 400 });
  }
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[r]] = await db.execute(`SELECT r.*,UTC_TIMESTAMP(3) AS clock_now,p.section_config_json FROM provider_update_recipients r
      JOIN provider_update_pushes p ON p.id=r.push_id WHERE r.id=? FOR UPDATE`, [recipientId]);
    if (!r || r.locked_at || String(r.token).startsWith('preview_')) {
      await db.rollback(); return { activeSeconds: Number(r?.active_seconds || 0), recording: false };
    }
    const keys = ['overview', ...enabledSectionKeys(parse(r.section_config_json))];
    if (!keys.includes(sectionKey)) throw Object.assign(new Error('Unknown update section.'), { status: 400 });
    const [[s]] = await db.execute('SELECT * FROM provider_update_work_sessions WHERE recipient_id=? AND session_id=?', [recipientId, sessionId]);
    if (s && sequence <= s.last_sequence) { await db.rollback(); return { activeSeconds: Number(r.active_seconds), recording: r.activity_session_id === sessionId }; }
    const now = updateTimestamp(r.clock_now || new Date());
    const gap = r.last_heartbeat_at ? now - updateTimestamp(r.last_heartbeat_at) : Infinity;
    const owns = r.activity_session_id === sessionId;
    const canOwn = owns || !r.activity_session_id || gap > 45000;
    const delta = s ? payableHeartbeatSeconds({ elapsedMs: now - updateTimestamp(s.last_seen_at), reportedSeconds: activeSeconds, owner: owns, sequence, lastSequence: s.last_sequence }) : 0;
    const sections = parse(s?.section_seconds_json);
    sections[sectionKey] = Number(sections[sectionKey] || 0) + delta;
    await db.execute(`INSERT INTO provider_update_work_sessions
      (recipient_id,session_id,last_sequence,started_at,last_seen_at,active_seconds,section_seconds_json)
      VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE last_sequence=VALUES(last_sequence),last_seen_at=VALUES(last_seen_at),
      active_seconds=active_seconds+VALUES(active_seconds),section_seconds_json=VALUES(section_seconds_json)`,
      [recipientId, sessionId, sequence, s?.started_at || now, now, delta, JSON.stringify(sections)]);
    if (canOwn) await db.execute(`UPDATE provider_update_recipients SET active_seconds=active_seconds+?,last_heartbeat_at=?,activity_session_id=?,
      status=IF(status='not_started','in_progress',status) WHERE id=?`, [delta, now, input.active === false ? null : sessionId, recipientId]);
    await db.commit();
    return { activeSeconds: Number(r.active_seconds || 0) + delta, recording: canOwn };
  } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
}
export async function updateTimeSummary(recipientId, db = pool) {
  const [sessions] = await db.execute('SELECT session_id,started_at,last_seen_at,active_seconds,section_seconds_json FROM provider_update_work_sessions WHERE recipient_id=? ORDER BY started_at', [recipientId]);
  const sections = {};
  for (const s of sessions) for (const [key, seconds] of Object.entries(parse(s.section_seconds_json))) sections[key] = (sections[key] || 0) + Number(seconds);
  return { sessions, sections };
}
// Called under the recipient row lock; the claim and its pointer commit together.
export async function createUpdateTimeClaim(db, recipient, actorId) {
  if (recipient.payroll_time_claim_id) return recipient.payroll_time_claim_id;
  if (!recipient.finalized_at || String(recipient.token).startsWith('preview_') || !(Number(recipient.active_seconds) > 0)) return null;
  const seconds = Number(recipient.active_seconds);
  const summary = await updateTimeSummary(recipient.id, db);
  const payload = { source: 'provider_update', pushId: Number(recipient.push_id), recipientId: Number(recipient.id),
    activeSeconds: seconds, totalMinutes: seconds / 60, creditsHours: seconds / 3600,
    categoryGroup: 'support_activity', serviceCode: 'MEETING', bucket: 'indirect',
    description: 'Provider Update review', sectionSeconds: summary.sections,
    allocations: [{ serviceTypeKey: 'provider_update', serviceTypeLabel: 'Provider Update review', minutes: seconds / 60, payBucket: 'support' }] };
  const [claim] = await db.execute(`INSERT INTO payroll_time_claims
    (agency_id,user_id,submitted_by_user_id,status,claim_type,claim_date,payload_json)
    VALUES (?,?,?,'submitted','indirect_time',?,?)`, [recipient.agency_id, recipient.provider_user_id, actorId || recipient.provider_user_id,
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(updateTimestamp(recipient.finalized_at)), JSON.stringify(payload)]);
  await db.execute('UPDATE provider_update_recipients SET payroll_time_claim_id=? WHERE id=?', [claim.insertId, recipient.id]);
  return claim.insertId;
}
export async function submitCompletedUpdateTime(recipientId, actorId) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[r]] = await db.execute('SELECT * FROM provider_update_recipients WHERE id=? FOR UPDATE', [recipientId]);
    const claimId = r ? await createUpdateTimeClaim(db, r, actorId) : null;
    await db.commit(); return claimId;
  } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
}
