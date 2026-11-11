import pool from '../config/database.js';
import { secureSessionComments, sessionCommentError } from './secureSessionComments.service.js';
import { isNotificationChannelEnabled } from './notificationPreferences.service.js';
import { getAgencyEmailSettings } from './emailSettings.service.js';
import { notificationTransportReceipt } from '../utils/notificationTransportReceipt.js';
import { isValidTimeZone, utcDateToZonedYmd } from '../utils/zonedWallTime.util.js';

const PREFIX = 'secure_session_comment_notice:';
const PROVIDERS = new Set(['provider','provider_plus','intern','intern_plus','clinician','therapist','supervisor','clinical_practice_assistant','admin','super_admin']);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const deliveryId = type => String(type || '').startsWith(PREFIX) ? Number(String(type).slice(PREFIX.length)) : null;
const FAMILIES = new Set(['client', 'client_guardian']);
const emailFor = user => FAMILIES.has(user.role) ? user.email || user.personal_email : user.work_email || user.email;
async function usesPersonalPortal(userId,db=pool){
  const [[access]]=await db.execute('SELECT user_id FROM dependent_portal_access WHERE user_id=? AND revoked_at IS NULL',[userId]);
  return !!access;
}
export function sessionCommentNotificationPath({ kind, appointment, family = false, personal = false }) {
  const params = kind === 'morning' ? new URLSearchParams({ secureSessionComments:'today' })
    : new URLSearchParams({ secureCommentAppointmentId:String(appointment.id), secureCommentClientId:String(appointment.client_id) });
  if (family && appointment) { params.set('clientId',String(appointment.client_id)); params.set('panel','appointments'); }
  if (!family && appointment) { params.set('scheduleAction','appointment'); params.set('scheduleAppointmentId',String(appointment.id)); }
  return `${family ? personal ? 'my-portal' : 'guardian' : 'my-schedule'}?${params}`;
}

/** Deliberately accepts no clinical content, patient name, session time or author
 * name. All sensitive preview text is fetched after authentication. */
export function buildSessionCommentNotificationEmail({ url, morning = false }) {
  const headline = morning ? 'You have secure session comments for your appointments today.' : 'You have secure session comments waiting.';
  return { subject: morning ? 'AuricWell — secure session comments for today' : 'AuricWell — secure session comments',
    title:'AuricWell Secure Session Comments',
    text:`${headline}\n\nSign in to AuricWell to read and reply securely:\n${url}\n\nComments and appointment details are available only after sign-in. Please respond inside your portal.`,
    html:`<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:28px;background:#f7faff;border-radius:20px;color:#08204c"><p style="font-size:14px;color:#164e91;font-weight:bold">AURICWELL · SECURE SESSION COMMENTS</p><h1 style="font-size:26px;line-height:1.3">${escape(headline)}</h1><p>Sign in to read and reply securely. Comment contents and appointment details are not included in this email.</p><a href="${escape(url)}" style="display:block;text-align:center"><img src="https://auricwell.com/auricwell/session-comments/secure-session-button.png" alt="AuricWell Secure Session Comment — sign in to open" style="display:block;width:100%;max-width:580px;height:auto;border:0"></a><p><a href="${escape(url)}" style="color:#07519b;font-weight:bold">Open secure session comments in AuricWell</a></p><p style="font-size:12px">Please reply inside your portal. This notification does not provide emergency monitoring.</p></div>` };
}

async function defaultSend({ delivery, current, a }) {
  const family = FAMILIES.has(current.role);
  const { default: Agency } = await import('../models/Agency.model.js');
  const { buildPublicAppUrl } = await import('../utils/publicPortalUrl.js');
  const personal = family ? await usesPersonalPortal(current.id) : false;
  const path = sessionCommentNotificationPath({ kind: delivery.kind, appointment:a, family, personal });
  const to = emailFor(current);
  const common = { to, userId:current.id, clientId:a?.client_id || null, agencyId:Number(delivery.agency_id),
    generatedByUserId:null, source:'auto', templateType:`${PREFIX}${delivery.id}` };
  if (family) {
    const { clientEmailContext, sendClientPortalEmail } = await import('./clientPortalEmail.service.js');
    const context = await clientEmailContext({ agencyId:delivery.agency_id, clientId:a.client_id });
    return sendClientPortalEmail({ ...common, context,
      ...buildSessionCommentNotificationEmail({ url:context.url(path), morning:delivery.kind === 'morning' }) });
  }
  const agency = await Agency.findById(delivery.agency_id);
  const { sendNotificationEmail } = await import('./unifiedEmail/unifiedEmailSender.service.js');
  return sendNotificationEmail({ ...common, triggerKey:'secure_session_comment',
    ...buildSessionCommentNotificationEmail({ url:buildPublicAppUrl(agency,path), morning:delivery.kind === 'morning' }) });
}

export function createSessionCommentNotificationWorker(overrides = {}) {
  const d = { db:pool, comments:secureSessionComments, channel:isNotificationChannelEnabled, settings:getAgencyEmailSettings,
    personal:userId=>usesPersonalPortal(userId,d.db),
    clock:()=>new Date(), send:defaultSend, ...overrides };
  let morningCursor=0;
  async function dispatchOne(delivery) {
    const [claim] = await d.db.execute("UPDATE secure_session_comment_deliveries SET status='sending',attempted_at=UTC_TIMESTAMP(3) WHERE id=? AND status='pending'", [delivery.id]);
    if (!claim.affectedRows) return { id:Number(delivery.id), status:'already_claimed' };
    try {
      const { current, a } = await d.comments.deliveryAccess(delivery);
      const channelContext = { userId:current.id, userRole:current.role, agencyId:Number(delivery.agency_id), type:'secure_session_comment' };
      if (await d.channel({ ...channelContext, channel:'inApp' })) {
        const personal=FAMILIES.has(current.role)?await d.personal(current.id):false;
        const [notification] = await d.db.execute(`INSERT INTO notifications
          (type,severity,title,message,user_id,agency_id,related_entity_type,related_entity_id,audience_json,actor_source)
          VALUES ('secure_session_comment','info','AuricWell Secure Session Comments',?,?,?,'secure_session_comment',?,?,'secure_session_comments')`,
        [delivery.kind === 'morning' ? 'You have secure session comments for your appointments today. Sign in to read them securely.' : 'You have secure session comments waiting. Open AuricWell to read them securely.', current.id, delivery.agency_id,
          delivery.comment_id || null, JSON.stringify({ actionUrl:`/${sessionCommentNotificationPath({ kind:delivery.kind, appointment:a, family:FAMILIES.has(current.role),personal })}`,
            secureSessionComments:true, ...(a ? { appointmentId:Number(a.id), clientId:Number(a.client_id) } : {}) })]);
        await d.db.execute('UPDATE secure_session_comment_deliveries SET notification_id=? WHERE id=?', [notification.insertId, delivery.id]);
      }
      const settings = await d.settings(delivery.agency_id);
      let status = 'skipped', reason = 'email_disabled', communicationId = null;
      if (settings.secureClientMessageEmailEnabled !== false && await d.channel({ ...channelContext, channel:'email' })) {
        // Recheck immediately before the mail pipeline; it also repeats this at
        // actual transport time, including approval/delayed delivery.
        const fresh = await d.comments.deliveryAccess(delivery);
        if (!emailFor(fresh.current)) reason = 'no_email';
        else {
          const result = await d.send({ delivery, ...fresh });
          const receipt = notificationTransportReceipt(result, delivery.agency_id);
          status = receipt.accepted ? receipt.redirectedTo ? 'redirected' : 'sent'
            : result?.queued || result?.pendingApproval ? 'queued' : result?.blocked || result?.skipped ? 'skipped' : 'unknown';
          reason = status === 'sent' || status === 'redirected' ? null : status === 'queued' ? 'mail_pipeline_pending' : status === 'unknown' ? 'transport_unconfirmed' : 'mail_pipeline_blocked';
          communicationId = result?.communicationId || null;
        }
      }
      await d.db.execute('UPDATE secure_session_comment_deliveries SET status=?,reason=?,communication_id=COALESCE(?,communication_id) WHERE id=?', [status, reason, communicationId, delivery.id]);
      await d.comments.audit(`notification_${status}`, { a, commentId:delivery.comment_id || null, revision:delivery.revision || null, userId:current.id });
      return { id:Number(delivery.id), status };
    } catch (error) {
      const status = [403,404].includes(error.status) ? 'skipped' : 'unknown';
      await d.db.execute('UPDATE secure_session_comment_deliveries SET status=?,reason=? WHERE id=?', [status, status === 'skipped' ? 'access_or_unread_changed' : 'delivery_needs_review', delivery.id]);
      return { id:Number(delivery.id), status };
    }
  }
  async function queueMorning() {
    const [users] = await d.db.execute(`SELECT u.id,u.role,COALESCE(NULLIF(up.timezone,''),NULLIF(u.timezone,''),CASE WHEN COUNT(DISTINCT NULLIF(a.source_timezone,''))=1 THEN MIN(NULLIF(a.source_timezone,'')) ELSE NULL END) AS timezone
      FROM secure_session_comment_recipients r JOIN secure_session_comments c ON c.id=r.comment_id AND c.revision=r.revision
      JOIN appointments a ON a.id=c.appointment_id JOIN users u ON u.id=r.user_id
      LEFT JOIN user_preferences up ON up.user_id=u.id
      WHERE r.read_at IS NULL AND c.author_user_id<>u.id AND u.is_active=1 AND u.id>?
        AND a.start_at BETWEEN DATE_SUB(UTC_TIMESTAMP(),INTERVAL 36 HOUR) AND DATE_ADD(UTC_TIMESTAMP(),INTERVAL 36 HOUR)
      GROUP BY u.id,u.role,up.timezone,u.timezone ORDER BY u.id LIMIT 250`,[morningCursor]);
    morningCursor=users.length===250?Number(users.at(-1).id):0;
    let count = 0;
    const now = d.clock();
    for (const u of users) {
      if (!PROVIDERS.has(u.role)) continue;
      const zone = isValidTimeZone(u.timezone) ? u.timezone : 'America/Denver';
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone:zone, hourCycle:'h23',hour:'2-digit',minute:'2-digit' }).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
      const localMinutes = Number(parts.hour)*60+Number(parts.minute);
      // Owner confirmed 07:00 local. Unrelated daily-digest timing does not
      // alter secure-session reminders; email preferences still apply.
      if (localMinutes < 420) continue;
      try {
        const summary = await d.comments.today({ user:u, timeZone:zone, auditView:false,includeBodies:false });
        if (!summary.activeDay || !summary.unreadCount) continue;
        const agencies = [...new Set(summary.appointments.map(a=>a.agencyId))];
        for (const agencyId of agencies) {
          const [insert] = await d.db.execute(`INSERT IGNORE INTO secure_session_comment_deliveries
            (agency_id,recipient_user_id,kind,dedupe_key,time_zone,day_key) VALUES (?,?,'morning',?,?,?)`,
          [agencyId,u.id,`morning:${agencyId}:${u.id}:${utcDateToZonedYmd(now,zone)}`,zone,summary.dayKey]);
          count += Number(insert.affectedRows || 0);
        }
      } catch (error) { if (![403,404].includes(error.status)) throw error; }
    }
    return count;
  }
  async function tick({ limit = 50 } = {}) {
    const queuedMorning = await queueMorning();
    const [rows] = await d.db.execute(`SELECT *,DATE_FORMAT(day_key,'%Y-%m-%d') AS day_key FROM secure_session_comment_deliveries WHERE status='pending' ORDER BY id LIMIT ${Math.min(100,Math.max(1,Number(limit)||50))}`);
    const deliveries = [];
    for (const row of rows) deliveries.push(await dispatchOne(row));
    return { queuedMorning, deliveries };
  }
  return { tick, dispatchOne, queueMorning };
}
export const sessionCommentNotificationWorker = createSessionCommentNotificationWorker();

/** Called by both unified sender entry points and again immediately before MIME
 * transport. A crash/unknown transport consumes the claim and cannot auto-resend. */
export async function assertSessionCommentEmailRecipient({ templateType, agencyId, userId, to, cc = null, bcc = null, communicationId = null, claim = false }, overrides = {}) {
  const did = deliveryId(templateType);
  if (did === null) return;
  const d = { db:pool, comments:secureSessionComments, channel:isNotificationChannelEnabled, ...overrides };
  if (!Number.isSafeInteger(did) || did < 1 || cc || bcc) throw sessionCommentError(403, 'Secure session comment notification recipient changed.');
  const [[delivery]] = await d.db.execute("SELECT *,DATE_FORMAT(day_key,'%Y-%m-%d') AS day_key FROM secure_session_comment_deliveries WHERE id=?", [did]);
  if (!delivery || Number(delivery.agency_id) !== Number(agencyId) || Number(delivery.recipient_user_id) !== Number(userId)
    || !['sending','queued'].includes(delivery.status) || (delivery.communication_id && Number(delivery.communication_id) !== Number(communicationId))) throw sessionCommentError(409, 'Secure session comment notification needs delivery review.');
  const { current } = await d.comments.deliveryAccess(delivery);
  if (String(emailFor(current) || '').trim().toLowerCase() !== String(to || '').trim().toLowerCase()
    || !await d.channel({ userId:current.id,userRole:current.role,agencyId:Number(agencyId),type:'secure_session_comment',channel:'email' })) throw sessionCommentError(403, 'Secure session comment notification recipient changed.');
  if (claim) {
    const [result] = await d.db.execute("UPDATE secure_session_comment_deliveries SET transport_claimed_at=UTC_TIMESTAMP(3),communication_id=COALESCE(?,communication_id) WHERE id=? AND transport_claimed_at IS NULL AND status IN ('sending','queued')", [communicationId,did]);
    if (!result.affectedRows) throw sessionCommentError(409, 'Secure session comment notification already attempted. Review communication history before retrying.');
  }
}

export async function recordSessionCommentEmailTransport({ templateType, communicationId, accepted, redirected = false }, db = pool) {
  const did = deliveryId(templateType);
  if (!did) return;
  await db.execute("UPDATE secure_session_comment_deliveries SET status=?,reason=?,communication_id=COALESCE(?,communication_id) WHERE id=? AND transport_claimed_at IS NOT NULL", [accepted ? redirected ? 'redirected' : 'sent' : 'unknown', accepted ? null : 'transport_unconfirmed',communicationId,did]);
}
