import pool from '../config/database.js';
import {buildProviderUpdatePublicUrl} from './providerUpdate.service.js';
import {resolveProviderUpdateRecipients} from './providerUpdateRecipient.service.js';
import {resolveProviderUpdateSender} from './providerUpdateEmailSender.service.js';
import {sendEmailFromIdentity} from './unifiedEmail/unifiedEmailSender.service.js';
import {resolveRegisteredSmsSender,prepareSmsDelivery} from './smsCompliance.service.js';
import Vonage from './vonage.service.js';
import SmsLog from '../models/NotificationSmsLog.model.js';
import {normalizeSmsPhone} from '../utils/smsThreadIdentity.js';
import {staffCommunicationKey,phoneFingerprint} from '../utils/staffCommunicationChoices.js';
import {reminderDay,reminderRecipientSql,providerUpdateReminderMessage} from '../utils/providerUpdateReminders.js';

const parse=value=>typeof value==='string'?JSON.parse(value):value||{};
const fail=(message,status=400)=>Object.assign(Error(message),{status});

export function createProviderUpdateReminders({db=pool,resolveRecipients=resolveProviderUpdateRecipients,resolveSender=resolveProviderUpdateSender,sendEmail=sendEmailFromIdentity,resolveSmsSender=resolveRegisteredSmsSender,prepareSms=prepareSmsDelivery,sendSms=options=>Vonage.sendSms(options),smsLog=SmsLog,buildLink=buildProviderUpdatePublicUrl}={}) {
  async function assertPush(pushId,agencyId) {
    const [[push]]=await db.execute('SELECT id,status,title FROM provider_update_pushes WHERE id=? AND agency_id=?',[pushId,agencyId]);
    if(!push)throw fail('Provider Update not found.',404);
    return push;
  }
  async function getSettings(pushId,agencyId) {
    await assertPush(pushId,agencyId);
    const [[settings]]=await db.execute('SELECT enabled,sms_enabled,timezone,local_hour FROM provider_update_reminder_settings WHERE push_id=?',[pushId]);
    const [deliveries]=await db.execute(`SELECT d.channel,d.status,COUNT(*) count,MAX(d.updated_at) last_at FROM provider_update_reminder_deliveries d
      JOIN provider_update_recipients r ON r.id=d.recipient_id WHERE r.push_id=? AND r.agency_id=? GROUP BY d.channel,d.status`,[pushId,agencyId]);
    return {enabled:!!settings?.enabled,smsEnabled:!!settings?.sms_enabled,timezone:settings?.timezone||'America/Denver',localHour:settings?.local_hour??9,deliveries};
  }
  async function saveSettings({pushId,agencyId,enabled,smsEnabled,actorUserId}) {
    if(typeof enabled!=='boolean'||typeof smsEnabled!=='boolean')throw fail('Choose whether daily email and text reminders are enabled.');
    const push=await assertPush(pushId,agencyId);
    if(enabled&&(push.status!=='sent'||String(push.title).startsWith('[PREVIEW]')))throw fail('Send the update invitations before enabling reminders.',409);
    await db.execute(`INSERT INTO provider_update_reminder_settings (push_id,enabled,sms_enabled,updated_by_user_id) VALUES (?,?,?,?)
      ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),sms_enabled=VALUES(sms_enabled),updated_by_user_id=VALUES(updated_by_user_id)`,[pushId,enabled?1:0,smsEnabled?1:0,actorUserId]);
    return getSettings(pushId,agencyId);
  }
  async function currentRecipient(recipientId) {
    const [[row]]=await db.execute(`SELECT r.*,u.first_name,u.email,u.work_email,u.personal_phone,u.work_phone,u.phone_number,
      a.portal_url,a.slug,settings.sms_enabled ${reminderRecipientSql} AND r.id=?`,[recipientId]);
    return row;
  }
  async function smsOptions(row,link) {
    const to=normalizeSmsPhone(row.personal_phone||row.work_phone||row.phone_number);
    if(!to)return null;
    const [[prefs]]=await db.execute('SELECT sms_enabled,notification_categories FROM user_preferences WHERE user_id=?',[row.provider_user_id]);
    const choice=parse(prefs?.notification_categories)[staffCommunicationKey(row.agency_id)];
    if(!prefs?.sms_enabled||choice?.choices?.notifications!==true||choice.phoneHash!==phoneFingerprint(to))return null;
    const from=await resolveSmsSender({agencyId:row.agency_id,purpose:'workforce'});
    if(!from)return null;
    const options={to,from,body:`Your Provider Update is still unfinished. Continue here: ${link}`,purpose:'workforce',agencyId:row.agency_id,staffNotificationKind:'notifications'};
    // Preflight is read-only; sendSms checks consent, STOP, and live carrier status again.
    await prepareSms(options);
    return options;
  }
  async function deliver(recipientId,channel,date) {
    // Atomic unique claim survives process restarts and multiple Cloud Run instances.
    // Ambiguous sends stay 'sending' for review; never retry blindly.
    const [claim]=await db.execute(`INSERT IGNORE INTO provider_update_reminder_deliveries (recipient_id,reminder_date,channel)
      SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM provider_update_reminder_deliveries d WHERE d.recipient_id=? AND d.channel=? AND d.status IN ('sending','pending'))`,[recipientId,date,channel,recipientId,channel]);
    if(!claim.affectedRows)return {status:'duplicate'};
    let status='skipped',reason=null,communicationId=null,smsLogId=null,externalId=null;
    try {
      let row=await currentRecipient(recipientId);
      if(!row || (channel==='sms'&&!row.sms_enabled))reason='update_no_longer_eligible';
      else {
        const link=buildLink(row.token,row.portal_url||row.slug);
        if(channel==='email') {
          const [recipient]=await resolveRecipients(row.agency_id,[row]);
          if(!recipient?.work_email)reason='missing_work_email';
          else {
            const sender=await resolveSender(row.agency_id);
            // Recipient may have submitted while address/sender resolution was running.
            row=await currentRecipient(recipientId);
            if(!row)reason='update_no_longer_eligible';
            else {
              status='sending';
              const result=await sendEmail({senderIdentityId:sender.identity.id,to:recipient.work_email,...providerUpdateReminderMessage({firstName:row.first_name,link}),source:'auto',agencyId:row.agency_id,userId:row.provider_user_id,templateType:'provider_update_reminder',replyToOverride:sender.replyTo});
              communicationId=result?.communicationId||null;externalId=result?.id||null;
              status=result?.queued?'pending':result?.blocked?'failed':result?.skipped?'skipped':result?.id?'sent':'sending';
              reason=result?.reason||(!result?.id&&!result?.queued?'delivery_not_confirmed':null);
            }
          }
        } else {
          const options=await smsOptions(row,link);
          if(!options)reason='sms_not_eligible';
          else if(!(await currentRecipient(recipientId))?.sms_enabled)reason='update_no_longer_eligible';
          else {
            const log=await smsLog.create({userId:row.provider_user_id,agencyId:row.agency_id,toNumber:options.to,fromNumber:options.from,body:options.body});
            smsLogId=log.id;status='sending';
            const result=await sendSms(options);
            externalId=result?.sid||null;status=externalId?'sent':'sending';reason=externalId?null:'delivery_not_confirmed';
            await smsLog.updateStatus(log.id,{status:externalId?'sent':'failed',providerRef:externalId,errorMessage:reason});
          }
        }
      }
    } catch(error) {
      // Policy denials are safe skips. A transport exception may mean acceptance
      // without a response: retain 'sending' so tomorrow cannot duplicate it.
      reason=String(error?.code||'reminder_delivery_error').slice(0,255);
      if(reason.startsWith('sms_'))status='skipped';
      else if(status!=='sending')status='failed';
      if(smsLogId)await smsLog.updateStatus(smsLogId,{status:'failed',errorMessage:reason}).catch(()=>{});
    }
    await db.execute('UPDATE provider_update_reminder_deliveries SET status=?,reason=?,communication_id=?,sms_log_id=?,external_message_id=? WHERE id=?',[status,reason,communicationId,smsLogId,externalId,claim.insertId]);
    return {status,reason};
  }
  async function run({now=new Date(),pushId=null}={}) {
    // Reconcile accepted/failed approval-queue messages before considering another day.
    await db.execute(`UPDATE provider_update_reminder_deliveries d JOIN user_communications c ON c.id=d.communication_id
      SET d.status=CASE WHEN c.delivery_status IN ('sent','delivered') THEN 'sent' ELSE 'failed' END
      WHERE d.status='pending' AND c.delivery_status IN ('sent','delivered','failed','bounced','skipped')`);
    const [settings]=await db.execute(`SELECT s.* FROM provider_update_reminder_settings s JOIN provider_update_pushes p ON p.id=s.push_id
      WHERE s.enabled=1 AND p.status='sent' AND (? IS NULL OR s.push_id=?)`,[pushId,pushId]);
    const summary={email:{},sms:{}};
    for(const setting of settings) {
      const day=reminderDay(now,setting.timezone,setting.local_hour);
      if(!day.due)continue;
      const [rows]=await db.execute(`SELECT r.id ${reminderRecipientSql} AND r.push_id=?
        AND NOT EXISTS (SELECT 1 FROM provider_update_sends recent WHERE recent.recipient_id=r.id AND recent.sent_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR))
        AND (NOT EXISTS (SELECT 1 FROM provider_update_reminder_deliveries d WHERE d.recipient_id=r.id AND d.channel='email' AND (d.reminder_date=? OR d.status IN ('sending','pending')))
          OR (?=1 AND NOT EXISTS (SELECT 1 FROM provider_update_reminder_deliveries d WHERE d.recipient_id=r.id AND d.channel='sms' AND (d.reminder_date=? OR d.status IN ('sending','pending')))))
        ORDER BY r.id`,[setting.push_id,day.date,setting.sms_enabled?1:0,day.date]);
      for(const row of rows)for(const channel of setting.sms_enabled?['email','sms']:['email']) {
        const result=await deliver(row.id,channel,day.date);
        summary[channel][result.status]=(summary[channel][result.status]||0)+1;
      }
    }
    return summary;
  }
  return {getSettings,saveSettings,run,currentRecipient,smsOptions};
}
export const providerUpdateReminders=createProviderUpdateReminders();
