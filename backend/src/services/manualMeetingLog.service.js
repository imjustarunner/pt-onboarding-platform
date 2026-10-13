import { isStudentIntern } from './internMeetingPolicy.service.js';
import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { canManageMeetingCompensation } from './meetingClaimRate.service.js';
import { huddleSubtype } from './huddlePolicy.js';
import { hasActiveMeetingMembership } from './meetingJoinPolicy.service.js';
import { isCompensationClaimMeeting, syncCompensationClaimsForEvent } from './meetingCompensationClaims.service.js';
import Artifact from '../models/ProviderScheduleEventArtifact.model.js';
import { computeSubmissionWindow } from '../utils/payrollSubmissionWindow.js';
import { wallMysqlToUtcMysql, isValidTimeZone } from '../utils/zonedWallTime.util.js';
import { parseUtcDate, utcToZonedMysqlWall } from '../utils/officeEventDateTime.util.js';

const fail = (status, message) => Object.assign(new Error(message), { status, statusCode: status });
const STAFF = ['admin','super_admin','superadmin','support','staff','provider','provider_plus','supervisor','clinical_practice_assistant','intern','intern_plus','facilitator'];
const json = raw => typeof raw === 'string' ? JSON.parse(raw) : raw || {};
const dateOnly = raw => raw instanceof Date ? raw.toISOString().slice(0,10) : String(raw).slice(0,10);
export const PLATFORMS = { in_person:'In person', phone:'Phone call', google_meet:'Google Meet', app_issue:'App meeting — attendance issue', other:'Other' };
export const REASONS = { offline:'Met outside the app', missing_claim:'App did not create a time claim', supervisor_contact:'Unscheduled supervisor contact' };

export async function manualMeetingOptions(agencyId, userId) {
  if (!await hasActiveMeetingMembership(agencyId, userId)) throw fail(403,'Current agency membership is required.');
  const [users] = await pool.execute(`SELECT u.id,COALESCE(NULLIF(ua.agency_role,''),u.role) AS role,
    u.credential,u.title,u.employment_type,u.has_supervisor_privileges AS is_supervisor,CONCAT_WS(' ',u.first_name,u.last_name) AS name
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
    WHERE COALESCE(u.is_active,1)=1 AND UPPER(COALESCE(u.status,'')) NOT IN ('INACTIVE','INACTIVE_EMPLOYEE','ARCHIVED','TERMINATED','DELETED')`, [agencyId]);
  const actor = users.find(u => Number(u.id) === Number(userId));
  const allowed = ['clinical_practice_assistant','provider_plus'].includes(actor?.role);
  if (!allowed) return { allowed:false, people:[], types:[] };
  const people = users.filter(u => STAFF.includes(u.role) && (actor.role === 'clinical_practice_assistant'
    || Number(u.id) === Number(userId) || isStudentIntern(u) || ['intern','intern_plus','admin','super_admin','superadmin','supervisor'].includes(u.role) || Number(u.is_supervisor) === 1));
  return { allowed, actorId:Number(userId), actorRole:actor.role, people, platforms:PLATFORMS, reasons:REASONS,
    types:[{value:'primary',label:actor.role === 'clinical_practice_assistant'?'CPA meeting / huddle':'Intern mentorship / huddle'}, {value:'contact',label:'Administrative / supervisor contact'}] };
}

export function validateManualMeeting(body, options, now = new Date()) {
  if (!options.allowed) throw fail(403,'Manual meeting logs are available to CPA and Provider Plus hosts.');
  const timeZone = String(body.timeZone || 'America/Denver');
  if (!isValidTimeZone(timeZone)) throw fail(400,'Choose a valid meeting time zone.');
  if (!/^[\w-]{16,64}$/.test(String(body.requestId || ''))) throw fail(400,'Reload the form and try again.');
  if (!['primary','contact'].includes(body.type) || !Object.hasOwn(PLATFORMS,body.platform) || !Object.hasOwn(REASONS,body.reason)) throw fail(400,'Choose the meeting type, location, and reason.');
  const convert = raw => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(raw || ''))) throw fail(400,'Enter the actual meeting start and end.');
    const utc = wallMysqlToUtcMysql(raw.replace('T',' ') + ':00',timeZone);
    if (!utc || !parseUtcDate(utc) || utcToZonedMysqlWall(utc,timeZone)!==raw.replace('T',' ')+':00') throw fail(400,'Enter a valid meeting date and time.');
    return utc;
  };
  const startAt = convert(body.start), endAt = convert(body.end);
  const minutes = (parseUtcDate(endAt)-parseUtcDate(startAt))/60000;
  if (!(minutes >= 1 && minutes <= 720) || parseUtcDate(endAt)>now) throw fail(400,'Log a completed meeting lasting 1 minute to 12 hours.');
  if (body.start.slice(0,10) !== body.end.slice(0,10)) throw fail(400,'Split an overnight meeting into separate dates.');
  const title = String(body.title || '').trim(), summary = String(body.summary || '').trim(), transcript = String(body.transcript || '').trim();
  if (title.length<3 || title.length>200 || summary.length<10 || summary.length>20000 || transcript.length>100000) throw fail(400,'Add a title and a summary of at least 10 characters (maximum 20,000). Transcripts may contain up to 100,000 characters.');
  if (body.attested !== true) throw fail(400,'Confirm attendance and that the requested time is not already covered.');
  if (!Array.isArray(body.people) || body.people.length<2 || body.people.length>50) throw fail(400,'List yourself and at least one other person who attended.');
  const seen = new Set();
  const people = body.people.map(p => {
    const person = options.people.find(u => Number(u.id) === Number(p.userId));
    if (!person || seen.has(Number(p.userId))) throw fail(403,'Select distinct current staff from your available attendee list.');
    seen.add(Number(p.userId));
    if (options.actorRole === 'provider_plus' && Number(p.userId)!==options.actorId) {
      const eligible = body.type==='primary' ? isStudentIntern(person)
        : ['admin','super_admin','superadmin','supervisor'].includes(person.role) || Number(person.is_supervisor)===1;
      if (!eligible) throw fail(403,'Mentorship is for interns; administrative contacts must include an administrator or supervisor.');
    }
    const attendedMinutes = Number(p.minutes);
    if (!Number.isInteger(attendedMinutes) || attendedMinutes<1 || attendedMinutes>minutes) throw fail(400,'Each person’s actual minutes must fit within the meeting.');
    return {userId:Number(p.userId),minutes:attendedMinutes,covered:p.covered===true,name:person.name};
  }).sort((a,b)=>a.userId-b.userId);
  if (!seen.has(options.actorId)) throw fail(403,'You can only log meetings you attended.');
  const facilitatorId = body.type==='primary' ? options.actorId : Number(body.facilitatorId || options.actorId);
  if (!seen.has(facilitatorId)) throw fail(400,'The meeting leader must be one of the listed attendees.');
  return {facilitatorId,agencyId:Number(body.agencyId),actorId:options.actorId,requestId:body.requestId,timeZone,startAt,endAt,claimDate:body.start.slice(0,10),
    startTime:body.start.slice(11),endTime:body.end.slice(11),type:body.type,platform:body.platform,reason:body.reason,title,summary,transcript,people,eventId:Number(body.eventId)||null,
    subtype:body.type==='contact'?'admin':options.actorRole==='clinical_practice_assistant'?'cpa':'mentorship'};
}

export function overlappingClaim(claim, input, eventId) {
  const payload = json(claim.payload_json);
  if (eventId && Number(payload.scheduleEventId)===Number(eventId)) return true;
  if (dateOnly(claim.claim_date)!==input.claimDate) return false;
  // These claims have no reliable clock times. Require payroll review rather than duplicate admin/meeting time.
  if (!payload.startTime || !payload.endTime) return ['indirect_service','supervision_note'].includes(payload.categoryGroup) ? false : null;
  return payload.startTime < input.endTime && payload.endTime > input.startTime;
}
async function inspect(input, db = pool) {
  const [events] = await db.execute(`SELECT e.id,e.title,e.kind,e.meeting_subtype,e.provider_id,e.start_at,e.end_at,e.meeting_settings_json,
    EXISTS(SELECT 1 FROM hiring_interviews hi WHERE hi.provider_schedule_event_id=e.id) AS interview
    FROM provider_schedule_events e WHERE e.agency_id=? AND e.kind IN ('HUDDLE','TEAM_MEETING') AND e.status<>'CANCELLED'
    AND e.start_at<? AND e.end_at>? AND (e.provider_id=? OR EXISTS(SELECT 1 FROM provider_schedule_event_attendees a WHERE a.event_id=e.id AND a.user_id=?))`,
    [input.agencyId,input.endAt,input.startAt,input.actorId,input.actorId]);
  const event = events.find(e=>Number(e.id)===input.eventId);
  if (input.eventId && !event) throw fail(409,'The selected meeting does not match your attendance and time. Check the meeting or refresh.');
  if (event && (Number(event.interview)>0 || !isCompensationClaimMeeting(event)
    || (input.type==='primary' ? event.kind!=='HUDDLE' || huddleSubtype(event,input.subtype==='cpa'?'clinical_practice_assistant':'provider_plus')!==input.subtype || Number(event.provider_id)!==input.actorId : event.kind!=='TEAM_MEETING' || event.meeting_subtype!=='admin'))) {
    throw fail(409,'This is a different meeting type. Use its existing meeting details or contact payroll instead of creating a duplicate.');
  }
  if (event && (input.startAt < String(event.start_at instanceof Date ? event.start_at.toISOString().slice(0,19).replace('T',' ') : event.start_at) || input.endAt > String(event.end_at instanceof Date ? event.end_at.toISOString().slice(0,19).replace('T',' ') : event.end_at))) throw fail(409,'Attendance must fit within the selected meeting. Contact payroll for a time correction.');
  if (event && Number(event.provider_id)!==input.actorId) {
    const [invited] = await db.execute('SELECT user_id FROM provider_schedule_event_attendees WHERE event_id=?',[event.id]);
    const ids = new Set([Number(event.provider_id),...invited.map(p=>Number(p.user_id))]);
    if(input.people.some(p=>!ids.has(p.userId))) throw fail(403,'Only this meeting’s host can add other attendees.');
  }
  const attendees=[];
  for (const person of input.people) {
    const [claims] = await db.execute(`SELECT id,claim_date,payload_json FROM payroll_time_claims WHERE agency_id=? AND user_id=?
      AND claim_date=? AND claim_type IN ('meeting_training','mentor_cpa_meeting','indirect_time')
      AND (status NOT IN ('rejected','withdrawn') OR JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.scheduleEventId'))=?) ORDER BY id DESC`,
      [input.agencyId,person.userId,input.claimDate,String(input.eventId || 0)]);
    const existing = claims.find(c=>overlappingClaim(c,input,input.eventId)===true);
    const uncertain = claims.find(c=>overlappingClaim(c,input,input.eventId)===null);
    const policy = existing?'existing':person.covered?'covered':uncertain?'review':'submit';
    attendees.push({...person,policy,claimId:Number((existing || uncertain)?.id)||null});
  }
  return {event, events:events.map(e=>({id:e.id,title:e.interview?'Interview — use hiring records':e.title})),attendees,requiresEvent:!event && events.length>0};
}
async function prepare(body, userId) {
  const options=await manualMeetingOptions(Number(body.agencyId),userId);
  const input=validateManualMeeting(body,options);
  const window=await computeSubmissionWindow({agencyId:input.agencyId,effectiveDateYmd:input.claimDate,submittedAt:new Date(),timeZone:input.timeZone,hardStopPolicy:'60_days'});
  if(!window.ok) throw fail(400,window.errorMessage || 'Contact payroll about this meeting date.');
  return input;
}
function publicPreview(review) {
  return {events:review.events,requiresEvent:review.requiresEvent,attendees:review.attendees.map(p=>({userId:p.userId,name:p.name,minutes:p.minutes,policy:p.policy}))};
}
export async function previewManualMeeting(body,userId) { const input=await prepare(body,userId); return publicPreview(await inspect(input)); }

// Claims use the same event lock and source as automatic attendance; retries never create a second meeting.
export async function saveManualMeeting(body,userId) {
  const input=await prepare(body,userId), hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const db=await pool.getConnection(), locks=[];
  let eventId,logId;
  const lock=async key=>{const [rows]=await db.execute('SELECT GET_LOCK(?,10) AS acquired',[key]);if(!Number(rows[0]?.acquired))throw fail(409,'Another meeting is being saved. Please try again.');locks.push(key);};
  try {
    await lock(`manual-meeting:${input.agencyId}`);
    const [prior]=await db.execute('SELECT * FROM manual_meeting_logs WHERE agency_id=? AND submitted_by_user_id=? AND request_id=?',[input.agencyId,userId,input.requestId]);
    if(prior.length){if(prior[0].request_hash!==hash)throw fail(409,'This form was already saved. Open a new log for another meeting.');eventId=prior[0].event_id;logId=prior[0].id;}
    else {
      if(input.eventId)await lock(`meeting-compensation:${input.eventId}`);
      await db.beginTransaction();
      const review=await inspect(input,db);
      if(review.requiresEvent)throw fail(409,'A meeting already exists at this time. Select it before saving.');
      if(input.eventId){const [logged]=await db.execute('SELECT id FROM manual_meeting_logs WHERE event_id=?',[input.eventId]);if(logged.length)throw fail(409,'This meeting already has a fallback log. Review its existing claims instead of logging it again.');}
      eventId=input.eventId;
      if(!eventId){
        const [created]=await db.execute(`INSERT INTO provider_schedule_events
          (agency_id,provider_id,kind,title,start_at,end_at,event_timezone,meeting_subtype,created_by_user_id,updated_by_user_id,
           platform_video_link,notify_participants,meeting_completed_at,meeting_completed_by_user_id,attendance_tracking_enabled,meeting_settings_json)
          VALUES (?,?,?,?,?,?,?,?,?,?,0,0,?,?,1,?)`,
          [input.agencyId,input.facilitatorId,input.type==='primary'?'HUDDLE':'TEAM_MEETING',input.title,input.startAt,input.endAt,input.timeZone,input.subtype,userId,userId,input.endAt,userId,JSON.stringify({compensation:true,attendance:true,reminders:[]})]);
        eventId=created.insertId;
      }
      const [record]=await db.execute(`INSERT INTO manual_meeting_logs (agency_id,event_id,submitted_by_user_id,request_id,request_hash,platform,reason) VALUES (?,?,?,?,?,?,?)`,[input.agencyId,eventId,userId,input.requestId,hash,input.platform,input.reason]);
      logId=record.insertId;
      // Preserve existing shared artifacts. Append the author's manual record inside encrypted storage.
      const artifact=await Artifact.findByEventId(eventId,db);
      const label=`Manually logged by ${input.people.find(p=>p.userId===userId)?.name || 'Staff'} — ${PLATFORMS[input.platform]} — ${REASONS[input.reason]}`;
      await Artifact.upsertByEventId({eventId,summaryText:[artifact?.summary_text,label,input.summary].filter(Boolean).join('\n\n'),
        ...(input.transcript?{transcriptText:[artifact?.transcript_text,input.transcript].filter(Boolean).join('\n\n')}:{}),summaryModel:'manual',updatedByUserId:userId},db);
      for(const person of review.attendees){
        await db.execute('INSERT INTO manual_meeting_log_attendees (log_id,user_id,minutes,claim_policy,covered_claim_id) VALUES (?,?,?,?,?)',[logId,person.userId,person.minutes,person.policy,person.claimId]);
        await db.execute('INSERT IGNORE INTO provider_schedule_event_attendees (event_id,user_id) VALUES (?,?)',[eventId,person.userId]);
        const [attendance]=await db.execute('SELECT total_seconds FROM agency_meeting_attendance_rollups WHERE event_id=? AND user_id=?',[eventId,person.userId]);
        if(!Number(attendance[0]?.total_seconds)){
          const attendedEnd = new Date(parseUtcDate(input.startAt).getTime()+person.minutes*60000).toISOString().slice(0,19).replace('T',' ');
          await db.execute(`INSERT INTO provider_schedule_event_attendance_segments (event_id,user_id,started_at,ended_at,source) VALUES (?,?,?,?,'manual')`,[eventId,person.userId,input.startAt,attendedEnd]);
          await db.execute(`INSERT INTO agency_meeting_attendance_rollups (event_id,user_id,total_seconds,synced_at) VALUES (?,?,?,NOW()) ON DUPLICATE KEY UPDATE total_seconds=VALUES(total_seconds),synced_at=NOW()`,[eventId,person.userId,person.minutes*60]);
        }
      }
      await db.commit();
    }
  }catch(e){await db.rollback();throw e;}finally{for(const key of locks.reverse())await db.execute('SELECT RELEASE_LOCK(?)',[key]);db.release();}
  const sync=await syncCompensationClaimsForEvent({eventId,actorUserId:userId});
  const [attendees]=await pool.execute(`SELECT a.user_id AS userId,a.claim_policy AS policy,CONCAT_WS(' ',u.first_name,u.last_name) AS name
    FROM manual_meeting_log_attendees a JOIN users u ON u.id=a.user_id WHERE a.log_id=?`,[logId]);
  return {eventId,logId,created:sync.created || 0,syncPending:!sync.ok || sync.error==='sync_in_progress',attendees:attendees.map(p=>({...p,result:sync.results?.find(r=>r.userId===Number(p.userId))?.error || null}))};
}

// A payroll administrator can resolve an untimed possible overlap; this never approves a claim.
export async function resolveManualMeetingReview({actor,eventId,userId,action,note}) {
  if(!canManageMeetingCompensation(actor)) throw fail(403,'Only admins and superadmins can resolve compensation overlaps.');
  if(!['covered','submit'].includes(action) || typeof note!=='string' || note.trim().length<5 || note.length>500) throw fail(400,'Choose an outcome and explain the review in 5–500 characters.');
  const db=await pool.getConnection(),key=`meeting-compensation:${Number(eventId)}`;
  let locked=false;
  try{
    const [acquired]=await db.execute('SELECT GET_LOCK(?,10) AS acquired',[key]);locked=!!Number(acquired[0]?.acquired);
    if(!locked)throw fail(409,'Meeting claims are being updated. Try again.');
    await db.beginTransaction();
    const [rows]=await db.execute(`SELECT l.agency_id,l.id AS log_id,a.claim_policy,e.start_at,e.end_at,e.event_timezone
      FROM manual_meeting_logs l JOIN manual_meeting_log_attendees a ON a.log_id=l.id JOIN provider_schedule_events e ON e.id=l.event_id
      WHERE l.event_id=? AND a.user_id=? FOR UPDATE`,[eventId,userId]);
    const row=rows[0];
    if(!row || !await hasActiveMeetingMembership(row.agency_id,actor.id))throw fail(403,'Meeting review is not available in your agency.');
    if(row.claim_policy!=='review')throw fail(409,'This attendance has already been reviewed. Refresh the meeting.');
    if(action==='submit'){
      const zone=row.event_timezone || 'America/Denver',start=utcToZonedMysqlWall(row.start_at,zone),end=utcToZonedMysqlWall(row.end_at,zone);
      const [claims]=await db.execute(`SELECT id,claim_date,payload_json FROM payroll_time_claims WHERE agency_id=? AND user_id=? AND claim_date=?
        AND claim_type IN ('meeting_training','mentor_cpa_meeting','indirect_time') AND status NOT IN ('rejected','withdrawn')`,[row.agency_id,userId,start.slice(0,10)]);
      if(claims.some(c=>overlappingClaim(c,{claimDate:start.slice(0,10),startTime:start.slice(11,16),endTime:end.slice(11,16)},eventId)===true))throw fail(409,'An overlapping claim exists. Review that claim instead of requesting duplicate time.');
    }
    await db.execute(`UPDATE manual_meeting_log_attendees SET claim_policy=?,reviewed_by_user_id=?,review_note=?,reviewed_at=NOW()
      WHERE log_id=? AND user_id=?`,[action,actor.id,note.trim(),row.log_id,userId]);
    await db.commit();
  }catch(error){await db.rollback();throw error;}finally{if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[key]);db.release();}
  const sync=await syncCompensationClaimsForEvent({eventId,actorUserId:actor.id});
  return {ok:true,syncPending:!sync.ok || sync.error==='sync_in_progress'};
}
