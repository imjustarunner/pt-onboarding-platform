import pool from '../config/database.js';
import {qaAutomationActorFor} from '../utils/qaAutomationAttribution.js';
import {QA_EMAIL_INBOX} from '../utils/qaEmailPolicy.js';
const unavailable=()=>Object.assign(new Error('Plotline verification email is not ready. Your request is saved; please retry shortly.'),{status:503,code:'PLOTLINE_EMAIL_UNAVAILABLE'});
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createPlotlineAccountEmail({db=pool,transport,verifySender,identityId=()=>process.env.PLOTLINE_SENDER_IDENTITY_ID}={}) {
 async function sender() {
   const configured=String(identityId()||'');
   // An exact, explicitly configured platform identity. Never a first-tenant fallback.
   if(!/^[1-9]\d*$/.test(configured))throw unavailable();
   const [[identity]]=await db.execute(`SELECT e.id,e.from_email FROM email_sender_identities e
     JOIN agencies a ON a.id=e.agency_id WHERE e.id=? AND e.is_active=1 AND a.slug='plottwistco'
     AND a.is_active=1 AND COALESCE(a.is_archived,0)=0`,[Number(configured)]);
   if(!identity || !/^[^\s<>@,;]+@(plotlinepo\.com|plottwistco\.com)$/i.test(identity.from_email))throw unavailable();
   await (verifySender || (async address=>{
     const {getGmailClient}=await import('./unifiedEmail/gmailClient.js');
     const {assertVerifiedGmailSender}=await import('./unifiedEmail/verifiedSender.js');
     await assertVerifiedGmailSender(await getGmailClient(),address);
   }))(identity.from_email);
   return identity;
 }
 async function send({email,url,qaAutomationUserId=null}) {
   const identity=await sender();
   const qa=!!qaAutomationActorFor(qaAutomationUserId);
   const text=`Verify your email for Plotline\n\nConfirm the email address you supplied to start your company workspace:\n${url}\n\nThis personal link expires in 24 hours. Your free 30 days begin only when you create your company. No card required. If you didn’t request this, ignore this email.\n\nPlotline by PlotTwistCo`;
   const html=`<div data-portal-email="v2" style="background:#FAF8F4;padding:24px;font:16px/1.6 Arial,sans-serif;color:#0F2D24"><div style="max-width:560px;margin:auto;background:white;padding:28px;border-top:4px solid #D89B7F;border-radius:12px"><img src="https://plotlinepo.com/assets/plotline/website/brand/logos/plotline-primary-transparent.png" width="180" alt="Plotline by PlotTwistCo"><h1 style="font-size:26px">Your next chapter starts here.</h1><p>Confirm your email to set up your company in Plotline.</p><p style="margin:28px 0"><a href="${escape(url)}" style="display:inline-block;padding:14px 22px;background:#0F2D24;color:white;text-decoration:none;border-radius:8px">Verify my email</a></p><p>This personal link expires in 24 hours. Your 30 days free begin when you create your company. No card required.</p><p style="font-size:12px">If you didn’t request this email, you can ignore it.</p><p style="font-size:12px">Plotline by PlotTwistCo</p></div></div>`;
   const result=await (transport || (await import('./unifiedEmail/unifiedEmailSender.service.js')).sendEmailFromIdentity)({senderIdentityId:Number(identity.id),fromDisplayNameOverride:'Plotline',to:qa?QA_EMAIL_INBOX:email,userId:qa?Number(qaAutomationUserId):null,subject:'Verify your email for Plotline',text:qa?`${text}\n\nQA copy: requested for ${email}; physical delivery to ${QA_EMAIL_INBOX}.`:text,html:qa?`${html}<p style="font:12px Arial">QA copy: requested for ${escape(email)}; physical delivery to ${QA_EMAIL_INBOX}.</p>`:html,templateType:'plotline_email_verification',source:'manual'});
   if(result?.skipped || result?.blocked)return {sent:false,pending:false};
   if(result?.queued || result?.requiresApproval || result?.pendingApproval || result?.status==='pending_approval')return {sent:false,pending:true};
   if(result?.redirected || result?.testInboxRedirect){
     const delivered=result?.testInboxRedirect?.deliveredTo;
     const approvedQa=qaAutomationActorFor(qaAutomationUserId)&&Array.isArray(delivered)&&delivered.length===1&&delivered[0]===QA_EMAIL_INBOX;
     return {sent:!!approvedQa&&!!result.id,pending:false,qaRedirect:!!approvedQa};
   }
   return {sent:!!result?.id,pending:false,...(qa?{qaRedirect:true}:{})};
 }
 return {sender,send};
}
export default createPlotlineAccountEmail();
