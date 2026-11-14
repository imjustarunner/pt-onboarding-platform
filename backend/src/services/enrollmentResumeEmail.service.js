import crypto from 'node:crypto';
import pool from '../config/database.js';
import UserCommunication from '../models/UserCommunication.model.js';
import {sendEnrollmentPortalEmail} from './enrollmentPortalEmail.service.js';
import {buildPublicPortalBaseUrl} from '../utils/publicPortalUrl.js';
import Agency from '../models/Agency.model.js';
import {isValidEnrollmentEmail} from '../../../frontend/src/navigation/tutoringEnrollmentPolicy.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const type='enrollment_resume_requested';

export function createEnrollmentResumeEmail({db=pool,communications=UserCommunication,send=sendEnrollmentPortalEmail,agencies=Agency}={}) {
 return async function request({agencyId,link,submission,sessionToken}) {
  const email=String(submission.intake_data?.guardian?.email||submission.signer_email||'').trim().toLowerCase();
  if(!isValidEnrollmentEmail(email))throw fail(400,'Enter a valid email address and save your enrollment before requesting a return link.');
  if(!['started','consented'].includes(String(submission.status))||submission.submitted_at)throw fail(409,'This enrollment is already complete. Sign in to your portal instead.');
  const conn=await db.getConnection();let locked=false,receipt=null,sending=false,transmission=null;
  const lock=`resume-email:${crypto.createHash('sha256').update(`${agencyId}:${submission.id}`).digest('hex').slice(0,40)}`;
  try {
   const [[claim]]=await conn.execute('SELECT GET_LOCK(?,5) AS acquired',[lock]);
   if(!Number(claim?.acquired))throw fail(409,'Your return-link request is being processed. Wait before trying again.');
   locked=true;
   const [[current]]=await conn.execute('SELECT status,submitted_at,signer_email,session_token,draft_expires_at FROM intake_submissions WHERE id=? AND intake_link_id=?',[submission.id,link.id]);
   if(!current||!['started','consented'].includes(current.status)||current.submitted_at||current.session_token!==sessionToken||String(current.signer_email||'').trim().toLowerCase()!==email||current.draft_expires_at&&+new Date(current.draft_expires_at)<=Date.now())throw fail(409,'This saved enrollment changed or expired. Refresh it before requesting a return link.');
   const [[prior]]=await conn.execute(`SELECT id,delivery_status,external_message_id FROM user_communications WHERE agency_id=? AND template_type=? AND recipient_address=?
     AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.intakeSubmissionId'))=? AND generated_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 10 MINUTE) ORDER BY id DESC LIMIT 1`,[agencyId,type,email,String(submission.id)]);
   if(prior)return {communicationId:prior.id,deliveryStatus:['sent','delivered'].includes(prior.delivery_status)?'sent':'pending',alreadyRequested:true,retryAfterSeconds:600};
   const agency=await agencies.findById(agencyId);
   const base=buildPublicPortalBaseUrl(agency);
   if(!base)throw fail(503,'Your organization’s enrollment email is not ready. Keep your saved return link and contact your team.');
   const url=new URL(`${base}/intake/${encodeURIComponent(link.public_key)}`);url.searchParams.set('session',sessionToken);url.searchParams.set('serviceType','tutoring');
   const es=String(link.language_code||'').startsWith('es');
   const subject=es?'Su enlace de inscripción guardada':'Your saved enrollment link';
   const text=es?`Usted solicitó volver a su inscripción guardada. Este enlace privado abre solo ese borrador; no es un inicio de sesión del portal. No lo reenvíe.\n\n${url}\n\nSi no lo solicitó, puede ignorar este correo.`:`You requested a link to return to your saved enrollment. This private link opens only that draft; it does not sign in to the family portal. Do not forward it.\n\n${url}\n\nIf you did not request this, you can ignore this email.`;
   receipt=await communications.create({agencyId,clientId:submission.client_id||null,userId:submission.guardian_user_id||null,templateType:type,channel:'email',subject,body:text,recipientAddress:email,metadata:{intakeSubmissionId:submission.id,intakeLinkId:link.id,source:'recipient_request'}});
   sending=true;
   const result=await send({agencyId,enrollmentChannel:'tutoring',locale:es?'es':'en',to:email,subject,text,templateType:type,existingCommunicationId:receipt.id,preloggedReceipt:true,metadata:{intakeSubmissionId:submission.id,source:'recipient_request'}});
   transmission=result;
   await communications.updateDeliveryStatus(receipt.id,result.sent?'sent':'pending',result.id||null,null,result.sent?null:result.reason||'Awaiting delivery review');
   return {communicationId:receipt.id,deliveryStatus:result.sent?'sent':'pending',retryAfterSeconds:600};
  } catch(error) {
   // Transport acceptance survives a later history-write failure. Do not invite
   // the requester to resend a message whose transmission is already known.
   if(transmission?.sent)return {communicationId:receipt.id,deliveryStatus:'sent',historyNeedsReview:true,retryAfterSeconds:600};
   if(receipt?.id&&sending)await communications.updateDeliveryStatus(receipt.id,'pending',null,null,'Delivery needs review before another request.').catch(()=>{});
   throw error;
  } finally {try{if(locked)await conn.execute('SELECT RELEASE_LOCK(?)',[lock]);}finally{conn.release();}}
 };
}
export const requestEnrollmentResumeEmail=createEnrollmentResumeEmail();
