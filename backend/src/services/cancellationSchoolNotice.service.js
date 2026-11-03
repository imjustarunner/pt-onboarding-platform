import { notificationTransportReceipt } from '../utils/notificationTransportReceipt.js';
import { createHash } from 'node:crypto';
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
      title: `${s.name} — school cancellation notice`, recipients: [...new Set([s.itsco_email].filter(Boolean).map(e => String(e).trim().toLowerCase()))],
      message: { subject: `${s.provider_name || 'Provider'} — schedule change for ${date}`,
        text: `${s.provider_name || 'Your assigned provider'} ${wholeDay ? 'has canceled their sessions' : 'has canceled selected sessions'} on ${date}.\n\nCategory: ${reason}\n\nFamily notifications are handled separately according to available contact details and notification preferences. Please contact our support team if you need help coordinating the school schedule.` } }));
  }
  function review(item, edits, required = false) {
    const recipients = edits?.recipients ?? item.recipients;
    if (!Array.isArray(recipients) || recipients.length > 20 || (required && !recipients.length)) throw fail('Add at least one school email recipient before confirming.');
    return { ...item, recipients: [...new Set(recipients.map(reviewedEmail))], message: reviewedMessage(edits?.message, item.message) };
  }
  async function send(token, item, actorUserId) {
    if (item.kind === 'school' && item.providerId) token = createHash('sha256').update(`school-day:${item.agencyId}:${item.providerId}:${item.date}:${item.notificationScope || 'days'}`).digest('hex').slice(0,36);
    if (!item.recipients.length) return { sent: 0, skipped: 1, reason: 'No school email on file. Follow up separately; family notices are processed independently.', deliveries: [] };
    const deliveries = [];
    for (const to of item.recipients) {
      await d.database.execute(`INSERT IGNORE INTO cancellation_school_deliveries (review_token,item_key,recipient_address) VALUES (?,?,?)`, [token, item.key, to]);
      const [claim] = await d.database.execute("UPDATE cancellation_school_deliveries SET status='sending' WHERE review_token=? AND item_key=? AND recipient_address=? AND status IN ('pending','failed')", [token, item.key, to]);
      if (claim.affectedRows === 1) {
        let status = 'review', error = null, communicationId = null, externalId = null, actualTo = to;
        try {
          const result = await d.sendEmail({ agencyId: item.agencyId, to, subject: item.message.subject, text: item.message.text,
            html: `<p>${escapeNoticeHtml(item.message.text).replaceAll('\n', '<br>')}</p>`, triggerKey: 'session_cancellation',
            templateType: 'school_day_cancellation', generatedByUserId: actorUserId, source: 'manual' });
          communicationId = result?.communicationId || null;
          const receipt = notificationTransportReceipt(result, item.agencyId);
          externalId = receipt.externalId;
          actualTo = receipt.redirectedTo || to;
          status = receipt.accepted ? 'sent' : 'held';
          error = status === 'sent' ? null : result?.reason || 'Delivery was held. Review before sending again.';
        } catch (e) { error = String(e.message || 'School email delivery is uncertain; check communications before resending.').slice(0, 500); }
        await d.database.execute(`UPDATE cancellation_school_deliveries SET status=?,error_message=?,communication_id=?,sent_at=IF(?='sent',UTC_TIMESTAMP(),NULL)
          WHERE review_token=? AND item_key=? AND recipient_address=?`, [status, error, communicationId, status, token, item.key, to]);
        await d.database.execute(`UPDATE cancellation_school_deliveries SET external_message_id=?,actual_recipient_address=? WHERE review_token=? AND item_key=? AND recipient_address=?`, [externalId,actualTo,token,item.key,to]);
      }
      const [[saved]] = await d.database.execute('SELECT status,error_message,sent_at,recipient_address,actual_recipient_address,external_message_id,communication_id FROM cancellation_school_deliveries WHERE review_token=? AND item_key=? AND recipient_address=?', [token, item.key, to]);
      deliveries.push(saved);
    }
    return { sent: deliveries.filter(r => r.status === 'sent').length, held: deliveries.filter(r => r.status !== 'sent').length, deliveries };
  }
  return { list, review, send };
}
export const cancellationSchoolNotices = createCancellationSchoolNoticeService();
