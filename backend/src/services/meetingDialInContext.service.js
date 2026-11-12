import { isSupervisionFacilitator } from '../utils/supervisionFacilitators.js';
import pool from '../config/database.js';
import { canJoinSupervision, canJoinTeamMeeting } from './meetingJoinPolicy.service.js';
import { parseMeetingSettings } from './meetingSettingsPolicy.js';
import { assertDialInMeeting, dialInError } from './meetingDialInPolicy.js';
import {reserveSupervisionJoin} from './supervisionJoinCapacity.service.js';

export function dialInSchema(type) {
  if (type === 'supervision') return { table: 'supervision_sessions', presence: 'supervision_session_join_presence', admissions: 'supervision_session_video_admissions', foreign: 'session_id' };
  if (type === 'team-meeting') return { table: 'provider_schedule_events', presence: 'provider_schedule_event_join_presence', admissions: 'provider_schedule_event_video_admissions', foreign: 'event_id' };
  throw dialInError('Unknown meeting type.', 400);
}
export async function dialInContext(type, id, userId, { joining = false, db = pool } = {}) {
  const schema = dialInSchema(type);
  const [[meeting]] = await db.execute(`SELECT * FROM ${schema.table} WHERE id=?`, [id]);
  assertDialInMeeting(type, meeting, { joining });
  const allowed = type === 'supervision' ? await canJoinSupervision(meeting, userId) : await canJoinTeamMeeting(meeting, userId);
  if (!allowed) throw dialInError('You are not an invited participant in this meeting.', 403);
  const [[user]] = await db.execute('SELECT id,email,work_email,first_name,last_name,preferred_name,personal_phone,work_phone,phone_number FROM users WHERE id=?', [userId]);
  if (!user) throw dialInError('Participant account is unavailable.',403);
  let isHost = type === 'supervision'
    ? isSupervisionFacilitator(meeting, userId)
    : Number(meeting.provider_id) === Number(userId);
  if (!isHost && type === 'team-meeting') {
    const [cohosts] = await db.execute('SELECT 1 FROM meeting_participant_preferences WHERE event_id=? AND user_id=? AND is_cohost=1', [id, userId]);
    isHost = cohosts.length > 0;
  }
  const [admissions] = await db.execute(`SELECT 1 FROM ${schema.admissions} WHERE ${schema.foreign}=? AND user_id=?`, [id, userId]);
  let presenter = false;
  if (type === 'supervision') {
    const [rows] = await db.execute('SELECT 1 FROM supervision_session_presenters WHERE session_id=? AND user_id=?', [id, userId]);
    presenter = rows.length > 0;
  }
  const waitingRoom = Number(meeting.waiting_room_enabled ?? 1) !== 0;
  return { type, meeting, user, userId: Number(userId), isHost, schema,
    supervisionRole:type==='supervision'?(isHost?'supervisor':presenter?'presenter':'supervisee'):null,
    name: [user.preferred_name || user.first_name, user.last_name].filter(Boolean).join(' ') || 'Participant',
    admitted: isHost || presenter || !waitingRoom || admissions.length > 0,
    settings: parseMeetingSettings(meeting.meeting_settings_json) };
}
export async function admitDialInUser(context) {
  const { schema, meeting, userId } = context;
  if (context.type === 'supervision') {
    await reserveSupervisionJoin({sessionId:meeting.id,userId,joinIdentity:`dial-${userId}`,displayName:`${context.name} · Phone`,expectedRole:context.supervisionRole});
    return;
  }
  await pool.execute(`INSERT IGNORE INTO ${schema.admissions} (${schema.foreign},user_id,join_identity) VALUES (?,?,?)`, [meeting.id, userId, `dial-${userId}`]);
}
export async function dialInRoster(context) {
  const { type, meeting } = context;
  const query = type === 'supervision'
    ? `SELECT u.id,COALESCE(NULLIF(TRIM(u.preferred_name),''),u.first_name) first_name,u.last_name FROM users u
       WHERE u.id IN (?,?,?) OR u.id IN (SELECT user_id FROM supervision_session_attendees WHERE session_id=? AND status NOT IN ('DECLINED','REMOVED','CANCELLED','WITHDRAWN'))
         OR u.id IN (SELECT user_id FROM supervision_session_presenters WHERE session_id=?)`
    : `SELECT u.id,COALESCE(NULLIF(TRIM(u.preferred_name),''),u.first_name) first_name,u.last_name FROM users u WHERE u.id=? OR u.id IN (SELECT user_id FROM provider_schedule_event_attendees WHERE event_id=?)`;
  const [rows] = await pool.execute(query, type === 'supervision'
    ? [meeting.supervisor_user_id, meeting.co_facilitator_user_id || null, meeting.supervisee_user_id || null, meeting.id, meeting.id]
    : [meeting.provider_id, meeting.id]);
  const allowed = await Promise.all(rows.map(async user => ({ user, allowed: type === 'supervision'
    ? await canJoinSupervision(meeting, user.id) : await canJoinTeamMeeting(meeting, user.id) })));
  return allowed.filter(item => item.allowed).map(({user}) => ({ id: Number(user.id), name: [user.first_name,user.last_name].filter(Boolean).join(' ') }));
}
