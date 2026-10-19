import { normalizeSupervisionSpeakerLabels } from '../utils/supervisionSpeakerLabels.js';
import pool from '../config/database.js';
import HiringInterview from '../models/HiringInterview.model.js';
import HiringInterviewArtifact from '../models/HiringInterviewArtifact.model.js';
import { canAccessHiringInterview } from './hiringInterviewAccess.service.js';
import VideoMeetingActivity from '../models/VideoMeetingActivity.model.js';
import { mapMeetingAgendaItem } from '../models/MeetingAgendaItem.model.js';
import { hasActiveMeetingMembership } from './meetingJoinPolicy.service.js';
import TeamArtifact from '../models/ProviderScheduleEventArtifact.model.js';
import SupervisionArtifact from '../models/SupervisionSessionArtifact.model.js';
import SupervisionPersonalNote from '../models/SupervisionSessionPersonalNote.model.js';
import { encryptPersonalNoteText, resolvePersonalNotePlaintext } from './supervisionPersonalNoteEncryption.service.js';
import { enqueueMeetingSummary, meetingSummaryStatus } from './meetingSummaryJobs.service.js';
import { hasUnresolvedMeetingReferences } from '../utils/meetingSummaryReferences.js';

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
const ADMIN_CATEGORIES = ['admin', 'cpa', 'mentorship', 'huddle'];
export function meetingCategory(type, meeting) {
  if (type === 'supervision') return String(meeting.session_type).toLowerCase() === 'group' ? 'group_supervision' : 'supervision';
  if (meeting.interview_id) return 'interview';
  return meeting.kind === 'HUDDLE' && (!meeting.meeting_subtype || meeting.meeting_subtype === 'general') ? 'huddle' : meeting.meeting_subtype || meeting.category || 'general';
}
async function allowedInterview(eventId, actor) {
  const interview = await HiringInterview.findByScheduleEventId(eventId);
  return interview && await canAccessHiringInterview(actor, interview);
}
// A linked interview is restricted even if its schedule subtype was later changed.
const interviewJoin = type => type === 'team' ? 'LEFT JOIN hiring_interviews hi ON hi.id=(SELECT MIN(linked.id) FROM hiring_interviews linked WHERE linked.provider_schedule_event_id=m.id)' : '';
const interviewColumn = type => type === 'team' ? 'hi.id AS interview_id,' : '';

export async function listMyMeetings({ agencyId, userId, actor = { id: userId }, offset = 0, category = '', from = '', to = '', search = '' }) {
  if (!await hasActiveMeetingMembership(agencyId, userId)) deny();
  const meetings = [];
  for (const type of ['team','supervision']) {
    const s = sources[type];
    const [rows] = await pool.execute(`SELECT m.id,m.agency_id,m.start_at,m.end_at,m.status,
      ${type === 'team' ? "m.title,m.kind,m.meeting_subtype,m.meeting_completed_at," : "m.session_type,m.live_ended_at,"}
      ${interviewColumn(type)} CONCAT_WS(' ',host.first_name,host.last_name) AS facilitator,
      j.status AS summary_status FROM ${s.table} m
      LEFT JOIN meeting_summary_jobs j ON j.meeting_type=? AND j.meeting_id=m.id
      LEFT JOIN users host ON host.id=m.${s.host} ${interviewJoin(type)}
      WHERE m.agency_id=? AND ${attendedSql(type)}
      AND (?='' OR m.start_at>=?) AND (?='' OR m.start_at<DATE_ADD(?,INTERVAL 1 DAY))`,
      [type,Number(agencyId),...attendanceArgs(userId),from,from || null,to,to || null]);
    for (const row of rows) {
      const category = meetingCategory(type, row);
      if (category === 'interview' && !await allowedInterview(row.id, actor)) continue;
      meetings.push({ ...row, category, title: row.title || (category === 'group_supervision' ? 'Group supervision' : 'Individual supervision'), type });
    }
  }
  const searched = meetings.filter(m => !search || `${m.title} ${m.facilitator || ''}`.toLowerCase().includes(search.toLowerCase()));
  const counts = searched.reduce((acc, row) => { acc[row.category] = (acc[row.category] || 0) + 1; return acc; }, {});
  const filtered = searched.filter(m => !category || m.category === category || (category === 'administrative' && ADMIN_CATEGORIES.includes(m.category)))
    .sort((a,b) => new Date(b.start_at)-new Date(a.start_at) || b.id-a.id);
  const page = filtered.slice(offset,offset+50);
  for (const type of ['team','supervision']) {
    const subset = page.filter(row => row.type === type);
    if (!subset.length) continue;
    const participants = await participantRecords(type, subset.map(row => row.id));
    for (const row of subset) row.participants = participants.filter(person => Number(person.meeting_id) === Number(row.id));
  }
  return { meetings: page, hasMore: filtered.length>offset+50, total: filtered.length, counts };
}
async function participantRecords(type, ids) {
  const s = sources[type], placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.execute(`SELECT ar.${s.key} AS meeting_id, ar.user_id, CONVERT(CONCAT('user-',ar.user_id) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS identity, CONVERT(CONCAT_WS(' ',u.first_name,u.last_name) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS name
    FROM ${s.rollup} ar JOIN users u ON u.id=ar.user_id WHERE ar.${s.key} IN (${placeholders}) AND ar.total_seconds>0
    UNION
    SELECT jp.${s.key} AS meeting_id, u.id AS user_id, CONVERT(jp.join_identity USING utf8mb4) COLLATE utf8mb4_unicode_ci AS identity, CONVERT(COALESCE(NULLIF(CONCAT_WS(' ',u.first_name,u.last_name),''),jp.display_name) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS name
    FROM ${s.presence} jp JOIN ${s.table} m ON m.id=jp.${s.key}
    LEFT JOIN users u ON jp.join_identity=CONCAT('user-',u.id)
    WHERE jp.${s.key} IN (${placeholders}) AND (jp.join_identity=CONCAT('user-',m.${s.host}) OR EXISTS
      (SELECT 1 FROM ${s.admission} va WHERE va.${s.key}=jp.${s.key} AND (CONCAT('user-',va.user_id)=jp.join_identity OR va.join_identity COLLATE utf8mb4_unicode_ci=jp.join_identity COLLATE utf8mb4_unicode_ci)))`, [...ids,...ids]);
  return rows;
}
export async function requireAttendedMeeting(type, id, userId, actor = { id: userId }) {
  const s = sources[type];
  if (!s || !Number.isInteger(Number(id)) || Number(id)<1) deny();
  const [rows] = await pool.execute(`SELECT m.*, ${interviewColumn(type)} CONCAT_WS(' ',host.first_name,host.last_name) AS facilitator
    FROM ${s.table} m LEFT JOIN users host ON host.id=m.${s.host} ${interviewJoin(type)}
    WHERE m.id=? AND ${attendedSql(type)} LIMIT 1`, [Number(id),...attendanceArgs(userId)]);
  if (!rows[0] || !await hasActiveMeetingMembership(rows[0].agency_id,userId)) deny();
  if (meetingCategory(type, rows[0]) === 'interview' && !await allowedInterview(id, actor)) deny();
  return rows[0];
}
export async function myMeetingActivity(type, id, userId, offset = 0, actor = { id: userId }) {
  await requireAttendedMeeting(type, id, userId, actor);
  const rows = await VideoMeetingActivity.list({ [type === 'team' ? 'eventId' : 'sessionId']: Number(id), limit: 101, offset, viewerUserId: userId });
  return { activity: rows.slice(0,100), hasMore: rows.length > 100 };
}
export async function myMeetingDetail(type,id,userId,actor = { id: userId }) {
  const meeting = await requireAttendedMeeting(type,id,userId,actor);
  const s = sources[type];
  const artifact = type === 'team' ? await TeamArtifact.findByEventId(id) : await SupervisionArtifact.findBySessionId(id);
  if (type === 'supervision' && artifact) {
    artifact.transcript_text = normalizeSupervisionSpeakerLabels(artifact.transcript_text);
    artifact.summary_text = normalizeSupervisionSpeakerLabels(artifact.summary_text);
  }
  const interviewArtifact = meetingCategory(type, meeting) === 'interview' && meeting.interview_id
    ? await HiringInterviewArtifact.findByInterviewId(meeting.interview_id) : null;
  const [agenda] = await pool.execute(`SELECT i.id,i.title,i.notes,i.status FROM meeting_agenda_items i
    JOIN meeting_agendas a ON a.id=i.meeting_agenda_id WHERE a.meeting_type=? AND a.meeting_id=? ORDER BY i.sort_order,i.id`,
    [type === 'team' ? 'provider_schedule_event' : 'supervision_session',Number(id)]);
  const [attendance] = await pool.execute(`SELECT ar.user_id,${type === 'supervision' ? 'ar.first_joined_at,ar.last_left_at,' : ''}CONCAT_WS(' ',u.first_name,u.last_name) AS name, ar.total_seconds
    FROM ${s.rollup} ar JOIN users u ON u.id=ar.user_id WHERE ar.${s.key}=? AND ar.total_seconds>0 ORDER BY name`, [Number(id)]);
  const [presence] = await pool.execute(`SELECT jp.join_identity,jp.display_name AS name,jp.joined_at,jp.left_at FROM ${s.presence} jp
    WHERE jp.${s.key}=? AND (jp.join_identity=? OR EXISTS (SELECT 1 FROM ${s.admission} va WHERE va.${s.key}=jp.${s.key} AND (CONCAT('user-',va.user_id)=jp.join_identity OR va.join_identity COLLATE utf8mb4_unicode_ci=jp.join_identity COLLATE utf8mb4_unicode_ci)))`, [Number(id),`user-${meeting[s.host]}`]);
  const [attendanceLog] = type === 'team'
    ? await pool.execute(`SELECT a.id,CONCAT_WS(' ',u.first_name,u.last_name) AS name,
        a.started_at AS at,a.ended_at AS endedAt,a.source,'attendance' AS eventType
        FROM provider_schedule_event_attendance_segments a JOIN users u ON u.id=a.user_id
        WHERE a.event_id=? ORDER BY a.started_at,a.id`,[Number(id)])
    : await pool.execute(`SELECT a.id,CONCAT_WS(' ',u.first_name,u.last_name) AS name,
        a.event_at AS at,a.event_type AS eventType
        FROM supervision_session_attendance_events a LEFT JOIN users u ON u.id=a.user_id
        WHERE a.session_id=? ORDER BY a.event_at,a.id`,[Number(id)]);
  let summaryStatus = await meetingSummaryStatus(type,id,artifact);
  if (!summaryStatus && artifact?.transcript_text && !artifact?.summary_text && (meeting.meeting_completed_at || meeting.live_ended_at || String(meeting.status).toUpperCase() === 'FINALIZED')) {
    await enqueueMeetingSummary(type,id); summaryStatus = 'queued';
  }
  let personalNote;
  if (type === 'supervision') personalNote = (await SupervisionPersonalNote.findBySessionAndUser({ sessionId:id,userId }))?.noteText || '';
  else {
    const [notes] = await pool.execute('SELECT * FROM meeting_personal_notes WHERE event_id=? AND user_id=?',[Number(id),Number(userId)]);
    personalNote = resolvePersonalNotePlaintext(notes[0]);
  }
  let training = null;
  if (type==='team' && meeting.meeting_subtype==='training') {
    const [assets]=await pool.execute(`SELECT a.id,a.filename FROM scheduled_training_assets a JOIN scheduled_trainings t ON t.event_id=a.event_id JOIN scheduled_trainings selected ON selected.series_key=t.series_key AND selected.event_id=? ORDER BY a.created_at`,[Number(id)]);
    training={topic:meeting.description || '',assets};
  }
  return { training, meeting: { id:Number(id),type,title:meeting.title || (meetingCategory(type,meeting) === 'group_supervision' ? 'Group supervision' : 'Individual supervision'),startAt:meeting.start_at,endAt:meeting.end_at,category:meetingCategory(type,meeting),facilitator:meeting.facilitator,status:meeting.status,completedAt:meeting.meeting_completed_at || meeting.live_ended_at || null },
    interviewTeamChat: (Array.isArray(interviewArtifact?.team_chat_json) ? interviewArtifact.team_chat_json : []).map(message => ({
      text: message.text, authorName: message.authorName, at: message.at
    })),
    agenda:agenda.map(mapMeetingAgendaItem),attendance,presence,attendanceLog,personalNote,transcript:artifact?.transcript_text || '',summary:hasUnresolvedMeetingReferences(artifact?.summary_text) ? '' : artifact?.summary_text || interviewArtifact?.transcript_summary || '',
    summarySource:artifact?.summary_model === 'manual'?'manual':'generated',summaryStatus,workspace:type === 'team' ? TeamArtifact.toWorkspaceDto(artifact) : { focusTitle: artifact?.focusTitle || '', goals: artifact?.goals || [], actionItems: artifact?.actionItems || [] } };
}
export async function saveMyMeetingNote(type,id,userId,text,actor = { id: userId }) {
  await requireAttendedMeeting(type,id,userId,actor);
  if (typeof text !== 'string' || text.length>120000) throw Object.assign(new Error('Notes must be text up to 120,000 characters'),{status:400});
  if (type === 'supervision') return SupervisionPersonalNote.upsertBySessionAndUser({ sessionId:id,userId,noteText:text });
  const enc = encryptPersonalNoteText(text);
  if (!enc) throw new Error('Could not encrypt personal note');
  await pool.execute(`INSERT INTO meeting_personal_notes (event_id,user_id,note_text,note_ciphertext,note_iv,note_auth_tag,encryption_key_id)
    VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE note_text=VALUES(note_text),note_ciphertext=VALUES(note_ciphertext),note_iv=VALUES(note_iv),note_auth_tag=VALUES(note_auth_tag),encryption_key_id=VALUES(encryption_key_id)`,
    [Number(id),Number(userId),null,enc.ciphertextB64,enc.ivB64,enc.authTagB64,enc.keyId]);
  return { ok:true };
}
export async function retryMyMeetingSummary(type,id,userId,actor = { id: userId }) {
  await requireAttendedMeeting(type,id,userId,actor);
  const status = await meetingSummaryStatus(type,id);
  if (['queued','generating'].includes(status)) return { ok:true,status };
  const artifact = type === 'team' ? await TeamArtifact.findByEventId(id) : await SupervisionArtifact.findBySessionId(id);
  if (!String(artifact?.transcript_text || '').trim()) throw Object.assign(new Error('No saved transcript is available'),{status:409});
  return enqueueMeetingSummary(type,id);
}
