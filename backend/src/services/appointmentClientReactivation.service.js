import {randomUUID} from 'node:crypto';
import pool from '../config/database.js';
import {reactivateClientForActivity} from './clientReactivation.service.js';
export async function reactivateConfirmedAppointmentClients(appointmentId,{executor=pool,clientIds=null,actorUserId=null}={}){
 const [[appointment]]=await executor.execute("SELECT id,agency_id,created_by_user_id,updated_by_user_id FROM appointments WHERE id=? AND status IN ('scheduled','confirmed','client_confirmed') AND end_at>UTC_TIMESTAMP()",[appointmentId]);
 if(!appointment)return {processed:0};
 const [participants]=await executor.execute('SELECT DISTINCT client_id FROM appointment_participants WHERE appointment_id=? AND client_id IS NOT NULL',[appointmentId]);
 const selected=clientIds?new Set(clientIds.map(Number)):null;
 let processed=0;
 for(const row of participants){
  if(selected&&!selected.has(Number(row.client_id)))continue;
  await reactivateClientForActivity({clientId:row.client_id,agencyId:appointment.agency_id,trigger:'confirmed_appointment',sourceId:`appointment:${appointmentId}:${randomUUID()}`,actorUserId:actorUserId||appointment.updated_by_user_id||appointment.created_by_user_id||null},executor===pool?{}:{executor});processed++;
 }
 return {processed};
}
