import pool from '../config/database.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { schoolClosurePlans, closureNoticeMessage, closureNoticeMessageId } from '../utils/schoolClosureNotice.js';

async function schoolsSender(agencyId) {
  const identity = await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId, 'schools');
  if (!identity?.id || String(identity.from_email).trim().toLowerCase() !== 'schools@itsco.health'
    || Number(identity.agency_id) !== Number(agencyId)) throw new Error('Configure the agency’s schools@itsco.health sender');
  return { senderIdentityId: identity.id, replyToOverride: 'schools@itsco.health', fromDisplayNameOverride: 'Schools Team' };
}
async function sendNotice(message) {
  const { sendEmailFromIdentity } = await import('./unifiedEmail/unifiedEmailSender.service.js');
  return sendEmailFromIdentity(message);
}

/** ITSCO internal staff only. Preview mode performs no writes and sends no mail. */
export async function runSchoolClosureNotifications({ now = new Date(), dryRun = false,
  enabled = process.env.SCHOOL_CLOSURE_NOTICES_ENABLED === 'true', db = pool,
  sender = schoolsSender, send = sendNotice } = {}) {
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
  const plans = schoolClosurePlans({ events, schools, assignments, now });
  const senders = new Map();
  const deliveries = [];
  for (const plan of plans) {
    let claimed = false;
    try {
      if (!senders.has(plan.agencyId)) senders.set(plan.agencyId, await sender(plan.agencyId));
      const envelope = senders.get(plan.agencyId);
      const schoolsEmail = String(envelope.replyToOverride || '').trim().toLowerCase();
      if (!envelope.senderIdentityId || !/^schools@[^\s@]+\.[^\s@]+$/.test(schoolsEmail)) throw new Error('Schools sender is unavailable');
      const to = plan.audience === 'team' ? schoolsEmail : plan.to;
      const message = closureNoticeMessage(plan, schoolsEmail);
      const review = { key: plan.key, date: plan.date, district: plan.district, audience: plan.audience, userId: plan.userId, to,
        schools: plan.schools.map(school => ({ id: school.id, name: school.name, eventIds: school.sources.map(source => source.id) })),
        ...envelope, ...message };
      if (dryRun) { deliveries.push({ ...review, status: to ? 'due' : 'missing_provider_email' }); continue; }
      if (!to) { deliveries.push({ key: plan.key, status: 'missing_provider_email' }); continue; }
      const messageId = closureNoticeMessageId(plan.key, schoolsEmail);
      const [claim] = await db.execute(`INSERT IGNORE INTO school_closure_notice_deliveries
        (agency_id,delivery_key,closure_date,phase,audience,user_id,recipient_email,message_id,source_event_ids_json,status)
        VALUES (?,?,?,?,?,?,?,?,?,'sending')`, [plan.agencyId, plan.key, plan.date, plan.phase, plan.audience, plan.userId, to, messageId,
        JSON.stringify([...new Set(plan.schools.flatMap(school => school.sources.map(source => source.id)))])]);
      if (!claim.affectedRows) { deliveries.push({ key: plan.key, status: 'already_claimed' }); continue; }
      claimed = true;
      const result = await send({ ...envelope, to, userId: plan.userId, ...message, source: 'auto',
        templateType: 'school_closure_notice', internetMessageIdOverride: messageId });
      const status = result.id && !result.redirected ? 'sent' : result.skipped ? 'skipped' : 'held';
      await db.execute(`UPDATE school_closure_notice_deliveries SET status=?,communication_id=?,
        sent_at=IF(?='sent',UTC_TIMESTAMP(),NULL),last_error=? WHERE agency_id=? AND delivery_key=?`,
      [status, result.communicationId || null, status, result.reason || (status === 'held' ? 'Delivery requires receipt review' : null), plan.agencyId, plan.key]);
      deliveries.push({ key: plan.key, status, communicationId: result.communicationId || null });
    } catch (error) {
      if (claimed) await db.execute("UPDATE school_closure_notice_deliveries SET status='held',last_error=? WHERE agency_id=? AND delivery_key=?",
        [String(error.message).slice(0, 500), plan.agencyId, plan.key]);
      deliveries.push({ key: plan.key, status: claimed ? 'held' : 'blocked', reason: String(error.message).slice(0, 500) });
    }
  }
  return { enabled, deliveries };
}
