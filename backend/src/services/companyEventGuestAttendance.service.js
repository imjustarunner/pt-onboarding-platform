import crypto from 'node:crypto';
import pool from '../config/database.js';
import { readEventOperations } from '../utils/companyEventOperations.js';
import { toUtcIso, utcDateToZonedYmd } from '../utils/zonedWallTime.util.js';

const fail = (status, message) => { throw Object.assign(new Error(message), { status, statusCode: status }); };
const calendarDate = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const result = (row) => ({ checkedInAt: toUtcIso(row?.checked_in_at) || null, checkedOutAt: toUtcIso(row?.checked_out_at) || null });

function validateGuestAttendanceInput({ eventId, email, managementToken, now }) {
  const id = Number(eventId);
  const address = String(email || '').trim().toLowerCase();
  const token = String(managementToken || '');
  const instant = now instanceof Date ? now : new Date(now);
  if (!Number.isSafeInteger(id) || id <= 0 || address.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) fail(400, 'Enter a valid event and registration email');
  if (!/^[a-f0-9]{64}$/i.test(token)) fail(404, 'Guest registration not found');
  if (!Number.isFinite(instant.getTime())) fail(400, 'Invalid attendance time');
  return { eventId: id, email: address, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), now: instant };
}

async function loadGuestAttendanceContext(input, db, { lock = false, requireEventDay = true } = {}) {
  const [events] = await db.execute(`SELECT id, agency_id, starts_at, ends_at, timezone, is_active, school_event_status, operations_json
    FROM company_events WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [input.eventId]);
  const event = events[0];
  if (!event || Number(event.is_active) !== 1 || event.school_event_status === 'canceled'
    || ![true, 1, '1', 'true'].includes(readEventOperations(event).attendeeCheckInEnabled)) fail(404, 'Guest check-in is not available for this event');

  const [guests] = await db.execute(`SELECT id, response, management_token_hash FROM company_event_guest_registrations
    WHERE company_event_id = ? AND agency_id = ? AND LOWER(email) = ? ORDER BY id ASC LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
  [input.eventId, event.agency_id, input.email]);
  const guest = guests[0];
  if (!guest || !/^[a-f0-9]{64}$/i.test(String(guest.management_token_hash || ''))
    || !crypto.timingSafeEqual(Buffer.from(guest.management_token_hash, 'hex'), Buffer.from(input.tokenHash, 'hex'))) fail(404, 'Guest registration not found');
  if (String(guest.response).toLowerCase() !== 'yes') fail(409, 'Confirm Yes on your RSVP before checking in');

  const date = utcDateToZonedYmd(input.now, event.timezone || 'America/Denver');
  const [sessions] = await db.execute('SELECT session_date FROM company_event_session_dates WHERE company_event_id = ?', [input.eventId]);
  const startDate = utcDateToZonedYmd(event.starts_at, event.timezone);
  const endDate = utcDateToZonedYmd(event.ends_at, event.timezone);
  const isEventDay = sessions.length
    ? sessions.some((session) => calendarDate(session.session_date) === date)
    : !!startDate && !!endDate && date >= startDate && date <= endDate;
  if (requireEventDay && !isEventDay) fail(409, 'Guest check-in and check-out are available on an event date');
  return { guest, date, isEventDay };
}

async function loadAttendance(db, guestId, eventId, date, { lock = false } = {}) {
  const [rows] = await db.execute(`SELECT id, checked_in_at, checked_out_at FROM company_event_guest_attendance
    WHERE guest_registration_id = ? AND company_event_id = ? AND attendance_date = ? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [guestId, eventId, date]);
  return rows[0] || null;
}

/** Read only today's guest attendance after the same registration/token checks as a punch. */
export async function getCompanyEventGuestAttendance({ eventId, email, managementToken, now = new Date(), db = pool }) {
  const input = validateGuestAttendanceInput({ eventId, email, managementToken, now });
  const { guest, date, isEventDay } = await loadGuestAttendanceContext(input, db, { requireEventDay: false });
  if (!isEventDay) return { checkedInAt: null, checkedOutAt: null, isEventDay: false };
  return result(await loadAttendance(db, guest.id, input.eventId, date));
}

/** Guest attendance is its own daily register; it never writes staff payroll or clinical attendance.
 * db may be a pool or a standalone connection whose transaction is owned by this call.
 */
export async function recordCompanyEventGuestAttendance({ eventId, email, managementToken, action, now = new Date(), db = pool }) {
  if (!['check-in', 'check-out'].includes(action)) fail(400, 'Choose check-in or check-out');
  const input = validateGuestAttendanceInput({ eventId, email, managementToken, now });
  const ownsConnection = typeof db.getConnection === 'function';
  const conn = ownsConnection ? await db.getConnection() : db;
  try {
    await conn.beginTransaction();
    // Matches public registration's event -> guest order. The event lock also
    // serializes the first daily insert before an attendance row exists.
    const { guest, date } = await loadGuestAttendanceContext(input, conn, { lock: true });
    let attendance = await loadAttendance(conn, guest.id, input.eventId, date, { lock: true });
    let changed = false;
    if (action === 'check-in' && !attendance) {
      const [created] = await conn.execute(`INSERT INTO company_event_guest_attendance
        (company_event_id, guest_registration_id, attendance_date, checked_in_at) VALUES (?, ?, ?, ?)`,
      [input.eventId, guest.id, date, input.now]);
      attendance = { id: created.insertId, checked_in_at: input.now, checked_out_at: null };
      changed = true;
    } else if (action === 'check-out') {
      if (!attendance) fail(409, 'Check in before checking out');
      if (!attendance.checked_out_at) {
        if (input.now < new Date(toUtcIso(attendance.checked_in_at))) fail(409, 'Check-out cannot precede check-in');
        await conn.execute('UPDATE company_event_guest_attendance SET checked_out_at = ? WHERE id = ? AND checked_out_at IS NULL', [input.now, attendance.id]);
        attendance = { ...attendance, checked_out_at: input.now };
        changed = true;
      }
    }
    if (changed) await conn.execute(`UPDATE company_event_guest_registrations SET checked_in_at = ?, checked_out_at = ?
      WHERE id = ? AND company_event_id = ? AND (checked_in_at IS NULL OR checked_in_at <= ?)`,
    [attendance.checked_in_at, attendance.checked_out_at, guest.id, input.eventId, attendance.checked_in_at]);
    await conn.commit();
    return result(attendance);
  } catch (error) { await conn.rollback(); throw error; } finally { if (ownsConnection) conn.release(); }
}
