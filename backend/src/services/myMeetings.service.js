import pool from '../config/database.js';
import { mapMeetingAgendaItem } from '../models/MeetingAgendaItem.model.js';
import { hasActiveMeetingMembership } from './meetingJoinPolicy.service.js';
import TeamArtifact from '../models/ProviderScheduleEventArtifact.model.js';
import SupervisionArtifact from '../models/SupervisionSessionArtifact.model.js';
import SupervisionPersonalNote from '../models/SupervisionSessionPersonalNote.model.js';
import { encryptPersonalNoteText, resolvePersonalNotePlaintext } from './supervisionPersonalNoteEncryption.service.js';
import { enqueueMeetingSummary, meetingSummaryStatus } from './meetingSummaryJobs.service.js';

const deny = () => { throw Object.assign(new Error('Meeting not found or you did not attend it'), { status: 403 }); };
const sources = {
  team: { table: 'provider_schedule_events', rollup: 'agency_meeting_attendance_rollups', key: 'event_id', presence: 'provider_schedule_event_join_presence', admission: 'provider_schedule_event_video_admissions', host: 'provider_id' },
  supervision: { table: 'supervision_sessions', rollup: 'supervision_session_attendance_rollups', key: 'session_id', presence: 'supervision_session_join_presence', admission: 'supervision_session_video_admissions', host: 'supervisor_user_id' }
};
function attendedSql(type) {
  const s = sources[type];
  return `(EXISTS (SELECT 1 FROM ${s.rollup} ar WHERE ar.${s.key}=m.id AND ar.user_id=? AND ar.total_seconds>0)
    OR EXISTS (SELECT 1 FROM ${s.presence} jp WHERE jp.${s.key}=m.id AND jp.join_identity=?
      AND (m.${s.host}=? OR EXISTS (SELECT 1 FROM ${s.admission} va WHERE va.${s.key}=m.id AND va.user_id=?))))`;
}
const attendanceArgs = userId => [Number(userId), `user-${userId}`, Number(userId), Number(userId)];
export async function listMyMeetings({ agencyId, userId, offset = 0, category = '', from = '', to = '', search = '' }) {
  if (!await hasActiveMeetingMembership(agencyId, userId)) deny();
  const meetings = [];
  for (const type of ['team','supervision']) {
    const s = sources[type];
    const [rows] = await pool.execute(`SELECT m.id,m.agency_id,m.start_at,m.end_at,
      ${type === 'team' ? "m.title,CASE WHEN m.kind='HUDDLE' AND COALESCE(m.meeting_subtype,'general')='general' THEN 'huddle' ELSE COALESCE(m.meeting_subtype,'general') END" : "'Supervision' AS title,'supervision'"} AS category,
      j.status AS summary_status FROM ${s.table} m
      LEFT JOIN meeting_summary_jobs j ON j.meeting_type=? AND j.meeting_id=m.id
      WHERE m.agency_id=? AND ${attendedSql(type)}
      AND (?='' OR m.start_at>=?) AND (?='' OR m.start_at<DATE_ADD(?,INTERVAL 1 DAY))`,
      [type,Number(agencyId),...attendanceArgs(userId),from,from || null,to,to || null]);
    meetings.push(...rows.map(row => ({ ...row, type })));
  }
  const filtered = meetings.filter(m => (!category || m.category === category) && (!search || String(m.title).toLowerCase().includes(search.toLowerCase())))
    .sort((a,b) => new Date(b.start_at)-new Date(a.start_at) || b.id-a.id);
  return { meetings: filtered.slice(offset,offset+50), hasMore: filtered.length>offset+50 };
}
export async function requireAttendedMeeting(type, id, userId) {
  const s = sources[type];
  if (!s || !Number.isInteger(Number(id)) || Number(id)<1) deny();
  const [rows] = await pool.execute(`SELECT m.* FROM ${s.table} m WHERE m.id=? AND ${attendedSql(type)} LIMIT 1`, [Number(id),...attendanceArgs(userId)]);
  if (!rows[0] || !await hasActiveMeetingMembership(rows[0].agency_id,userId)) deny();
  return rows[0];
}
export async function myMeetingDetail(type,id,userId) {
  const meeting = await requireAttendedMeeting(type,id,userId);
  const s = sources[type];
  const artifact = type === 'team' ? await TeamArtifact.findByEventId(id) : await SupervisionArtifact.findBySessionId(id);
  const [agenda] = await pool.execute(`SELECT i.id,i.title,i.notes,i.status FROM meeting_agenda_items i
    JOIN meeting_agendas a ON a.id=i.meeting_agenda_id WHERE a.meeting_type=? AND a.meeting_id=? ORDER BY i.sort_order,i.id`,
    [type === 'team' ? 'provider_schedule_event' : 'supervision_session',Number(id)]);
  const [attendance] = await pool.execute(`SELECT ar.user_id,CONCAT_WS(' ',u.first_name,u.last_name) AS name, ar.total_seconds
    FROM ${s.rollup} ar JOIN users u ON u.id=ar.user_id WHERE ar.${s.key}=? AND ar.total_seconds>0 ORDER BY name`, [Number(id)]);
  const [presence] = await pool.execute(`SELECT jp.join_identity,jp.display_name AS name,jp.joined_at,jp.left_at FROM ${s.presence} jp
    WHERE jp.${s.key}=? AND (jp.join_identity=? OR EXISTS (SELECT 1 FROM ${s.admission} va WHERE va.${s.key}=jp.${s.key} AND CONCAT('user-',va.user_id)=jp.join_identity))`, [Number(id),`user-${meeting[s.host]}`]);
  let summaryStatus = await meetingSummaryStatus(type,id);
  if (!summaryStatus && artifact?.transcript_text && !artifact?.summary_text && (meeting.meeting_completed_at || meeting.live_ended_at || String(meeting.status).toUpperCase() === 'FINALIZED')) {
    await enqueueMeetingSummary(type,id); summaryStatus = 'queued';
  }
  let personalNote;
  if (type === 'supervision') personalNote = (await SupervisionPersonalNote.findBySessionAndUser({ sessionId:id,userId }))?.noteText || '';
  else {
    const [notes] = await pool.execute('SELECT * FROM meeting_personal_notes WHERE event_id=? AND user_id=?',[Number(id),Number(userId)]);
    personalNote = resolvePersonalNotePlaintext(notes[0]);
  }
  return { meeting: { id:Number(id),type,title:meeting.title || 'Supervision',startAt:meeting.start_at,endAt:meeting.end_at,category:type === 'supervision' ? 'supervision' : meeting.meeting_subtype || 'general' },
    agenda:agenda.map(mapMeetingAgendaItem),attendance,presence,personalNote,transcript:artifact?.transcript_text || '',summary:artifact?.summary_text || '',
    summaryStatus,workspace:type === 'team' ? TeamArtifact.toWorkspaceDto(artifact) : { focusTitle: artifact?.focusTitle || '', goals: artifact?.goals || [], actionItems: artifact?.actionItems || [] } };
}
export async function saveMyMeetingNote(type,id,userId,text) {
  await requireAttendedMeeting(type,id,userId);
  if (typeof text !== 'string' || text.length>120000) throw Object.assign(new Error('Notes must be text up to 120,000 characters'),{status:400});
  if (type === 'supervision') return SupervisionPersonalNote.upsertBySessionAndUser({ sessionId:id,userId,noteText:text });
  const enc = encryptPersonalNoteText(text);
  if (!enc) throw new Error('Could not encrypt personal note');
  await pool.execute(`INSERT INTO meeting_personal_notes (event_id,user_id,note_text,note_ciphertext,note_iv,note_auth_tag,encryption_key_id)
    VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE note_text=VALUES(note_text),note_ciphertext=VALUES(note_ciphertext),note_iv=VALUES(note_iv),note_auth_tag=VALUES(note_auth_tag),encryption_key_id=VALUES(encryption_key_id)`,
    [Number(id),Number(userId),null,enc.ciphertextB64,enc.ivB64,enc.authTagB64,enc.keyId]);
  return { ok:true };
}
export async function retryMyMeetingSummary(type,id,userId) {
  await requireAttendedMeeting(type,id,userId);
  const status = await meetingSummaryStatus(type,id);
  if (['queued','generating'].includes(status)) return { ok:true,status };
  const artifact = type === 'team' ? await TeamArtifact.findByEventId(id) : await SupervisionArtifact.findBySessionId(id);
  if (!String(artifact?.transcript_text || '').trim()) throw Object.assign(new Error('No saved transcript is available'),{status:409});
  return enqueueMeetingSummary(type,id);
}
