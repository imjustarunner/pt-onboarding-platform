import { parseUtcDate, utcToZonedMysqlWall } from './officeEventDateTime.util.js';
const HOUR=3600000;
// Minute 31 opens the next hour; minute 30 remains in the current window.
export function lobbyHour(now=Date.now(),nextHour=false){return Math.floor((Number(now)+29*60000)/HOUR)*HOUR+(nextHour?HOUR:0);}
export function lobbySlot(event,{now=Date.now(),nextHour=false,timezone='America/Denver'}={}){
 const from=parseUtcDate(event.start_at)?.getTime(),to=parseUtcDate(event.end_at)?.getTime();
 const hour=lobbyHour(now,nextHour);
 if(!Number.isFinite(from)||!Number.isFinite(to)||from>=hour+HOUR||to<=hour)return null;
 // Clinical appointments use their real start once linked; office allocations use the hour.
 const exact=!!(event.client_id||event.clinical_session_id);
 const start=exact?from:hour;
 if(exact && (Number(now)<start-(nextHour?90:30)*60000 || Number(now)>=Math.min(to,start+31*60000)))return null;
 const closes=exact?Math.min(to,start+31*60000):hour+31*60000;
 return {eventId:Number(event.event_id||event.id),startAt:utcToZonedMysqlWall(new Date(start),timezone),appointmentStartAt:new Date(start).toISOString(),checkinClosesAt:new Date(closes).toISOString(),nextHour,roomName:event.room_name,roomNumber:event.room_number,assigned:!event.booked_provider_id};
}
