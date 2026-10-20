import { parseUtcDate } from './officeEventDateTime.util.js';
export function supervisionDisplayTitle(session, firstName = '') {
 if(session.session_type === 'group')return 'Group supervision';
 const date=parseUtcDate(session.start_at);
 if(!date || !firstName)return 'Individual supervision';
 const timeZone=session.event_timezone || 'America/Denver';
 const day=new Intl.DateTimeFormat('en-US',{timeZone,month:'2-digit',day:'2-digit',year:'2-digit'}).format(date);
 const clock=new Intl.DateTimeFormat('en-US',{timeZone,hour:'numeric',minute:'2-digit',hour12:true}).format(date).replace(':00','').replace(/\s/g,'').toLowerCase();
 return `Individual Supervision–${firstName} ${day} – ${clock}`;
}
