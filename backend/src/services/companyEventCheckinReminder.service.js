import { randomBytes } from 'node:crypto';
import pool from '../config/database.js';
import { utcDateToZonedYmd } from '../utils/zonedWallTime.util.js';
import { EVENT_STAFF_ROLES_SQL } from '../utils/companyEventOperations.js';
import { eventCheckinMessage, eventCheckinReminderDue } from '../utils/companyEventCheckin.js';
import { getEmployeeEventParticipation } from './companyEventParticipation.service.js';
import { sendCompanyEventSms } from './companyEventSms.service.js';

async function sendCheckinEmail({ agencyId, userId, to, message, url }) {
  const { resolveSenderIdentityForSend } = await import('./emailSenderIdentityResolver.service.js');
  const { sendEmailFromIdentity } = await import('./unifiedEmail/unifiedEmailSender.service.js');
  const { identity } = await resolveSenderIdentityForSend({ agencyId, templateType: 'company_event_checkin', preferredKeys: ['notifications', 'people_operations'], includePlatformDefaults: false });
  if (!identity) throw new Error('Configure an event notification email sender');
  return sendEmailFromIdentity({ senderIdentityId: identity.id, userId, to, ...message, source: 'auto', templateType: 'company_event_checkin', linkUrl: url });
}

export async function processCompanyEventCheckinReminders({ now = new Date(), db = pool,
  participation = getEmployeeEventParticipation, sendEmail = sendCheckinEmail, sendSms = sendCompanyEventSms } = {}) {
  const base = String(process.env.FRONTEND_URL || process.env.FRONTEND_BASE_URL || '').replace(/\/$/, '');
  if (!/^https?:\/\//i.test(base)) return [];
  // Session occurrences cover recurring events; events without sessions use their own dates.
  const [events] = await db.execute(`SELECT e.*, COALESCE(sd.starts_at, e.starts_at) occurrence_start,
      COALESCE(sd.ends_at, e.ends_at) occurrence_end
    FROM company_events e LEFT JOIN company_event_session_dates sd ON sd.company_event_id = e.id
    WHERE e.is_active = 1 AND COALESCE(e.school_event_status, '') <> 'canceled'
      AND COALESCE(sd.starts_at, e.starts_at) <= DATE_ADD(?, INTERVAL 1 HOUR)
      AND COALESCE(sd.ends_at, e.ends_at) > ?`, [now, now]);
  const results = [];
  for (const event of events) {
    if (!eventCheckinReminderDue(event, now)) continue;
    const date = utcDateToZonedYmd(now, event.timezone);
    if (!event.staff_link_token) {
      await db.execute('UPDATE company_events SET staff_link_token = ? WHERE id = ? AND staff_link_token IS NULL', [randomBytes(24).toString('hex'), event.id]);
      const [fresh] = await db.execute('SELECT staff_link_token FROM company_events WHERE id = ?', [event.id]);
      event.staff_link_token = fresh[0]?.staff_link_token;
    }
    if (!event.staff_link_token) continue;
    const url = `${base}/company-events/${event.id}/staff/${event.staff_link_token}#event-check-in`;
    const message = eventCheckinMessage(event, url);
    const [users] = await db.execute(`SELECT DISTINCT u.id, u.email, u.work_email, u.personal_email, u.phone_number, u.personal_phone, u.work_phone
      FROM users u JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ? AND COALESCE(ua.is_active, 1) = 1
      WHERE u.is_active = 1 AND COALESCE(u.is_archived, 0) = 0 AND u.terminated_at IS NULL
        AND LOWER(u.role) IN (${EVENT_STAFF_ROLES_SQL})
        AND (EXISTS (SELECT 1 FROM company_event_provider_assignments a WHERE a.company_event_id = ? AND a.provider_user_id = u.id)
          OR EXISTS (SELECT 1 FROM company_event_session_providers sp JOIN company_event_session_dates sd ON sd.id = sp.session_date_id AND sd.company_event_id = sp.company_event_id
            WHERE sp.company_event_id = ? AND sp.agency_id = ua.agency_id AND sp.provider_user_id = u.id AND sp.assignment_status = 'finalized' AND sd.session_date = ?)
          OR EXISTS (SELECT 1 FROM skills_group_providers gp JOIN skills_groups g ON g.id = gp.skills_group_id
            WHERE g.company_event_id = ? AND g.agency_id = ua.agency_id AND gp.provider_user_id = u.id))`,
    [event.agency_id, event.id, event.id, date, event.id]);
    for (const user of users) {
      try {
        const state = await participation({ eventId: event.id, userId: user.id, now, db });
        if (!state.canCheckIn) continue;
        for (const channel of ['email', 'sms']) {
          const to = channel === 'email' ? user.work_email || user.email || user.personal_email : user.phone_number || user.personal_phone || user.work_phone;
          if (!to) continue;
          // Claim each channel independently, atomically across server instances.
          const [claim] = await db.execute(`INSERT IGNORE INTO company_event_checkin_reminders
            (company_event_id, user_id, event_date, channel) VALUES (?, ?, ?, ?)`, [event.id, user.id, date, channel]);
          if (!claim.affectedRows) continue;
          let status, reason = null;
          try {
            if (channel === 'sms') {
              // Existing transport enforces campaign opt-in, STOP and per-event mute.
              await sendSms({ eventId: event.id, agencyId: event.agency_id, userId: user.id, to, purpose: 'workforce', audience: 'staff',
                dispatchType: 'checkin_reminder', batchId: `checkin:${event.id}:${date}`,
                body: `${message.text}\nReply CHECKIN to check in now. Reply CHECKOUT when finished. If you have multiple events, add the event code shown below.` });
              status = 'sent';
            } else {
              const result = await sendEmail({ agencyId: event.agency_id, userId: user.id, to, message, url });
              status = result?.id && !result.redirected ? 'sent' : result?.pendingApproval ? 'approval' : 'held';
              reason = result?.reason || null;
            }
          } catch (error) {
            status = Number(error.status) === 403 ? 'skipped' : 'review';
            reason = error.code || error.message;
          }
          await db.execute('UPDATE company_event_checkin_reminders SET status = ?, status_reason = ? WHERE id = ?', [status, reason ? String(reason).slice(0, 255) : null, claim.insertId]);
          results.push({ eventId: event.id, userId: user.id, channel, status });
        }
      } catch (error) {
        results.push({ eventId: event.id, userId: user.id, status: 'review', reason: error.message });
      }
    }
  }
  return results;
}
