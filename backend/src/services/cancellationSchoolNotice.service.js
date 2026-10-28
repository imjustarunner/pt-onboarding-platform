import pool from '../config/database.js';
import { reviewedEmail, reviewedMessage } from './cancellationRecipients.service.js';
import { escapeNoticeHtml } from './scheduleNoticeMessage.service.js';

const fail = message => Object.assign(new Error(message), { status: 400 });
export function createCancellationSchoolNoticeService(overrides = {}) {
  const d = { database: pool,
    sendEmail: async args => (await import('./scheduleNotificationEmail.service.js')).sendScheduleNotificationEmail(args),
    ...overrides };
  async function list({ providerId, agencyId, date, reason, wholeDay = true }) {
    const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(`${date}T12:00:00Z`).getUTCDay()];
    const [rows] = await d.database.execute(`SELECT DISTINCT school.id,school.name,sp.itsco_email,sp.primary_contact_email,
      CONCAT_WS(' ',u.first_name,u.last_name) AS provider_name
      FROM provider_school_assignments psa JOIN agencies school ON school.id=psa.school_organization_id
      JOIN organization_affiliations oa ON oa.organization_id=school.id AND oa.agency_id=? AND oa.is_active=1
      JOIN users u ON u.id=psa.provider_user_id LEFT JOIN school_profiles sp ON sp.school_organization_id=school.id
      WHERE psa.provider_user_id=? AND psa.day_of_week=? AND psa.is_active=1 ORDER BY school.id`, [agencyId, providerId, weekday]);
    return rows.map(s => ({ key: `school:${agencyId}:${s.id}:${date}`, kind: 'school', id: Number(s.id), agencyId, date,
      title: `${s.name} — school cancellation notice`, recipients: [...new Set([s.primary_contact_email, s.itsco_email].filter(Boolean).map(e => String(e).trim().toLowerCase()))],
      message: { subject: `${s.provider_name || 'Provider'} — schedule change for ${date}`,
        text: `${s.provider_name || 'Your assigned provider'} ${wholeDay ? 'has canceled their sessions' : 'has canceled selected sessions'} on ${date}.\n\nCategory: ${reason}\n\nFamily notifications are handled separately according to available contact details and notification preferences. Please contact our support team if you need help coordinating the school schedule.` } }));
  }
  function review(item, edits, required = false) {
    const recipients = edits?.recipients ?? item.recipients;
    if (!Array.isArray(recipients) || recipients.length > 20 || (required && !recipients.length)) throw fail('Add at least one school email recipient before confirming.');
    return { ...item, recipients: [...new Set(recipients.map(reviewedEmail))], message: reviewedMessage(edits?.message, item.message) };
  }
  async function send(token, item, actorUserId) {
    if (!item.recipients.length) throw fail('The school needs an email address before this notice can be sent.');
    const deliveries = [];
    for (const to of item.recipients) {
      await d.database.execute(`INSERT IGNORE INTO cancellation_school_deliveries (review_token,item_key,recipient_address) VALUES (?,?,?)`, [token, item.key, to]);
      const [claim] = await d.database.execute("UPDATE cancellation_school_deliveries SET status='sending' WHERE review_token=? AND item_key=? AND recipient_address=? AND status IN ('pending','failed')", [token, item.key, to]);
      if (claim.affectedRows === 1) {
        let status = 'review', error = null, communicationId = null;
        try {
          const result = await d.sendEmail({ agencyId: item.agencyId, to, subject: item.message.subject, text: item.message.text,
            html: `<p>${escapeNoticeHtml(item.message.text).replaceAll('\n', '<br>')}</p>`, triggerKey: 'session_cancellation',
            templateType: 'school_day_cancellation', generatedByUserId: actorUserId, source: 'manual' });
          const accepted = result?.id || result?.messageId || result?.messageUuid;
          communicationId = result?.communicationId || null;
          status = accepted && !result?.skipped && !result?.blocked && !result?.pendingApproval && !result?.queued && !result?.redirected ? 'sent' : 'held';
          error = status === 'sent' ? null : result?.reason || 'Delivery was held. Review before sending again.';
        } catch (e) { error = String(e.message || 'School email delivery is uncertain; check communications before resending.').slice(0, 500); }
        await d.database.execute(`UPDATE cancellation_school_deliveries SET status=?,error_message=?,communication_id=?,sent_at=IF(?='sent',UTC_TIMESTAMP(),NULL)
          WHERE review_token=? AND item_key=? AND recipient_address=?`, [status, error, communicationId, status, token, item.key, to]);
      }
      const [[saved]] = await d.database.execute('SELECT status,error_message,sent_at,recipient_address FROM cancellation_school_deliveries WHERE review_token=? AND item_key=? AND recipient_address=?', [token, item.key, to]);
      deliveries.push(saved);
    }
    return { sent: deliveries.filter(r => r.status === 'sent').length, held: deliveries.filter(r => r.status !== 'sent').length, deliveries };
  }
  return { list, review, send };
}
export const cancellationSchoolNotices = createCancellationSchoolNoticeService();
