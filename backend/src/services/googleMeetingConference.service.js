import {parseUtcDate} from '../utils/officeEventDateTime.util.js';

export {googleMeetingConference} from '../utils/googleMeetingConference.js';

// Reads the conference for this saved event only. It never creates a conference
// or changes the organizer's Google Workspace policy.
export async function currentGoogleConference({providerUserId,eventId,startAt,endAt,meetLink},dependencies={}) {
 const d={user:async id=>(await import('../models/User.model.js')).default.findById(id),event:async input=>(await import('./googleCalendar.service.js')).default.getEvent(input),...dependencies};
 if(!providerUserId||!eventId)return {status:'not_available',phones:[]};
 try{
  const provider=await d.user(providerUserId);
  const result=await d.event({subjectEmail:provider?.email,eventId});
  const event=result?.event;
  if(!result?.ok||!event)return {status:'not_verified',phones:[]};
  if(event.status==='cancelled'||event.status==='canceled')return {status:'not_available',phones:[]};
  if((startAt&&+parseUtcDate(startAt)!==+parseUtcDate(event.startAt))||(endAt&&+parseUtcDate(endAt)!==+parseUtcDate(event.endAt)))return {status:'not_verified',phones:[]};
  const conference=event.googleConference||{meetLink:event.meetLink,phones:[]};
  if(meetLink&&conference.meetLink!==meetLink)return {status:'not_verified',phones:[]};
  return {...conference,status:conference.phones?.length?'available':'not_available'};
 }catch{return {status:'not_verified',phones:[]};}
}

const esc=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function googleDialInContent(conference) {
 if(conference?.status!=='available'||!conference.phones?.length)return null;
 const phone=conference.phones[0];
 return {provider:'google_meet',...phone,text:`Join Google Meet by phone: ${phone.number}\nGoogle Meet PIN: ${phone.pin} #\nCall charges may apply. The organizer may need to admit you.`,
  html:`<p><strong>Join Google Meet by phone</strong><br><a href="${esc(phone.telephoneUrl)}">${esc(phone.number)}</a><br>Google Meet PIN: <strong>${esc(phone.pin)} #</strong><br>Call charges may apply. The organizer may need to admit you.</p>`};
}
