import { nluTutoringVideoChoice } from './nluTutoringVideoChoice.service.js';
import pool from '../config/database.js';
import {buildPublicAppUrl} from '../utils/publicPortalUrl.js';
import {authorizedAppointmentClient} from './guardianAppointments.service.js';
import {guardianAppointmentJoin} from './guardianVirtualJoin.js';
import {guardianContextAllowsAppointment} from './clientServiceEnrollment.service.js';
import { prepareStaffAppointmentMeet, readStaffAppointmentMeetConference, savedStaffAppointmentMeet } from './staffAppointmentMeet.service.js';
import {currentGoogleConference,googleDialInContent} from './googleMeetingConference.service.js';

const active=appointment=>['VIRTUAL','TELEHEALTH','VIDEO','ONLINE'].includes(String(appointment.modality||'').toUpperCase())&&['scheduled','confirmed','client_confirmed','in_progress'].includes(appointment.status);
const esc=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function appointmentGoogleConference(appointment,{db=pool,conference=currentGoogleConference}={}) {
 if(!active(appointment)||['external', 'none'].includes(appointment.videoRoomMode))return {status:'not_available',phones:[]};
 try{
 if(appointment.videoRoomMode!=='google_meet'&&await nluTutoringVideoChoice(appointment))return {status:'not_available',phones:[]};
 if (appointment.videoRoomMode === 'google_meet') {
   const url = await savedStaffAppointmentMeet(appointment, db);
   return url ? readStaffAppointmentMeetConference(appointment, url) : {status:'not_available',phones:[]};
 }
 if (!appointment.providerScheduleEventId) return {status:'not_available',phones:[]};
 const [[event]]=await db.execute('SELECT google_event_id,google_meet_link FROM provider_schedule_events WHERE id=? AND agency_id=? AND provider_id=?',[appointment.providerScheduleEventId,appointment.agencyId,appointment.providerUserId]);
  if (!event?.google_meet_link) return {status:'not_available',phones:[]};
  if (!event.google_event_id) return {status:'not_available',phones:[]};
 return await conference({providerUserId:appointment.providerUserId,eventId:event.google_event_id,startAt:appointment.startAt,endAt:appointment.endAt,meetLink:event.google_meet_link});
 }catch{return {status:'not_verified',phones:[]};}
}

// Message recipients are checked against the same current relationship and
// service permissions as portal Join. Contacts and billing-only accounts never
// receive a room link or its telephone credentials from this renderer.
export async function appointmentJoinEmail({appointment,clientId,to,context,recipientUserId=null},dependencies={}) {
 if(!active(appointment)||appointment.videoRoomMode==='none')return null;
 const d={db:pool,authorize:authorizedAppointmentClient,join:guardianAppointmentJoin,conference:appointmentGoogleConference,...dependencies};
 try{
  const [[recipient]]=await d.db.execute(`SELECT u.id FROM users u JOIN client_guardians g ON g.guardian_user_id=u.id AND g.client_id=?
    JOIN appointment_participants p ON p.client_id=g.client_id AND p.appointment_id=?
    WHERE ${Number(recipientUserId)>0?'u.id=?':'LOWER(u.email)=LOWER(?)'} AND u.is_active=1 AND g.access_enabled=1 LIMIT 1`,[clientId,appointment.id,Number(recipientUserId)>0?Number(recipientUserId):to]);
  if(!recipient)return null;
  const client=await d.authorize(recipient.id,clientId,{agencyId:appointment.agencyId});
  let permissions=client.permissions_json||{};
  if(typeof permissions==='string'){try{permissions=JSON.parse(permissions);}catch{return null;}}
  if(!permissions||typeof permissions!=='object'||Array.isArray(permissions))return null;
  if(permissions.billingOnly||permissions.noView||permissions.noViewOtherGuardian||permissions.coGuardianInviteRestricted)return null;
  if(client.portal_access?.limited||!guardianContextAllowsAppointment(client,appointment))return null;
  const [[event]]=appointment.videoRoomMode !== 'google_meet' && appointment.providerScheduleEventId?await d.db.execute('SELECT google_meet_link FROM provider_schedule_events WHERE id=? AND agency_id=? AND provider_id=?',[appointment.providerScheduleEventId,appointment.agencyId,appointment.providerUserId]):[[]];
  const meetLink = appointment.videoRoomMode === 'google_meet'
    ? await savedStaffAppointmentMeet(appointment, d.db)
      || await (dependencies.prepareMeet || prepareStaffAppointmentMeet)(appointment).catch(() => null)
    : event?.google_meet_link || null;
  const destination=await d.join({...appointment,googleMeetLink:meetLink},client,d.db,{includeFutureDestination:true});
  if(!destination)return null;
  context ||= await (await import('./clientPortalEmail.service.js')).clientEmailContext({agencyId:appointment.agencyId,clientId,...(['learning','tutoring'].includes(appointment.businessType)?{learning:true}:{})});
  const bookedTutoring = destination.startsWith('/tutoring/appointment/') && Number(context.tenant?.id) === Number(appointment.agencyId);
  let url = bookedTutoring ? buildPublicAppUrl(context.tenant,destination) : destination.startsWith('/') ? context.url(destination.slice(1)) : destination;
  if(bookedTutoring){const guest=await (dependencies.guestLink|| (await import('./tutoringGuest.service.js')).issueTutoringGuestLink)(appointment,clientId,recipient.id,d.db);if(guest)url=guest;}
  const learning=['learning','tutoring'].includes(appointment.businessType);
  const phone=(appointment.videoRoomMode === 'google_meet' || (appointment.includeGoogleDialIn === true&&!(learning&&await nluTutoringVideoChoice(appointment))))?googleDialInContent(await d.conference(appointment)):null;
  const label=['learning','tutoring'].includes(appointment.businessType)?'Join tutoring session':'Join online appointment';
  return {url,label,detailsHtml:phone?.html||'',detailsText:phone?.text||'',text:`${label}:\n${url}${phone?`\n\n${phone.text}`:''}`,html:`<p><a href="${esc(url)}">${esc(label)}</a></p>${phone?.html||''}`};
 }catch(error){
  if(![403,404,410].includes(error.status))console.warn('[appointment email join] Details unavailable',{appointmentId:appointment.id,code:error.code||'join_lookup_failed'});
  return null;
 }
}
