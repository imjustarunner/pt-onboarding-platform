import { utcToZonedMysqlWall, parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { wallMysqlToUtcMysql } from '../utils/zonedWallTime.util.js';
const invalid = message => Object.assign(new Error(message), {status:400});
export function supervisionAbsenceWindow(session, untilDate) {
 const date=String(untilDate || '');
 const parsed=new Date(`${date}T12:00:00Z`);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw invalid('Choose a valid end date. A recurring absence cannot be indefinite.');
 const tz=session.event_timezone || 'America/Denver';
 const local=utcToZonedMysqlWall(session.start_at,tz).slice(0,10);
 if(date<local)throw invalid('The end date must be on or after this supervision date.');
 parsed.setUTCDate(parsed.getUTCDate()+1);
 const endsAt=wallMysqlToUtcMysql(`${parsed.toISOString().slice(0,10)} 00:00:00`,tz);
 if(!endsAt)throw invalid('Choose a valid end date.');
 return {startsAt:session.start_at,endsAt,throughDate:date,
 weekday:session.recurrence_frequency==='MONTHLY'?null:new Date(`${local}T12:00:00Z`).getUTCDay()};
}
export function absenceCoversSession(absence,session) {
 const start=parseUtcDate(session.start_at);
 if(start<parseUtcDate(absence.starts_at)||start>=parseUtcDate(absence.ends_at))return false;
 const local=utcToZonedMysqlWall(session.start_at,session.event_timezone || 'America/Denver').slice(0,10);
 return absence.weekday==null||Number(absence.weekday)===new Date(`${local}T12:00:00Z`).getUTCDay();
}
// Newly generated occurrences inherit a bounded absence, never the last RSVP forever.
export async function applySupervisionAbsences(db,sessionId) {
 const [[session]]=await db.execute('SELECT * FROM supervision_sessions WHERE id=?',[sessionId]);
 if(!session?.recurrence_series_id||session.session_type!=='group')return;
 const [absences]=await db.execute('SELECT * FROM supervision_rsvp_absences WHERE agency_id=? AND recurrence_series_id=? AND starts_at<=? AND ends_at>? ORDER BY id',[session.agency_id,session.recurrence_series_id,session.start_at,session.start_at]);
 for(const absence of absences)if(absenceCoversSession(absence,session))await db.execute("UPDATE supervision_session_attendees SET status='DECLINED',decline_reason=?,updated_at=UTC_TIMESTAMP() WHERE session_id=? AND user_id=? AND status='INVITED'",[absence.reason,sessionId,absence.user_id]);
}
