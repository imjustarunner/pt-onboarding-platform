import { huddleHostServiceCode } from './huddlePolicy.js';
import { resolveMeetingRecipient } from './meetingRecipientIdentity.service.js';
import pool from '../config/database.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import PayrollRate from '../models/PayrollRate.model.js';
import { isCompensationClaimMeeting } from './meetingCompensationClaims.service.js';
import PayrollSalaryPosition from '../models/PayrollSalaryPosition.model.js';
export async function meetingParticipantRows(event,{includeCompensation=false}={}) {
  if(event.meeting_type==='supervision') {
    const [people]=await pool.execute(`SELECT DISTINCT u.id,u.first_name,u.last_name FROM users u WHERE u.id=? OR u.id=? OR u.id IN (SELECT user_id FROM supervision_session_attendees WHERE session_id=? AND status NOT IN ('DECLINED','REMOVED','CANCELLED'))`,[event.provider_id,event.co_facilitator_user_id||null,event.id]);
    return people.map(u=>({...u,name:[u.first_name,u.last_name].filter(Boolean).join(' '),rsvp:'pending'}));
  }
  const [rows]=await pool.execute(`SELECT u.id,u.email,u.work_email,u.first_name,u.last_name,u.role,u.has_supervisor_privileges,
    EXISTS(SELECT 1 FROM hiring_interviews h WHERE h.provider_schedule_event_id=pse.id AND h.candidate_user_id=u.id) isInterviewCandidate,
    COALESCE(p.is_required,1) is_required,COALESCE(p.is_cohost,0) is_cohost,COALESCE(p.rsvp,'pending') rsvp
    FROM users u JOIN provider_schedule_events pse ON pse.id=? LEFT JOIN meeting_participant_preferences p ON p.user_id=u.id AND p.event_id=?
    WHERE u.id=? OR u.id IN (SELECT user_id FROM provider_schedule_event_attendees WHERE event_id=?)
      OR u.id IN (SELECT candidate_user_id FROM hiring_interviews WHERE provider_schedule_event_id=?)`,[event.id,event.id,event.provider_id,event.id,event.id]);
  const date=parseUtcDate(event.start_at);const asOfDate=date?new Intl.DateTimeFormat('en-CA',{timeZone:event.event_timezone||'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(date):null;
  for(const row of rows) {
    const identity=await resolveMeetingRecipient({agencyId:event.agency_id,user:row,guest:!!Number(row.isInterviewCandidate)});
    row.email=identity.email;delete row.work_email;delete row.isInterviewCandidate;
    row.name=[row.first_name,row.last_name].filter(Boolean).join(' ');row.isHost=Number(row.id)===Number(event.provider_id);
    if(includeCompensation) {
      const salary=await PayrollSalaryPosition.findActiveForUser({agencyId:event.agency_id,userId:row.id,asOfDate});
      const supervisorRate = ['admin','leadership_circle','supervisors_meeting'].includes(event.meeting_subtype) && (row.role==='supervisor' || Number(row.has_supervisor_privileges)===1);
      const serviceCode = event.kind==='HUDDLE' && row.isHost ? huddleHostServiceCode(event,row.role) : supervisorRate ? 'Supervisor meeting' : 'MEETING';
      if (event.kind==='HUDDLE' && row.role==='intern') row.compensation='Unpaid indirect time · recorded attendance';
      else if (['admin','super_admin','superadmin'].includes(row.role)) row.compensation='Not compensated · administrator';
      else if (Number(salary?.salary_per_pay_period)>0) row.compensation='Not compensated · salaried';
      else if (!isCompensationClaimMeeting(event)) row.compensation='Not compensated · meeting setting';
      else {
        const rate=await PayrollRate.findBestRate({agencyId:event.agency_id,userId:row.id,serviceCode,asOf:asOfDate});
        row.compensation=Number(rate?.rate_amount)>0 ? `Compensated · $${Number(rate.rate_amount).toFixed(2)}/hour · recorded attendance` : 'Rate needed before compensation';
      }
    }
    delete row.role;
    delete row.has_supervisor_privileges;
  }
  return rows;
}
export async function meetingReplyTo(event) {
  if(event.meeting_type==='supervision') {
    const [hosts]=await pool.execute('SELECT id,email,work_email,first_name,last_name FROM users WHERE id IN (?,?)',[event.provider_id,event.co_facilitator_user_id||null]);return (await Promise.all(hosts.map(user=>resolveMeetingRecipient({agencyId:event.agency_id,user})))).map(u=>u.email).filter(Boolean).join(', ');
  }
  const [rows]=await pool.execute(`SELECT DISTINCT u.id,u.email,u.work_email,u.first_name,u.last_name FROM users u WHERE u.id=? OR u.id IN (SELECT p.user_id FROM meeting_participant_preferences p JOIN provider_schedule_event_attendees a ON a.event_id=p.event_id AND a.user_id=p.user_id WHERE p.event_id=? AND p.is_cohost=1)`,[event.provider_id,event.id]);
  return (await Promise.all(rows.map(user=>resolveMeetingRecipient({agencyId:event.agency_id,user})))).map(u=>u.email).filter(Boolean).join(', ');
}

export async function meetingEmailDetails(event) {
  if(event.meeting_type==='supervision' || event.meeting_subtype==='interview')return '';
  const settings=typeof event.meeting_settings_json==='string'?JSON.parse(event.meeting_settings_json):event.meeting_settings_json||{};
  const [artifacts]=await pool.execute('SELECT goals_json,action_items_json FROM provider_schedule_event_artifacts WHERE event_id=?',[event.id]);
  const [agenda]=settings.agenda===false?[[]]:await pool.execute(`SELECT i.title FROM meeting_agenda_items i JOIN meeting_agendas a ON a.id=i.meeting_agenda_id WHERE a.meeting_type='provider_schedule_event' AND a.meeting_id=? ORDER BY i.sort_order,i.id`,[event.id]);
  const parse=raw=>{try{return typeof raw==='string'?JSON.parse(raw):raw||[];}catch{return [];}};
  return [agenda.length?`Agenda: ${agenda.map(i=>i.title).join('; ')}`:'',settings.goals===false?'':`Goals: ${parse(artifacts[0]?.goals_json).map(i=>i.text).filter(Boolean).join('; ')}`,settings.actionItems===false?'':`Action items: ${parse(artifacts[0]?.action_items_json).map(i=>i.text).filter(Boolean).join('; ')}`].filter(line=>line&&!line.endsWith(': ')).join('\n');
}
