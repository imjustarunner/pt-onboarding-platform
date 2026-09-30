import crypto from 'node:crypto';
import pool from '../config/database.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { usesPasswordLogin } from '../utils/passwordLogin.js';
import { isNotificationChannelEnabled } from './notificationPreferences.service.js';
import { resolvePreferredSenderIdentityForAgency } from './emailSenderIdentityResolver.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { arrivalEmail } from './officeArrivalEmail.js';
import { feedbackForArrival } from './officeArrivalFeedback.service.js';
export { arrivalEmail, escapeHtml } from './officeArrivalEmail.js';
import { withMessagingJobLock } from './messagingJobLock.service.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';

export function arrivalRecipient(user) {
  const address = usesPasswordLogin(user)
    ? user.personal_email || (![true,1,'1'].includes(user.login_is_group_email) ? user.email : null)
    : user.work_email || user.email;
  return String(address || '').trim().toLowerCase() || null;
}
export const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');

export async function acknowledgeArrival(id, userId, inAppOnly = false) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[row]] = await db.execute('SELECT notification_id FROM office_arrival_deliveries WHERE notification_id=? AND user_id=? FOR UPDATE', [id,userId]);
    if (!row) throw Object.assign(new Error('Arrival not found'), {status:404});
    if (inAppOnly) {
      // Update just these channels; preserve all other notification preferences.
      await db.execute(`INSERT INTO user_notification_type_preferences (user_id,notification_type,in_app_enabled,email_enabled)
        VALUES (?,'kiosk_checkin',1,0) ON DUPLICATE KEY UPDATE in_app_enabled=1,email_enabled=0`,[userId]);
    }
    await db.execute(`UPDATE office_arrival_deliveries SET acknowledged_at=COALESCE(acknowledged_at,UTC_TIMESTAMP()),
      email_status=IF(email_status='pending','suppressed',email_status) WHERE notification_id=? AND user_id=?`,[id,userId]);
    await db.execute('UPDATE notifications SET is_read=1,read_at=COALESCE(read_at,UTC_TIMESTAMP()) WHERE id=? AND user_id=?',[id,userId]);
    await db.commit();
  } catch(error) {await db.rollback();throw error;} finally {db.release();}
}

export async function listArrivals(userId, userRole) {
  const [rows] = await pool.execute(`SELECT n.id,n.title,n.message,n.agency_id,d.email_status,d.due_at
    FROM office_arrival_deliveries d JOIN notifications n ON n.id=d.notification_id
    JOIN users u ON u.id=d.user_id AND u.is_active=1 AND u.terminated_at IS NULL
    WHERE d.user_id=? AND n.user_id=? AND d.acknowledged_at IS NULL
      AND d.created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 4 HOUR)
      AND EXISTS (SELECT 1 FROM user_agencies ua WHERE ua.user_id=d.user_id AND ua.agency_id=d.agency_id AND ua.is_active=1)
    ORDER BY d.created_at LIMIT 20`,[userId,userId]);
  const result=[];
  for(const row of rows) if(await isNotificationChannelEnabled({userId,userRole,agencyId:row.agency_id,type:'kiosk_checkin',channel:'inApp'})) {
    // An unavailable score must never hide the arrival itself.
    try { row.feedback=await feedbackForArrival({notification_id:row.id,user_id:userId,agency_id:row.agency_id},Date.now(),{waitForCompletion:false}); }
    catch { row.feedbackUnavailable=true; }
    result.push(row);
  }
  return result;
}

// A database advisory lock prevents competing replicas. Claim each row before
// sending: uncertain sends stay 'sending' for inspection rather than duplicate
// an arrival email after a process crash. Definitive failures retry up to 3 times.
export async function runOfficeArrivalTick() {
  return withMessagingJobLock('office-arrivals', async () => {
    const [rows]=await pool.execute(`SELECT d.*,n.message,n.is_read,u.role,u.email,u.work_email,u.personal_email,
      u.sso_password_override,u.login_is_group_email,u.is_demo,u.is_active,u.terminated_at
      FROM office_arrival_deliveries d JOIN notifications n ON n.id=d.notification_id
      JOIN users u ON u.id=d.user_id
      WHERE d.email_status='pending' AND d.due_at<=UTC_TIMESTAMP()
      ORDER BY d.due_at LIMIT 30`);
    for(const row of rows) {
      const context={userId:row.user_id,userRole:row.role,agencyId:row.agency_id,type:'kiosk_checkin',channel:'email'};
      try {
        const [members]=await pool.execute('SELECT 1 FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1 LIMIT 1',[row.user_id,row.agency_id]);
        if(row.acknowledged_at || !row.is_active || row.terminated_at || !members.length || !await isNotificationChannelEnabled(context)) {
          await pool.execute("UPDATE office_arrival_deliveries SET email_status='suppressed' WHERE notification_id=? AND email_status='pending'",[row.notification_id]);continue;
        }
        if(Date.now()-parseUtcDate(row.created_at).getTime()>4*60*60_000){await pool.execute("UPDATE office_arrival_deliveries SET email_status='expired' WHERE notification_id=? AND email_status='pending'",[row.notification_id]);continue;}
        const feedback=await feedbackForArrival(row);
        if(feedback?.wait){
          await pool.execute("UPDATE office_arrival_deliveries SET due_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 SECOND) WHERE notification_id=? AND email_status='pending'",[row.notification_id]);continue;
        }
        const to=arrivalRecipient(row);
        const sender=await EmailSenderIdentity.findByAgencyAndIdentityKey(row.agency_id,'kiosk') || await resolvePreferredSenderIdentityForAgency({agencyId:row.agency_id,preferredKeys:['notifications','system'],includePlatformDefaults:false,onlyActive:true});
        if(!to || !sender?.id || Number(sender.agency_id)!==Number(row.agency_id)) throw Object.assign(new Error('Missing email setup'),{code:'ARRIVAL_EMAIL_SETUP'});
        const token=crypto.randomBytes(32).toString('hex');
        // Recheck acknowledgment atomically immediately before external delivery.
        const [claim]=await pool.execute(`UPDATE office_arrival_deliveries d JOIN notifications n ON n.id=d.notification_id
          SET d.email_status='sending',d.attempts=d.attempts+1,d.action_token_hash=?,d.action_expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 DAY)
          WHERE d.notification_id=? AND d.email_status='pending' AND d.acknowledged_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM user_notification_type_preferences p WHERE p.user_id=d.user_id AND p.notification_type='kiosk_checkin' AND p.email_enabled=0)`,[tokenHash(token),row.notification_id]);
        if(!claim.affectedRows)continue;
        const result=await sendEmailFromIdentity({senderIdentityId:sender.id,to,...arrivalEmail(row,token,feedback),userId:row.user_id,templateType:'kiosk_checkin',source:'auto',internetMessageIdOverride:`<office-arrival-${row.notification_id}@plottwisthq.com>`});
        const status=result?.skipped?'suppressed':result?.pendingApproval?'pending_approval':result?.id?'sent':'failed';
        await pool.execute('UPDATE office_arrival_deliveries SET email_status=?,last_error=? WHERE notification_id=?',[status,result?.reason?.slice(0,100)||null,row.notification_id]);
      } catch(error) {
        // Verification happens before Gmail send. A temporary verification
        // failure is known not to have sent mail, so it is safe to retry.
        if(error.code==='EMAIL_SENDER_TEMPORARY'){
          const retry=new Date(Math.max(Date.now()+60000,Number(error.retryAt)||0)+5000).toISOString().slice(0,19).replace('T',' ');
          await pool.execute("UPDATE office_arrival_deliveries SET email_status='pending',last_error=?,due_at=? WHERE notification_id=? AND email_status IN ('pending','sending')",[error.code,retry,row.notification_id]);
          continue;
        }
        // A transport timeout can mean delivered: never automatically resend an
        // already claimed email. Pre-send setup errors may safely retry.
        await pool.execute(`UPDATE office_arrival_deliveries SET attempts=attempts+1,last_error=?,
          email_status=IF(email_status='sending' OR attempts>=3,'failed','pending'),due_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 60 SECOND)
          WHERE notification_id=? AND email_status IN ('pending','sending')`,[String(error.code||'delivery_error').slice(0,100),row.notification_id]);
        console.warn('[office-arrival] Email fallback needs attention',row.notification_id,error.code||'delivery_error');
      }
    }
  });
}
