import { familyMessageVisibilitySql } from '../familySecureMessageAccess.service.js';
import pool from '../../config/database.js';
import webpush from 'web-push';
import { mobileSessions } from './session.service.js';
import { requireConversationAccess } from '../communicationAccess.service.js';
import { assignedSmsAccessSql } from '../../utils/assignedSmsAccessSql.js';
import { refreshClientSecureAccess } from '../clientSecureConversation.service.js';
import { failure } from './policy.js';
import {qaAgencyAllowed} from './qaScope.service.js';
import { sendApplePush, applePushConfigured } from './applePush.service.js';
import { readAgencyAccess } from '../agencyAccessProfiles.service.js';
import { applyAgencyAccess } from '../../utils/agencyAccessPolicy.js';
import { getUserCapabilities } from '../../utils/capabilities.js';
import { isNotificationChannelEnabled } from '../notificationPreferences.service.js';
import { isDemoExchangeListing } from '../clientExchangeDemo.service.js';

const EVENT_NOTIFICATION_TYPES = ['website_chat_waiting','client_exchange_match','client_exchange_assigned','client_exchange_shared','new_job_application_submitted'];

export function pushConfiguration() {
  return { appleReady: applePushConfigured(), webReady: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY), webPublicKey: process.env.VAPID_PUBLIC_KEY || '' };
}

// Persist only an opaque reference, never a sender, subject, message body or PHI.
export function mobilePushPayload(delivery) {
  if (['websitechat','notification'].includes(delivery.source_kind)) return { title:'Auricwell',body:'New update',url:`/mobile/workspace?kind=notification&id=${delivery.source_id}`,tag:`auricwell-notification-${delivery.source_id}` };
  return { title: 'Auricwell', body: 'New message', url: `/mobile/workspace?kind=${delivery.source_kind}&id=${delivery.source_id}`, tag: `auricwell-${delivery.source_kind}-${delivery.source_id}` };
}

export function validateWebSubscription(subscription) {
  const endpoint = new URL(subscription?.endpoint || 'invalid:');
  // Restrict server-side delivery to known Web Push providers; no arbitrary URLs.
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.port ||
      !['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(endpoint.hostname) ||
      !/^[A-Za-z0-9_-]{80,100}$/.test(subscription?.keys?.p256dh || '') ||
      !/^[A-Za-z0-9_-]{20,30}$/.test(subscription?.keys?.auth || '')) {
    throw failure(400, 'MOBILE_PUSH_INVALID', 'This device notification subscription is invalid.');
  }
  return { endpoint: endpoint.href, keys: {p256dh: subscription.keys.p256dh, auth: subscription.keys.auth} };
}

export function createMobilePushRegistration(db=pool) { return async function registerMobilePush(context, payload) {
  if (payload.enabled !== true) {
    await db.execute('UPDATE mobile_device_sessions SET push_enabled=0,push_token=NULL,web_push_subscription=NULL WHERE id=?', [context.device.id]);
    await db.execute('UPDATE mobile_push_deliveries SET skipped_at=NOW() WHERE device_session_id=? AND delivered_at IS NULL',[context.device.id]);
    return { enabled: false, ...pushConfiguration() };
  }
  let token=null, environment=null, subscription=null;
  if (context.device.client_id === 'ios') {
    if (!/^[a-f0-9]{64}$/i.test(payload.token || '') || !['sandbox','production'].includes(payload.environment)) throw failure(400,'MOBILE_PUSH_INVALID','Register this device with Apple notifications first.');
    token=payload.token.toLowerCase(); environment=payload.environment;
  } else subscription=validateWebSubscription(payload.subscription);
  // Baseline at first opt-in (and after disabling), so old mail is never replayed.
  // A renewed token belongs to one current device grant, not prior sign-ins.
  if(token)await db.execute('UPDATE mobile_device_sessions SET push_enabled=0,push_token=NULL WHERE push_token=? AND id<>?',[token,context.device.id]);
  await db.execute(`UPDATE mobile_device_sessions SET
    chat_cursor=IF(push_enabled=1,chat_cursor,(SELECT COALESCE(MAX(id),0) FROM chat_messages)),
    email_cursor=IF(push_enabled=1,email_cursor,(SELECT COALESCE(MAX(id),0) FROM communication_messages)),
    sms_cursor=IF(push_enabled=1,sms_cursor,(SELECT COALESCE(MAX(id),0) FROM message_logs)),
    notification_cursor=IF(push_enabled=1,notification_cursor,(SELECT COALESCE(MAX(id),0) FROM notifications)),
    push_enabled=1,push_token=?,push_environment=?,web_push_subscription=? WHERE id=? AND revoked_at IS NULL`,
    [token,environment,subscription ? JSON.stringify(subscription) : null,context.device.id]);
  return {enabled:true,...pushConfiguration()};
}; }
export const registerMobilePush=createMobilePushRegistration();

export function createMobilePushWorker({db=pool, sessions=mobileSessions, conversationAccess=requireConversationAccess,refreshSecure=refreshClientSecureAccess,
  agencyAccess=readAgencyAccess, channelEnabled=isNotificationChannelEnabled, demoListing=isDemoExchangeListing,
  sendApple=sendApplePush, sendWeb=(sub,payload)=>webpush.sendNotification(sub,JSON.stringify(payload),{
    TTL:3600,vapidDetails:{subject:'mailto:support@auricwell.com',publicKey:process.env.VAPID_PUBLIC_KEY,privateKey:process.env.VAPID_PRIVATE_KEY}
  }), configuration=pushConfiguration}={}) {
  async function permitted(device, kind, id, context=null, {forDelivery=true}={}) {
    context=context || await sessions.access(device.id,device.user_id,device.agency_id);
    const uid=Number(device.user_id);
    const agencyScope=column=>{
      if(Array.isArray(context.agencies)){
        const ids=context.agencies.map(a=>Number(a.id)).filter(id=>Number.isSafeInteger(id)&&id>0);
        return {sql:ids.length?`${column} IN(${ids.map(()=>'?').join(',')})`:'FALSE',params:ids};
      }
      return {sql:`EXISTS(SELECT 1 FROM user_agencies member JOIN agencies a ON a.id=member.agency_id WHERE member.user_id=? AND member.agency_id=${column} AND member.is_active=1 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0)`,params:[uid]};
    };
    if(context.surface==='family'){
      if(kind!=='chat')return null;
      const [[row]]=await db.execute(`SELECT m.thread_id,t.agency_id FROM chat_messages m JOIN chat_threads t ON t.id=m.thread_id
        JOIN chat_thread_participants p ON p.thread_id=t.id AND p.user_id=? JOIN agencies a ON a.id=t.agency_id AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
        WHERE m.id=? AND ${familyMessageVisibilitySql(uid)} AND t.message_channel='secure' AND m.sender_user_id<>? AND NOT EXISTS(SELECT 1 FROM chat_message_deletes d WHERE d.message_id=m.id AND d.user_id=?)
        AND NOT EXISTS(SELECT 1 FROM notifications n LEFT JOIN notification_user_reads r ON r.notification_id=n.id AND r.user_id=?
          WHERE n.user_id=? AND n.related_entity_type='chat_thread' AND n.related_entity_id=t.id AND COALESCE(r.muted_until,n.muted_until)>NOW()) LIMIT 1`,[uid,id,uid,uid,uid,uid]);
      if(!row)return null;
      try{await refreshSecure(row.thread_id,uid);return Number(row.thread_id);}catch(error){if([403,404].includes(error.status))return null;throw error;}
    }

    if (['websitechat','notification'].includes(kind)) {
      const scope=agencyScope('n.agency_id');
      const [[row]]=await db.execute(`SELECT n.*,r.dismissed_at,r.snoozed_until,r.muted_until AS viewer_muted_until FROM notifications n
        LEFT JOIN notification_user_reads r ON r.notification_id=n.id AND r.user_id=?
        WHERE n.id=? AND n.user_id=? AND ${scope.sql} AND n.type IN (${EVENT_NOTIFICATION_TYPES.map(()=>'?').join(',')})
        AND r.dismissed_at IS NULL AND (r.snoozed_until IS NULL OR r.snoozed_until<=NOW())
        AND (COALESCE(r.muted_until,n.muted_until) IS NULL OR COALESCE(r.muted_until,n.muted_until)<=NOW()) LIMIT 1`,[uid,id,uid,...scope.params,...EVENT_NOTIFICATION_TYPES]);
      if(!row || !qaAgencyAllowed(context.qaAgencyIds,row.agency_id))return null;
      const grant=await agencyAccess(uid,row.agency_id);if(!grant)return null;
      const actor=applyAgencyAccess(context.user,grant);
      if(row.type==='website_chat_waiting') {
        if(!['admin','support','super_admin'].includes(actor.role))return null;
        if(forDelivery){const [[online]]=await db.execute('SELECT 1 FROM public_website_chat_staff WHERE user_id=? AND last_seen_at>UTC_TIMESTAMP()-INTERVAL 75 SECOND',[uid]);if(!online)return null;}
      } else if(row.type==='new_job_application_submitted') {
        if(getUserCapabilities(actor).canManageHiring!==true)return null;
      } else if(await demoListing({listingId:row.related_entity_id,agencyId:row.agency_id}))return null;
      if(!await channelEnabled({userId:uid,userRole:actor.role,agencyId:row.agency_id,type:row.type,channel:forDelivery?'push':'inApp'}))return null;
      return Number(row.id);
    }

    if(kind==='chat') {
      const scope=agencyScope('t.agency_id');
      const [[row]]=await db.execute(`SELECT m.thread_id,t.agency_id FROM chat_messages m
        JOIN chat_threads t ON t.id=m.thread_id JOIN chat_thread_participants p ON p.thread_id=t.id AND p.user_id=?
        WHERE m.id=? AND ${familyMessageVisibilitySql(uid)} AND ${scope.sql} AND m.sender_user_id<>?
        AND NOT EXISTS (SELECT 1 FROM chat_message_deletes d WHERE d.message_id=m.id AND d.user_id=?)
        AND NOT EXISTS (SELECT 1 FROM notifications n LEFT JOIN notification_user_reads r ON r.notification_id=n.id AND r.user_id=?
          WHERE n.user_id=? AND n.related_entity_type='chat_thread' AND n.related_entity_id=t.id
          AND COALESCE(r.muted_until,n.muted_until)>NOW()) LIMIT 1`,[uid,id,...scope.params,uid,uid,uid,uid]);
      if(!row || !qaAgencyAllowed(context.qaAgencyIds,row.agency_id))return null;
      try{await refreshSecure(row.thread_id,uid);}catch(error){if([403,404].includes(error.status))return null;throw error;}
      return Number(row.thread_id);
    }
    if(kind==='email') {
      const scope=agencyScope('c.agency_id');
      const [[row]]=await db.execute(`SELECT m.conversation_id,c.agency_id,m.subject,m.suppress_push,m.auto_reply_kind FROM communication_messages m JOIN communication_conversations c ON c.id=m.conversation_id
        WHERE m.id=? AND ${scope.sql} AND m.channel='email' AND m.direction='inbound' AND m.is_internal_note=0`,[id,...scope.params]);
      if(!row || !qaAgencyAllowed(context.qaAgencyIds,row.agency_id))return null;
      if(Number(row.suppress_push))return null;
      if(row.auto_reply_kind==='school_group_notification' || / - (?:Paper Enrollment Packet Uploaded|Digital Enrollment Packet)$/i.test(row.subject || '')){
        const [[choice]]=await db.execute("SELECT in_app_enabled,push_enabled FROM user_notification_type_preferences WHERE user_id=? AND notification_type='school_group_email_received'",[uid]);
        if(choice && (Number(choice.in_app_enabled)===0 && choice.in_app_enabled!=null || Number(choice.push_enabled)===0 && choice.push_enabled!=null))return null;
      }
      try { await conversationAccess({id:uid,role:'provider',mobileDevice:true},row.conversation_id); return Number(row.conversation_id); }
      catch(error) { if(error.status===403 || error.status===404)return null; throw error; }
    }
    if(kind==='sms') {
      const scope=agencyScope('ml.agency_id');
      const [[row]]=await db.execute(`SELECT ml.id,ml.agency_id FROM message_logs ml WHERE ml.id=? AND ${scope.sql} AND ml.direction='INBOUND'
        AND (ml.user_id=? OR ml.assigned_user_id=? OR ml.number_id IN
          (SELECT number_id FROM twilio_number_assignments WHERE user_id=? AND is_active=1 AND sms_access_enabled=1)
          OR ${assignedSmsAccessSql}) LIMIT 1`,[id,...scope.params,uid,uid,uid,uid,uid,uid]);
      return row && qaAgencyAllowed(context.qaAgencyIds,row.agency_id) ? Number(row.id) : null;
    }
    return null;
  }
  async function scan(device) {
    const context=await sessions.access(device.id,device.user_id,device.agency_id);
    for(const [kind,table,cursor] of [['chat','chat_messages','chat_cursor'],['email','communication_messages','email_cursor'],['sms','message_logs','sms_cursor']]) {
      if(device[cursor]==null)continue;
      // Ascending IDs + per-device cursor + unique queue key survive restarts and overlap.
      const [rows]=await db.execute(`SELECT id FROM ${table} WHERE id>? ORDER BY id LIMIT 100`,[device[cursor]]);
      for(const row of rows) {
        const target=await permitted(device,kind,row.id,context);
        if(target)await db.execute(`INSERT IGNORE INTO mobile_push_deliveries (device_session_id,source_kind,source_id,target_id) VALUES (?,?,?,?)`,[device.id,kind,row.id,target]);
        await db.execute(`UPDATE mobile_device_sessions SET ${cursor}=GREATEST(${cursor},?) WHERE id=?`,[row.id,device.id]);
      }
    }
    if(device.notification_cursor==null) {
      await db.execute('UPDATE mobile_device_sessions SET notification_cursor=(SELECT COALESCE(MAX(id),0) FROM notifications) WHERE id=? AND notification_cursor IS NULL',[device.id]);
    } else {
      const [rows]=await db.execute('SELECT id FROM notifications WHERE id>? AND user_id=? ORDER BY id LIMIT 100',[device.notification_cursor,device.user_id]);
      for(const row of rows){
        const target=await permitted(device,'notification',row.id,context);
        if(target)await db.execute(`INSERT IGNORE INTO mobile_push_deliveries(device_session_id,source_kind,source_id,target_id) VALUES(?,?,?,?)`,[device.id,'notification',row.id,target]);
        await db.execute('UPDATE mobile_device_sessions SET notification_cursor=GREATEST(notification_cursor,?) WHERE id=?',[row.id,device.id]);
      }
    }
  }
  async function deliver(row) {
    const [claim]=await db.execute(`UPDATE mobile_push_deliveries SET locked_until=DATE_ADD(NOW(),INTERVAL 60 SECOND),attempts=attempts+1,last_attempt_at=NOW()
      WHERE id=? AND delivered_at IS NULL AND skipped_at IS NULL AND (locked_until IS NULL OR locked_until<NOW())`,[row.delivery_id]);
    if(claim.affectedRows!==1)return;
    try {
      const context=await sessions.access(row.device_session_id,row.user_id,row.agency_id);
      const device=context.device;
      if(!device.push_enabled || !await permitted(device,row.source_kind,row.source_id,context)) {
        await db.execute('UPDATE mobile_push_deliveries SET skipped_at=NOW() WHERE id=?',[row.delivery_id]);return;
      }
      const config=configuration();
      const native=device.client_id==='ios';
      if(native ? !config.appleReady : !config.webReady) {
        await db.execute("UPDATE mobile_push_deliveries SET last_error='pending_configuration',locked_until=DATE_ADD(NOW(),INTERVAL 5 MINUTE) WHERE id=?",[row.delivery_id]);return;
      }
      const payload=mobilePushPayload(row);
      if(native)await sendApple(device.push_token,device.push_environment,payload);
      else await sendWeb(typeof device.web_push_subscription==='string'?JSON.parse(device.web_push_subscription):device.web_push_subscription,payload);
      await db.execute('UPDATE mobile_push_deliveries SET delivered_at=NOW(),last_error=NULL WHERE id=?',[row.delivery_id]);
    } catch(error) {
      if([404,410].includes(error.statusCode) || error.code==='APNS_UNREGISTERED')await db.execute('UPDATE mobile_device_sessions SET push_enabled=0 WHERE id=?',[row.device_session_id]);
      await db.execute("UPDATE mobile_push_deliveries SET last_error=?,locked_until=DATE_ADD(NOW(),INTERVAL 60 SECOND) WHERE id=?",[String(error.code || 'delivery_failed').slice(0,160),row.delivery_id]);
    }
  }
  async function tick() {
    const [devices]=await db.execute('SELECT * FROM mobile_device_sessions WHERE revoked_at IS NULL AND push_enabled=1 ORDER BY id');
    for(const device of devices) {
      try { await scan(device); }
      catch(error) { if(![401,403].includes(error.status))throw error; }
    }
    const [queue]=await db.execute(`SELECT q.id AS delivery_id,q.*,d.user_id,d.agency_id FROM mobile_push_deliveries q
      JOIN mobile_device_sessions d ON d.id=q.device_session_id WHERE q.delivered_at IS NULL AND q.skipped_at IS NULL
      AND d.revoked_at IS NULL AND d.push_enabled=1 AND q.created_at>DATE_SUB(NOW(),INTERVAL 1 HOUR)
      AND (q.locked_until IS NULL OR q.locked_until<NOW()) ORDER BY q.id LIMIT 100`);
    for(const row of queue)await deliver(row);
  }
  return {tick,permitted,scan,deliver};
}

let running=false;
export async function mobilePushTick() {
  if(running)return;
  running=true;
  try { await (await import('../websiteChatNotifications.service.js')).websiteChatNotifications.drain();await createMobilePushWorker().tick(); }
  catch(error) { if(!['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes(error.code))console.warn('[mobile push]',error.code || 'worker_failed'); }
  finally {running=false;}
}
