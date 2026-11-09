import pool from '../config/database.js';
import { closureEmailOptions } from '../utils/schoolClosureDelivery.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { schoolClosurePlans, closureNoticeMessage, closureNoticeMessageId } from '../utils/schoolClosureNotice.js';

async function schoolsSender(agencyId) {
  const identity = await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId, 'schools');
  if (!identity?.id || String(identity.from_email).trim().toLowerCase() !== 'schools@itsco.health'
    || Number(identity.agency_id) !== Number(agencyId)) throw new Error('Configure the agency’s schools@itsco.health sender');
  return { senderIdentityId: identity.id, replyToOverride: 'schools@itsco.health', fromDisplayNameOverride: 'Schools Team' };
}
async function defaultPreference(...args) { return (await import('./schoolClosureChannel.service.js')).closurePreference(...args); }
async function defaultTeam(...args) { return (await import('./schoolClosureChannel.service.js')).closureTeamMembers(...args); }
async function defaultForward(...args) { return (await import('./schoolClosureChannel.service.js')).closureForwardRecipient(...args); }
async function defaultChannel(kind, input) { return (await import('./schoolClosureChannel.service.js')).closureNotificationChannels[kind](input); }
async function sendNotice(message) {
  const { sendEmailFromIdentity } = await import('./unifiedEmail/unifiedEmailSender.service.js');
  return sendEmailFromIdentity(message);
}

/** ITSCO internal staff only. Preview mode performs no writes and sends no mail. */
export async function runSchoolClosureNotifications({ now = new Date(), dryRun = false,
  enabled = process.env.SCHOOL_CLOSURE_NOTICES_ENABLED === 'true', db = pool,
  sender = schoolsSender, send = sendNotice, preference = defaultPreference, teamMembers = defaultTeam, forwardRecipient = defaultForward,
  notify = { create: input => defaultChannel('create', input), push: input => defaultChannel('push', input), sms: input => defaultChannel('sms', input) } } = {}) {
  if (!dryRun && !enabled) return { enabled: false, deliveries: [] };
  const [schools] = await db.execute(`SELECT DISTINCT s.id,s.name,s.slug,oa.agency_id,sp.district_name
    FROM agencies s JOIN organization_affiliations oa ON oa.organization_id=s.id AND oa.is_active=1
    JOIN agencies owner ON owner.id=oa.agency_id AND LOWER(owner.slug)='itsco' AND owner.is_active=1 AND COALESCE(owner.is_archived,0)=0
    LEFT JOIN school_profiles sp ON sp.school_organization_id=s.id
    WHERE s.organization_type='school' AND s.is_active=1 AND COALESCE(s.is_archived,0)=0`);
  const agencies = [...new Set(schools.map(school => Number(school.agency_id)))];
  if (!agencies.length) return { enabled, deliveries: [] };
  const marks = agencies.map(() => '?').join(',');
  const [events] = await db.execute(`SELECT * FROM company_events WHERE agency_id IN (${marks})
    AND is_active=1 AND school_event_status IN ('scheduled','rescheduled')
    AND event_type IN ('school_holiday','school_day_off','school_sessions_prohibited')
    AND starts_at<DATE_ADD(?,INTERVAL 6 DAY) AND ends_at>DATE_SUB(?,INTERVAL 1 DAY)`, [...agencies, now, now]);
  const [assignments] = await db.execute(`SELECT DISTINCT oa.agency_id,psa.school_organization_id school_id,u.id provider_id,
      CONCAT_WS(' ',u.first_name,u.last_name) provider_name,u.work_email,u.email
    FROM provider_school_assignments psa
    JOIN organization_affiliations oa ON oa.organization_id=psa.school_organization_id AND oa.is_active=1
    JOIN users u ON u.id=psa.provider_user_id AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND u.terminated_at IS NULL
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=oa.agency_id AND COALESCE(ua.is_active,1)=1
    WHERE psa.is_active=1 AND oa.agency_id IN (${marks})`, agencies);
  const sourcePlans = schoolClosurePlans({ events, schools, assignments, now });
  const deliveries = [];
  const plans = [];
  for (const plan of sourcePlans) {
    if (plan.audience !== 'team') { plans.push(plan); continue; }
    const [legacy] = await db.execute('SELECT id FROM school_closure_notice_deliveries WHERE agency_id=? AND delivery_key=? LIMIT 1', [plan.agencyId, plan.key]);
    if (legacy.length) { deliveries.push({ key: plan.key, status: 'already_claimed' }); continue; }
    try {
      const team = await teamMembers(plan.agencyId, db);
      if (!team.length) throw new Error('No active Schools team accounts were resolved');
      for (const user of team) plans.push({ ...plan, key: `${plan.key}:${user.id}`, userId: Number(user.id) });
    } catch (error) { deliveries.push({ key: plan.key, status: 'blocked', reason: error.message }); }
  }
  const senders = new Map();
  for (const plan of plans) {
    let claimed = false;
    try {
      const [existing] = await db.execute('SELECT id FROM school_closure_notice_deliveries WHERE agency_id=? AND delivery_key=? LIMIT 1', [plan.agencyId, plan.key]);
      if (existing.length) { deliveries.push({ key: plan.key, status: 'already_claimed' }); continue; }
      const resolved = await preference(plan.userId, plan.agencyId);
      const mode = resolved.delivery.mode;
      const account = closureEmailOptions(resolved.user);
      const schoolsEmail = 'schools@itsco.health';
      const message = closureNoticeMessage(plan, schoolsEmail);
      const to = mode.startsWith('work_email') ? account.work : null;
      let blocked = mode === 'none' ? 'delivery_choice_none' : !resolved.recommendedForRole ? 'role_not_eligible'
        : mode === 'app' && !resolved.effective.inApp ? 'app_disabled'
        : mode === 'sms' && !resolved.effective.sms ? 'text_not_enabled_or_consented'
        : mode.startsWith('work_email') && (!resolved.effective.email || !account.work || !account.emailAvailable || mode !== account.emailMode) ? 'email_disabled_or_route_unavailable' : null;
      const review = { key: plan.key, date: plan.date, district: plan.district, audience: plan.audience, userId: plan.userId, mode, to,
        schools: plan.schools.map(school => ({ id: school.id, name: school.name, eventIds: school.sources.map(source => source.id) })), ...message };
      if (dryRun) { deliveries.push({ ...review, status: blocked || 'due' }); continue; }
      const messageId = closureNoticeMessageId(plan.key, schoolsEmail);
      const [claim] = await db.execute(`INSERT IGNORE INTO school_closure_notice_deliveries
        (agency_id,delivery_key,closure_date,phase,audience,user_id,recipient_email,message_id,source_event_ids_json,status,delivery_mode)
        VALUES (?,?,?,?,?,?,?,?,?,'sending',?)`, [plan.agencyId,plan.key,plan.date,plan.phase,plan.audience,plan.userId,to,messageId,
          JSON.stringify([...new Set(plan.schools.flatMap(school => school.sources.map(source => source.id)))]),mode]);
      if (!claim.affectedRows) { deliveries.push({ key: plan.key, status: 'already_claimed' }); continue; }
      claimed = true;
      let status = 'skipped', communicationId = null, notificationId = null, external = null, reason = blocked;
      if (!blocked && ['app','sms'].includes(mode)) {
        const notification = await notify.create({ type: 'school_closure_notice', title: message.subject, message: message.text,
          userId: plan.userId, agencyId: plan.agencyId, relatedEntityType: 'school_closure_delivery', relatedEntityId: claim.insertId,
          actorSource: 'school_calendar', audienceJson: { date: plan.date, district: plan.district, schoolIds: plan.schools.map(school => school.id) } });
        notificationId = notification.id;
        if (mode === 'app') {
          status = 'sent';
          await notify.push(notification).catch(() => {}); // The app inbox delivery already succeeded.
        } else {
          const result = await notify.sms(notification);
          status = result.dispatched ? 'sent' : result.reason === 'send_failed' ? 'held' : 'skipped';
          reason = result.reason || null; external = result.providerRef || null;
        }
      } else if (!blocked) {
        const personal = mode === 'work_email_forward' ? await forwardRecipient(resolved.user, plan.agencyId) : null;
        if (!senders.has(plan.agencyId)) senders.set(plan.agencyId, await sender(plan.agencyId));
        const result = await send({ ...senders.get(plan.agencyId), to, ...(personal ? { bcc: personal } : {}), userId: plan.userId,
          ...message, source: 'auto', templateType: 'school_closure_notice', internetMessageIdOverride: messageId });
        status = result.id && !result.redirected ? 'sent' : result.skipped ? 'skipped' : 'held';
        communicationId = result.communicationId || null;
        reason = result.reason || (status === 'held' ? 'Delivery requires receipt review' : null);
      }
      await db.execute(`UPDATE school_closure_notice_deliveries SET status=?,communication_id=?,notification_id=?,external_reference=?,
        sent_at=IF(?='sent',UTC_TIMESTAMP(),NULL),last_error=? WHERE agency_id=? AND delivery_key=?`,
        [status,communicationId,notificationId,external,status,reason,plan.agencyId,plan.key]);
      deliveries.push({ key: plan.key, status, mode, communicationId, notificationId, reason });
    } catch (error) {
      if (claimed) await db.execute("UPDATE school_closure_notice_deliveries SET status='held',last_error=? WHERE agency_id=? AND delivery_key=?", [String(error.message).slice(0,500),plan.agencyId,plan.key]);
      deliveries.push({ key: plan.key, status: claimed ? 'held' : 'blocked', reason: String(error.message).slice(0,500) });
    }
  }
  return { enabled, deliveries };
}
