import pool from '../config/database.js';
import { personalDialIn } from './meetingDialIn.service.js';
import { dialInContext } from './meetingDialInContext.service.js';
import { dialInConfigured, dialInError } from './meetingDialInPolicy.js';
import { dialInEmailHtml } from '../utils/meetingDialInEmail.js';
import { resolveMeetingRecipient } from './meetingRecipientIdentity.service.js';
import { sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';
import { resolveRegisteredSmsSender, getSmsSender, prepareSmsDelivery } from './smsCompliance.service.js';
import { assertCompanyEventSmsCampaign } from '../utils/companyEventSms.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';
import Vonage from './vonage.service.js';
import SmsLog from '../models/NotificationSmsLog.model.js';

export async function optionalMeetingDialIn(event,userId) {
  if (!dialInConfigured()) return null;
  const type = event.meeting_type==='supervision' || event.supervisor_user_id ? 'supervision' : 'team-meeting';
  try { return await personalDialIn(type,event.id,userId); }
  catch (error) { if ([400,403,409,410].includes(error.status)) return null;throw error; }
}
export async function sendMeetingDialIn({type,meetingId,actorUserId,userId,channel,requestKey}) {
  if (!dialInConfigured()) throw dialInError('Telephone joining is not configured or enabled.',503);
  if (!['email','sms'].includes(channel) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestKey||'')) throw dialInError('Choose email or text and a delivery request id.',400);
  const actor = await dialInContext(type,meetingId,actorUserId);
  if (Number(userId)!==Number(actorUserId) && !actor.isHost) throw dialInError('Only the meeting host can share another participant’s telephone invitation.',403);
  let target = await dialInContext(type,meetingId,userId);
  const details = await personalDialIn(type,meetingId,userId);
  if (!details) throw dialInError('Telephone joining is not enabled.',503);
  const db = await pool.getConnection();
  const lock = `meeting-phone-send:${details.invitationId}:${channel}`;
  let receipt;
  try {
    const [[held]] = await db.execute('SELECT GET_LOCK(?,5) acquired',[lock]);
    if (!Number(held.acquired)) throw dialInError('An invitation is being sent. Please try again.',409);
  const [[prior]] = await db.execute('SELECT * FROM meeting_dial_in_deliveries WHERE actor_user_id=? AND request_key=?',[actorUserId,requestKey]);
  if (prior) {
    if (Number(prior.invitation_id)!==Number(details.invitationId) || prior.channel!==channel) throw dialInError('This request id was already used.',409);
    return {status:prior.status,duplicate:true};
  }
  const [[recent]] = await db.execute('SELECT COUNT(*) count FROM meeting_dial_in_deliveries WHERE invitation_id=? AND channel=? AND created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 HOUR)',[details.invitationId,channel]);
  if (Number(recent.count)>=5) throw dialInError('Joining details were recently sent. Copy the invitation or try again later.',429);
  [receipt] = await db.execute('INSERT IGNORE INTO meeting_dial_in_deliveries (invitation_id,actor_user_id,channel,request_key) VALUES (?,?,?,?)',[details.invitationId,actorUserId,channel,requestKey]);
  if (!receipt.affectedRows) return {status:'pending',duplicate:true};
  } finally { await db.execute('SELECT RELEASE_LOCK(?)',[lock]).catch(()=>{});db.release(); }
  try {
    let result;
    const latestActor=await dialInContext(type,meetingId,actorUserId);
    if (Number(userId)!==Number(actorUserId) && !latestActor.isHost) throw dialInError('Host permission changed.',403);
    const latest=await personalDialIn(type,meetingId,userId);
    if (latest?.invitationId!==details.invitationId) throw dialInError('The meeting changed. Refresh its telephone invitation.',409);
    target = await dialInContext(type,meetingId,userId);
    if (channel==='email') {
      const recipient = await resolveMeetingRecipient({agencyId:target.meeting.agency_id,user:target.user});
      result = await sendNotificationEmail({agencyId:target.meeting.agency_id,triggerKey:'meeting_invited',to:recipient.email,
        subject:`Your telephone invitation: ${target.meeting.title || 'Supervision'}`,text:details.text,html:dialInEmailHtml(details),
        userId,generatedByUserId:actorUserId,source:'manual',templateType:'meeting_invited'});
    } else {
      const to=[target.user.personal_phone,target.user.work_phone,target.user.phone_number].map(normalizeSmsPhone).find(Boolean);
      if (!to) throw dialInError('This participant does not have a phone number. Use email or copy instead.');
      const from=await resolveRegisteredSmsSender({agencyId:target.meeting.agency_id,purpose:'workforce',requiredPurpose:'polling'});
      if (!from) throw dialInError('Staff texting is not configured for this agency.');
      assertCompanyEventSmsCampaign(await getSmsSender(from),'staff','workforce');
      const options={to,from,body:details.text,agencyId:target.meeting.agency_id,purpose:'workforce',staffNotificationKind:'notifications'};
      await prepareSmsDelivery(options);
      const currentTarget=await dialInContext(type,meetingId,userId);
      const currentPhone=[currentTarget.user.personal_phone,currentTarget.user.work_phone,currentTarget.user.phone_number].map(normalizeSmsPhone).find(Boolean);
      if (to!==currentPhone) throw dialInError('The participant phone number changed. Refresh before sending.',409);
      const log=await SmsLog.create({userId,agencyId:target.meeting.agency_id,toNumber:to,fromNumber:from,body:details.text});
      try { result=await Vonage.sendSms(options);await SmsLog.updateStatus(log.id,{status:result?.sid?'sent':'failed',providerRef:result?.sid||null}); }
      catch(error){await SmsLog.updateStatus(log.id,{status:'failed',errorMessage:error.code||'delivery_uncertain'});throw error;}
    }
    const status=result?.skipped?'skipped':result?.pendingApproval?'pending':!(channel==='sms'?result?.sid:result?.id)?'review':result?.redirected?'redirected':'sent';
    await pool.execute('UPDATE meeting_dial_in_deliveries SET status=? WHERE id=?',[status,receipt.insertId]);
    return {status};
  } catch(error){await pool.execute("UPDATE meeting_dial_in_deliveries SET status='review' WHERE id=?",[receipt.insertId]);throw error;}
}
