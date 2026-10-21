import pool from '../config/database.js';
import crypto from 'node:crypto';
import ProviderMyRoom from '../models/ProviderMyRoom.model.js';
import {assertOfficeAccess,officeGuestStatus,officeForHost,officeAvailability,officeCredentialHash} from './privateVirtualOffice.service.js';
import {tutoringOfficeAppointments,officeAppointmentWindow,TUTORING_OFFICE_WINDOW_MINUTES} from './tutoringOfficeWindow.service.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export async function guardianTutoringOfficeStatus(context){
 const appointments=await tutoringOfficeAppointments(context);
 const offices=[];
 for(const appointment of appointments){
  const room=await ProviderMyRoom.findByUserId(appointment.provider_user_id,context.agencyId);
  if(!room)continue;
  try{await assertOfficeAccess(room);}catch(e){if([403,404].includes(e.status))continue;throw e;}
  const [[person]]=await pool.execute('SELECT first_name FROM users WHERE id=?',[room.userId]);
  offices.push({appointmentId:appointment.id,source:appointment.source,providerName:person?.first_name||'Your tutor',officeSlug:room.slug,joinUrl:`/tutoring-session/${appointment.source==='appointment'?'appointment/':''}${Number(appointment.id)}?clientId=${Number(context.clientId)}&agencyId=${Number(context.agencyId)}`,virtual:['virtual','online','video','telehealth'].includes(String(appointment.modality).toLowerCase()),...officeAppointmentWindow(appointment),availability:await officeAvailability(room)});
 }
 return {offices,windowMinutes:TUTORING_OFFICE_WINDOW_MINUTES};
}
export async function startGuardianOfficeVisit(context,{appointmentId,source,existingVisitId,credential},userId){
 const appointments=await tutoringOfficeAppointments(context);
 const appointment=appointments.find(a=>Number(a.id)===Number(appointmentId)&&a.source===source);
 if(!appointment)throw fail(409,'Office chat opens 30 minutes before your appointment and closes 30 minutes after it ends.');
 let room=await ProviderMyRoom.findByUserId(appointment.provider_user_id,context.agencyId);
 if(!room)({room}=await officeForHost(appointment.provider_user_id,context.agencyId));
 await assertOfficeAccess(room);
 if(Number.isSafeInteger(Number(existingVisitId))&&Number(existingVisitId)>0&&credential){
  const [[binding]]=await pool.execute('SELECT * FROM private_virtual_office_appointment_visits WHERE visit_id=? AND guardian_user_id=? AND client_id=? AND appointment_source=? AND appointment_id=?',[Number(existingVisitId),userId,context.clientId,source,appointment.id]);
  if(binding){try{const lobby=await officeGuestStatus(room,Number(existingVisitId),credential);if(['waiting','admitted'].includes(lobby.status))return {lobby:{...lobby,credential},officeSlug:room.slug};}catch(e){if(![403,404].includes(e.status))throw e;}}
 }
 const token=crypto.randomBytes(32).toString('base64url');
 const [[person]]=await pool.execute("SELECT CONCAT_WS(' ',first_name,last_name) AS name FROM users WHERE id=?",[userId]);
 const db=await pool.getConnection();
 try{await db.beginTransaction();
  // Do not admit or link shared student materials simply because a chat opens.
  const [result]=await db.execute(`INSERT INTO private_virtual_office_visits (room_id,credential_hash,display_name,tutoring_client_id,expires_at) VALUES (?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 HOUR))`,[room.id,officeCredentialHash(token),String(person?.name||'Portal visitor').slice(0,120),context.clientId]);
  await db.execute('INSERT INTO private_virtual_office_appointment_visits (visit_id,client_id,guardian_user_id,agency_id,provider_user_id,appointment_source,appointment_id) VALUES (?,?,?,?,?,?,?)',[result.insertId,context.clientId,userId,context.agencyId,appointment.provider_user_id,source,appointment.id]);
  await db.commit();return {lobby:{id:result.insertId,credential:token,status:'waiting',guestDisplayName:person?.name||'Portal visitor'},officeSlug:room.slug};
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
export async function guardianTutoringOfficeEntry(context,input){
 const {tutoringOfficeEntryAppointment}=await import('./tutoringOfficeWindow.service.js');
 const appointment=await tutoringOfficeEntryAppointment({...context,source:input.source,appointmentId:Number(input.appointmentId)});
 if(!appointment)throw fail(404,'This appointment is not available for the selected student.');
 const window=officeAppointmentWindow(appointment);
 const room=window.available?await ProviderMyRoom.findByUserId(appointment.provider_user_id,context.agencyId):null;
 return {...window,officeSlug:room?.slug||null,appointmentId:appointment.id,source:appointment.source,timeZone:appointment.timeZone||'America/Denver',virtual:['virtual','online','video','telehealth'].includes(String(appointment.modality).toLowerCase())};
}
