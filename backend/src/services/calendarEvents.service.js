import pool from '../config/database.js';
import UserWorkSchedule from '../models/UserWorkSchedule.model.js';
import { zonedWallTimeToUtc } from '../utils/zonedWallTime.util.js';
import { workTitle, calendarWindow, uniqueOfficeReservations } from './calendarPublicationPolicy.js';
import { personalMeetingInvitation } from './meetingInvitations.service.js';
import { json, localDay } from './familyPolicy.js';

const dateOnly = v => v instanceof Date ? v.toISOString().slice(0,10) : String(v || '').slice(0,10);
export async function workCalendarEvents(userId,agencyId,from,to) {
  const {start,end}=calendarWindow(from,to);
  const [events]=await pool.execute(`SELECT p.id,p.agency_id,p.provider_id,p.recurrence_series_id,p.kind,p.client_id,c.initials AS client_initials,p.is_private,p.start_at,p.end_at,p.start_date,p.end_date,p.all_day,p.updated_at,
    p.participant_join_token,p.join_token,p.platform_video_link,p.google_meet_link
    FROM provider_schedule_events p LEFT JOIN clients c ON c.id=p.client_id AND c.agency_id=p.agency_id
    WHERE p.agency_id=? AND p.status='ACTIVE' AND p.kind NOT IN ('PERSONAL_EVENT','SCHEDULE_HOLD','FALL_CHECKIN_PRESLOT')
    AND (p.provider_id=? OR EXISTS(SELECT 1 FROM provider_schedule_event_attendees a WHERE a.event_id=p.id AND a.user_id=?))
    AND COALESCE(p.end_at,p.end_date)>? AND COALESCE(p.start_at,p.start_date)<?`,[agencyId,userId,userId,start,end]);
  const output=await Promise.all(events.map(async e=>({key:`work:${agencyId}:event:${e.id}`,title:workTitle(e),start:e.start_at,end:e.end_at,updatedAt:e.updated_at,
    ...(e.all_day?{startDate:dateOnly(e.start_date),endDate:dateOnly(e.end_date)}:{}),
    url:!e.is_private && ['TEAM_MEETING','HUDDLE'].includes(e.kind)?(await personalMeetingInvitation(e,userId)).url:null})));
  const [office]=await pool.execute(`SELECT o.id,o.office_location_id,o.room_id,r.room_number,r.label AS room_label,r.name AS room_name,o.clinical_session_id,o.start_at,o.end_at,o.updated_at,o.client_id,c.initials AS client_initials,l.name,l.street_address,l.timezone,l.events_stored_utc,o.appointment_type_code,o.appointment_subtype_code
    FROM office_events o JOIN office_locations l ON l.id=o.office_location_id LEFT JOIN office_rooms r ON r.id=o.room_id LEFT JOIN clients c ON c.id=o.client_id AND c.agency_id=?
    WHERE COALESCE(o.booked_provider_id,o.assigned_provider_id)=? AND o.status='BOOKED'
    AND o.end_at>DATE_SUB(?,INTERVAL 1 DAY) AND o.start_at<DATE_ADD(?,INTERVAL 1 DAY)
    AND (l.agency_id=? OR EXISTS(SELECT 1 FROM office_location_agencies a WHERE a.office_location_id=l.id AND a.agency_id=?))`,[agencyId,userId,start,end,agencyId,agencyId]);
  for(const o of uniqueOfficeReservations(office)){
    const utc=v=>{if(Number(o.events_stored_utc)===1)return v;const d=new Date(v);return zonedWallTimeToUtc({year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate(),hour:d.getUTCHours(),minute:d.getUTCMinutes(),timeZone:o.timezone || 'America/Denver'});};
    const s=utc(o.start_at),e=utc(o.end_at);if(e<=start || s>=end)continue;
    const room = o.room_number ? `Room ${o.room_number}` : o.room_label || o.room_name || (o.room_id ? `Room #${o.room_id}` : '');
    output.push({key:`work:${agencyId}:office:${o.id}`,title:[workTitle({...o,kind:o.client_id?'SESSION':'OFFICE'}),room].filter(Boolean).join(' · '),start:s,end:e,location:[o.name,room,o.street_address].filter(Boolean).join(' · '),updatedAt:o.updated_at});
  }
  const [supervision]=await pool.execute(`SELECT s.id,s.agency_id,s.supervisor_user_id,s.recurrence_series_id,s.start_at,s.end_at,s.updated_at,s.modality,s.location_text,s.participant_join_token,s.join_token
    FROM supervision_sessions s WHERE s.agency_id=? AND s.status IN ('SCHEDULED','IN_PROGRESS')
    AND (s.supervisor_user_id=? OR s.supervisee_user_id=? OR EXISTS(SELECT 1 FROM supervision_session_attendees a WHERE a.session_id=s.id AND a.user_id=?))
    AND s.end_at>? AND s.start_at<?`,[agencyId,userId,userId,userId,start,end]);
  output.push(...await Promise.all(supervision.map(async s=>({key:`work:${agencyId}:supervision:${s.id}`,title:'Supervision',start:s.start_at,end:s.end_at,updatedAt:s.updated_at,
    url:['VIRTUAL','VIDEO','TELEHEALTH'].includes(String(s.modality).toUpperCase())?(await personalMeetingInvitation(s,userId)).url:null}))));
  const schedule=await UserWorkSchedule.getForUser(userId,{agencyId});
  if(schedule.isActive){
    const date=new Date(`${localDay(start,schedule.timezone)}T12:00:00Z`);
    for(let n=0;n<372;n++,date.setUTCDate(date.getUTCDate()+1)){
      if(date>+end+86400000)break;
      for(const block of schedule.blocks.filter(b=>Number(b.day_of_week)===date.getUTCDay())){
        const at=t=>{const [hour,minute]=String(t).split(':').map(Number);return zonedWallTimeToUtc({year:date.getUTCFullYear(),month:date.getUTCMonth()+1,day:date.getUTCDate(),hour,minute,timeZone:schedule.timezone});};
        const s=at(block.start_time),e=at(block.end_time);if(e<=start || s>=end)continue;
        output.push({key:`work:${agencyId}:hours:${userId}:${block.id}:${dateOnly(date)}`,title:'Work hours',start:s,end:e});
      }
    }
  }
  return output.filter(e=>(e.startDate && e.endDate) || (e.start && e.end && new Date(e.end)>new Date(e.start)));
}
export async function familyCalendarEvents(householdId,from,to,{details=false}={}) {
  const {start,end}=calendarWindow(from,to);
  const [rows]=await pool.execute(`SELECT e.*,h.timezone,m.display_name,m.color,m.photo_url FROM family_entries e
    JOIN family_households h ON h.id=e.household_id LEFT JOIN family_members m ON m.household_id=e.household_id AND m.user_id=e.member_user_id
    WHERE e.household_id=? AND e.kind IN ('event','status') AND e.archived_at IS NULL AND e.end_at>? AND e.start_at<? ORDER BY e.start_at`,[householdId,start,end]);
  return rows.map(e=>{const metadata=json(e.metadata);return {key:`family:${householdId}:${e.id}`,id:e.id,title:details?e.title:'Personal event',start:e.start_at,end:e.end_at,updatedAt:e.updated_at,
    ...(metadata.allDay?{startDate:localDay(e.start_at,e.timezone),endDate:localDay(e.end_at,e.timezone)}:{}),
    ...(details?{memberId:e.member_user_id,memberName:e.display_name,color:e.color,photo:e.photo_url,metadata,location:metadata.address || ''}:{})};});
}
