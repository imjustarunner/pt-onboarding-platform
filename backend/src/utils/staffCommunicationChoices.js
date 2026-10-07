import { createHash } from 'node:crypto';
export const isStaffCommunicationRole = role => ['super_admin','admin','assistant_admin','support','clinical_practice_assistant','provider_plus','staff','provider','schedule_manager','intern','intern_plus','supervisor','facilitator'].includes(String(role || '').toLowerCase());
export const STAFF_COMMUNICATION_VERSION = '2026-10-06.2';
export const staffCommunicationKey = agencyId => `staff_communications_${Number(agencyId)}`;
export const phoneFingerprint = phone => createHash('sha256').update(String(phone || '')).digest('hex');
export const STAFF_COMMUNICATION_CHOICES = [
  { key: 'notifications', label: 'Staff reminders and announcements', description: 'Supervisor and team messages, schedule updates, upcoming meetings, supervision/session links, and assigned videos or training.' },
  { key: 'messageAlerts', label: 'Message-waiting text alerts', description: 'A generic notice that a message is waiting in the app. Client names, initials, message contents and clinical details are not included.' },
  { key: 'polling', label: 'Optional staff polls and voting', description: 'Attendance Y/N and numbered choices for dates or activities. Final totals are available in the app; a results text is a separate choice for each poll.' }
];
export function validateStaffCommunicationInput(input, disclosureHash) {
  const errors=[];
  if(input?.disclosureHash!==disclosureHash) errors.push('The notice changed. Reload and review it before saving.');
  if(!input?.choices || STAFF_COMMUNICATION_CHOICES.some(({key})=>typeof input.choices[key]!=='boolean') || Object.keys(input.choices).some(k=>!STAFF_COMMUNICATION_CHOICES.some(c=>c.key===k))) errors.push('Choose Yes or No for each text category. All may be No.');
  if(typeof input?.signerName!=='string'||input.signerName.trim().length<2||input.signerName.length>200) errors.push('Enter your full name.');
  if(input?.acknowledged!==true) errors.push('Confirm that you reviewed these choices and control the phone number.');
  return errors;
}
export function staffDeliveryKinds(choices) { return ['notifications','messageAlerts'].filter(k=>choices?.[k]===true); }
export function staffNotificationKind(type) { return ['inbound_client_message','support_safety_net_alert','client_note'].includes(type)?'messageAlerts':'notifications'; }
export function staffNotificationBody(type, portalUrl) {
  const intro=staffNotificationKind(type)==='messageAlerts'?'You have a message waiting in the app.':'You have a staff update or reminder in the app.';
  return `${intro} Sign in to review: ${portalUrl}`;
}
