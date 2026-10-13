import {parseScheduleUtcInstant} from './scheduleEventInstants.js';
export const officeTypeColors={SUPERVISION:'#8864ac',TEAM_MEETING:'#4c75ac',HUDDLE:'#ce9541',mental_health:'#27816f',healthcare:'#27816f',tutoring:'#d19a30',learning:'#d19a30',coaching:'#6b6fb6',consulting:'#557f98'};
export function officeMeetingTarget(raw,origin=window.location.origin){
 try{const url=new URL(raw,origin);if(!['https:','http:'].includes(url.protocol))return null;
  const own=url.origin===origin||['plottwisthq.com','auricwell.com','app.itsco.health'].includes(url.hostname);
  const internal=own&&/^\/(?:[^/]+\/)?(?:join\/(?:team-meeting|supervision|invitation)\/|counseling\/session\/|tutoring-session\/)[A-Za-z0-9_-]+\/?$/.test(url.pathname);
  return internal?{embedded:true,path:url.pathname+url.search}:{embedded:false,path:url.href};
 }catch{return null;}
}
export function agendaMeeting(event){
 // An old join URL cannot override an explicit in-person/phone modality.
 const modalities=[event.modality,event.deliveryContext,event.delivery_context].filter(value=>String(value||'').trim());
 const virtualModes=new Set(['VIRTUAL','TELEHEALTH','VIDEO','ONLINE','REMOTE']);
 if(modalities.some(value=>!virtualModes.has(String(value).trim().toUpperCase())))return null;
 // Team meetings/huddles predate modality and use their video-link configuration.
 if(!modalities.length && !['TEAM_MEETING','HUDDLE'].includes(String(event.kind||'').toUpperCase()))return null;
 const url=((event.isHost||event.role==='supervisor')&&event.hostJoinUrl)||event.appJoinUrl||event.participantJoinUrl||event.joinUrl||event.meetLink||event.googleMeetLink;
 if(!url||['CANCELLED','CANCELED'].includes(String(event.status||'').toUpperCase()))return null;
 const start=parseScheduleUtcInstant(event.startAt),end=parseScheduleUtcInstant(event.endAt);if(!start||!end)return null;
 return {key:`meeting-${event.kind}-${event.id}`,type:'meeting',title:event.title||'Meeting',kind:event.kind||'Meeting',startAt:start.toISOString(),endAt:end.toISOString(),agencyId:Number(event.agencyId||event.agency_id)||null,agencyName:event.agencyName||event.organizationName,color:event.color||event.colorHex,url,details:event.description||event.notes||'',status:event.meetingCompletedAt||event.liveEndedAt?'ended':event.status||'scheduled',canOpen:!event.meetingCompletedAt&&!event.liveEndedAt};
}
