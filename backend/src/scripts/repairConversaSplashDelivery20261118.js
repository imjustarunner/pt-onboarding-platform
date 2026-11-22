/** User-authorized, narrowly scoped repair. No application login or human audit actor.
 * Default: read-only recipient preview. --remind sends email only; --notify-rachel
 * sends the completion update, after the operator verifies both public releases.
 * Uses configured Events/Technology service identities and the normal mail gates.
 */
import pool from '../config/database.js';
import { notificationTransportReceipt } from '../utils/notificationTransportReceipt.js';
import { listCompanyEventInvitees, resolveCompanyEventAudienceUserIds } from '../services/companyEventAudience.service.js';
import { companyEventEmailContext, listCompanyEventInvitations, deliverCompanyEventInvitation, sendCompanyEventInvitationEmail } from '../services/companyEventInvitations.service.js';
import { invitationResponse } from '../utils/companyEventReminders.js';
import { buildStaffPollEmail, sendStaffPollEmail, staffPollWorkEmail } from '../services/staffPollEmail.service.js';
import { pollClosedAt } from '../utils/staffPollPresentation.js';
import Agency from '../models/Agency.model.js';
import CommunicationLoggingService from '../services/communicationLogging.service.js';
import { sendEmailFromIdentity } from '../services/unifiedEmail/unifiedEmailSender.service.js';

const actor='codex.conversa_splash_repair.20261118', originalOperation='conversa-splash-repair-20261118', agencyId=2;
// The first attempts failed sender verification before transport. Preserve them;
// this explicit retry uses the already verified Technology service identity.
const retryUnverified=process.argv.includes('--retry-unverified');
const operation=retryUnverified?`${originalOperation}-technology-retry`:originalOperation;
const mode=process.argv.includes('--remind')?'remind':process.argv.includes('--notify-rachel')?'notify':'preview';
const principal=process.env.AUTHORIZED_CLOUD_PRINCIPAL;
if(mode!=='preview'&&!principal)throw Error('Set AUTHORIZED_CLOUD_PRINCIPAL to the actual authorized Cloud IAM principal.');
const accepted=result=>notificationTransportReceipt(result,agencyId).accepted && !result?.redirected && !result?.held;
const json=value=>typeof value==='string'?JSON.parse(value):value||{};
async function append(eventId,userId,phase,details){
  await pool.execute(`INSERT INTO company_event_automation_audit
    (operation_key,automation_actor,cloud_principal,company_event_id,recipient_user_id,phase,details_json) VALUES (?,?,?,?,?,?,?)`,
    [operation,actor,principal,eventId,userId,phase,JSON.stringify(details)]);
}
async function technologyIdentity(){
  const [[identity]]=await pool.execute("SELECT id FROM email_sender_identities WHERE agency_id=2 AND identity_key='technology' AND LOWER(from_email)='technology@itsco.health' AND is_active=1");
  if(!identity)throw Error('Expected Technology service identity unavailable.');
  return identity;
}
async function claim(eventId,userId){
  if(retryUnverified){
    if(mode!=='remind')throw Error('The verification retry is only for reminder emails.');
    const [[previous]]=await pool.execute("SELECT details_json FROM company_event_automation_audit WHERE operation_key=? AND company_event_id=? AND recipient_user_id=? AND phase='finished'",[originalOperation,eventId,userId]);
    const outcome=json(previous?.details_json);
    const [receipts]=await pool.execute("SELECT delivery_status,external_message_id,error_message FROM user_communications WHERE JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.operationKey'))=? AND user_id=? AND template_id=?",[originalOperation,userId,eventId]);
    if((outcome.code||outcome.reason)!=='EMAIL_SENDER_UNVERIFIED'||receipts.length!==1||receipts[0].delivery_status!=='failed'||receipts[0].external_message_id||!String(receipts[0].error_message).includes('Email was not sent.'))throw Error('Retry requires proof of a single failed verification before transport.');
  }
  try{await append(eventId,userId,'claimed',{purpose:mode==='notify'?'Technology completion email':'Unanswered invitation email reminder',authorization:'User requested this repair and these emails in the Codex conversation on 2026-11-18',...(retryUnverified?{retryOf:originalOperation,sender:'technology@itsco.health'}:{})});return true;}catch(error){if(error.code==='ER_DUP_ENTRY')return false;throw error;}
}
async function receipt(eventId,user,to,type,subject){
  const comm=await CommunicationLoggingService.logGeneratedCommunication({agencyId,userId:Number(user.id),generatedByUserId:null,templateType:type,templateId:eventId||null,subject,body:'Authorized automation preparing this email.',recipientAddress:to,channel:'email',metadata:{source:'auto',automationActor:actor,operationKey:operation,cloudPrincipal:principal}});
  // Transport updates replace communication metadata, so retain the link in the
  // independent, append-only automation ledger before delivery.
  await append(eventId,user.id,'prepared',{communicationId:comm.id});
  return comm;
}
async function unanswered(event){
  const allowed=new Set(await resolveCompanyEventAudienceUserIds({event}));
  if(event.event_type==='team_poll'){
    if(pollClosedAt(event))return [];
    const [responses]=await pool.execute('SELECT user_id FROM company_event_responses WHERE company_event_id=?',[event.id]);
    const answered=new Set(responses.map(r=>Number(r.user_id)));
    return (await listCompanyEventInvitees({event})).filter(u=>allowed.has(Number(u.id))&&!answered.has(Number(u.id)));
  }
  if(event.rsvp_deadline&&new Date(event.rsvp_deadline)<=new Date()||event.ends_at&&new Date(event.ends_at)<=new Date())return [];
  return (await listCompanyEventInvitations(event)).filter(i=>allowed.has(Number(i.user_id))&&!invitationResponse(i)).map(i=>({...i,id:Number(i.user_id),invitationId:i.id}));
}
async function remind(event,agency){
  const initial=await unanswered(event),result=[];
  for(const initialUser of initial){
    if(process.argv.includes('--one')&&result.length)break;
    // Recheck current audience, activity, deadline and replies before each recipient.
    const user=(await unanswered(event)).find(u=>Number(u.id)===Number(initialUser.id));if(!user)continue;
    const to=event.event_type==='team_poll'?staffPollWorkEmail(user,agency,{selected:true}):String(user.work_email||user.email||'').trim();
    if(!to){result.push({userId:user.id,status:'no_work_email'});continue;}
    if(!await claim(event.id,user.id)){result.push({userId:user.id,status:'already_attempted'});continue;}
    try{
      let outcome;
      if(event.event_type==='team_poll'){
        const comm=await receipt(event.id,user,to,'staff_poll_followup',`Reminder — team poll: ${event.title}`);
        // A reply can arrive while the receipt is being prepared.
        if(!(await unanswered(event)).some(u=>u.id===user.id)){await append(event.id,user.id,'finished',{status:'answered_before_send',communicationId:comm.id});continue;}
        const poll={...event,agencyId,votingConfig:json(event.voting_config_json)};
        if(retryUnverified&&poll.votingConfig.linkedEventId)throw Error('This scoped retry only supports the original standalone poll.');
        const sent=retryUnverified
          ?await sendEmailFromIdentity({senderIdentityId:(await technologyIdentity()).id,to,...buildStaffPollEmail({event:poll,agency,user,followup:true}),source:'auto',generatedByUserId:null,userId:Number(user.id),templateType:'staff_poll_followup',templateId:Number(event.id),existingCommunicationId:comm.id,preloggedReceipt:true})
          :await sendStaffPollEmail({event:poll,agency,user,to,actorUserId:null,followup:true,receiptId:comm.id});
        outcome={status:accepted(sent)?'sent':'needs_review',communicationId:comm.id,reason:sent?.reason||null};
        await pool.execute(`INSERT INTO company_event_dispatch_logs(company_event_id,user_id,channel,dispatch_type,occurrence_key,status,status_reason,sent_at,payload_json)
          VALUES (?,?,'email','poll_followup',?,?,?,IF(?='sent',UTC_TIMESTAMP(),NULL),?)`,
          [event.id,user.id,`manual:${operation}`,outcome.status==='sent'?'sent':'failed',outcome.reason,outcome.status,JSON.stringify({communicationId:comm.id,automationActor:actor,operationKey:operation})]);
      }else{
        const invitation={...user,id:user.invitationId,user_id:user.id};
        const deliveries=await deliverCompanyEventInvitation({event,invitation,actorUserId:null,kind:'rsvp_reminder',scheduleKey:`manual:${operation}`,channels:{email:true,inApp:false,sms:false},sendEmail:async args=>{
          const comm=await receipt(event.id,user,to,'company_event_reminder',`Please RSVP: ${event.title}`);
          const context=retryUnverified?{...await companyEventEmailContext(event),identity:await technologyIdentity()}:args.context;
          return sendCompanyEventInvitationEmail({...args,context,receiptId:comm.id});
        }});
        outcome={status:deliveries[0]?.status||'answered_before_send',reason:deliveries[0]?.reason||null};
      }
      await append(event.id,user.id,'finished',outcome);result.push({userId:user.id,...outcome});
    }catch(error){await append(event.id,user.id,'finished',{status:'needs_review',code:error.code||error.name});result.push({userId:user.id,status:'needs_review'});}
  }
  return result;
}
async function reminderSummary(agency,events){
  const retryOperation=`${originalOperation}-technology-retry`;
  const [finished]=await pool.execute("SELECT company_event_id,recipient_user_id,details_json FROM company_event_automation_audit WHERE operation_key=? AND phase='finished'",[retryOperation]);
  const sent=finished.filter(row=>json(row.details_json).status==='sent');
  let missingEmail=0;
  for(const event of events)for(const user of await unanswered(event)){
    const to=event.event_type==='team_poll'?staffPollWorkEmail(user,agency,{selected:true}):String(user.work_email||user.email||'').trim();
    if(!to){missingEmail++;continue;}
    if(!sent.some(row=>Number(row.company_event_id)===Number(event.id)&&Number(row.recipient_user_id)===Number(user.id)))throw Error('Finish the outstanding authorized reminders before sending the completion email.');
  }
  if(!sent.length)throw Error('No completed reminders to report.');
  return {denver:sent.filter(row=>Number(row.company_event_id)===353).length,springs:sent.filter(row=>Number(row.company_event_id)===354).length,missingEmail};
}
async function notifyRachel(agency,events){
  const [[user]]=await pool.execute("SELECT id,first_name,last_name,email,work_email FROM users WHERE id=507 AND first_name='Rachel' AND last_name='Finch' AND is_active=1");
  const [[identity]]=await pool.execute("SELECT id FROM email_sender_identities WHERE agency_id=2 AND identity_key='technology' AND LOWER(from_email)='technology@itsco.health' AND is_active=1");
  if(!user||!identity)throw Error('Expected Rachel recipient or Technology service identity unavailable.');
  const summary=await reminderSummary(agency,events);
  if(!await claim(0,user.id))return {status:'already_attempted'};
  const subject='Conversa poll and RSVP reminders are ready';
  const text=`Hi Rachel,\n\nThank you for flagging the missing splash screens. The fixes are live and ready to use.\n\nInvited staff with an unanswered poll or RSVP will now see one Conversa prompt at a time when they sign in. They can answer right there or dismiss it until their next login. Once they respond, that prompt stops appearing.\n\nDelivery history now shows each splash display, how many times someone has seen it, and when they dismissed it, opened the details, or replied. These records start with this update.\n\nWe also fixed the Colorado Springs poll email sender. Poll invitations and reminders now use the configured ITSCO Events address, including when email is selected. Your Denver event emails were already sending successfully. Today’s email-only reminders were sent from ITSCO Technology to ${summary.denver} Denver invitees and ${summary.springs} Colorado Springs invitees who had not responded. We checked for new replies before sending. ${summary.missingEmail ? `${summary.missingEmail} remaining invitee has no eligible work email address and will still receive the login prompt. ` : ''}Individual outcomes are in delivery history.\n\nThe login prompts are separate from scheduled announcements, so you do not need to move Denver’s December 3 announcement to make the RSVP prompt appear now. Texting continues through the existing setup.\n\nOne setting to review: the Colorado Springs poll currently closes December 15, while two date choices are December 11 and 12. You may want to move the voting deadline earlier.\n\nThanks for helping us make this easier for everyone.\n\nITSCO Technology Team`;
  const to=user.work_email||user.email,comm=await receipt(0,user,to,'technology_poll_splash_update',subject);
  const result=await sendEmailFromIdentity({senderIdentityId:identity.id,to,subject,text,source:'auto',generatedByUserId:null,userId:user.id,templateType:'technology_poll_splash_update',existingCommunicationId:comm.id,preloggedReceipt:true});
  const outcome={status:accepted(result)?'sent':'needs_review',communicationId:comm.id,reason:result?.reason||null};
  await append(0,user.id,'finished',outcome);return outcome;
}
try{
  if(mode!=='preview'&&(retryUnverified||mode==='notify')){
    await technologyIdentity();
    const {getGmailClient}=await import('../services/unifiedEmail/gmailClient.js');
    const {assertVerifiedGmailSender}=await import('../services/unifiedEmail/verifiedSender.js');
    await assertVerifiedGmailSender(await getGmailClient(),'technology@itsco.health');
  }
  const agency=await Agency.findById(agencyId);
  const [events]=await pool.execute("SELECT * FROM company_events WHERE agency_id=2 AND id IN (353,354) AND is_active=1 AND COALESCE(school_event_status,'') NOT IN ('canceled','cancelled') ORDER BY id");
  if(mode==='notify')console.log(JSON.stringify({action:'notify_rachel',...await notifyRachel(agency,events)}));
  else for(const event of events){const users=await unanswered(event);console.log(JSON.stringify({eventId:event.id,title:event.title,unanswered:users.length,...(mode==='remind'?{deliveries:await remind(event,agency)}:{recipientIds:users.map(u=>u.id)})}));}
}catch(error){console.error(JSON.stringify({error:error.code||error.name,message:error.message?.replace(/[^\x20-\x7E]/g,' ').slice(0,180)}));process.exitCode=1;}finally{await pool.end();}
