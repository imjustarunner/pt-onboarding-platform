import { createHash } from 'node:crypto';
export const isStaffCommunicationRole = role => ['super_admin','admin','assistant_admin','support','clinical_practice_assistant','provider_plus','staff','provider','schedule_manager','intern','intern_plus','supervisor','facilitator'].includes(String(role || '').toLowerCase());
export const STAFF_COMMUNICATION_VERSION = '2026-10-09.2';
export const STAFF_COMMUNICATION_REQUESTS = [
  {key:'staffSmsAssistant',label:'Allow staff text-assistant requests from my saved mobile number',description:'Enable a limited text assistant from my saved mobile number. #task plus text immediately adds a personal task; #task alone returns my top five open tasks excluding anything categorized/tagged Client or linked to client records. #calendar returns today’s app calendar types and times only. Text MENU anytime for current features and instructions. Do not include client details or sensitive information. Each request permits its reply, not recurring enrollment. STOP stops texts from this campaign.'},
  {key:'inAppTexting',label:'I would like client texting access in the app',description:'Request access to send and receive messages with assigned clients using the agency business number. An administrator reviews access; this choice does not grant permissions or enroll clients.'},
  {key:'personalSmsRelay',label:'I would like client-message forwarding when it becomes available',description:'Record interest in receiving client messages and replying through your personal phone. Forwarding is not available now. This request does not enable forwarding or authorize sharing client information. Separate healthcare setup and consent are required before launch.'}
];
export const staffCommunicationKey = agencyId => `staff_communications_${Number(agencyId)}`;
export const phoneFingerprint = phone => createHash('sha256').update(String(phone || '')).digest('hex');
export const STAFF_COMMUNICATION_CHOICES = [
  { key: 'notifications', label: 'Staff reminders and announcements', description: 'Supervisor and team messages, schedule updates, upcoming meetings, supervision/session links, and assigned videos or training.' },
  { key: 'messageAlerts', label: 'Message-waiting text alerts', description: 'A generic notice that a message is waiting in the app. Client names, initials, message contents and clinical details are not included.' },
  { key: 'appointmentReplies', label: 'Client cancellations and appointment replies', description: 'Text me when an assigned client responds about an appointment—including N, Y, R, or another response. Open the app to read the reply and take action. School replies need staff review; they do not automatically cancel a school visit.' },
  { key: 'kioskArrivals', label: 'Client check-in at the office kiosk', description: 'Text me “Your client has just checked in!” with a secure app link. Your in-app arrival notification is always on; this choice controls only the extra text.' },
  { key: 'exchangeMatches', label: 'New matching clients in Client Exchange', description: 'Text me about possible matches only while I am open for new clients in the requested format. Waitlist and Closed do not receive match alerts. Unknown preferences may still match. The staff notifications number sends a generic sign-in link; client identities, demographics, clinical summaries and record identifiers stay in the app.' },
  { key: 'polling', label: 'Optional staff polls and voting', description: 'Attendance Y/N and numbered choices for dates or activities. Final totals are available in the app; a results text is a separate choice for each poll.' }
];
export function validateStaffCommunicationInput(input, disclosureHash) {
  const errors=[];
  if(input?.disclosureHash!==disclosureHash) errors.push('The notice changed. Reload and review it before saving.');
  if(!input?.choices || STAFF_COMMUNICATION_CHOICES.some(({key})=>typeof input.choices[key]!=='boolean') || Object.keys(input.choices).some(k=>!STAFF_COMMUNICATION_CHOICES.some(c=>c.key===k))) errors.push('Choose Yes or No for each text category. All may be No.');
  if(!input?.accessRequests || STAFF_COMMUNICATION_REQUESTS.some(({key})=>typeof input.accessRequests[key]!=='boolean') || Object.keys(input.accessRequests).some(k=>!STAFF_COMMUNICATION_REQUESTS.some(c=>c.key===k))) errors.push('Choose Yes or No for the staff text assistant, in-app texting access and future forwarding. All may be No.');
  if(typeof input?.signerName!=='string'||input.signerName.trim().length<2||input.signerName.length>200) errors.push('Enter your full name.');
  if(input?.acknowledged!==true) errors.push('Confirm that you reviewed these choices and control the phone number.');
  if(input?.usageAcknowledged!==true) errors.push('Review and acknowledge the Communications Use Agreement.');
  return errors;
}
export function staffDeliveryKinds(choices) { return STAFF_COMMUNICATION_CHOICES.filter(c=>c.key!=='polling'&&choices?.[c.key]===true).map(c=>c.key); }
export function staffNotificationKind(type) { return type==='client_exchange_match'?'exchangeMatches':type==='kiosk_checkin'?'kioskArrivals':type==='client_appointment_reply'?'appointmentReplies':['inbound_client_message','support_safety_net_alert','client_note'].includes(type)?'messageAlerts':'notifications'; }
export function staffNotificationBody(type, portalUrl) {
  const intro=type==='client_exchange_match'?'New client added to the exchange. A possible match is available.':type==='kiosk_checkin'?'Your client has just checked in!':type==='client_appointment_reply'?'A client replied about an appointment. Open the app to review any cancellation or scheduling concern.':staffNotificationKind(type)==='messageAlerts'?'You have a message waiting in the app.':'You have a staff update or reminder in the app.';
  return `${intro} Sign in to review: ${portalUrl}`;
}
