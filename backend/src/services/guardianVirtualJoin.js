import {parseUtcDate} from '../utils/officeEventDateTime.util.js';
// Only expose a real room attached to this appointment. Never construct a
// learning-room route from a canonical appointment ID.
import {serviceMatchesAppointment} from './clientServiceEnrollment.service.js';
import {validExternalMeetingUrl} from './appointmentExternalMeeting.service.js';
export function guardianVirtualJoin(row) {
  if (row.videoRoomMode === 'none') return null;
  if (!['VIRTUAL', 'TELEHEALTH', 'VIDEO', 'ONLINE'].includes(String(row.modality || '').toUpperCase())) return null;
  if (!['scheduled', 'confirmed', 'client_confirmed', 'in_progress'].includes(row.status)) return null;
  if(row.videoRoomMode==='external'){try{return validExternalMeetingUrl(row.externalMeetingUrl);}catch{return null;}}
  try {
    const url = new URL(row.googleMeetLink);
    return url.protocol === 'https:' && url.hostname === 'meet.google.com' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export async function guardianAppointmentJoin(row,client,db,{includeFutureDestination=false,now=Date.now(),recipientUserId=null,guestLink=null}={}) {
  if (row.videoRoomMode === 'none') return null;
  const learning=['learning','tutoring'].includes(String(row.businessType||row.business_type||client.client_type).toLowerCase());
  if(learning&&!includeFutureDestination){const start=+parseUtcDate(row.startAt),end=+parseUtcDate(row.endAt);if(!start||!end||now<start-1800000||now>end+1800000)return null;}
  let permissions=client.permissions_json||{};
  if(typeof permissions==='string'){try{permissions=JSON.parse(permissions);}catch{return null;}}
  if(!permissions||typeof permissions!=='object'||Array.isArray(permissions))return null;
  if(permissions.billingOnly||permissions.noView||permissions.noViewOtherGuardian||permissions.coGuardianInviteRestricted||permissions.canViewAppointments===false)return null;
  if(client.portal_access?.limited)return null;
  if((client.services||[]).some(s=>Number(s.provider_user_id)===Number(row.providerUserId)&&(Number(s.is_active)!==1||s.portal_limited)&&serviceMatchesAppointment(s,{...row,agencyId:row.agencyId||client.agency_id})))return null;
  if(row.videoRoomMode==='external')return guardianVirtualJoin(row);
  const google=guardianVirtualJoin(row);
  if (google || row.videoRoomMode === 'google_meet') return google;
  if(!learning){
    if(!db?.execute||!['VIRTUAL','ONLINE','VIDEO','TELEHEALTH'].includes(String(row.modality).toUpperCase())||!['scheduled','confirmed','client_confirmed','in_progress'].includes(row.status))return null;
    let room;
    try{[[room]]=await db.execute("SELECT guest_invite_token,guest_invite_expires_at FROM counseling_sessions WHERE appointment_id=? AND agency_id=? AND provider_user_id=? AND status IN ('scheduled','joining','active') ORDER BY id DESC LIMIT 1",[row.id,row.agencyId||client.agency_id,row.providerUserId]);}
    catch(error){if(['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes(error.code))return null;throw error;}
    if(!room?.guest_invite_token||(room.guest_invite_expires_at&&new Date(room.guest_invite_expires_at)<=new Date()))return null;
    return `/counseling/invite/${encodeURIComponent(room.guest_invite_token)}`;
  }
  if(!['VIRTUAL','ONLINE','VIDEO','TELEHEALTH'].includes(String(row.modality).toUpperCase())||!['scheduled','confirmed','client_confirmed','in_progress'].includes(row.status))return null;
  // A booked tutoring visit always has an appointment-specific destination.
  let context=row.learningContext||{};if(typeof context==='string'){try{context=JSON.parse(context);}catch{context={};}}
  const selectedServiceId=Number(context.serviceEnrollmentId||client.service?.id)||null;
  if (Number(row.id)>0) {
    if(Number(recipientUserId)>0&&db?.execute){
      const issue=guestLink||(await import('./tutoringGuest.service.js')).issueTutoringGuestLink;
      const invitation=await issue({...row,agencyId:row.agencyId||client.agency_id,learningContext:context},Number(client.client_id),Number(recipientUserId),db);
      if(invitation)return invitation;
    }
    return `/${includeFutureDestination?'tutoring':'tutoring-session'}/appointment/${Number(row.id)}?clientId=${Number(client.client_id)}&agencyId=${Number(row.agencyId||client.agency_id)}${selectedServiceId?'&serviceId='+selectedServiceId:''}`;
  }
  // An unlinked legacy record cannot safely open an attendance-tracked room.
  return null;
}
