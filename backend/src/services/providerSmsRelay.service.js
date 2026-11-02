import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import MessageLog from '../models/MessageLog.model.js';
import VonageService from './vonage.service.js';
import { relayEnrollmentReady } from './providerSmsRelaySettings.service.js';
import { resolveRelayFamily, familyReplyCode, parseProviderReply } from './providerSmsRelayIdentity.service.js';
import { sendClinicalSms } from './clinicalSmsSend.service.js';
import { isSmsSuppressed } from './smsCompliance.service.js';

async function claim(table, columns, values) {
  try {
    const [result]=await pool.execute(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${values.map(()=>'?').join(',')})`,values);
    return result.insertId;
  } catch(error) { if(error.code==='ER_DUP_ENTRY') return null; throw error; }
}
async function sendProviderCopy(enrollment, from, body, metadata) {
  const log=await MessageLog.createOutbound({agencyId:enrollment.agency_id,numberId:enrollment.number_id,
    userId:enrollment.provider_user_id,assignedUserId:enrollment.provider_user_id,ownerType:'staff',
    clientId:null,fromNumber:from,toNumber:enrollment.phone,body,deliveryStatus:'pending',metadata});
  try {
    const result=await VonageService.sendSms({purpose:'care',agencyId:enrollment.agency_id,
      from,to:enrollment.phone,body});
    await MessageLog.markSent(log.id,result.sid,metadata);
    return log.id;
  } catch(error) { await MessageLog.markFailed(log.id,error.code || 'relay_send_failed'); throw error; }
}
export async function forwardClientSmsToProviders({route,from,to,body,messageId,inboundLogId,mediaUrls=[]}) {
  if (!route?.clientId || !route?.number?.id || !messageId || !String(body||'').trim() || mediaUrls.length) return;
  const client=await Client.findById(route.clientId,{includeSensitive:true});
  if (Number(client?.agency_id)!==Number(route.agencyId)) return;
  const family=await resolveRelayFamily(client,from);
  if (!family) return;
  const [enrollments]=await pool.execute('SELECT * FROM provider_sms_relay_enrollments WHERE agency_id=? AND number_id=? AND enabled=TRUE', [route.agencyId,route.number.id]);
  for(const enrollment of enrollments) {
    const code=familyReplyCode(client,family.guardianUserId);
    // Family phone changes require a new route/code review; no silent reassignment.
    try {
      if (!await relayEnrollmentReady(enrollment,client.id)) continue;
      await pool.execute(`INSERT INTO provider_sms_relay_routes (enrollment_id,client_id,guardian_user_id,family_phone,reply_code)
        VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id`,[enrollment.id,client.id,family.guardianUserId,family.phone,code]);
      const [routes]=await pool.execute('SELECT * FROM provider_sms_relay_routes WHERE enrollment_id=? AND reply_code=?',[enrollment.id,code]);
      if (routes[0]?.family_phone!==family.phone) continue;
      const dispatchId=await claim('provider_sms_relay_dispatches',['enrollment_id','carrier_message_id','inbound_log_id'],[enrollment.id,String(messageId),inboundLogId || null]);
      if(!dispatchId) continue;
      try {
        const label=code.split('-')[0];
        const outboundId=await sendProviderCopy(enrollment,to,`${family.guardian ? 'Guardian of ' : ''}${label}: ${body}\nReply ${code} followed by your message.`,
          {providerSmsRelay:true,originalClientId:client.id,originalInboundLogId:inboundLogId,replyCode:code});
        await pool.execute("UPDATE provider_sms_relay_dispatches SET status='sent',outbound_log_id=? WHERE id=?",[outboundId,dispatchId]);
      } catch(error) {
        await pool.execute("UPDATE provider_sms_relay_dispatches SET status='needs_review' WHERE id=?",[dispatchId]);
        console.warn('[providerSMS] Forward pending review:',error.code || 'send_failed');
      }
    } catch(error) { console.warn('[providerSMS] Forward unavailable:',error.code || 'relay_failed'); }
  }
}
export async function handleProviderSmsReply({sender,from,to,body,messageId}) {
  const [enrollments]=await pool.execute('SELECT * FROM provider_sms_relay_enrollments WHERE number_id=? AND phone=?',[sender.id,from]);
  if(!enrollments.length) return false;
  // Historical/disabled provider phones are consumed; they are never client input.
  if(enrollments.length!==1 || !messageId) return true;
  const enrollment=enrollments[0];
  if(Number(enrollment.agency_id)!==Number(sender.agency_id) || !await relayEnrollmentReady(enrollment)
    || await isSmsSuppressed(sender,from)) return true;
  const replyId=await claim('provider_sms_relay_replies',['number_id','carrier_message_id','enrollment_id'],[sender.id,String(messageId),enrollment.id]);
  if(!replyId) return true;
  try {
    await MessageLog.createInbound({agencyId:enrollment.agency_id,numberId:sender.id,
      userId:enrollment.provider_user_id,assignedUserId:enrollment.provider_user_id,ownerType:'staff',
      clientId:null,fromNumber:from,toNumber:to,body,providerMessageSid:messageId,
      metadata:{providerSmsRelayReply:true,relayReplyId:replyId}});
    const parsed=parseProviderReply(body);
    const [routes]=parsed ? await pool.execute('SELECT * FROM provider_sms_relay_routes WHERE enrollment_id=? AND reply_code=?',[enrollment.id,parsed.code]) : [[]];
    const route=routes[0];
    if(!route) {
      const logId=await sendProviderCopy(enrollment,to,'Message not forwarded. Start your reply with the exact family code shown on the forwarded text, followed by your message. You can also reply in the app.',{providerSmsRelayGuidance:true});
      await pool.execute("UPDATE provider_sms_relay_replies SET status='guidance',outbound_log_id=? WHERE id=?",[logId,replyId]);
      return true;
    }
    const client=await Client.findById(route.client_id,{includeSensitive:true});
    const family=await resolveRelayFamily(client,route.family_phone);
    if(Number(client?.agency_id)!==Number(enrollment.agency_id) || !family
      || family.guardianUserId!==Number(route.guardian_user_id)
      || !await relayEnrollmentReady(enrollment,client.id)) {
      await pool.execute("UPDATE provider_sms_relay_replies SET status='access_changed' WHERE id=?",[replyId]);
      return true;
    }
    const result=await sendClinicalSms({userId:enrollment.provider_user_id,clientId:client.id,
      numberId:enrollment.number_id,body:parsed.body,
      relayRecipient:{phone:family.phone,guardianUserId:family.guardianUserId}});
    await pool.execute("UPDATE provider_sms_relay_replies SET status='sent',outbound_log_id=? WHERE id=?",[result.messageLog.id,replyId]);
  } catch(error) {
    await pool.execute("UPDATE provider_sms_relay_replies SET status='needs_review' WHERE id=?",[replyId]);
    console.warn('[providerSMS] Reply pending review:',error.code || 'send_failed');
  }
  return true;
}
