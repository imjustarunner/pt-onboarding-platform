import User from '../models/User.model.js';
import { contactReminderPhoneHash } from '../utils/contactReminderConsent.js';

const STAFF = new Set(['super_admin','admin','support','staff','scheduler','provider','provider_plus','clinical_practice_assistant']);
export function canEditAffiliatedContact(contact, actor) {
  return STAFF.has(String(actor?.role || '').toLowerCase())
    || (!!Number(actor?.id) && Number(contact?.created_by_user_id) === Number(actor.id));
}
export async function assertContactOwner(contact, userId, users = User) {
  if (Number(contact?.created_by_user_id) === Number(userId) && Number(userId)) return;
  if (!canEditAffiliatedContact(contact, await users.findById(userId))) {
    throw Object.assign(new Error('This contact was added by another parent. You can view it; only that parent or the care team can change or remove it.'), {status:403});
  }
}
export function reminderConsentAttestations({emailEnabled,smsEnabled,emailConsent,smsConsent,userId,email,phone,previous={}}) {
  if (emailEnabled && emailConsent !== true) throw Object.assign(new Error('Attest that this person verbally consented to email appointment reminders.'),{status:400});
  if (smsEnabled && smsConsent !== true) throw Object.assign(new Error('Attest that this person verbally consented to text appointment reminders.'),{status:400});
  if(typeof previous==='string'){try{previous=JSON.parse(previous);}catch{previous={};}}
  const result={...(previous || {})}, stamp={method:'verbal',attestedAt:new Date().toISOString(),attestedByUserId:Number(userId)};
  if(emailEnabled)result.email={...stamp,recipientEmail:String(email||'').trim().toLowerCase()};
  if(smsEnabled)result.sms={...stamp,recipientPhoneHash:contactReminderPhoneHash(phone)};
  return result;
}
