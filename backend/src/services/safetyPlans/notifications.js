import pool from '../../config/clinicalDatabase.js';
import main from '../../config/database.js';
import {recipientAccess} from './access.js';
import {ensureTenantFormsMailbox} from '../tenantMessageMailboxes.service.js';
import {sendEmailFromIdentity} from '../unifiedEmail/unifiedEmailSender.service.js';
import {guardianReminderPreferences} from '../guardianAppointments.service.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import {resolveRegisteredSmsSender} from '../smsCompliance.service.js';
import {normalizeSmsPhone} from '../../utils/smsThreadIdentity.js';
import Vonage from '../vonage.service.js';
const escape=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function clinicalPortalNotice({agencyName,portalUrl}) {
 const subject='Documents and forms are ready in your portal';
 return {subject,text:`${agencyName} has shared documents or forms with you in AuricWell. Sign in to review, complete, or sign the items available to you.\n\nOpen your secure portal: ${portalUrl}\n\nPlease keep personal and clinical information inside the secure portal.`,
 html:`<div style="font-family:Arial,sans-serif;padding:24px;color:#183d39"><p style="font-size:20px;font-weight:bold">AuricWell <span style="font-weight:normal;font-size:14px">· ${escape(agencyName)}</span></p><h1 style="font-size:25px">Your documents and forms are ready</h1><p style="line-height:1.6">Your care team has shared documents or forms with you. Open your secure portal to review, complete, or sign the items available to you.</p><p style="margin:28px 0"><a href="${escape(portalUrl)}" style="background:#175b48;color:white;padding:14px 20px;border-radius:7px;text-decoration:none">Open documents &amp; forms</a></p><p style="font-size:12px;line-height:1.6">Please keep personal and clinical information inside the secure portal.</p></div>`};
}
async function contextFor(batch,db) {
 const [shares]=await db.execute(`SELECT p.*,s.signer_kind FROM clinical_form_signers s
  JOIN clinical_form_records p ON p.id=s.plan_id
  WHERE p.agency_id=? AND s.recipient_user_id=? AND s.revoked_at IS NULL AND s.signed_at IS NULL
  AND s.version=p.current_version AND s.portal_shared_at>=FROM_UNIXTIME(?)
  AND s.portal_shared_at<FROM_UNIXTIME(?+1800)`,[batch.agency_id,batch.recipient_user_id,batch.batch_key,batch.batch_key]);
 let share;
 for(const candidate of shares){try{await recipientAccess(candidate,batch.recipient_user_id,candidate.signer_kind);share=candidate;break;}catch(e){if(![403,404].includes(e.status))throw e;}}
 if(!share)return null;
 const [[recipient]]=await main.execute('SELECT email FROM users WHERE id=? AND is_active=1',[batch.recipient_user_id]);
 const [[agency]]=await main.execute('SELECT name,slug FROM agencies WHERE id=?',[batch.agency_id]);
 if(!recipient||!agency)return null;
 const base=String(process.env.APP_PUBLIC_URL||process.env.FRONTEND_URL||'https://plottwisthq.com').replace(/\/$/,'');
 const portalUrl=`${base}/${encodeURIComponent(agency.slug)}/guardian?panel=documents&clientId=${share.client_id}`;
 return {share,recipient,agency,portalUrl};
}
async function deliverEmail(batch,context) {
 if(!context.recipient.email)return {skipped:true};
 const {forms,domain}=await ensureTenantFormsMailbox(batch.agency_id);
 return sendEmailFromIdentity({senderIdentityId:forms.id,to:context.recipient.email,
  ...clinicalPortalNotice({agencyName:context.agency.name,portalUrl:context.portalUrl}),
  fromDisplayNameOverride:`${context.agency.name} · AuricWell`,replyToOverride:`support@${domain}`,
  userId:batch.recipient_user_id,clientId:context.share.client_id,templateType:'clinical_portal_documents',
  linkUrl:context.portalUrl,source:'auto',usedFallbackSender:false});
}
async function deliverSms(batch,context) {
 const preferences=await guardianReminderPreferences({userId:batch.recipient_user_id,clientId:context.share.client_id});
 if(preferences.channels?.sms!==true||preferences.providerPushedUpdatesEnabled===false)return {skipped:true};
 const contacts=await ClientGuardian.listForClient(context.share.client_id);
 const to=normalizeSmsPhone(contacts.find(c=>Number(c.guardian_user_id)===Number(batch.recipient_user_id))?.phone);
 if(!to)return {skipped:true};
 const from=await resolveRegisteredSmsSender({agencyId:batch.agency_id,purpose:'reminders'});
 if(!from)return {skipped:true};
 // Transport rechecks campaign registration, purpose-specific consent and STOP at send time.
 return Vonage.sendSms({agencyId:batch.agency_id,purpose:'reminders',from,to,
  body:`${context.agency.name}: Documents or forms are ready in your AuricWell portal. Review, complete or sign them securely: ${context.portalUrl}`});
}
export function createClinicalFormNotifier({db=pool,context=contextFor,email=deliverEmail,sms=deliverSms}={}) {
 return async function process({limit=20}={}) {
  // An interrupted transport is ambiguous: require review instead of automatically sending twice.
  await db.execute(`UPDATE clinical_form_notification_batches SET email_state=IF(email_state='sending','review',email_state),sms_state=IF(sms_state='sending','review',sms_state)
   WHERE updated_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 10 MINUTE) AND (email_state='sending' OR sms_state='sending')`);
  const [batches]=await db.execute(`SELECT * FROM clinical_form_notification_batches WHERE available_at<=UTC_TIMESTAMP()
   AND (email_state='pending' OR sms_state='pending') ORDER BY id LIMIT ${Math.min(50,Math.max(1,Math.floor(Number(limit)||20)))}`);
  for(const batch of batches)for(const channel of ['email','sms']){
   if(batch[`${channel}_state`]!=='pending')continue;
   const [claim]=await db.execute(`UPDATE clinical_form_notification_batches SET ${channel}_state='sending' WHERE id=? AND batch_key=? AND ${channel}_state='pending'`,[batch.id,batch.batch_key]);
   if(!claim.affectedRows)continue;
   let state='review',reference=null;
   try{
    // Re-read the live grant separately before each channel, including after email delivery.
    const current=await context(batch,db);
    if(!current)state='skipped';
    else{
     const result=await (channel==='email'?email:sms)(batch,current);
     reference=result?.id||result?.sid||null;
     state=result?.skipped||result?.blocked?'skipped':reference&&!result?.redirected&&!result?.queued?'sent':'review';
    }
   }catch(e){console.warn('[Clinical form notification]',channel,'requires review',e.code||'delivery_failed');}
   await db.execute(`UPDATE clinical_form_notification_batches SET ${channel}_state=?,${channel}_provider_ref=? WHERE id=? AND batch_key=?`,[state,reference?String(reference).slice(0,255):null,batch.id,batch.batch_key]);
  }
 };
}
export const processClinicalFormNotifications=createClinicalFormNotifier();
