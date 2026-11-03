import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import MessageLog from '../models/MessageLog.model.js';
import VonageService from './vonage.service.js';
import { relayEnrollmentReady } from './providerSmsRelaySettings.service.js';
import { resolveRelayFamily, familyReplyCode, parseProviderReply, shortFamilyCode } from './providerSmsRelayIdentity.service.js';
import { sendClinicalSms } from './clinicalSmsSend.service.js';
import { isSmsSuppressed } from './smsCompliance.service.js';
import { requestRelaySupport } from './providerRelaySupport.service.js';

async function claim(table, columns, values) {
  try {
    const [result]=await pool.execute(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${values.map(()=>'?').join(',')})`,values);
    return result.insertId;
  } catch(error) { if(error.code==='ER_DUP_ENTRY') return null; throw error; }
}
// Serialize the phone's prompts and confirmations across instances. A pending
// reply always retains its original exact recipient, even if another family texts.
async function withRelayLock(enrollment, work) {
  const connection = await pool.getConnection();
  const key = `provider-relay:${enrollment.id}`;
  let locked = false;
  try {
    const [[result]] = await connection.execute('SELECT GET_LOCK(?, 5) AS acquired', [key]);
    locked = Number(result?.acquired) === 1;
    if (!locked) throw Object.assign(new Error('Relay is busy; retry this event'), { status: 503 });
    return await work();
  } finally {
    if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', [key]);
    connection.release();
  }
}
async function sendProviderCopy(enrollment, from, body, metadata) {
  const [[notice]] = await pool.execute(`SELECT MAX(created_at) AS last_notice FROM message_logs
    WHERE number_id=? AND to_number=? AND direction='OUTBOUND' AND delivery_status IN ('sent','delivered','queued')
      AND JSON_EXTRACT(metadata,'$.providerSmsRelayNotice')=TRUE`, [enrollment.number_id,enrollment.phone]);
  const due = !notice?.last_notice || (metadata.providerSmsRelay && Date.now()-new Date(notice.last_notice).getTime() >= 14*86400000);
  const content = due ? `${body}\nReminder: Reply SUPPORT for help with this conversation, NOCLIENTS to stop client forwarding to this phone, or STOP to stop all texts.` : body;
  const details = { ...metadata, providerSmsRelayNotice: !!due };
  const log=await MessageLog.createOutbound({agencyId:enrollment.agency_id,numberId:enrollment.number_id,
    userId:enrollment.provider_user_id,assignedUserId:enrollment.provider_user_id,ownerType:'staff',
    clientId:null,fromNumber:from,toNumber:enrollment.phone,body,deliveryStatus:'pending',metadata:details});
  try {
    const result=await VonageService.sendSms({purpose:'care',agencyId:enrollment.agency_id,
      from,to:enrollment.phone,body:content,providerRelayEnrollmentId:enrollment.id});
    await MessageLog.markSent(log.id,result.sid,details);
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
    try { await withRelayLock(enrollment, async () => {
      if (!await relayEnrollmentReady(enrollment,client.id)) return;
      const legacyCode=familyReplyCode(client,family.guardianUserId);
      await pool.execute(`INSERT INTO provider_sms_relay_routes (enrollment_id,client_id,guardian_user_id,family_phone,reply_code)
        VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id`,[enrollment.id,client.id,family.guardianUserId,family.phone,legacyCode]);
      const [routes]=await pool.execute('SELECT * FROM provider_sms_relay_routes WHERE enrollment_id=? AND reply_code=?',[enrollment.id,legacyCode]);
      if (routes[0]?.family_phone!==family.phone) return;
      const dispatchId=await claim('provider_sms_relay_dispatches',['enrollment_id','carrier_message_id','inbound_log_id'],[enrollment.id,String(messageId),inboundLogId || null]);
      if(!dispatchId) return;
      try {
        const label=legacyCode.split('-')[0];
        const outboundId=await sendProviderCopy(enrollment,to,`${family.guardian ? 'Guardian of ' : ''}${label}: ${body}\nReply normally to confirm the recipient, or ${shortFamilyCode(routes[0])} followed by your message.`,
          {providerSmsRelay:true,originalClientId:client.id,originalInboundLogId:inboundLogId,replyCode:legacyCode,relayRouteId:routes[0].id});
        await pool.execute("UPDATE provider_sms_relay_dispatches SET status='sent',outbound_log_id=? WHERE id=?",[outboundId,dispatchId]);
      } catch(error) {
        await pool.execute("UPDATE provider_sms_relay_dispatches SET status='needs_review' WHERE id=?",[dispatchId]);
        console.warn('[providerSMS] Forward pending review:',error.code || 'send_failed');
      }
    }); } catch(error) { console.warn('[providerSMS] Forward unavailable:',error.code || 'relay_failed'); }
  }
}
async function validRecipient(enrollment, route) {
  if (!route || Number(route.enrollment_id)!==Number(enrollment.id)) return null;
  const client=await Client.findById(route.client_id,{includeSensitive:true});
  const family=await resolveRelayFamily(client,route.family_phone);
  if(Number(client?.agency_id)!==Number(enrollment.agency_id) || !family
    || family.guardianUserId!==Number(route.guardian_user_id) || !await relayEnrollmentReady(enrollment,client.id)) return null;
  return { client, family };
}
async function pendingReply(enrollment) {
  await pool.execute(`UPDATE provider_sms_relay_replies SET status='expired'
    WHERE enrollment_id=? AND status='awaiting_confirmation' AND created_at<UTC_TIMESTAMP()-INTERVAL 10 MINUTE`, [enrollment.id]);
  const [rows] = await pool.execute(`SELECT r.id, original.body AS pending_body,
    JSON_EXTRACT(prompt.metadata,'$.relayRouteId') AS route_id,
    JSON_UNQUOTE(JSON_EXTRACT(prompt.metadata,'$.relayAction')) AS relay_action
    FROM provider_sms_relay_replies r JOIN message_logs prompt ON prompt.id=r.outbound_log_id
    JOIN message_logs original ON original.id=CAST(JSON_UNQUOTE(JSON_EXTRACT(prompt.metadata,'$.relayOriginalInboundLogId')) AS UNSIGNED)
    WHERE r.enrollment_id=? AND r.status='awaiting_confirmation' AND r.created_at>=UTC_TIMESTAMP()-INTERVAL 10 MINUTE
    ORDER BY r.id DESC LIMIT 1`, [enrollment.id]);
  return rows[0] || null;
}
async function recentRoute(enrollment) {
  // Only an actually sent forward can establish recent context. Existing long
  // codes remain usable, and historical forwards can seed the new confirmation.
  const [rows] = await pool.execute(`SELECT route.* FROM provider_sms_relay_dispatches d
    JOIN message_logs m ON m.id=d.outbound_log_id
    JOIN provider_sms_relay_routes route ON route.enrollment_id=d.enrollment_id
      AND route.reply_code=JSON_UNQUOTE(JSON_EXTRACT(m.metadata,'$.replyCode'))
    WHERE d.enrollment_id=? AND d.status='sent' AND d.created_at>=UTC_TIMESTAMP()-INTERVAL 2 HOUR
      AND m.delivery_status IN ('sent','delivered','queued')
    ORDER BY d.id DESC LIMIT 1`, [enrollment.id]);
  return rows[0] || null;
}
export async function handleProviderSmsReply({sender,from,to,body,messageId}) {
  const [enrollments]=await pool.execute('SELECT * FROM provider_sms_relay_enrollments WHERE number_id=? AND phone=?',[sender.id,from]);
  if(!enrollments.length) return false;
  if(enrollments.length!==1 || !messageId) return true;
  const enrollment=enrollments[0];
  if(Number(enrollment.agency_id)!==Number(sender.agency_id)) return true;
  return withRelayLock(enrollment, async () => {
    if (!await relayEnrollmentReady(enrollment) || await isSmsSuppressed(sender,from)) return true;
    const replyId=await claim('provider_sms_relay_replies',['number_id','carrier_message_id','enrollment_id'],[sender.id,String(messageId),enrollment.id]);
    if(!replyId) return true;
    let confirmedId = null;
    try {
      const inbound = await MessageLog.createInbound({agencyId:enrollment.agency_id,numberId:sender.id,
        userId:enrollment.provider_user_id,assignedUserId:enrollment.provider_user_id,ownerType:'staff',
        clientId:null,fromNumber:from,toNumber:to,body,providerMessageSid:messageId,
        metadata:{providerSmsRelayReply:true,relayReplyId:replyId}});
      const guide = async text => {
        const logId=await sendProviderCopy(enrollment,to,text,{providerSmsRelayGuidance:true});
        await pool.execute("UPDATE provider_sms_relay_replies SET status='guidance',outbound_log_id=? WHERE id=?",[logId,replyId]);
        return true;
      };
      const pending = await pendingReply(enrollment);
      const control = String(body || '').trim().toUpperCase();
      let route, replyBody, action = 'reply';
      if (control === 'SUPPORT') {
        const candidate = pending
          ? (await pool.execute('SELECT * FROM provider_sms_relay_routes WHERE enrollment_id=? AND id=?',[enrollment.id,Number(pending.route_id)]))[0][0]
          : await recentRoute(enrollment);
        const recipient = await validRecipient(enrollment,candidate);
        if (!recipient) return guide('There is no recent eligible conversation. Reply with its short code followed by SUPPORT, or use Forward to Support in the app.');
        if (pending) await pool.execute("UPDATE provider_sms_relay_replies SET status='cancelled' WHERE id=?",[pending.id]);
        const label = familyReplyCode(recipient.client,recipient.family.guardianUserId).split('-')[0];
        const logId = await sendProviderCopy(enrollment,to,`Forward the conversation for ${label} (family phone ending ${candidate.family_phone.slice(-4)}) to Support? Reply Y to confirm or N to cancel. Nothing will be sent to the family.`,
          {providerSmsRelayConfirmation:true,relayRouteId:candidate.id,relayOriginalInboundLogId:inbound.id,relayAction:'support'});
        await pool.execute("UPDATE provider_sms_relay_replies SET status='awaiting_confirmation',outbound_log_id=? WHERE id=?",[logId,replyId]);
        return true;
      } else if (['Y','YES','N','NO'].includes(control)) {
        if (!pending) return guide('There is no reply waiting for confirmation. Send your message again, or use the short family code shown with your message.');
        if (['N','NO'].includes(control)) {
          await pool.execute("UPDATE provider_sms_relay_replies SET status='cancelled' WHERE id=?",[pending.id]);
          return guide('Reply cancelled. Nothing was sent to the family.');
        }
        const [routes]=await pool.execute('SELECT * FROM provider_sms_relay_routes WHERE enrollment_id=? AND id=?',[enrollment.id,Number(pending.route_id)]);
        route=routes[0]; replyBody=pending.pending_body; confirmedId=pending.id;
        action = pending.relay_action === 'support' ? 'support' : 'reply';
        await pool.execute("UPDATE provider_sms_relay_replies SET status='sending' WHERE id=?",[confirmedId]);
      } else {
        const parsed=parseProviderReply(body);
        if (parsed) {
          const [routes]=await pool.execute(`SELECT * FROM provider_sms_relay_routes WHERE enrollment_id=? AND ${parsed.routeId ? 'id' : 'reply_code'}=?`,[enrollment.id,parsed.routeId || parsed.code]);
          route=routes[0]; replyBody=parsed.body;
          if (String(parsed.body).trim().toUpperCase() === 'SUPPORT') action = 'support';
          if (pending) await pool.execute("UPDATE provider_sms_relay_replies SET status='cancelled' WHERE id=?",[pending.id]);
        } else {
          if (pending) return guide('An earlier reply is waiting: reply Y to send that reply or N to cancel it. This new message was not sent; resend it afterward.');
          // A mistyped explicit address must not be reinterpreted as a normal reply.
          if (/^(?:#\S*|[A-Z0-9]+-\d+-\d+)/i.test(String(body).trim())) return guide('Message not forwarded. Use the short family code shown with your message, or reply in the app.');
          const candidate=await recentRoute(enrollment);
          const recipient=await validRecipient(enrollment,candidate);
          if (!recipient) return guide('Message not forwarded. There is no recent eligible family text. Use the short family code shown with your message, or reply in the app.');
          const label=familyReplyCode(recipient.client,recipient.family.guardianUserId).split('-')[0];
          const who=recipient.family.guardian ? `${label}'s guardian (phone ending ${candidate.family_phone.slice(-4)})` : label;
          const logId=await sendProviderCopy(enrollment,to,`Did you mean to reply to ${who}? Reply Y to send your message, or N to cancel. This confirmation expires in 10 minutes.`,
            {providerSmsRelayConfirmation:true,relayRouteId:candidate.id,relayOriginalInboundLogId:inbound.id});
          await pool.execute("UPDATE provider_sms_relay_replies SET status='awaiting_confirmation',outbound_log_id=? WHERE id=?",[logId,replyId]);
          return true;
        }
      }
      const recipient=await validRecipient(enrollment,route);
      if (!recipient) {
        await pool.execute("UPDATE provider_sms_relay_replies SET status='access_changed' WHERE id IN (?,?)",[replyId,confirmedId || replyId]);
        return guide('Message not forwarded. Access to this family has changed. Please open the app or contact Support.');
      }
      if (action === 'support') {
        await requestRelaySupport({ enrollment, route, inboundLogId: inbound.id });
        await pool.execute("UPDATE provider_sms_relay_replies SET status='support_requested' WHERE id IN (?,?)",[replyId,confirmedId || replyId]);
        return guide('Your Support request is queued. Support can review this conversation in the app; this does not mean someone has read it yet.');
      }
      const result=await sendClinicalSms({userId:enrollment.provider_user_id,clientId:recipient.client.id,
        numberId:enrollment.number_id,body:replyBody,
        relayRecipient:{phone:recipient.family.phone,guardianUserId:recipient.family.guardianUserId}});
      await pool.execute("UPDATE provider_sms_relay_replies SET status='sent',outbound_log_id=? WHERE id IN (?,?)",[result.messageLog.id,replyId,confirmedId || replyId]);
    } catch(error) {
      await pool.execute("UPDATE provider_sms_relay_replies SET status='needs_review' WHERE id IN (?,?)",[replyId,confirmedId || replyId]);
      console.warn('[providerSMS] Reply pending review:',error.code || 'send_failed');
    }
    return true;
  });
}
