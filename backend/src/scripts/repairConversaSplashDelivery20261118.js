/** User-authorized, narrowly scoped repair. No application login or human audit actor.
 * Default: read-only recipient preview. --remind sends email only; --notify-rachel
 * sends the completion update, after the operator verifies both public releases.
 * Uses configured Events/Technology service identities and the normal mail gates.
 */
import pool from '../config/database.js';
import { listCompanyEventInvitees, resolveCompanyEventAudienceUserIds } from '../services/companyEventAudience.service.js';
import { listCompanyEventInvitations, deliverCompanyEventInvitation, sendCompanyEventInvitationEmail } from '../services/companyEventInvitations.service.js';
import { invitationResponse } from '../utils/companyEventReminders.js';
import { sendStaffPollEmail, staffPollWorkEmail } from '../services/staffPollEmail.service.js';
import { pollClosedAt } from '../utils/staffPollPresentation.js';
import Agency from '../models/Agency.model.js';
import CommunicationLoggingService from '../services/communicationLogging.service.js';
import { sendEmailFromIdentity } from '../services/unifiedEmail/unifiedEmailSender.service.js';

const actor='codex.conversa_splash_repair.20261118', operation='conversa-splash-repair-20261118', agencyId=2;
const mode=process.argv.includes('--remind')?'remind':process.argv.includes('--notify-rachel')?'notify':'preview';
const principal=process.env.AUTHORIZED_CLOUD_PRINCIPAL;
if(mode!=='preview'&&!principal)throw Error('Set AUTHORIZED_CLOUD_PRINCIPAL to the actual authorized Cloud IAM principal.');
const json=value=>typeof value==='string'?JSON.parse(value):value||{};
async function append(eventId,userId,phase,details){
  await pool.execute(`INSERT INTO company_event_automation_audit
    (operation_key,automation_actor,cloud_principal,company_event_id,recipient_user_id,phase,details_json) VALUES (?,?,?,?,?,?,?)`,
    [operation,actor,principal,eventId,userId,phase,JSON.stringify(details)]);
}
async function claim(eventId,userId){try{await append(eventId,userId,'claimed',{purpose:mode==='notify'?'Technology completion email':'Unanswered invitation email reminder',authorization:'User requested this repair and these emails in the Codex conversation on 2026-11-18'});return true;}catch(error){if(error.code==='ER_DUP_ENTRY')return false;throw error;}}
async function receipt(eventId,user,to,type,subject){return CommunicationLoggingService.logGeneratedCommunication({agencyId,userId:Number(user.id),generatedByUserId:null,templateType:type,templateId:eventId||null,subject,body:'Authorized automation preparing this email.',recipientAddress:to,channel:'email',metadata:{source:'auto',automationActor:actor,operationKey:operation,cloudPrincipal:principal}});}
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
        const sent=await sendStaffPollEmail({event:{...event,agencyId,votingConfig:json(event.voting_config_json)},agency,user,to,actorUserId:null,followup:true,receiptId:comm.id});
        outcome={status:sent?.id&&!sent.skipped&&!sent.held&&!sent.pendingApproval?'sent':'needs_review',communicationId:comm.id,reason:sent?.reason||null};
        await pool.execute(`INSERT INTO company_event_dispatch_logs(company_event_id,user_id,channel,dispatch_type,occurrence_key,status,status_reason,sent_at,payload_json)
          VALUES (?,?,'email','poll_followup',?,?,?,IF(?='sent',UTC_TIMESTAMP(),NULL),?)`,
          [event.id,user.id,`manual:${operation}`,outcome.status==='sent'?'sent':'failed',outcome.reason,outcome.status,JSON.stringify({communicationId:comm.id,automationActor:actor,operationKey:operation})]);
      }else{
        const invitation={...user,id:user.invitationId,user_id:user.id};
        const deliveries=await deliverCompanyEventInvitation({event,invitation,actorUserId:null,kind:'rsvp_reminder',scheduleKey:`manual:${operation}`,channels:{email:true,inApp:false,sms:false},sendEmail:async args=>{
          const comm=await receipt(event.id,user,to,'company_event_reminder',`Please RSVP: ${event.title}`);
          return sendCompanyEventInvitationEmail({...args,receiptId:comm.id});
        }});
        outcome={status:deliveries[0]?.status||'answered_before_send',reason:deliveries[0]?.reason||null};
      }
      await append(event.id,user.id,'finished',outcome);result.push({userId:user.id,...outcome});
    }catch(error){await append(event.id,user.id,'finished',{status:'needs_review',code:error.code||error.name});result.push({userId:user.id,status:'needs_review'});}
  }
  return result;
}
async function notifyRachel(){
  const [[user]]=await pool.execute("SELECT id,first_name,last_name,email,work_email FROM users WHERE id=507 AND first_name='Rachel' AND last_name='Finch' AND is_active=1");
  const [[identity]]=await pool.execute("SELECT id FROM email_sender_identities WHERE agency_id=2 AND identity_key='technology' AND LOWER(from_email)='technology@itsco.health' AND is_active=1");
  if(!user||!identity)throw Error('Expected Rachel recipient or Technology service identity unavailable.');
  if(!await claim(0,user.id))return {status:'already_attempted'};
  const subject='Conversa poll and RSVP reminders are ready';
  const text=`Hi Rachel,\n\nThank you for flagging the missing splash screens. The fixes are live and ready to use.\n\nInvited staff with an unanswered poll or RSVP will now see one Conversa prompt at a time when they sign in. They can answer right there or dismiss it until their next login. Once they respond, that prompt stops appearing.\n\nDelivery history now shows each splash display, how many times someone has seen it, and when they dismissed it, opened the details, or replied. These records start with this update.\n\nWe also fixed the Colorado Springs poll email sender. Poll invitations and reminders now use the configured ITSCO Events address, including when email is selected. Your Denver event emails were already sending successfully. The requested email-only reminders have been processed for invitees who still had not responded; their individual outcomes are in delivery history.\n\nThe login prompts are separate from scheduled announcements, so you do not need to move Denver’s December 3 announcement to make the RSVP prompt appear now. Texting continues through the existing setup.\n\nOne setting to review: the Colorado Springs poll currently closes December 15, while two date choices are December 11 and 12. You may want to move the voting deadline earlier.\n\nThanks for helping us make this easier for everyone.\n\nITSCO Technology Team`;
  const to=user.work_email||user.email,comm=await receipt(0,user,to,'technology_poll_splash_update',subject);
  const result=await sendEmailFromIdentity({senderIdentityId:identity.id,to,subject,text,source:'auto',generatedByUserId:null,userId:user.id,templateType:'technology_poll_splash_update',existingCommunicationId:comm.id,preloggedReceipt:true});
  const outcome={status:result?.id&&!result.skipped&&!result.held&&!result.pendingApproval?'sent':'needs_review',communicationId:comm.id,reason:result?.reason||null};
  await append(0,user.id,'finished',outcome);return outcome;
}
try{
  const agency=await Agency.findById(agencyId);
  const [events]=await pool.execute("SELECT * FROM company_events WHERE agency_id=2 AND id IN (353,354) AND is_active=1 AND COALESCE(school_event_status,'') NOT IN ('canceled','cancelled') ORDER BY id");
  if(mode==='notify')console.log(JSON.stringify({action:'notify_rachel',...await notifyRachel()}));
  else for(const event of events){const users=await unanswered(event);console.log(JSON.stringify({eventId:event.id,title:event.title,unanswered:users.length,...(mode==='remind'?{deliveries:await remind(event,agency)}:{recipientIds:users.map(u=>u.id)})}));}
}catch(error){console.error(JSON.stringify({error:error.code||error.name,message:error.message?.replace(/[^\x20-\x7E]/g,' ').slice(0,180)}));process.exitCode=1;}finally{await pool.end();}
