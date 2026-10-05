import { createSchoolVisitChangeToken } from '../utils/schoolVisitChangeToken.js';
import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import GoogleCalendarService from './googleCalendar.service.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { schoolVisitReminderDue, schoolVisitReminderDetails, schoolVisitReminderBody } from '../utils/schoolVisitReminder.js';

export async function runSchoolVisitReminders({ now = new Date(), dryRun = false, sendUpcoming = false, bookingIds = null } = {}) {
  // Use booking identity, never event-title guessing or a list of individual staff.
  const [bookings] = await pool.execute(`SELECT b.*, s.name school_name, sp.itsco_email,
      h.google_event_id, h.host_user_id
    FROM school_reinit_checkin_bookings b
    JOIN agencies a ON a.id=b.agency_id AND a.slug='itsco' AND a.is_active=1
    JOIN agencies s ON s.id=b.school_agency_id AND s.organization_type='school' AND s.is_active=1
    LEFT JOIN school_profiles sp ON sp.school_organization_id=s.id
    JOIN school_reinit_checkin_slot_host_events h ON h.slot_id=b.slot_id
    JOIN users u ON u.id=h.host_user_id AND u.is_active=1
      AND (LOWER(u.email)='rachel@itsco.health' OR LOWER(u.work_email)='rachel@itsco.health')
    WHERE b.status='booked' AND b.starts_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 14 DAY)
      AND b.starts_at<DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 DAY)
    ORDER BY b.starts_at`);
  const results = [];
  for (const booking of bookings) {
    if (bookingIds && !bookingIds.map(Number).includes(Number(booking.id))) continue;
    const db = await pool.getConnection();
    const lock = `school-visit-reminder:${booking.id}`;
    let locked = false, claimId = null, jobId = null;
    try {
      const [[acquired]] = await db.execute('SELECT GET_LOCK(?,0) acquired', [lock]);
      locked = !!acquired.acquired;
      if (!locked) continue;
      const remote = await GoogleCalendarService.getEvent({ subjectEmail: 'rachel@itsco.health', eventId: booking.google_event_id });
      const event = remote.ok ? remote.event : null;
      const details = schoolVisitReminderDetails(booking, event);
      // Calendar access failures remain reviewable; never fall back to stale details.
      const to = String(booking.itsco_email || '').trim().toLowerCase();
      let hold = remote.ok ? details.hold : `calendar_unverified:${remote.reason}`;
      if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) hold = 'school_group_email_missing_or_invalid';
      if (booking.calendar_sync_status && booking.calendar_sync_status !== 'ready') hold = 'calendar_sync_needs_attention';
      if (!hold && new Date(details.startAt) <= now) continue;
      if (!hold && !sendUpcoming && !schoolVisitReminderDue(details.startAt, now)) continue;
      const identities = await EmailSenderIdentity.list({ agencyId: booking.agency_id, includePlatformDefaults: false, onlyActive: true });
      const identity = identities.find(i => String(i.from_email || '').toLowerCase() === 'notifications@itsco.health');
      if (!identity) hold = 'notifications@itsco.health sender identity is not configured';
      const revision = createHash('sha256').update(JSON.stringify([booking.id, booking.google_event_id, event?.startAt, event?.endAt, details.detail, to, hold || null])).digest('hex');
      if (dryRun) { results.push({ bookingId: booking.id, school: booking.school_name, startAt: event?.startAt, status: hold ? 'review' : 'due', reason: hold || null, to }); continue; }
      await db.execute(`INSERT IGNORE INTO school_visit_reminders(booking_id,revision_hash,recipient,delivery_status,last_error) VALUES(?,?,?,?,?)`,
        [booking.id, revision, to || null, hold ? 'review' : 'pending', hold || null]);
      const [[job]] = await db.execute('SELECT * FROM school_visit_reminders WHERE booking_id=? AND revision_hash=?', [booking.id, revision]);
      jobId = job.id;
      if (hold || job.delivery_status !== 'pending') { results.push({ bookingId: booking.id, status: job.delivery_status, reason: hold || job.last_error }); continue; }
      // Recheck cancellation/edits after calendar verification and before claiming.
      const [[fresh]] = await db.execute('SELECT status,updated_at FROM school_reinit_checkin_bookings WHERE id=?', [booking.id]);
      if (fresh?.status !== 'booked' || String(fresh.updated_at) !== String(booking.updated_at)) continue;
      const [claim] = await db.execute("UPDATE school_visit_reminders SET delivery_status='sending' WHERE id=? AND delivery_status='pending'", [job.id]);
      if (!claim.affectedRows) continue;
      claimId = job.id;
      // The unified sender applies ITSCO's configured branded header/footer and
      // logs the exact sender, recipient, reply-to and delivery outcome.
      const result = await sendEmailFromIdentity({ senderIdentityId: identity.id,
        fromDisplayNameOverride: 'ITSCO Schools', replyToOverride: 'schools@itsco.health', to,
        ...schoolVisitReminderBody({ schoolName: booking.school_name, ...details, changeUrl: `https://app.itsco.health/school-visit-change/${createSchoolVisitChangeToken(booking.id)}` }),
        source: 'auto', templateType: 'school_visit_reminder' });
      const status = result.id && !result.redirected ? 'sent' : result.pendingApproval ? 'approval' : 'held';
      await db.execute("UPDATE school_visit_reminders SET delivery_status=?,communication_id=?,sent_at=IF(?='sent',UTC_TIMESTAMP(),NULL),last_error=? WHERE id=?",
        [status, result.communicationId || null, status, result.reason || null, job.id]);
      results.push({ bookingId: booking.id, status });
    } catch (error) {
      if (claimId) await db.execute("UPDATE school_visit_reminders SET delivery_status='review',last_error=? WHERE id=?", [String(error.message).slice(0, 500), claimId]);
      if (jobId && !claimId && !dryRun) await db.execute('UPDATE school_visit_reminders SET last_error=? WHERE id=?', [String(error.message).slice(0, 500), jobId]);
      results.push({ bookingId: booking.id, status: 'review', reason: error.message });
      console.error('[schoolVisitReminder]', booking.id, error.message);
    } finally {
      if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [lock]);
      db.release();
    }
  }
  return results;
}
