import { supervisionAbsenceWindow, absenceCoversSession } from './supervisionRsvpAbsence.service.js';
import pool from '../config/database.js';
import { withRecurringScheduleEdit } from './recurringScheduleCancellation.service.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { isSignupOpen } from './supervisionSignup.service.js';
export async function saveSupervisionRsvp({sessionId,userId,response,reason='',scope='occurrence',untilDate=null,now=new Date()}) {
 if(!['accepted','declined'].includes(response))throw Object.assign(new Error('Choose attending or not attending.'),{status:400});
 if(!['occurrence','until_date'].includes(scope))throw Object.assign(new Error('Choose this date or a specific end date; you cannot cancel the series forever.'),{status:400});
 if(scope==='until_date'&&response!=='declined')throw Object.assign(new Error('A date range is only available when you cannot attend.'),{status:400});
 const work=async db=>{
 try{await db.beginTransaction();
 const [rows]=await db.execute(`SELECT s.*,a.status attendee_status,a.is_required, EXISTS(SELECT 1 FROM supervision_session_presenters p WHERE p.session_id=s.id AND p.user_id=a.user_id) AS is_presenter FROM supervision_sessions s JOIN supervision_session_attendees a ON a.session_id=s.id AND a.user_id=?
 WHERE s.id=? AND a.status NOT IN ('REMOVED','CANCELLED','WITHDRAWN') AND EXISTS(SELECT 1 FROM user_agencies ua JOIN users u ON u.id=ua.user_id WHERE ua.user_id=? AND (ua.agency_id=s.agency_id OR JSON_CONTAINS(JSON_EXTRACT(s.meeting_settings_json,'$.audienceAgencyIds'),CAST(ua.agency_id AS JSON))) AND ua.is_active=1 AND u.is_active=1) FOR UPDATE`,[userId,sessionId,userId]);
 const session=rows[0];
 if(!session||session.status!=='SCHEDULED'||parseUtcDate(session.start_at)<=now)throw Object.assign(new Error('This supervision RSVP is no longer available.'),{status:410});
 if(response==='accepted'&&session.enrollment_mode==='signup_only'&&!['SIGNED_UP','JOINED'].includes(session.attendee_status)&&!isSignupOpen(session,now))throw Object.assign(new Error('Registration for this session has closed.'),{status:409});
 const required = Number(session.is_required) === 1 || Number(session.is_presenter) === 1 || [session.supervisor_user_id,session.co_facilitator_user_id,session.session_type==='individual'?session.supervisee_user_id:null].some(id=>Number(id)>0 && Number(id)===Number(userId));
 const declineReason = required ? String(reason || '').trim() : '';
 if (response==='declined' && required && !declineReason) throw Object.assign(new Error('Please explain why you cannot attend this required supervision.'),{status:400});
 if (declineReason.length>2000) throw Object.assign(new Error('Keep your reason under 2,000 characters.'),{status:400});
 if(scope==='until_date') {
  if(!required || session.session_type!=='group'||!session.recurrence_series_id||session.enrollment_mode==='signup_only')throw Object.assign(new Error('A recurring absence is only available for regular recurring group supervision.'),{status:400});
  const window=supervisionAbsenceWindow(session,untilDate);
  await db.execute(`INSERT INTO supervision_rsvp_absences (agency_id,recurrence_series_id,user_id,source_session_id,starts_at,ends_at,through_date,weekday,reason) VALUES (?,?,?,?,?,?,?,?,?)`,[session.agency_id,session.recurrence_series_id,userId,sessionId,window.startsAt,window.endsAt,window.throughDate,window.weekday,declineReason]);
  const [occurrences]=await db.execute(`SELECT s.* FROM supervision_sessions s JOIN supervision_session_attendees a ON a.session_id=s.id AND a.user_id=? WHERE s.agency_id=? AND s.recurrence_series_id=? AND s.session_type='group' AND s.status='SCHEDULED' AND s.start_at>=? AND s.start_at<? AND s.start_at>? AND a.status NOT IN ('REMOVED','CANCELLED','WITHDRAWN') FOR UPDATE`,[userId,session.agency_id,session.recurrence_series_id,window.startsAt,window.endsAt,now]);
  let affected=0;
  for(const occurrence of occurrences)if(absenceCoversSession({starts_at:window.startsAt,ends_at:window.endsAt,weekday:window.weekday},occurrence)){
   await db.execute("UPDATE supervision_session_attendees SET status='DECLINED',decline_reason=?,updated_at=UTC_TIMESTAMP() WHERE session_id=? AND user_id=?",[declineReason,occurrence.id,userId]);affected++;
  }
  await db.commit();return {ok:true,response,scope,untilDate:window.throughDate,affectedSessions:affected};
 }
 await db.execute('UPDATE supervision_session_attendees SET status=?,decline_reason=?,updated_at=UTC_TIMESTAMP() WHERE session_id=? AND user_id=?',[response==='accepted'?'SIGNED_UP':'DECLINED',response==='declined'?declineReason||null:null,sessionId,userId]);
 await db.commit();return {ok:true,response};
 }catch(error){await db.rollback();throw error;}
 };
 // Serialize bounded absences with renewal so a concurrently generated date cannot be missed.
 if(scope==='until_date')return withRecurringScheduleEdit(work);
 const db=await pool.getConnection();
 try{return await work(db);}finally{db.release();}
}
