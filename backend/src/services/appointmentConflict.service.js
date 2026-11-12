import { readProviderCalendarBusy } from './providerCalendarBusy.service.js';
import { withProviderSelectionLock } from './publicProviderHold.service.js';
import { readPrivateReplacementSlots } from './privateReplacementSlots.service.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

export const appointmentOccupiesTime = status => !['draft','canceled_by_provider','canceled_by_client','canceled_by_guardian','canceled_by_organization','late_canceled','rescheduled','voided'].includes(String(status || 'scheduled').toLowerCase());
const calendarConflictLabels = {
  PERSONAL_EVENT: 'a personal event',
  SCHEDULE_HOLD: 'a schedule hold',
  TEAM_MEETING: 'a team meeting',
  HUDDLE: 'a huddle',
  INDIRECT_SERVICES: 'indirect-service time'
};
function calendarDay(value) {
  if (!value) return '';
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}
function shiftDay(date, days) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
function longDay(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}
function plannedOutSpan(entry) {
  const start = calendarDay(entry.startDate);
  if (!entry.allDay || !start) return 'during this time';
  const end = calendarDay(entry.endDate);
  const last = end ? shiftDay(end, -1) : start;
  if (!last || last <= start) return `all day ${longDay(start)}`;
  return `all day ${longDay(start)} through ${longDay(last)}`;
}
async function plannedOutAvailability(db, entry) {
  if (!entry?.id) return null;
  try {
    const [[found]] = await db.execute(`SELECT CASE
      WHEN description LIKE 'Unavailable%' THEN 'Unavailable'
      WHEN description LIKE 'Available%' THEN 'Available'
      ELSE NULL END AS availability
      FROM provider_schedule_events WHERE id = ? AND reason_code = 'PLANNED_OUT' LIMIT 1`, [entry.id]);
    return found?.availability || null;
  } catch { return null; }
}
async function fail(db, row, activity, { overridable = false, plannedOut = false } = {}) {
  let person = `Provider #${Number(row.providerUserId)}`;
  try {
    const [[user]] = await db.execute('SELECT first_name, last_name FROM users WHERE id = ? LIMIT 1', [row.providerUserId]);
    const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
    if (name) person = name;
  } catch { /* Keep the conflict enforced even if its display name cannot be read. */ }
  // Identify whose calendar is blocked without exposing client names or private
  // event titles/notes. Google copies do not change the source of an app entry.
  const message = plannedOut
    ? `${person} is ${activity}. That planned-out entry is in the app. Update it, or schedule this interview anyway.`
    : `${person} has ${activity} saved in the app during this time. Update that entry or choose another time.`;
  return Object.assign(new Error(message), {
    status: 409, code: 'PROVIDER_TIME_CONFLICT', overridable
  });
}
export async function assertAppointmentWindowAvailable(db, row, appointmentId = null) {
  if (!row.providerUserId || !appointmentOccupiesTime(row.status)) return;
  let childcare=[];
  try {
    [childcare]=await db.execute(`SELECT s.id FROM childcare_shifts s JOIN company_events e ON e.id=s.company_event_id
      JOIN company_event_provider_assignments assignment ON assignment.company_event_id=e.id
      WHERE assignment.provider_user_id=? AND s.status<>'canceled' AND e.is_active=1
        AND e.starts_at<? AND e.ends_at>? AND s.id<>? LIMIT 1`,[row.providerUserId,row.endAt,row.startAt,row.excludeChildcareShiftId||0]);
  } catch(error) {if(error.code!=='ER_NO_SUCH_TABLE')throw error;}
  if(childcare.length)throw await fail(db,row,'an assigned childcare shift');
  const offered = await readPrivateReplacementSlots(db, row.providerUserId);
  let ownsOffer = false;
  if (row.replacementOfferId) {
    const [[own]] = await db.execute(`SELECT o.id FROM appointment_replacement_offers o
      JOIN appointment_replacement_offer_slots os ON os.offer_id=o.id
      JOIN appointment_replacement_slots s ON s.id=os.slot_id
      WHERE o.id=? AND o.provider_id=? AND s.start_at=? AND s.end_at=? AND s.released_at IS NULL AND os.released_at IS NULL
        AND ((o.status='open' AND o.expires_at>UTC_TIMESTAMP()) OR (o.status='requested' AND o.selected_slot_id=s.id))`,
    [row.replacementOfferId, row.providerUserId, row.startAt, row.endAt]);
    ownsOffer = !!own;
  }
  for (const slot of offered) {
    if (parseUtcDate(slot.start_at) >= parseUtcDate(row.endAt) || parseUtcDate(slot.end_at) <= parseUtcDate(row.startAt)) continue;
    if (ownsOffer) continue;
    // A pending client selection must be confirmed through its own request.
    throw await fail(db, row, 'a private replacement offer');
  }
  const [appointments] = await db.execute(`SELECT id FROM appointments WHERE provider_user_id = ? AND start_at < ? AND end_at > ?
    AND status NOT IN ('draft','canceled_by_provider','canceled_by_client','canceled_by_guardian','canceled_by_organization','late_canceled','rescheduled','voided')
    AND (? IS NULL OR id <> ?) LIMIT 1`, [row.providerUserId, row.endAt, row.startAt, appointmentId, appointmentId]);
  if (appointments.length) throw await fail(db, row, 'a client appointment');
  // Lazy office materialization can reserve a client slot before its canonical
  // appointment is linked. That reservation must still block another booking,
  // including a virtual booking, beyond the guardian's six-item display.
  const [officeBookings] = await db.execute(`SELECT id FROM office_events
    WHERE (booked_provider_id = ? OR assigned_provider_id = ?) AND client_id IS NOT NULL
      AND status = 'BOOKED' AND start_at < ? AND end_at > ?
      AND (? IS NULL OR id <> ?) LIMIT 1`,
    [row.providerUserId,row.providerUserId,row.endAt,row.startAt,row.officeEventId || null,row.officeEventId || null]);
  if (officeBookings.length) throw await fail(db, row, 'a client room reservation');
  const excludedSupervisionIds = (row.excludeSupervisionIds || []).map(Number).filter(id => Number.isSafeInteger(id) && id > 0);
  const [supervision] = await db.execute(`SELECT s.id FROM supervision_sessions s WHERE s.status='SCHEDULED'
    AND (? IS NULL OR s.id<>?) ${excludedSupervisionIds.length ? `AND s.id NOT IN (${excludedSupervisionIds.map(()=>'?')})` : ''} AND s.start_at<? AND s.end_at>?
    AND (s.supervisor_user_id=? OR s.co_facilitator_user_id=? OR (s.session_type='individual' AND s.supervisee_user_id=?)
      OR EXISTS (SELECT 1 FROM supervision_session_attendees a WHERE a.session_id=s.id AND a.user_id=?
        AND a.is_required=1 AND a.status NOT IN ('REMOVED','CANCELLED','WITHDRAWN'))) LIMIT 1`,
    [row.supervisionSessionId || null,row.supervisionSessionId || null,...excludedSupervisionIds,row.endAt,row.startAt,row.providerUserId,row.providerUserId,row.providerUserId,row.providerUserId]);
  if (supervision.length) throw await fail(db, row, 'a supervision session');
  const busy = await readProviderCalendarBusy(db, { providerId: row.providerUserId, startAt: row.startAt, endAt: row.endAt,
    excludeEventId: row.providerScheduleEventId || null, timeZone: row.sourceTimezone || 'America/Denver', includeKind: true });
  const blocking = row.ignoreScheduleHolds ? busy.filter(entry => String(entry.kind || '').toUpperCase() !== 'SCHEDULE_HOLD') : busy;
  if (blocking.length) {
    const entry = blocking[0];
    const kind = String(entry.kind || '').toUpperCase();
    if (kind === 'SCHEDULE_HOLD' && String(entry.reasonCode || '').toUpperCase() === 'PLANNED_OUT') {
      const availability = await plannedOutAvailability(db, entry);
      const status = availability ? ` (${availability})` : '';
      throw await fail(db, row, `planned out ${plannedOutSpan(entry)}${status}`, { overridable: true, plannedOut: true });
    }
    throw await fail(db, row, calendarConflictLabels[kind] || 'a calendar event', { overridable: kind === 'SCHEDULE_HOLD' });
  }
}
export async function withAppointmentWindow(pool, row, appointmentId, save) {
  if (!row.providerUserId || !appointmentOccupiesTime(row.status)) return save();
  return withProviderSelectionLock(pool, row.providerUserId, async connection => {
    await assertAppointmentWindowAvailable(connection, row, appointmentId);
    return save();
  });
}
