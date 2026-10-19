import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import { generateJoinToken } from '../utils/joinToken.js';
import { canJoinTeamMeeting, hasActiveMeetingMembership } from './meetingJoinPolicy.service.js';
import { defaultMeetingSettings, normalizeMeetingSettings } from './meetingSettingsPolicy.js';
import { canScheduleTraining, isScheduledTraining, trainingRequirement, validateTrainingInput } from './scheduledTrainingPolicy.js';
import { maybeEncryptNotePayload } from './clinicalNoteCrypto.service.js';
import { validateTrainingCompensationOverrides } from './scheduledTrainingCompensation.service.js';

export const trainingError = (status, message) => Object.assign(new Error(message), { status });
export async function trainingRoster(agencyId, actor) {
  if (!canScheduleTraining(actor) || !await hasActiveMeetingMembership(agencyId, actor.id)) throw trainingError(403, 'Only an agency admin, CPA, or Provider Plus can schedule training.');
  const [rows] = await pool.execute(`SELECT DISTINCT u.id,u.first_name,u.last_name,u.role,u.credential,u.title,u.employment_type
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id
    WHERE ua.agency_id=? AND ua.is_active=1 AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0
      AND u.role NOT IN ('client','client_guardian','guardian','parent','school_staff','school_support','school_admin','school','kiosk','prehire','candidate')
      AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE_EMPLOYEE','ACTIVE','ONBOARDING')
    ORDER BY u.last_name,u.first_name`, [agencyId]);
  return rows.map(u => ({ ...u, name: [u.first_name,u.last_name].filter(Boolean).join(' '), requirement: trainingRequirement(u) }));
}
export async function isTrainingProctor(event, userId, db = pool) {
  if (!isScheduledTraining(event) || !await hasActiveMeetingMembership(event.agency_id,userId)) return false;
  if (Number(event.provider_id) === Number(userId)) return true;
  const [rows] = await db.execute(`SELECT 1 FROM meeting_participant_preferences p JOIN provider_schedule_event_attendees a
    ON a.event_id=p.event_id AND a.user_id=p.user_id WHERE p.event_id=? AND p.user_id=? AND p.is_cohost=1`, [event.id,userId]);
  return !!rows.length;
}
export async function trainingAccess(eventId, actor, { edit = false, visible = false } = {}) {
  const [rows] = await pool.execute(`SELECT e.*,t.topic,t.agency_visible,t.video_default_on,t.video_allowed,t.mute_all,t.series_key,
    EXISTS(SELECT 1 FROM provider_schedule_event_attendees a WHERE a.event_id=e.id AND a.user_id=?) actor_invited,
    EXISTS(SELECT 1 FROM meeting_participant_preferences p JOIN provider_schedule_event_attendees a ON a.event_id=p.event_id AND a.user_id=p.user_id WHERE p.event_id=e.id AND p.user_id=? AND p.is_cohost=1) actor_coproctor
    FROM provider_schedule_events e JOIN scheduled_trainings t ON t.event_id=e.id WHERE e.id=?`, [actor.id,actor.id,eventId]);
  const event = rows[0];
  if (!event || !await hasActiveMeetingMembership(event.agency_id,actor.id)) throw trainingError(404, 'Training not found.');
  const proctor = Number(event.provider_id)===Number(actor.id) || !!event.actor_coproctor;
  const visibleStaff = !['client','client_guardian','guardian','parent','school_staff','school_support','school_admin','school','kiosk','prehire','candidate'].includes(String(actor.role || '').toLowerCase());
  if (edit ? !proctor : !proctor && !event.actor_invited && !(visible && event.agency_visible && visibleStaff)) throw trainingError(403, edit ? 'Only the proctor or coproctors may change this training.' : 'You are not invited to this training.');
  return { event, proctor };
}
export async function createScheduledTraining(input, actor) {
  const {default:TeamArtifact}=await import('../models/ProviderScheduleEventArtifact.model.js');
  const {queueMeetingInvitations}=await import('./meetingInvitations.service.js');
  const agencyId = Number(input.agencyId);
  const roster = await trainingRoster(agencyId, actor);
  const value = validateTrainingInput(input);
  const allowed = new Set(roster.map(u => Number(u.id)));
  const proctorId = Number(input.proctorId);
  if (input.coproctorIds !== undefined && !Array.isArray(input.coproctorIds)) throw trainingError(400, 'Choose coproctors from agency staff.');
  const coproctors = [...new Set((input.coproctorIds || []).map(Number))].filter(id => id !== proctorId);
  const people = input.inviteAll ? roster.map(u => ({ userId: u.id, required: u.requirement === 'mandatory' })) : input.participants;
  if (!Array.isArray(people) || !people.length) throw trainingError(400, 'Invite at least one staff member.');
  const participants = new Map(people.map(p => {
    if (!p || !allowed.has(Number(p.userId)) || typeof p.required !== 'boolean') throw trainingError(400, 'Choose active agency staff and mark each invitation mandatory or optional.');
    return [Number(p.userId), p.required];
  }));
  if (![proctorId,...coproctors].every(id => allowed.has(id))) throw trainingError(400, 'Proctors must be active staff in this agency.');
  for (const id of [proctorId,...coproctors]) if (!participants.has(id)) participants.set(id,false);
  const compensationOverrides = validateTrainingCompensationOverrides(input.compensationOverrides, actor, roster, participants);
  if (input.agenda && (!Array.isArray(input.agenda) || input.agenda.length>50)) throw trainingError(400,'Choose up to 50 agenda items.');
  if (input.goals && (!Array.isArray(input.goals) || input.goals.length>50)) throw trainingError(400,'Choose up to 50 goals.');
  const settings = normalizeMeetingSettings(input.meetingSettings, defaultMeetingSettings('training'));
  settings.attendance = true; settings.compensation = true;
  const seriesKey = randomUUID();
  const db = await pool.getConnection(); const events = [];
  try {
    await db.beginTransaction();
    for (let i=0;i<value.sessions.length;i++) {
      const s=value.sessions[i], token=generateJoinToken();
      const [result] = await db.execute(`INSERT INTO provider_schedule_events
        (agency_id,provider_id,kind,meeting_subtype,title,description,start_at,end_at,event_timezone,status,all_day,is_private,
         platform_video_link,join_token,participant_join_token,host_join_token,waiting_room_enabled,notify_participants,
         attendance_tracking_enabled,meeting_settings_json,recurrence_series_id,recurrence_index,created_by_user_id,updated_by_user_id)
        VALUES (?,?,'TEAM_MEETING','training',?,?,?,?,?,'ACTIVE',0,0,1,?,?,?,1,1,1,?,?,?,?,?)`,
        [agencyId,proctorId,value.title,value.topic || null,s.startAt,s.endAt,value.timeZone,token,token,generateJoinToken(),JSON.stringify(settings),value.sessions.length>1?seriesKey:null,i,actor.id,actor.id]);
      const eventId=result.insertId;
      await db.execute(`INSERT INTO scheduled_trainings (event_id,series_key,seed_key,topic,agency_visible,video_default_on,video_allowed,mute_all) VALUES (?,?,?,?,?,?,?,?)`,
        [eventId,seriesKey,input.seedKey ? `${input.seedKey}:${i}` : null,value.topic || null,Number(input.agencyVisible===true),Number(input.videoDefaultOn===true),Number(input.videoAllowed!==false),Number(input.muteAll!==false)]);
      for (const [uid,required] of participants) {
        if (uid!==proctorId) await db.execute('INSERT INTO provider_schedule_event_attendees (event_id,user_id) VALUES (?,?)',[eventId,uid]);
        await db.execute('INSERT INTO meeting_participant_preferences (event_id,user_id,is_required,is_cohost) VALUES (?,?,?,?)',[eventId,uid,Number(required),Number(coproctors.includes(uid))]);
      }
      for (const override of compensationOverrides) {
        await db.execute(`INSERT INTO scheduled_training_compensation_overrides (event_id,user_id,agency_id,rate_type,reason,authorized_by_user_id) VALUES (?,?,?,?,?,?)`,
          [eventId,override.userId,agencyId,override.rateType,override.reason,actor.id]);
      }
      if (Array.isArray(input.agenda) && input.agenda.length) {
        const [agenda]=await db.execute("INSERT INTO meeting_agendas (agency_id,meeting_type,meeting_id,created_by_user_id) VALUES (?,'provider_schedule_event',?,?)",[agencyId,eventId,actor.id]);
        for (const [index,title] of input.agenda.entries()) {
          if (String(title).trim()) await db.execute('INSERT INTO meeting_agenda_items (meeting_agenda_id,title,sort_order,created_by_user_id) VALUES (?,?,?,?)',[agenda.insertId,maybeEncryptNotePayload(String(title).trim().slice(0,1000)),index,actor.id]);
        }
      }
      if (Array.isArray(input.goals) && input.goals.length) await TeamArtifact.upsertByEventId({eventId,goals:input.goals.filter(Boolean).slice(0,50).map(text=>({id:randomUUID(),text:String(text).slice(0,500),done:false})),updatedByUserId:actor.id},db);
      const [saved]=await db.execute('SELECT * FROM provider_schedule_events WHERE id=?',[eventId]); events.push(saved[0]);
    }
    await db.commit();
  } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
  // The durable queue deduplicates an invitation across all dates in this series.
  const delivery = await queueMeetingInvitations(events[0],[...participants.keys()]);
  return { events, delivery };
}
