import pool from '../config/database.js';
export const MEETING_PLANS = Object.freeze([
 { id: 'basic', name: 'Basic', aiNoteAid: true, privateOffice: false, multipleOfficeGuests: false },
 { id: 'premium', name: 'Premium', aiNoteAid: true, privateOffice: true, multipleOfficeGuests: false },
 { id: 'premium_plus', name: 'Premium Plus', aiNoteAid: true, privateOffice: true, multipleOfficeGuests: true }
]);
export function meetingPlan(tier) { return MEETING_PLANS.find(p => p.id === tier) || MEETING_PLANS[0]; }
export async function getMeetingPlan(userId, db = pool) {
 const [rows] = await db.execute('SELECT tier,source FROM meeting_access_plans WHERE user_id=?', [userId]);
 return { ...meetingPlan(rows[0]?.tier), grandfathered: rows[0]?.source === 'existing_account_launch_grant' };
}
export async function setMeetingPlan(userId, tier, actorId) {
 if (!MEETING_PLANS.some(p => p.id === tier)) throw Object.assign(new Error('Choose Basic, Premium, or Premium Plus.'), {status:400});
 const db = await pool.getConnection();
 try { await db.beginTransaction();
  const [users] = await db.execute('SELECT id FROM users WHERE id=?', [userId]);
  if (!users.length) throw Object.assign(new Error('Account not found.'), {status:404});
  await db.execute(`INSERT INTO meeting_access_plans (user_id,tier,source,updated_by_user_id) VALUES (?,?,'assigned',?)
   ON DUPLICATE KEY UPDATE tier=VALUES(tier),source='assigned',updated_by_user_id=VALUES(updated_by_user_id)`, [userId,tier,actorId]);
  await db.execute('INSERT INTO meeting_access_plan_events (user_id,tier,actor_user_id) VALUES (?,?,?)', [userId,tier,actorId]);
  await db.commit(); return meetingPlan(tier);
 } catch(e) { await db.rollback(); throw e; } finally { db.release(); }
}
