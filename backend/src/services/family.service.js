import crypto from 'crypto';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import UserWorkSchedule from '../models/UserWorkSchedule.model.js';
import { zonedWallTimeToUtc } from '../utils/zonedWallTime.util.js';
import { requireHousehold, familyHash } from './familyAuth.service.js';
import { json, familyError, validateEntry, occurrenceKey, assignedMember, safePhoto, localDay } from './familyPolicy.js';

export async function familyTransaction(fn) {
  const db = await pool.getConnection();
  try { await db.beginTransaction(); const result = await fn(db); await db.commit(); return result; }
  catch (e) { await db.rollback(); throw e; } finally { db.release(); }
}

async function lockHousehold(db, session, id, parent = false) {
  const household = await requireHousehold(session, id, db, parent);
  await db.execute('SELECT id FROM family_households WHERE id=? FOR UPDATE', [household.id]);
  return household;
}

export async function createHousehold(session, body) {
  const name = String(body.name || '').trim().slice(0, 120);
  const timezone = String(body.timezone || 'America/Denver');
  if (!name) throw familyError('Name your household.');
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { throw familyError('Choose a valid time zone.'); }
  return familyTransaction(async db => {
    const [result] = await db.execute('INSERT INTO family_households (agency_id,name,created_by_user_id,timezone) VALUES (?,?,?,?)', [session.agencyId, name, session.userId, timezone]);
    const [users] = await db.execute('SELECT first_name FROM users WHERE id=?', [session.userId]);
    await db.execute("INSERT INTO family_members (household_id,user_id,role,display_name) VALUES (?,?,'parent',?)", [result.insertId, session.userId, users[0]?.first_name || 'Parent']);
    return { id: result.insertId };
  });
}

export async function householdDashboard(session, id) {
  const household = await requireHousehold(session, id);
  const [[members], [entries], [activity]] = await Promise.all([
    pool.execute('SELECT * FROM family_members WHERE household_id=? ORDER BY role,display_name', [id]),
    pool.execute(`SELECT * FROM family_entries WHERE household_id=? AND archived_at IS NULL
      AND (kind NOT IN ('event','status') OR end_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)) ORDER BY start_at,id LIMIT 1500`, [id]),
    pool.execute('SELECT a.*,e.title AS entry_title FROM family_activity a JOIN family_entries e ON e.id=a.entry_id WHERE a.household_id=? ORDER BY a.id DESC LIMIT 1000', [id])
  ]);
  const [balances] = await pool.execute("SELECT user_id,SUM(points) AS points FROM family_activity WHERE household_id=? AND state='approved' GROUP BY user_id", [id]);
  const [work] = await pool.execute(`SELECT p.id,p.provider_id,p.kind,p.start_at,p.end_at,p.start_date,p.end_date,p.all_day,
      CASE WHEN p.client_id IS NULL AND p.kind IN ('TEAM_MEETING','HUDDLE') THEN 'Team meeting' ELSE 'Work' END AS detail_title
    FROM provider_schedule_events p JOIN family_members m ON m.user_id=p.provider_id AND m.household_id=? AND m.share_work=1
    WHERE p.status='ACTIVE' AND p.kind NOT IN ('PERSONAL_EVENT','SCHEDULE_HOLD')
    AND p.agency_id=? AND COALESCE(p.end_at,p.end_date)>=NOW() AND COALESCE(p.start_at,p.start_date)<DATE_ADD(NOW(),INTERVAL 32 DAY)
    ORDER BY p.start_at LIMIT 300`, [id, session.agencyId]);
  const [office] = await pool.execute(`SELECT CONCAT('office-',o.id) AS id,m.user_id AS provider_id,o.start_at,o.end_at,'Office hours' AS detail_title
    FROM office_events o JOIN family_members m ON m.user_id=COALESCE(o.booked_provider_id,o.assigned_provider_id) AND m.household_id=? AND m.share_work=1
    JOIN office_locations l ON l.id=o.office_location_id
    WHERE o.status='BOOKED' AND o.end_at>=NOW() AND o.start_at<DATE_ADD(NOW(),INTERVAL 32 DAY)
    AND (l.agency_id=? OR EXISTS(SELECT 1 FROM office_location_agencies a WHERE a.office_location_id=l.id AND a.agency_id=?))`, [id, session.agencyId, session.agencyId]);
  const [supervision] = await pool.execute(`SELECT CONCAT('supervision-',s.id,'-',m.user_id) AS id,m.user_id AS provider_id,s.start_at,s.end_at,'Supervision' AS detail_title
    FROM supervision_sessions s JOIN family_members m ON m.user_id IN (s.supervisor_user_id,s.supervisee_user_id) AND m.household_id=? AND m.share_work=1
    WHERE s.agency_id=? AND s.status='SCHEDULED' AND s.end_at>=NOW() AND s.start_at<DATE_ADD(NOW(),INTERVAL 32 DAY)`, [id,session.agencyId]);
  const weekly = [];
  for (const member of members.filter(m => m.share_work)) {
    const schedule = await UserWorkSchedule.getForUser(member.user_id, { agencyId: session.agencyId });
    if (!schedule.isActive) continue;
    const base = new Date(`${localDay(new Date(), schedule.timezone)}T12:00:00Z`);
    for (let offset = 0; offset < 32; offset++) {
      const date = new Date(base); date.setUTCDate(date.getUTCDate() + offset);
      for (const block of schedule.blocks.filter(b => Number(b.day_of_week) === date.getUTCDay())) {
        const at = time => { const [hour,minute] = String(time).split(':').map(Number); return zonedWallTimeToUtc({ year:date.getUTCFullYear(),month:date.getUTCMonth()+1,day:date.getUTCDate(),hour,minute,timeZone:schedule.timezone }); };
        const start = at(block.start_time), end = at(block.end_time);
        if (end <= new Date()) continue;
        weekly.push({ id:`hours-${member.user_id}-${block.id}-${offset}`,provider_id:member.user_id,start_at:start,end_at:end,detail_title:'Work hours' });
      }
    }
  }
  return {
    household, members, activity, balances, work: [...work,...office,...supervision,...weekly],
    entries: entries.map(e => ({ ...e, metadata: json(e.metadata), occurrence: occurrenceKey(e, household.timezone), assigned_user_id: assignedMember(e, household.timezone) }))
  };
}

export async function addChild(session, id, body) {
  const name = String(body.name || '').trim().slice(0, 80);
  if (!name) throw familyError('Enter a family member’s name.');
  const photo = safePhoto(body.photoUrl);
  const color = /^#[0-9a-f]{6}$/i.test(body.color) ? body.color : '#6667d9';
  // Reuse users for a pending dependent profile, with no workplace role, credentials or agency membership.
  const status = await User._resolveUserStatus('pending');
  return familyTransaction(async db => {
    await lockHousehold(db, session, id, true);
    const email = `family-${crypto.randomUUID()}@members.invalid`;
    const [user] = await db.execute("INSERT INTO users (email,username,role,status,first_name,last_name) VALUES (?,?,NULL,?,?,?)", [email, email, status, name, '']);
    await db.execute('INSERT INTO family_members (household_id,user_id,role,display_name,color,photo_url) VALUES (?,?,?,?,?,?)', [id, user.insertId, ['parent', 'pet'].includes(body.role) ? body.role : 'member', name, color, photo]);
    return { id: user.insertId };
  });
}

export async function updateMember(session, id, userId, body) {
  const household = await requireHousehold(session, id);
  if (Number(userId) !== session.userId && household.role !== 'parent') throw familyError('Only a parent can edit another member.', 403);
  // Work sharing always requires that adult's own consent, even for a parent device.
  if (body.shareWork !== undefined && Number(userId) !== session.userId) throw familyError('Each adult chooses whether to share their work schedule.', 403);
  const fields = [], values = [];
  if (body.name !== undefined) {
    const name = String(body.name || '').trim().slice(0,80);
    if (!name) throw familyError('Enter a family member’s name.');
    fields.push('display_name=?'); values.push(name);
  }
  if (body.shareWork !== undefined) { fields.push('share_work=?'); values.push(body.shareWork === true ? 1 : 0); }
  if (body.photoUrl !== undefined) { fields.push('photo_url=?'); values.push(safePhoto(body.photoUrl)); }
  if (body.color !== undefined) {
    if (!/^#[0-9a-f]{6}$/i.test(body.color)) throw familyError('Choose a color.');
    fields.push('color=?'); values.push(body.color);
  }
  if (!fields.length) throw familyError('No changes supplied.');
  await pool.execute(`UPDATE family_members SET ${fields.join(',')} WHERE household_id=? AND user_id=?`, [...values, id, userId]);
}

export async function createInvite(session, id, body) {
  await requireHousehold(session, id, pool, true);
  const raw = crypto.randomBytes(24).toString('base64url');
  await pool.execute('INSERT INTO family_invites (token_hash,household_id,role,expires_at) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL 2 DAY))', [familyHash(raw), id, ['parent', 'pet'].includes(body.role) ? body.role : 'member']);
  return { token: raw };
}

export async function joinHousehold(session, body) {
  return familyTransaction(async db => {
    const [rows] = await db.execute(`SELECT i.*,h.agency_id FROM family_invites i JOIN family_households h ON h.id=i.household_id
      WHERE i.token_hash=? AND i.expires_at>NOW() AND i.consumed_at IS NULL FOR UPDATE`, [familyHash(body.token)]);
    const invite = rows[0];
    if (!invite || invite.agency_id !== session.agencyId) throw familyError('That invitation is invalid, expired, or belongs to another organization.');
    const [users] = await db.execute('SELECT first_name FROM users WHERE id=?', [session.userId]);
    await db.execute('INSERT INTO family_members (household_id,user_id,role,display_name) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)', [invite.household_id, session.userId, invite.role, users[0]?.first_name || 'Family member']);
    await db.execute('UPDATE family_invites SET consumed_at=NOW() WHERE token_hash=?', [familyHash(body.token)]);
    return { id: invite.household_id };
  });
}

export async function saveFamilyEntry(session, id, body, entryId = null, afterSave = null, connection = null) {
  const entry = validateEntry(body);
  const save = async db => {
    const household = await lockHousehold(db, session, id);
    if (['chore','reward','announcement'].includes(entry.kind) && household.role !== 'parent') throw familyError('A parent manages chores, rewards and announcements.', 403);
    const [members] = await db.execute('SELECT user_id,role FROM family_members WHERE household_id=?', [id]);
    const ids = new Set(members.map(m => m.user_id));
    if ((entry.memberId && !ids.has(entry.memberId)) || entry.metadata.rotation.some(uid => !ids.has(uid))) throw familyError('Choose members of this household.');
    let old;
    if (entryId) {
      const [rows] = await db.execute('SELECT * FROM family_entries WHERE id=? AND household_id=?', [entryId, id]);
      old = rows[0];
      if (!old || old.archived_at) throw familyError('Entry not found.', 404);
      if (old.kind !== entry.kind) throw familyError('Entry type cannot change.');
      if (household.role !== 'parent' && old.created_by_user_id !== session.userId) throw familyError('Only the creator or a parent can edit this entry.', 403);
      await db.execute('UPDATE family_entries SET title=?,member_user_id=?,start_at=?,end_at=?,metadata=? WHERE id=?', [entry.title, entry.memberId, entry.start, entry.end, JSON.stringify(entry.metadata), entryId]);
      await db.execute("UPDATE provider_schedule_events p JOIN family_schedule_links l ON l.schedule_event_id=p.id SET p.status='CANCELLED' WHERE l.entry_id=?", [entryId]);
      await db.execute('DELETE FROM family_schedule_links WHERE entry_id=?', [entryId]);
    } else {
      const [result] = await db.execute('INSERT INTO family_entries (household_id,kind,title,member_user_id,start_at,end_at,metadata,created_by_user_id) VALUES (?,?,?,?,?,?,?,?)', [id, entry.kind, entry.title, entry.memberId, entry.start, entry.end, JSON.stringify(entry.metadata), session.userId]);
      entryId = result.insertId;
    }
    if (['event','status'].includes(entry.kind)) {
      const scheduleUsers = entry.memberId ? new Set([entry.memberId]) : ids;
      // A child's soccer game also belongs on the parents' personal schedules.
      if (entry.kind === 'event') for (const member of members) if (member.role === 'parent') scheduleUsers.add(member.user_id);
      for (const userId of scheduleUsers) {
        // Private details remain in the household. Shared workplace calendars only see the generic label.
        const [schedule] = await db.execute(`INSERT INTO provider_schedule_events
          (agency_id,provider_id,kind,title,reason_code,is_private,start_at,end_at,event_timezone,status,created_by_user_id)
          VALUES (NULL,?,'PERSONAL_EVENT','Personal event','FAMILY',1,?,?,?,'ACTIVE',?)`, [userId, entry.start, entry.end, household.timezone, session.userId]);
        await db.execute('INSERT INTO family_schedule_links (entry_id,schedule_event_id) VALUES (?,?)', [entryId, schedule.insertId]);
      }
    }
    if (entry.kind === 'chore') {
      if (old?.task_id) {
        await db.execute('UPDATE tasks SET title=?,assigned_to_user_id=?,due_date=?,is_recurring=?,recurring_rule=? WHERE id=?', [entry.title, entry.memberId || session.userId, entry.start, entry.metadata.recurrence !== 'none', JSON.stringify({ frequency: entry.metadata.recurrence }), old.task_id]);
      } else {
        const [task] = await db.execute(`INSERT INTO tasks (task_type,title,assigned_to_user_id,assigned_by_user_id,is_private,due_date,metadata,is_recurring,recurring_rule)
          VALUES ('custom',?,?,?,1,?,?,?,?)`, [entry.title, entry.memberId || session.userId, session.userId, entry.start, JSON.stringify({ familyHouseholdId: Number(id), familyEntryId: entryId }), entry.metadata.recurrence !== 'none', JSON.stringify({ frequency: entry.metadata.recurrence })]);
        await db.execute('UPDATE family_entries SET task_id=? WHERE id=?', [task.insertId, entryId]);
      }
    }
    if (afterSave) await afterSave(db,entryId);
    return { id: entryId };
  };
  return connection ? save(connection) : familyTransaction(save);
}

export async function actOnEntry(session, id, entryId, body) {
  return familyTransaction(async db => {
    const household = await lockHousehold(db, session, id);
    const [rows] = await db.execute('SELECT * FROM family_entries WHERE id=? AND household_id=?', [entryId, id]);
    const entry = rows[0];
    if (!entry || entry.archived_at) throw familyError('Entry not found.', 404);
    const metadata = json(entry.metadata);
    if (body.action === 'delete') {
      if (household.role !== 'parent' && (entry.created_by_user_id !== session.userId || ['chore','reward','announcement'].includes(entry.kind))) throw familyError('Only a parent or the creator can remove this entry.', 403);
      const [pending] = await db.execute("SELECT id FROM family_activity WHERE entry_id=? AND state='pending' LIMIT 1", [entryId]);
      if (pending.length) throw familyError('Approve or decline outstanding requests before removing this entry.');
      await db.execute("UPDATE provider_schedule_events p JOIN family_schedule_links l ON l.schedule_event_id=p.id SET p.status='CANCELLED' WHERE l.entry_id=?", [entryId]);
      if (entry.task_id) await db.execute("UPDATE tasks SET status='completed' WHERE id=?", [entry.task_id]);
      await db.execute('UPDATE family_entries SET archived_at=NOW() WHERE id=?', [entryId]);
      return { ok: true };
    }
    if (!['chore','reward'].includes(entry.kind)) {
      if (body.action !== 'toggle' || !['grocery','shopping','packing','meal'].includes(entry.kind)) throw familyError('Unsupported action.');
      await db.execute('UPDATE family_entries SET completed_at=? WHERE id=?', [body.completed === true ? new Date() : null, entryId]);
      return { ok: true };
    }
    if (body.action === 'approve' || body.action === 'reject') {
      if (household.role !== 'parent') throw familyError('A parent must approve points and rewards.', 403);
      const [pending] = await db.execute("SELECT * FROM family_activity WHERE id=? AND entry_id=? AND household_id=? AND state='pending'", [Number(body.activityId) || 0, entryId, id]);
      if (!pending[0]) throw familyError('This request has already been handled.', 409);
      await db.execute('UPDATE family_activity SET state=?,actor_user_id=? WHERE id=?', [body.action === 'approve' ? 'approved' : 'rejected', session.userId, pending[0].id]);
      if (entry.task_id && body.action === 'approve' && metadata.recurrence === 'none') await db.execute("UPDATE tasks SET status='completed' WHERE id=?", [entry.task_id]);
      return { ok: true };
    }
    const userId = Number(body.userId) || assignedMember(entry, household.timezone) || session.userId;
    const [members] = await db.execute('SELECT user_id FROM family_members WHERE household_id=? AND user_id=?', [id, userId]);
    if (!members.length) throw familyError('Choose a household member.');
    if (household.role !== 'parent' && userId !== session.userId) throw familyError('You can only complete or redeem for yourself.', 403);
    if (entry.kind === 'chore' && assignedMember(entry, household.timezone) && Number(assignedMember(entry, household.timezone)) !== userId) throw familyError('Complete this chore for its assigned member.');
    if (body.action !== (entry.kind === 'chore' ? 'complete' : 'redeem')) throw familyError('Unsupported action.');
    if (entry.kind === 'chore' && entry.start_at && new Date(entry.start_at) > new Date()) throw familyError('This chore is not due yet.');
    const points = Number(metadata.points) || 0;
    if (entry.kind === 'reward') {
      // Pending redemptions reserve points so simultaneous requests cannot overspend.
      const [balance] = await db.execute("SELECT COALESCE(SUM(CASE WHEN state='approved' OR (state='pending' AND points<0) THEN points ELSE 0 END),0) AS total FROM family_activity WHERE household_id=? AND user_id=?", [id, userId]);
      if (Number(balance[0].total) < points) throw familyError('Not enough available points for this reward.');
    }
    const key = entry.kind === 'chore' ? occurrenceKey(entry, household.timezone) : String(body.requestId || '');
    if (!key || key.length > 40) throw familyError('A redemption request ID is required.');
    const state = entry.kind === 'chore' && metadata.approval === false ? 'approved' : 'pending';
    try {
      await db.execute('INSERT INTO family_activity (household_id,entry_id,user_id,actor_user_id,occurrence_key,points,state) VALUES (?,?,?,?,?,?,?)', [id, entryId, userId, session.userId, key, entry.kind === 'reward' ? -points : points, state]);
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY') throw e;
      // A declined chore may be corrected and submitted again, without duplicating history/points.
      const [retry] = await db.execute("UPDATE family_activity SET state=?,points=?,actor_user_id=? WHERE entry_id=? AND user_id=? AND occurrence_key=? AND state='rejected' AND points>=0", [state, points, session.userId, entryId, userId, key]);
      if (!retry.affectedRows) throw familyError('This completion or redemption has already been recorded.', 409);
    }
    if (entry.task_id && state === 'approved' && metadata.recurrence === 'none') await db.execute("UPDATE tasks SET status='completed' WHERE id=?", [entry.task_id]);
    return { ok: true, state };
  });
}
