import pool from '../config/database.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

const formats = {
  team: { table:'provider_schedule_events', presence:'provider_schedule_event_join_presence', foreign:'event_id', ended:'meeting_completed_at', scope:"m.kind IN ('TEAM_MEETING','HUDDLE') AND m.status='ACTIVE'" },
  supervision: { table:'supervision_sessions', presence:'supervision_session_join_presence', foreign:'session_id', ended:'live_ended_at', scope:"m.status IN ('SCHEDULED','IN_PROGRESS','COMPLETED_PENDING_FINALIZE','FINALIZED','MISSED')" }
};
export function pastMeetingDay(end, timeZone, now=new Date()) {
  const date=parseUtcDate(end);
  if (!date || date >= now) return false;
  let formatter;
  try { formatter=new Intl.DateTimeFormat('en-CA',{timeZone:timeZone||'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}); }
  catch { formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}); }
  return formatter.format(date)!==formatter.format(now);
}

// Expiration only closes the video room. It does not finalize attendance or payroll.
// The atomic presence check also protects rooms still in use after midnight.
export async function expireEmptyMeeting(kind,row,db=pool,now=new Date()) {
  const config=formats[kind];
  if(!config || !row?.end_at || row[config.ended] || parseUtcDate(row.end_at)>=now) return row;
  let zone=row.event_timezone||row.agency_timezone;
  if(!zone && row.agency_id){const [[agency]]=await db.execute('SELECT timezone FROM agencies WHERE id=?',[row.agency_id]);zone=agency?.timezone;}
  if(!pastMeetingDay(row.end_at,zone,now))return row;
  const [result]=await db.execute(`UPDATE ${config.table} m SET ${config.ended}=m.end_at
    WHERE m.id=? AND m.${config.ended} IS NULL AND m.end_at < UTC_TIMESTAMP()
      AND NOT EXISTS(SELECT 1 FROM ${config.presence} live WHERE live.${config.foreign}=m.id
        AND live.left_at IS NULL AND live.last_seen_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 90 SECOND))`,[row.id]);
  if(result.affectedRows) return {...row,[config.ended]:row.end_at};
  // Another worker may have closed it while the join request was resolving.
  const [[current]]=await db.execute(`SELECT ${config.ended} FROM ${config.table} WHERE id=?`,[row.id]);
  return {...row,...current};
}
export async function expireEmptyMeetings(db=pool,now=new Date()) {
  let closed=0;
  for(const [kind,c] of Object.entries(formats)) {
    const [rows]=await db.execute(`SELECT m.*,a.timezone AS agency_timezone FROM ${c.table} m
      LEFT JOIN agencies a ON a.id=m.agency_id
      WHERE m.${c.ended} IS NULL AND m.end_at<UTC_TIMESTAMP() AND ${c.scope}
        AND NOT EXISTS(SELECT 1 FROM ${c.presence} live WHERE live.${c.foreign}=m.id
          AND live.left_at IS NULL AND live.last_seen_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 90 SECOND))
      ORDER BY m.end_at LIMIT 500`);
    for(const row of rows){const result=await expireEmptyMeeting(kind,row,db,now);if(result[c.ended])closed++;}
  }
  return closed;
}
