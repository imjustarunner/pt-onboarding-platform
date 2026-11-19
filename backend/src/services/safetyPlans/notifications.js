import pool from '../../config/clinicalDatabase.js';
import main from '../../config/database.js';
import {recipientAccess} from './access.js';
import {guardianReminderPreferences} from '../guardianAppointments.service.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import {resolveRegisteredSmsSender} from '../smsCompliance.service.js';
import {normalizeSmsPhone} from '../../utils/smsThreadIdentity.js';
import Vonage from '../vonage.service.js';
import {shareEventStillOpen} from '../portalShareNotice.service.js';
import {clientEmailContext,sendClientPortalEmail} from '../clientPortalEmail.service.js';
import {familyEnrollmentContext,portalUrlWithLocale} from '../familyPortalLocale.service.js';
import {familyNotificationDeliveryGate} from '../familyNotificationChoices.service.js';
import {portalMessageHtml} from '../portalEmailBranding.service.js';
export function clinicalPortalNotice({agencyName,portalUrl,locale='en'}) {
 const spanish=locale==='es';
 const subject=spanish?'Hay documentos y formularios esperando en su portal':'Documents and forms are waiting in your portal';
 const introduction=spanish
  ? `${agencyName} ha compartido documentos o formularios con usted en AuricWell. Inicie sesión para revisar, completar o firmar los elementos que le esperan.`
  : `${agencyName} has shared documents or forms with you in AuricWell. Sign in to review, complete, or sign the items waiting for you.`;
 const privacy=spanish?'Mantenga su información personal y clínica dentro del portal seguro.':'Please keep personal and clinical information inside the secure portal.';
 const linkLabel=spanish?'Abrir documentos y formularios':'Open documents & forms';
 const text=`${introduction}\n\n${portalUrl}\n\n${privacy}`;
 return {subject,text,locale,linkLabel,html:portalMessageHtml({text,linkUrl:portalUrl,linkLabel})};
}
async function contextFor(batch,db) {
 const [shares]=await db.execute(`SELECT p.*,s.signer_kind FROM clinical_form_signers s
  JOIN clinical_form_records p ON p.id=s.plan_id
  WHERE p.agency_id=? AND s.recipient_user_id=? AND s.revoked_at IS NULL AND s.signed_at IS NULL
  AND s.version=p.current_version AND s.portal_shared_at>=FROM_UNIXTIME(?)
  AND s.portal_shared_at<FROM_UNIXTIME(?+1800)`,[batch.agency_id,batch.recipient_user_id,batch.batch_key,batch.batch_key]);
 let share;
 for(const candidate of shares){try{await recipientAccess(candidate,batch.recipient_user_id,candidate.signer_kind);share=candidate;break;}catch(e){if(![403,404].includes(e.status))throw e;}}
 let shareEvent=null;
 if(!share && process.env.CLIENT_UPDATE_WORKFLOWS_ENABLED==='true') {
  const [events]=await main.execute(`SELECT * FROM client_portal_share_events WHERE agency_id=? AND recipient_user_id=?
    AND created_at>=FROM_UNIXTIME(?) AND created_at<FROM_UNIXTIME(?+1800) ORDER BY id DESC`,[batch.agency_id,batch.recipient_user_id,batch.batch_key,batch.batch_key]);
  const {currentClientUpdateRecipient}=await import('../clientUpdate.service.js');
  const [[recipient]]=await main.execute('SELECT email FROM users WHERE id=? AND is_active=1',[batch.recipient_user_id]);
  for(const event of events) {
   if(!await shareEventStillOpen(event,main))continue;
   try{await currentClientUpdateRecipient({agencyId:batch.agency_id,clientId:event.client_id,to:recipient?.email,guardianUserId:batch.recipient_user_id});
    const gate=await familyNotificationDeliveryGate({agencyId:batch.agency_id,clientId:event.client_id,to:recipient?.email,channel:'email',templateType:'client_portal_share'});
    if(!gate.allowed)continue;
    shareEvent=event;share={client_id:event.client_id,agency_id:batch.agency_id};break;}
   catch(error){if(![403,404,409].includes(error.status))throw error;}
  }
 }
 if(!share)return null;
 const [[recipient]]=await main.execute('SELECT email FROM users WHERE id=? AND is_active=1',[batch.recipient_user_id]);
 const [[agency]]=await main.execute('SELECT name,slug FROM agencies WHERE id=?',[batch.agency_id]);
 if(!recipient||!agency)return null;
 const mail=await clientEmailContext({agencyId:batch.agency_id,clientId:share.client_id});
 const {locale}=await familyEnrollmentContext(batch.recipient_user_id,batch.agency_id);
 const currentUrl=new URL(mail.url('guardian'));
 currentUrl.searchParams.set('panel','documents');
 currentUrl.searchParams.set('clientId',String(share.client_id));
 const portalUrl=portalUrlWithLocale(currentUrl.toString(),locale);
 return {share,recipient,agency,portalUrl,shareEvent,mail,locale};
}
async function deliverEmail(batch,context) {
 if(!context.recipient.email)return {skipped:true};
 const templateType=context.shareEvent?'client_portal_share':'clinical_portal_documents';
 const gate=await familyNotificationDeliveryGate({agencyId:batch.agency_id,clientId:context.share.client_id,
  to:context.recipient.email,channel:'email',templateType,notificationCategory:'documents'});
 if(!gate.allowed)return {skipped:true,reason:gate.reason};
 return sendClientPortalEmail({agencyId:batch.agency_id,clientId:context.share.client_id,context:context.mail,to:context.recipient.email,
  ...clinicalPortalNotice({agencyName:context.agency.name,portalUrl:context.portalUrl,locale:context.locale}),
  userId:batch.recipient_user_id,templateType,linkUrl:context.portalUrl,source:'auto'});
}
async function deliverSms(batch,context) {
 if(context.shareEvent)return {skipped:true,reason:'portal_share_email_only'};
 const preferences=await guardianReminderPreferences({userId:batch.recipient_user_id,clientId:context.share.client_id});
 if(preferences.channels?.sms!==true||preferences.providerPushedUpdatesEnabled===false)return {skipped:true};
 const contacts=await ClientGuardian.listForClient(context.share.client_id);
 const to=normalizeSmsPhone(contacts.find(c=>Number(c.guardian_user_id)===Number(batch.recipient_user_id))?.phone);
 if(!to)return {skipped:true};
 const from=await resolveRegisteredSmsSender({agencyId:batch.agency_id,purpose:'reminders'});
 if(!from)return {skipped:true};
 // Transport rechecks campaign registration, purpose-specific consent and STOP at send time.
 return Vonage.sendSms({agencyId:batch.agency_id,purpose:'reminders',from,to,
  body:context.locale==='es'
   ? `${context.agency.name}: Hay documentos o formularios esperando en su portal AuricWell. Revise, complete o firme aquí: ${context.portalUrl}`
   : `${context.agency.name}: Documents or forms are waiting in your AuricWell portal. Review, complete or sign them securely: ${context.portalUrl}`});
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
   let state='review',reference=null,transportStarted=false;
   try{
    // Re-read the live grant separately before each channel, including after email delivery.
    const current=await context(batch,db);
    if(!current)state='skipped';
    else{
     transportStarted=true;
     const result=await (channel==='email'?email:sms)(batch,current);
     reference=result?.id||result?.sid||null;
     state=result?.skipped||result?.blocked?'skipped':reference&&!result?.redirected&&!result?.queued?'sent':'review';
    }
   }catch(e){
    const connectionFailure=['PROTOCOL_CONNECTION_LOST','ECONNRESET','ECONNREFUSED','ETIMEDOUT','ER_CON_COUNT_ERROR'].includes(e.code);
    if(!transportStarted && connectionFailure)state='pending';
    console.warn('[Clinical form notification]',channel,state==='pending'?'retry pending':'requires review',e.code||'delivery_failed');
   }
   await db.execute(`UPDATE clinical_form_notification_batches SET ${channel}_state=?,${channel}_provider_ref=? WHERE id=? AND batch_key=?`,[state,reference?String(reference).slice(0,255):null,batch.id,batch.batch_key]);
  }
 };
}
export const processClinicalFormNotifications=createClinicalFormNotifier();
