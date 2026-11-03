import pool from '../config/database.js';
import QRCode from 'qrcode';
import Notification from '../models/Notification.model.js';
import { requireReadySender } from './familyLedger/senders.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { billingError, auditBilling } from './familyBillingPolicy.service.js';
import { clientPaymentSetup, paymentSetupEmail, paymentSetupReviewHash } from './clientPaymentSetup.service.js';

const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
export function confirmedPaymentEmail(result) {
  return !!result?.id && !['skipped','blocked','queued','redirected'].some(key => result[key]);
}
export async function paymentFollowupPreview(agencyId, clientId, {db=pool, setup=clientPaymentSetup, sender=requireReadySender, ignoreRequestId=null}={}) {
  const context = await setup(agencyId,clientId,db);
  const {summary,client} = context;
  const blockers = [];
  if(summary.medicaid)blockers.push('Medicaid clients do not require a payment method.');
  else if(!summary.paymentMethodNeeded)blockers.push(summary.cardOnFile?'A payment method is already on file.':'Record the client’s coverage before requesting payment setup.');
  if(!summary.secureCollectionAvailable)blockers.push('Activate this organization’s secure Stripe payment setup first.');
  let identity;
  try {identity=await sender(agencyId,'billing');} catch(e) {if(!e.status)throw e;blockers.push(e.message);}
  const families = (context.payers.length?context.payers:context.eligible).map(row=>({userId:Number(row.guardian_user_id),kind:'family',name:[row.first_name,row.last_name].filter(Boolean).join(' '),email:String(row.email||'').trim()}));
  const [rows]=await db.execute(`SELECT DISTINCT u.id,u.first_name,u.last_name,COALESCE(NULLIF(u.work_email,''),u.email) AS email
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
    WHERE COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND
      (EXISTS(SELECT 1 FROM client_provider_assignments a WHERE a.client_id=? AND a.provider_user_id=u.id AND a.is_active=1)
       OR EXISTS(SELECT 1 FROM clients c WHERE c.id=? AND c.agency_id=? AND c.provider_id=u.id))`,[agencyId,clientId,clientId,agencyId]);
  const providers=rows.map(row=>({userId:Number(row.id),kind:'provider',name:[row.first_name,row.last_name].filter(Boolean).join(' '),email:String(row.email||'').trim()}));
  const recipients=[...new Map([...families,...providers].map(row=>[`${row.kind}:${row.userId}`,row])).values()];
  if(!families.length)blockers.push('Link an authorized responsible payer before requesting payment setup.');
  if(!providers.length)blockers.push('Assign a provider before sending the provider QR follow-up.');
  if(recipients.some(row=>!validEmail(row.email)))blockers.push('An intended recipient has no valid email address. Correct the contact information first.');
  const [[last]]=await db.execute('SELECT created_at FROM client_payment_setup_requests WHERE agency_id=? AND client_id=? AND id<>? ORDER BY id DESC LIMIT 1',[agencyId,clientId,Number(ignoreRequestId)||0]);
  if(last && Date.now()-new Date(last.created_at).getTime()<86400000)blockers.push('A payment follow-up was already requested in the last 24 hours. Review its delivery history before sending another.');
  const reviewHash=paymentSetupReviewHash({agencyId,clientId,summary,recipients,senderId:identity?.id,from:identity?.from_email||null});
  return {clientName:client.full_name||client.initials||'Client',summary,recipients,blockers,ready:!blockers.length,reviewHash,senderId:identity?.id,from:identity?.from_email||null};
}

/** Recipient outcomes are persisted before/after each side effect. Replaying a
 * request key returns its saved result; ambiguous deliveries are never retried. */
export async function sendPaymentFollowup({agencyId,clientId,userId,requestKey,reviewHash},deps={}) {
  const db=deps.db||pool,preview=deps.preview||paymentFollowupPreview,send=deps.send||sendEmailFromIdentity,notify=deps.notify||((value)=>Notification.coalesceOrCreate(value)),qr=deps.qr||(url=>QRCode.toBuffer(url,{type:'png',width:480,margin:4,errorCorrectionLevel:'M',color:{dark:'#173249',light:'#ffffff'}}));
  if(!/^[a-zA-Z0-9_-]{16,100}$/.test(String(requestKey||'')))throw billingError(400,'A unique request key is required.');
  const conn=await db.getConnection();let locked=false;
  const lockKey=`payment-setup:${agencyId}:${clientId}`;
  try {
    const [[lock]]=await conn.execute('SELECT GET_LOCK(?,5) AS acquired',[lockKey]);locked=Number(lock.acquired)===1;
    if(!locked)throw billingError(409,'Payment follow-up is already being processed.');
    const [[existing]]=await conn.execute('SELECT id,client_id,status FROM client_payment_setup_requests WHERE agency_id=? AND request_key=?',[agencyId,requestKey]);
    if(existing){
      if(Number(existing.client_id)!==Number(clientId))throw billingError(409,'This request key belongs to a different client.');
      return paymentFollowupResult(existing.id,conn);
    }
    const current=await preview(agencyId,clientId,{db});
    if(!current.ready)throw Object.assign(billingError(409,current.blockers.join(' ')),{code:'PAYMENT_SETUP_REVIEW_REQUIRED'});
    if(current.reviewHash!==reviewHash)throw Object.assign(billingError(409,'Recipients or payment setup changed. Review the request again.'),{code:'PAYMENT_SETUP_REVIEW_REQUIRED'});
    const image=await qr(current.summary.paymentUrl);
    const [insert]=await conn.execute('INSERT INTO client_payment_setup_requests (agency_id,client_id,requested_by_user_id,request_key,review_hash) VALUES (?,?,?,?,?)',[agencyId,clientId,userId,requestKey,reviewHash]);
    const requestId=insert.insertId;
    let familyNotified=true;
    for(const recipient of current.recipients){
      const [delivery]=await conn.execute('INSERT INTO client_payment_setup_deliveries (request_id,recipient_user_id,recipient_kind,status) VALUES (?,?,?,?)',[requestId,recipient.userId,recipient.kind,'sending']);
      let status='unknown',communicationId=null,notificationId=null;
      // Recipient access, Medicaid status and payment setup may change while a
      // preceding message is in flight. Recheck before each new side effect.
      let stillCurrent=false;
      try {
        const fresh=await preview(agencyId,clientId,{db,ignoreRequestId:requestId});
        stillCurrent=fresh.ready&&fresh.reviewHash===current.reviewHash;
      } catch { /* Missing access or unreadable coverage holds the next message. */ }
      try {
        if(!stillCurrent||(recipient.kind==='provider'&&!familyNotified))status='held';
        else {
          if(recipient.kind==='family'){
            const notification=await notify({type:'payment_setup_required',severity:'warning',title:'Payment setup requested',message:'Billing asks you to sign in and open Payment methods to add a payment method. Contact Billing if you need help or wish to discuss an arrangement.',userId:recipient.userId,agencyId,relatedEntityType:'client',relatedEntityId:clientId,actorUserId:userId,actorSource:'billing'});
            notificationId=notification?.id||notification;
          }
          const result=await send({senderIdentityId:current.senderId,to:recipient.email,...paymentSetupEmail({clientName:current.clientName,url:current.summary.paymentUrl,provider:recipient.kind==='provider',familyNotified}),attachments:[{filename:'fundthred-payment-setup.png',contentType:'image/png',contentId:'payment-setup-qr',contentBase64:image.toString('base64')}],generatedByUserId:userId,userId:recipient.userId,clientId,source:'manual',templateType:'payment_setup_required',replyToOverride:current.from});
          communicationId=result?.communicationId||null;
          status=confirmedPaymentEmail(result)?'sent':result?.redirected?'test_redirected':result?.queued?'queued':'held';
        }
      } catch(error) {
        // The mail transport may have accepted a message before a timeout.
        // Keep that outcome unknown rather than sending another copy.
        status='unknown';
      }
      if(recipient.kind==='family'&&(status!=='sent'||!notificationId))familyNotified=false;
      await conn.execute('UPDATE client_payment_setup_deliveries SET status=?,communication_id=?,notification_id=?,completed_at=NOW(6) WHERE id=?',[status,communicationId,notificationId,delivery.insertId]);
    }
    await conn.execute("UPDATE client_payment_setup_requests SET status='completed',completed_at=NOW(6) WHERE id=?",[requestId]);
    await auditBilling({agencyId,clientId,userId,action:'payment_setup_requested',objectId:requestId},conn);
    return paymentFollowupResult(requestId,conn);
  } finally {if(locked)await conn.execute('SELECT RELEASE_LOCK(?)',[lockKey]);conn.release();}
}
export async function paymentFollowupResult(requestId,db=pool){
  const [[request]]=await db.execute('SELECT id,status,created_at FROM client_payment_setup_requests WHERE id=?',[requestId]);
  const [deliveries]=await db.execute('SELECT recipient_user_id AS userId,recipient_kind AS kind,status,communication_id AS communicationId,notification_id AS notificationId FROM client_payment_setup_deliveries WHERE request_id=? ORDER BY id',[requestId]);
  return {...request,deliveries};
}
