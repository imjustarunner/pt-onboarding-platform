import Client from '../models/Client.model.js';
import { authorizedAppointmentClient } from './guardianAppointments.service.js';
import { clientAgencyMembership, guardianContextAllowsAppointment, listClientServices, serviceMatchesAppointment } from './clientServiceEnrollment.service.js';
import { tutoringInvitationAllowed } from '../utils/tutoringGuestPermissions.js';

const denied=()=>Object.assign(new Error('Access to this appointment’s assigned service is required.'),{status:403});
// Tools belong to the booked appointment. This does not grant access to a
// different counseling/tutoring enrollment or to its private documentation.
export async function nluSessionHubClientAccess(req,appointment,clientId,host) {
 if(!await clientAgencyMembership(clientId,appointment.agencyId))throw denied();
 const serviceId=req.query?.serviceId||appointment.learningContext?.serviceEnrollmentId;
 if(!host){
  const access=await authorizedAppointmentClient(req.user.id,clientId,{agencyId:appointment.agencyId,serviceId});
  if(!tutoringInvitationAllowed(access,appointment,guardianContextAllowsAppointment))throw denied();
  const permissions=typeof access.permissions_json==='string'?JSON.parse(access.permissions_json):access.permissions_json;
  if(permissions?.canViewProgress===false)throw denied();
  if(access.service&&(Number(access.service.is_active)!==1||!serviceMatchesAppointment(access.service,appointment)))throw denied();
  if(access.services?.length&&!access.services.some(s=>Number(s.is_active)===1&&serviceMatchesAppointment(s,appointment)))throw denied();
  return {...access,client:{full_name:access.full_name,initials:access.initials}};
 }
 const services=await listClientServices(clientId,appointment.agencyId);
 if(services.length&&!services.some(s=>Number(s.is_active)===1&&serviceMatchesAppointment(s,appointment)))throw denied();
 if(serviceId){
  if(!services.some(s=>Number(s.id)===Number(serviceId)&&Number(s.is_active)===1&&serviceMatchesAppointment(s,appointment)))throw denied();
 }
 const client=await Client.findById(clientId,{includeSensitive:false});
 if(!client)throw denied();
 return {client:{full_name:client.full_name,initials:client.initials}};
}
