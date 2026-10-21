import pool from '../config/database.js';
export const TUTORING_OFFICE_WINDOW_MINUTES=30;
const valid={appointment:['scheduled','confirmed','client_confirmed','in_progress','completed'],learning_session:['scheduled','live','completed']};
export function officeAppointmentWindow(appointment,now=Date.now()){
 const start=new Date(appointment?.starts_at).getTime(),end=new Date(appointment?.ends_at).getTime();
 const opensAt=start-TUTORING_OFFICE_WINDOW_MINUTES*60000,closesAt=end+TUTORING_OFFICE_WINDOW_MINUTES*60000;
 const eligible=Number.isFinite(start)&&Number.isFinite(end)&&end>start&&valid[appointment?.source]?.includes(appointment?.status);
 return {available:!!eligible&&now>=opensAt&&now<=closesAt,opensAt:eligible?new Date(opensAt).toISOString():null,closesAt:eligible?new Date(closesAt).toISOString():null};
}
export async function tutoringOfficeAppointments({clientId,agencyId,providerId=null},db=pool){
 const [rows]=await db.execute(`SELECT DISTINCT a.id,'appointment' AS source,a.provider_user_id,a.start_at AS starts_at,a.end_at AS ends_at,a.status,a.modality
 FROM appointments a JOIN appointment_participants p ON p.appointment_id=a.id
 WHERE p.client_id=? AND a.agency_id=? AND (? IS NULL OR a.provider_user_id=?) AND a.business_type IN ('learning','tutoring')
 AND a.start_at<=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE) AND a.end_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 MINUTE)
 UNION ALL
 SELECT s.id,'learning_session' AS source,s.provider_user_id,s.starts_at,s.ends_at,s.status,s.delivery_context AS modality
 FROM learning_class_sessions s JOIN learning_program_classes c ON c.id=s.learning_class_id JOIN tutoring_session_clients p ON p.session_id=s.id
 WHERE p.client_id=? AND c.organization_id=? AND (? IS NULL OR s.provider_user_id=?) AND (s.session_subtype='tutoring' OR s.mode='individual')
 AND NOT EXISTS(SELECT 1 FROM tutoring_appointment_sessions linked WHERE linked.session_id=s.id)
 AND s.starts_at<=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE) AND s.ends_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 MINUTE)
 ORDER BY starts_at`,[clientId,agencyId,providerId,providerId,clientId,agencyId,providerId,providerId]);
 return rows.filter(row=>officeAppointmentWindow(row).available);
}
// Re-evaluate the live schedule for every send; stored visit credentials cannot
// keep a cancelled/rescheduled appointment's chat open.
export async function officeVisitWindowOpen(visitId,db=pool,{messaging=false}={}){
 const [[binding]]=await db.execute('SELECT * FROM private_virtual_office_appointment_visits WHERE visit_id=?',[visitId]);
 if(!binding)return true; // A regular permanent-office visit has no appointment gate.
 const [[access]]=await db.execute(`SELECT g.permissions_json FROM client_guardians g JOIN clients c ON c.id=g.client_id JOIN users u ON u.id=g.guardian_user_id AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 WHERE g.client_id=? AND g.guardian_user_id=? AND g.access_enabled=1
 AND (c.agency_id=? OR EXISTS(SELECT 1 FROM client_agency_assignments a WHERE a.client_id=c.id AND a.agency_id=? AND a.is_active=1)) LIMIT 1`,[binding.client_id,binding.guardian_user_id,binding.agency_id,binding.agency_id]);
 if(!access)return false;
 let permissions=access.permissions_json||{};try{if(typeof permissions==='string')permissions=JSON.parse(permissions);}catch{return false;}
 if(permissions.noView||permissions.noViewOtherGuardian||permissions.coGuardianInviteRestricted||permissions.canViewAppointments===false||(messaging&&permissions.canMessage===false))return false;
 const appointments=await tutoringOfficeAppointments({clientId:binding.client_id,agencyId:binding.agency_id,providerId:binding.provider_user_id},db);
 return appointments.some(a=>a.source===binding.appointment_source&&Number(a.id)===Number(binding.appointment_id));
}
export async function tutoringOfficeEntryAppointment({clientId,agencyId,providerId=null,source,appointmentId},db=pool){
 if(!Number.isSafeInteger(Number(appointmentId))||Number(appointmentId)<1)return null;
 if(source==='appointment'){
  const [[row]]=await db.execute(`SELECT DISTINCT a.id,'appointment' AS source,a.provider_user_id,a.start_at AS starts_at,a.end_at AS ends_at,a.status,a.source_timezone AS timeZone,a.modality
   FROM appointments a JOIN appointment_participants p ON p.appointment_id=a.id WHERE a.id=? AND p.client_id=? AND a.agency_id=? AND (? IS NULL OR a.provider_user_id=?) AND a.business_type IN ('learning','tutoring') LIMIT 1`,[Number(appointmentId),clientId,agencyId,providerId,providerId]);return row||null;
 }
 if(source!=='learning_session')return null;
 const [[mapped]]=await db.execute('SELECT appointment_id FROM tutoring_appointment_sessions WHERE session_id=?',[Number(appointmentId)]);
 if(mapped)return tutoringOfficeEntryAppointment({clientId,agencyId,providerId,source:'appointment',appointmentId:Number(mapped.appointment_id)},db);
 const [[row]]=await db.execute(`SELECT s.id,'learning_session' AS source,s.provider_user_id,s.starts_at,s.ends_at,s.status,s.delivery_context AS modality FROM learning_class_sessions s JOIN learning_program_classes c ON c.id=s.learning_class_id JOIN tutoring_session_clients p ON p.session_id=s.id WHERE s.id=? AND p.client_id=? AND c.organization_id=? AND (? IS NULL OR s.provider_user_id=?) AND (s.session_subtype='tutoring' OR s.mode='individual') LIMIT 1`,[Number(appointmentId),clientId,agencyId,providerId,providerId]);return row||null;
}
