// Only expose a real room attached to this appointment. Never construct a
// learning-room route from a canonical appointment ID.
import {serviceMatchesAppointment} from './clientServiceEnrollment.service.js';
import {validExternalMeetingUrl} from './appointmentExternalMeeting.service.js';
export function guardianVirtualJoin(row) {
  if (!['VIRTUAL', 'TELEHEALTH', 'VIDEO', 'ONLINE'].includes(String(row.modality || '').toUpperCase())) return null;
  if (!['scheduled', 'confirmed', 'client_confirmed', 'in_progress'].includes(row.status)) return null;
  if(row.videoRoomMode==='external'){try{return validExternalMeetingUrl(row.externalMeetingUrl);}catch{return null;}}
  try {
    const url = new URL(row.googleMeetLink);
    return url.protocol === 'https:' && url.hostname === 'meet.google.com' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export async function guardianAppointmentJoin(row,client,db) {
  if(client.portal_access?.limited)return null;
  if((client.services||[]).some(s=>Number(s.provider_user_id)===Number(row.providerUserId)&&(Number(s.is_active)!==1||s.portal_limited)&&serviceMatchesAppointment(s,{...row,agencyId:row.agencyId||client.agency_id})))return null;
  if(row.videoRoomMode==='external')return guardianVirtualJoin(row);
  const learning=['learning','tutoring'].includes(String(row.businessType||row.business_type||client.client_type).toLowerCase());
  if(!learning)return guardianVirtualJoin(row);
  if(!['VIRTUAL','ONLINE','VIDEO','TELEHEALTH'].includes(String(row.modality).toUpperCase())||!['scheduled','confirmed','client_confirmed','in_progress'].includes(row.status))return null;
  // A booked tutoring visit always has an appointment-specific destination.
  if (Number(row.id)>0) return `/tutoring-session/appointment/${Number(row.id)}?clientId=${Number(client.client_id)}&agencyId=${Number(row.agencyId||client.agency_id)}`;
  // An unlinked legacy record cannot safely open an attendance-tracked room.
  return null;
}
