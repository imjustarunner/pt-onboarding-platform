import { readProviderCalendarBusy } from './providerCalendarBusy.service.js';
import { withProviderSelectionLock } from './publicProviderHold.service.js';

export const appointmentOccupiesTime = status => !['draft','canceled_by_provider','canceled_by_client','canceled_by_guardian','canceled_by_organization','late_canceled','rescheduled','voided'].includes(String(status || 'scheduled').toLowerCase());
const fail = () => Object.assign(new Error('The provider already has an appointment, personal event, meeting, or schedule hold during this time. Choose another time or update that block first.'), { status: 409, code: 'PROVIDER_TIME_CONFLICT' });
export async function assertAppointmentWindowAvailable(db, row, appointmentId = null) {
  if (!row.providerUserId || !appointmentOccupiesTime(row.status)) return;
  const [appointments] = await db.execute(`SELECT id FROM appointments WHERE provider_user_id = ? AND start_at < ? AND end_at > ?
    AND status NOT IN ('draft','canceled_by_provider','canceled_by_client','canceled_by_guardian','canceled_by_organization','late_canceled','rescheduled','voided')
    AND (? IS NULL OR id <> ?) LIMIT 1`, [row.providerUserId, row.endAt, row.startAt, appointmentId, appointmentId]);
  if (appointments.length) throw fail();
  // Lazy office materialization can reserve a client slot before its canonical
  // appointment is linked. That reservation must still block another booking,
  // including a virtual booking, beyond the guardian's six-item display.
  const [officeBookings] = await db.execute(`SELECT id FROM office_events
    WHERE (booked_provider_id = ? OR assigned_provider_id = ?) AND client_id IS NOT NULL
      AND status = 'BOOKED' AND start_at < ? AND end_at > ?
      AND (? IS NULL OR id <> ?) LIMIT 1`,
    [row.providerUserId,row.providerUserId,row.endAt,row.startAt,row.officeEventId || null,row.officeEventId || null]);
  if (officeBookings.length) throw fail();
  const [supervision] = await db.execute(`SELECT s.id FROM supervision_sessions s WHERE s.status='SCHEDULED'
    AND (? IS NULL OR s.id<>?) AND s.start_at<? AND s.end_at>?
    AND (s.supervisor_user_id=? OR s.co_facilitator_user_id=? OR s.supervisee_user_id=?
      OR EXISTS (SELECT 1 FROM supervision_session_attendees a WHERE a.session_id=s.id AND a.user_id=?
        AND a.is_required=1 AND a.status NOT IN ('REMOVED','CANCELLED','WITHDRAWN'))) LIMIT 1`,
    [row.supervisionSessionId || null,row.supervisionSessionId || null,row.endAt,row.startAt,row.providerUserId,row.providerUserId,row.providerUserId,row.providerUserId]);
  if (supervision.length) throw fail();
  const busy = await readProviderCalendarBusy(db, { providerId: row.providerUserId, startAt: row.startAt, endAt: row.endAt,
    excludeEventId: row.providerScheduleEventId || null, timeZone: row.sourceTimezone || 'America/Denver' });
  if (busy.length) throw fail();
}
export async function withAppointmentWindow(pool, row, appointmentId, save) {
  if (!row.providerUserId || !appointmentOccupiesTime(row.status)) return save();
  return withProviderSelectionLock(pool, row.providerUserId, async connection => {
    await assertAppointmentWindowAvailable(connection, row, appointmentId);
    return save();
  });
}
