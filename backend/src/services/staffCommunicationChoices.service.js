import { createHash, randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import { getAgencyCampaignPacket } from './smsCampaignPacket.service.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';
import { validateSmsRegistration } from '../utils/smsCompliancePolicy.js';
import { recordSmsPermission, getSmsSender, isSmsSuppressed } from './smsCompliance.service.js';
import { encryptChatText, decryptChatText, isChatEncryptionConfigured } from './chatEncryption.service.js';
import { appendSecurityEvidence } from './securityEvidence.service.js';
import { isStaffCommunicationRole, STAFF_COMMUNICATION_VERSION, STAFF_COMMUNICATION_CHOICES, STAFF_COMMUNICATION_REQUESTS, staffCommunicationKey, phoneFingerprint, validateStaffCommunicationInput, staffDeliveryKinds } from '../utils/staffCommunicationChoices.js';
const parse=v=>typeof v==='string'?JSON.parse(v):(v||{});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');

async function reviewedStaffPermission(program, phone, purpose, agencyId) {
  const sender = await getSmsSender(program.phone_number);
  if (await isSmsSuppressed(sender, phone)) return false;
  const [rows] = await pool.execute(`SELECT 1 FROM sms_recipient_permissions p
    JOIN sms_consent_requests r ON JSON_UNQUOTE(JSON_EXTRACT(p.evidence_json, '$.reference')) = CONCAT('sms_consent_request:', r.id)
    WHERE p.scope_key = ? AND p.phone = ? AND p.purpose = ? AND p.status = 'opted_in'
      AND (p.expires_at IS NULL OR p.expires_at > UTC_TIMESTAMP())
      AND r.agency_id = ? AND r.phone = p.phone AND r.signed_at IS NOT NULL
      AND JSON_EXTRACT(r.activation_json, ?) = TRUE LIMIT 1`,
    [`campaign:${program.campaign_id}`, phone, purpose, agencyId, `$.${purpose}.activated`]);
  return rows.length > 0;
}

async function context(userId,agencyId) {
  if(!Number.isSafeInteger(Number(agencyId))||Number(agencyId)<1)throw fail('Choose an organization');
  const user=await User.findById(userId);
  if(!user || !isStaffCommunicationRole(user.role))throw fail('Staff access required',403);
  const agencies=await User.getAgencies(userId);
  if(!agencies.some(a=>Number(a.id)===Number(agencyId)))throw fail('Organization access denied',403);
  const packet=await getAgencyCampaignPacket(Number(agencyId),'polling');
  const [rows]=await pool.execute(`SELECT n.id,n.phone_number,r.campaign_id,r.registration_json FROM twilio_numbers n JOIN sms_sender_registrations r ON r.number_id=n.id WHERE n.agency_id=? AND n.is_active=TRUE AND n.status <> 'released' ORDER BY n.id`,[agencyId]);
  const programs=[...new Map(rows.map(r=>({...r,registration:parse(r.registration_json)})).filter(r=>r.registration.purposes?.some(p=>['workforce','polling'].includes(p))).map(r=>[r.campaign_id,r])).values()];
  const profile=packet.profile;
  const registeredPolicy=programs.find(p=>validateSmsRegistration(p.registration).length===0)?.registration;
  const policyReady=!!packet.hasPublished||!!registeredPolicy;
  const disclosure={version:STAFF_COMMUNICATION_VERSION,brandName:profile.brandName,legalName:profile.legalName,
    supportContact:profile.supportContact,policyReady,termsUrl:packet.hasPublished?packet.links.termsUrl:(registeredPolicy?.termsUrl||null),privacyUrl:packet.hasPublished?packet.links.privacyUrl:(registeredPolicy?.privacyUrl||null),
    programs:programs.map(p=>({campaignId:p.campaign_id,brandName:p.registration.brandName,termsUrl:p.registration.termsUrl,privacyUrl:p.registration.privacyUrl,purposes:p.registration.purposes.filter(x=>['workforce','polling'].includes(x))})),
    choices:STAFF_COMMUNICATION_CHOICES, accessRequests:STAFF_COMMUNICATION_REQUESTS,
    text:`${profile.brandName} sends only the text categories you choose to your own phone. All choices default to No. Receiving texts is optional and is not a condition of employment or app access. Message frequency varies; message and data rates may apply. Reply HELP for help or contact ${profile.supportContact || 'your organization'}. Reply STOP to stop texts from that campaign; this also stops other categories on the same campaign. You can change your choices here at any time. Carriers are not liable for delayed or undelivered messages. Standard SMS is not end-to-end encrypted. Keep sensitive information in the secure app. These are administrative communications, not an emergency service. Client texts to your assigned business number remain in the app regardless of these personal-phone choices. Choosing No does not disable your app inbox.`,
    future:'Client-message forwarding and replies from your personal phone are not enabled by this form. Call bridging, voicemail, call recording and transcription are not currently available. A phone number or extension does not itself enable these features. Separate setup and disclosures are required before launch.'};
  const [prefs]=await pool.execute(`SELECT notification_categories,
    (SELECT email_enabled FROM user_notification_type_preferences n WHERE n.user_id=user_preferences.user_id AND n.notification_type='kiosk_checkin' LIMIT 1) AS kiosk_email_enabled,
    (SELECT email_enabled FROM user_notification_type_preferences n WHERE n.user_id=user_preferences.user_id AND n.notification_type='client_exchange_match' LIMIT 1) AS exchange_email_enabled,
    (SELECT sms_enabled FROM user_notification_type_preferences n WHERE n.user_id=user_preferences.user_id AND n.notification_type='client_exchange_match' LIMIT 1) AS exchange_sms_enabled
    FROM user_preferences WHERE user_id=?`,[userId]);
  const state=parse(prefs[0]?.notification_categories)[staffCommunicationKey(agencyId)]||null;
  const arrivalEmail=prefs[0]?.kiosk_email_enabled==null?(state?.arrivalEmail??null):Number(prefs[0].kiosk_email_enabled)===1;
  const exchangeEmail=prefs[0]?.exchange_email_enabled==null?(state?.exchangeEmail??null):Number(prefs[0].exchange_email_enabled)===1;
  const exchangeSms=prefs[0]?.exchange_sms_enabled==null?state?.choices?.exchangeMatches:Number(prefs[0].exchange_sms_enabled)===1;
  const phone=normalizeSmsPhone(user.personal_phone||user.work_phone||user.phone_number)||'';
  return {user,programs,disclosure,disclosureHash:digest(disclosure),state,phone,arrivalEmail,exchangeEmail,exchangeSms};
}
export async function getStaffCommunicationChoices({userId,agencyId}) {
  const c=await context(userId,agencyId);
  const activation = await Promise.all((c.state?.activation || []).map(async item => {
    if (!['active', 'pending_review'].includes(item.status)) return item;
    const program = c.programs.find(p => p.campaign_id === item.campaignId);
    if (!program || validateSmsRegistration(program.registration).length) return {...item,status:'pending_campaign'};
    const active = await reviewedStaffPermission(program, c.phone, item.purpose, agencyId);
    return {...item,status:active?'active':'pending_review'};
  }));
  return {agencyId:Number(agencyId),disclosure:c.disclosure,disclosureHash:c.disclosureHash,phone:c.phone,
    choices:{...Object.fromEntries(STAFF_COMMUNICATION_CHOICES.map(x=>[x.key,false])),...c.state?.choices,...(typeof c.exchangeSms==='boolean'?{exchangeMatches:c.exchangeSms}:{})},
    answeredChoices:Object.keys(c.state?.choices||{}),
    arrivalEmail:c.arrivalEmail,exchangeEmail:c.exchangeEmail,
    accessRequests:c.state?.accessRequests||Object.fromEntries(STAFF_COMMUNICATION_REQUESTS.map(x=>[x.key,false])),
    reviewedAt:c.state?.reviewedAt||null,activation,
    needsReview:!c.state||c.state.disclosureHash!==c.disclosureHash||(Object.values(c.state.choices||{}).some(v=>v===true)&&c.state.phoneHash!==phoneFingerprint(c.phone)),
    capabilities:{clientRelay:false,callBridge:false,voicemail:false,recording:false,transcription:false}};
}
export async function saveStaffCommunicationChoices({userId,agencyId,input,source='account',sendConfirmation}) {
  const connection=await pool.getConnection();let locked=false;
  const lock=`staff-communications-${Number(agencyId)}-${Number(userId)}`;
  try {
    const [locks]=await connection.execute('SELECT GET_LOCK(?, 5) AS acquired',[lock]);locked=Number(locks[0]?.acquired)===1;
    if(!locked)throw fail('Your choices are being saved. Please try again.',409);
    const c=await context(userId,agencyId);
    const errors=validateStaffCommunicationInput(input,c.disclosureHash);
    if(typeof input?.arrivalEmail!=='boolean')errors.push('Choose Yes or No for kiosk check-in emails.');
    if(typeof input?.exchangeEmail!=='boolean')errors.push('Choose Yes or No for Client Exchange emails.');
    const anyYes=Object.values(input?.choices||{}).some(v=>v===true);
    const phone=anyYes?(normalizeSmsPhone(input?.phone)||''):c.phone;
    if(anyYes&&!c.disclosure.policyReady)errors.push('Your organization must publish its SMS policies before text enrollment. You may choose No for every category now.');
    if(anyYes&&(!phone||phone!==c.phone))errors.push('Use the phone number saved in your profile, or update your profile first.');
    if(errors.length)throw fail(errors.join(' '));
    if(!isChatEncryptionConfigured())throw fail('Secure consent storage is unavailable. Nothing was saved.',503);
    const reviewedAt=new Date().toISOString(),reference=`staff_communications:${randomUUID()}`;
    const signed={phone,choices:input.choices,accessRequests:input.accessRequests,arrivalEmail:input.arrivalEmail,exchangeEmail:input.exchangeEmail,signerName:input.signerName.trim(),acknowledged:true,disclosure:c.disclosure,disclosureHash:c.disclosureHash,reviewedAt,source};
    const envelope=encryptChatText(JSON.stringify(signed));
    const state={choices:input.choices,accessRequests:input.accessRequests,arrivalEmail:input.arrivalEmail,exchangeEmail:input.exchangeEmail,reviewedAt,phoneHash:phoneFingerprint(phone),disclosureHash:c.disclosureHash,reference,envelope,activation:[]};
    await connection.beginTransaction();
    const evidenceId=await appendSecurityEvidence({requestId:randomUUID(),phase:'completed',userId,method:'PUT',route:'/staff-communication-choices',clientIp:null,ipSource:'not_collected',peerIp:null,
      action:'staff_communication_choices_signed',outcome:'success',statusCode:200,details:{agencyId:Number(agencyId),reference,envelope}},connection,{mirror:false});
    state.evidenceId=evidenceId;
    await writeState(connection,userId,agencyId,state);
    await connection.execute(`INSERT INTO user_notification_type_preferences (user_id,notification_type,in_app_enabled,email_enabled)
      VALUES (?,'kiosk_checkin',1,?) ON DUPLICATE KEY UPDATE in_app_enabled=1,email_enabled=VALUES(email_enabled)`,[userId,input.arrivalEmail?1:0]);
    await connection.execute(`INSERT INTO user_notification_type_preferences (user_id,notification_type,in_app_enabled,email_enabled,sms_enabled)
      VALUES (?,'client_exchange_match',1,?,?) ON DUPLICATE KEY UPDATE in_app_enabled=1,email_enabled=VALUES(email_enabled),sms_enabled=VALUES(sms_enabled)`,[userId,input.exchangeEmail?1:0,input.choices.exchangeMatches?1:0]);
    // Personal-phone forwarding never becomes enabled as a side effect of consent.
    await connection.execute('UPDATE user_preferences SET sms_forwarding_enabled=FALSE WHERE user_id=?',[userId]);
    await connection.commit();
    const old=c.state?.envelope?JSON.parse(decryptChatText(c.state.envelope)):null;
    const oldPhone=normalizeSmsPhone(old?.phone);
    const kinds=staffDeliveryKinds(input.choices);
    for(const program of c.programs) {
      for(const purpose of program.registration.purposes.filter(p=>['workforce','polling'].includes(p))) {
        const enabled=purpose==='polling'?input.choices.polling:kinds.length>0;
        const evidence={source:'web_form',reference,signatureReference:reference,disclosure:c.disclosure.text,disclosureHash:c.disclosureHash,collectedAt:reviewedAt,signerVerified:true,
          ...(purpose==='workforce'?{staffDeliveryKinds:kinds}:{}),evidenceId};
        if(oldPhone&&oldPhone!==phone)await recordSmsPermission({scope:`campaign:${program.campaign_id}`,phone:oldPhone,purpose,status:'opted_out',evidence:{source:'staff_phone_changed',reference}});
        const target=phone||oldPhone;
        if(!target)continue;
        if(!enabled) {
          await recordSmsPermission({scope:`campaign:${program.campaign_id}`,phone:target,purpose,status:'opted_out',evidence});
          state.activation.push({campaignId:program.campaign_id,purpose,status:'off'});continue;
        }
        if(validateSmsRegistration(program.registration).length) {state.activation.push({campaignId:program.campaign_id,purpose,status:'pending_campaign'});continue;}
        // The registered flow promises administrator review. Saving personal
        // preferences never self-approves enrollment or overwrites its evidence.
        const reviewed = await reviewedStaffPermission(program, target, purpose, agencyId);
        state.activation.push({campaignId:program.campaign_id,purpose,status:reviewed?'active':'pending_review'});
      }
    }
    for (const purpose of [ ...(kinds.length ? ['workforce'] : []), ...(input.choices.polling ? ['polling'] : []) ]) {
      if (!c.programs.some(program=>program.registration.purposes.includes(purpose))) state.activation.push({purpose,status:'pending_campaign'});
    }
    await writeState(connection,userId,agencyId,state);
    if(kinds.length)await connection.execute('UPDATE user_preferences SET sms_enabled=TRUE WHERE user_id=?',[userId]);
    return getStaffCommunicationChoices({userId,agencyId});
  } catch(error) {await connection.rollback();throw error;}
  finally {try{if(locked)await connection.execute('SELECT RELEASE_LOCK(?)',[lock]);}finally{connection.release();}}
}
async function writeState(db,userId,agencyId,state) {
  const key=staffCommunicationKey(agencyId),serialized=JSON.stringify(state);
  await db.execute(`INSERT INTO user_preferences (user_id,notification_categories,sms_enabled,sms_forwarding_enabled)
    VALUES (?,JSON_OBJECT(?,CAST(? AS JSON)),FALSE,FALSE) ON DUPLICATE KEY UPDATE notification_categories=JSON_SET(COALESCE(notification_categories,JSON_OBJECT()),?,CAST(? AS JSON)),updated_at=CURRENT_TIMESTAMP`,[userId,key,serialized,`$.${key}`,serialized]);
}
