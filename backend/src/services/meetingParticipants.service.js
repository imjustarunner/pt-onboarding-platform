import { meetingClaimHourlyRate } from './meetingClaimRate.service.js';
import { isStudentIntern } from '../utils/studentIntern.js';
import { huddleHostServiceCode } from './huddlePolicy.js';
import { resolveMeetingRecipient } from './meetingRecipientIdentity.service.js';
import pool from '../config/database.js';
import { isJacquelyneHuddle, JACQUELYNE_TIME_START } from '../utils/jacquelyneTimePolicy.js';
import TeamArtifact from '../models/ProviderScheduleEventArtifact.model.js';
import { mapMeetingAgendaItem } from '../models/MeetingAgendaItem.model.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { isCompensationClaimMeeting } from './meetingCompensationClaims.service.js';
import PayrollSalaryPosition from '../models/PayrollSalaryPosition.model.js';
import { trainingCompensationOverrides } from './scheduledTrainingCompensation.service.js';
export async function meetingParticipantRows(event,{includeCompensation=false,resolveEmails=true}={}) {
  if(event.meeting_type==='supervision') {
    const [people]=await pool.execute(`SELECT DISTINCT u.id,COALESCE(NULLIF(TRIM(u.preferred_name), SPACE(0)), u.first_name) AS first_name,u.last_name FROM users u WHERE u.id=? OR u.id=? OR u.id IN (SELECT user_id FROM supervision_session_attendees WHERE session_id=? AND status NOT IN ('DECLINED','REMOVED','CANCELLED'))`,[event.provider_id,event.co_facilitator_user_id||null,event.id]);
    return people.map(u=>({...u,name:[u.first_name,u.last_name].filter(Boolean).join(' '),rsvp:'pending'}));
  }
  const [rows]=await pool.execute(`SELECT u.id,u.email,u.work_email,COALESCE(NULLIF(TRIM(u.preferred_name), SPACE(0)), u.first_name) AS first_name,u.last_name,u.role,u.credential,u.title,u.employment_type,u.has_supervisor_privileges,
    EXISTS(SELECT 1 FROM hiring_interviews h WHERE h.provider_schedule_event_id=pse.id AND h.candidate_user_id=u.id) isInterviewCandidate,
    COALESCE(p.is_required,1) is_required,COALESCE(p.is_cohost,0) is_cohost,COALESCE(p.rsvp,'pending') rsvp,p.rsvp_decline_reason
    FROM users u JOIN provider_schedule_events pse ON pse.id=? LEFT JOIN meeting_participant_preferences p ON p.user_id=u.id AND p.event_id=?
    WHERE u.id=? OR u.id IN (SELECT user_id FROM provider_schedule_event_attendees WHERE event_id=?)
      OR u.id IN (SELECT candidate_user_id FROM hiring_interviews WHERE provider_schedule_event_id=?)`,[event.id,event.id,event.provider_id,event.id,event.id]);
  const date=parseUtcDate(event.start_at);const asOfDate=date?new Intl.DateTimeFormat('en-CA',{timeZone:event.event_timezone||'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(date):null;
  const trainingOverrides = includeCompensation ? await trainingCompensationOverrides(event) : new Map();
  for(const row of rows) {
    const identity=resolveEmails ? await resolveMeetingRecipient({agencyId:event.agency_id,user:row,guest:!!Number(row.isInterviewCandidate)}) : {email:row.work_email || row.email};
    row.email=identity.email;delete row.work_email;delete row.isInterviewCandidate;
    row.name=[row.first_name,row.last_name].filter(Boolean).join(' ');row.isHost=Number(row.id)===Number(event.provider_id);
    if(includeCompensation) {
      const salary=await PayrollSalaryPosition.findActiveForUser({agencyId:event.agency_id,userId:row.id,asOfDate});
      const supervisorRate = ['admin','leadership_circle','supervisors_meeting'].includes(event.meeting_subtype) && (row.role==='supervisor' || Number(row.has_supervisor_privileges)===1);
      const serviceCode = isJacquelyneHuddle(event, row.id) && asOfDate >= JACQUELYNE_TIME_START ? 'Admin Time' : event.kind==='HUDDLE' && row.isHost ? huddleHostServiceCode(event,row.role) : supervisorRate ? 'Supervisor meeting' : 'MEETING';
      if (event.meeting_subtype==='training' && !Number(row.is_required)) row.compensation='Optional attendance · no automatic training pay';
      else if (event.meeting_subtype==='training' && isStudentIntern(row)) row.compensation='Unpaid indirect training time · recorded attendance';
      else if (event.meeting_subtype==='training') {
        const override = trainingOverrides.get(Number(row.id));
        const label = override ? 'Administrative time override' : 'Support Activity';
        const rate=await meetingClaimHourlyRate({agency_id:event.agency_id,user_id:row.id,claim_date:asOfDate,payload:{serviceCode:override ? 'Admin Time' : 'MEETING'}},null);
        row.compensation=Number(rate)>0 ? `${label} · $${Number(rate).toFixed(2)}/hour · recorded attendance` : `${label} rate needed before compensation`;
        if (override) row.compensationOverride = { rateType:override.rate_type, reason:override.reason };
      }
      else if (event.kind==='HUDDLE' && isStudentIntern(row)) row.compensation='Unpaid indirect time · recorded attendance';
      else if (['admin','super_admin','superadmin'].includes(row.role)) row.compensation='Not compensated · administrator';
      else if (Number(salary?.salary_per_pay_period)>0) row.compensation='Not compensated · salaried';
      else if (!isCompensationClaimMeeting(event)) row.compensation='Not compensated · meeting setting';
      else {
        const rate=await meetingClaimHourlyRate({agency_id:event.agency_id,user_id:row.id,claim_date:asOfDate,payload:{serviceCode}},null);
        const label = serviceCode === 'Admin Time' ? 'Admin Time' : serviceCode === 'MEETING' ? 'Support Activity' : serviceCode;
        row.compensation=Number(rate)>0 ? `${label} · $${Number(rate).toFixed(2)}/hour · recorded attendance` : `${label} rate needed before compensation`;
      }
    }
    delete row.credential; delete row.title; delete row.employment_type;
    delete row.role;
    delete row.has_supervisor_privileges;
  }
  return rows;
}
export async function meetingReplyTo(event) {
  if(event.meeting_type==='supervision') {
    const [hosts]=await pool.execute('SELECT id,email,work_email,COALESCE(NULLIF(TRIM(preferred_name), SPACE(0)), first_name) AS first_name,last_name FROM users WHERE id IN (?,?)',[event.provider_id,event.co_facilitator_user_id||null]);return (await Promise.all(hosts.map(user=>resolveMeetingRecipient({agencyId:event.agency_id,user})))).map(u=>u.email).filter(Boolean).join(', ');
  }
  const [rows]=await pool.execute(`SELECT DISTINCT u.id,u.email,u.work_email,COALESCE(NULLIF(TRIM(u.preferred_name), SPACE(0)), u.first_name) AS first_name,u.last_name FROM users u WHERE u.id=? OR u.id IN (SELECT p.user_id FROM meeting_participant_preferences p JOIN provider_schedule_event_attendees a ON a.event_id=p.event_id AND a.user_id=p.user_id WHERE p.event_id=? AND p.is_cohost=1)`,[event.provider_id,event.id]);
  return (await Promise.all(rows.map(user=>resolveMeetingRecipient({agencyId:event.agency_id,user})))).map(u=>u.email).filter(Boolean).join(', ');
}

export async function meetingEmailDetails(event) {
  if(event.meeting_type==='supervision' || event.meeting_subtype==='interview')return '';
  const settings=typeof event.meeting_settings_json==='string'?JSON.parse(event.meeting_settings_json):event.meeting_settings_json||{};
  const artifacts=[await TeamArtifact.findByEventId(event.id)];
  const [agenda]=settings.agenda===false?[[]]:await pool.execute(`SELECT i.title FROM meeting_agenda_items i JOIN meeting_agendas a ON a.id=i.meeting_agenda_id WHERE a.meeting_type='provider_schedule_event' AND a.meeting_id=? ORDER BY i.sort_order,i.id`,[event.id]);
  const parse=raw=>{try{return typeof raw==='string'?JSON.parse(raw):raw||[];}catch{return [];}};
  return [agenda.length?`Agenda: ${agenda.map(mapMeetingAgendaItem).map(i=>i.title).join('; ')}`:'',settings.goals===false?'':`Goals: ${parse(artifacts[0]?.goals_json).map(i=>i.text).filter(Boolean).join('; ')}`,settings.actionItems===false?'':`Action items: ${parse(artifacts[0]?.action_items_json).map(i=>i.text).filter(Boolean).join('; ')}`].filter(line=>line&&!line.endsWith(': ')).join('\n');
}
