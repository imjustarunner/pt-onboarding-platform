import { randomBytes, createHash } from 'node:crypto';
import pool from '../config/database.js';
import { familyNotificationInvitationContext, familyContactHash, currentRecipient, persistFamilyNotificationChoices } from './familyNotificationChoices.service.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';
import { encryptChatText, decryptChatText } from './chatEncryption.service.js';
import { clientStartPurposes } from './clientSmsStartConsent.service.js';
import { getSmsSender, resolveRegisteredSmsSender } from './smsCompliance.service.js';

export const QUICK_TEXT_VERSION = '2026-11-18.1';
export const QUICK_TEXT_DISCLOSURE = 'I request email and text updates about forms, secure messages, schedule changes and appointment reminders for this client from this agency. I control the phone number entered here. Texting is optional and does not affect care. No marketing is included. Frequency varies; message and data rates may apply. Reply STOP to stop or HELP for help. Send START from this phone to confirm and activate both appointment reminders and care notifications. My phone is updated only after that confirmation. Other clients and guardians keep their own choices.';
const fail = (message, status=400) => Object.assign(new Error(message),{status});
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const hash = text => createHash('sha256').update(text).digest('hex');

export async function quickTextContext(token, {loadContext=familyNotificationInvitationContext,resolveSender=resolveRegisteredSmsSender,loadSender=getSmsSender}={}) {
  const context=await loadContext(token);
  const from=await resolveSender({agencyId:context.scope.agency_id,purpose:'reminders',requiredPurpose:'care'});
  const sender=from ? await loadSender(from) : null;
  if (!sender || Number(sender.agency_id)!==Number(context.scope.agency_id) || clientStartPurposes(sender).length!==2) {
    throw fail('Text enrollment is not currently available. You can still complete your school release and use your portal.',409);
  }
  return {...context,sender};
}

// The email capability can request preferences, but cannot activate a phone or
// change account contact details. Only a later authenticated carrier START can.
export async function requestQuickFamilyTexts({token,input,ip,userAgent}, {db=pool,loadContext=quickTextContext}={}) {
  if (input?.confirm!=='yes' || input.version!==QUICK_TEXT_VERSION) throw fail('Review and confirm the opt-in disclosure.');
  const phone=normalizeSmsPhone(input.phone);
  if (!phone) throw fail('Enter a valid mobile phone number.');
  const current=await loadContext(token),s=current.scope;
  if (Number(input.revision)!==current.revision) throw fail('Your choices changed. Open the email link again before continuing.',409);
  const payload={scope:s,choices:current.choices,revision:current.revision,priorPhoneHash:familyContactHash(normalizeSmsPhone(current.recipient.phone)),
    phone,requestedAt:new Date().toISOString(),ip,userAgent:String(userAgent||'').slice(0,500)};
  const disclosure={enrollmentCategory:'family_quick_start',version:QUICK_TEXT_VERSION,text:QUICK_TEXT_DISCLOSURE,
    brandName:current.sender.registration.brandName,termsUrl:current.sender.registration.termsUrl,privacyUrl:current.sender.registration.privacyUrl,
    purposes:[{purpose:'care'},{purpose:'reminders'}]};
  const serialized=JSON.stringify(disclosure),sealed=JSON.stringify(encryptChatText(JSON.stringify(payload)));
  await db.execute(`INSERT INTO sms_consent_requests (agency_id,number_id,phone,signer_role,token_hash,disclosure_json,disclosure_hash,
    created_by_user_id,expires_at,signed_at,signed_payload_json) VALUES (?,?,?,'guardian',?,?,?,NULL,LEAST(?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 14 DAY)),UTC_TIMESTAMP(),?)`,
    [s.agency_id,current.sender.id,phone,hash(randomBytes(32).toString('hex')),serialized,hash(serialized),s.expires_at,sealed]);
  return {pendingStart:true,phoneLastFour:phone.slice(-4),senderNumber:current.sender.phone_number,
    smsUrl:`sms:${current.sender.phone_number}?body=START`};
}

// Runs inside the authenticated START transaction and phone consent lock.
export async function activateQuickFamilyTexts({sender,phone,messageId,receivedAt},db) {
  const [rows]=await db.execute(`SELECT id,signed_payload_json FROM sms_consent_requests WHERE agency_id=? AND number_id=? AND phone=?
    AND JSON_UNQUOTE(JSON_EXTRACT(disclosure_json,'$.enrollmentCategory'))='family_quick_start'
    AND signed_at IS NOT NULL AND activation_json IS NULL AND expires_at>UTC_TIMESTAMP() ORDER BY id DESC LIMIT 20 FOR UPDATE`,
    [sender.agency_id,sender.id,phone]);
  for (const row of rows) {
    const payload=JSON.parse(decryptChatText(parse(row.signed_payload_json))),s=payload.scope;
    if (receivedAt<Date.parse(payload.requestedAt) || payload.phone!==phone || Number(s.agency_id)!==Number(sender.agency_id)) continue;
    const [[invitation]]=await db.execute('SELECT id FROM family_notification_invitations WHERE id=? AND token_hash=? AND expires_at>UTC_TIMESTAMP()',[s.id,s.token_hash]);
    if (!invitation) continue;
    await db.execute('SELECT id FROM clients WHERE id=? FOR UPDATE',[s.client_id]);
    let recipient;
    try { recipient=await currentRecipient(s,db); } catch(error) { if(error.status===410)continue;throw error; }
    // Lock preferences and the account before checking for a later decline or
    // contact correction. An old email request never replaces either one.
    const [[account]]=await db.execute('SELECT phone_number,personal_phone,work_phone FROM users WHERE id=? FOR UPDATE',[s.guardian_user_id]);
    const existingPhone=normalizeSmsPhone(account?.phone_number||account?.personal_phone||account?.work_phone);
    const [[saved]]=await db.execute('SELECT revision FROM family_notification_choices WHERE agency_id=? AND client_id=? AND guardian_user_id=? FOR UPDATE',[s.agency_id,s.client_id,s.guardian_user_id]);
    if ((Number(saved?.revision)||0)!==payload.revision || familyContactHash(existingPhone)!==payload.priorPhoneHash) continue;
    const choices={...payload.choices,appointments:'both',schedule_changes:'both',messages:'both',documents:'both',
      school_sessions:recipient.client_type==='school'?'both':'off'};
    await db.execute('UPDATE users SET phone_number=? WHERE id=?',[phone,s.guardian_user_id]);
    await persistFamilyNotificationChoices({scope:s,recipient:{...recipient,phone},choices,revision:payload.revision+1,
      version:QUICK_TEXT_VERSION,disclosure:QUICK_TEXT_DISCLOSURE},db);
    await db.execute('UPDATE sms_consent_requests SET activation_json=? WHERE id=? AND activation_json IS NULL',
      [JSON.stringify({activated:true,actor:'carrier-confirmed family opt-in automation',messageId,activatedAt:new Date(receivedAt).toISOString(),guardianUserId:s.guardian_user_id,clientId:s.client_id}),row.id]);
    await db.execute(`INSERT INTO user_activity_log (action_type,user_id,user_agent,agency_id,metadata)
      VALUES ('guardian_text_opt_in',NULL,'Carrier-confirmed family opt-in automation',?,?)`,
      [s.agency_id,JSON.stringify({actor:{kind:'automation',source:'verified_carrier_start'},clientId:s.client_id,guardianUserId:s.guardian_user_id,consentRequestId:row.id,messageId,phoneLastFour:phone.slice(-4)})]);
  }
}
