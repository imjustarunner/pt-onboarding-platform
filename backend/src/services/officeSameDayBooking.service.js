import { wallMysqlToUtcMysql } from '../utils/zonedWallTime.util.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import OfficeLocation from '../models/OfficeLocation.model.js';
import OfficeLocationAgency from '../models/OfficeLocationAgency.model.js';
import User from '../models/User.model.js';
import UserComplianceDocument from '../models/UserComplianceDocument.model.js';
import { directorySelection, loadOfficeDirectory } from './officeKioskDirectory.service.js';
import { utcToZonedMysqlWall } from '../utils/officeEventDateTime.util.js';
const fail = (status, message) => Object.assign(new Error(message), { status });
export function sameDayWindow(input, timezone, now = new Date()) {
  if (typeof input.date !== 'string' || typeof input.time !== 'string') throw fail(400,'Choose a date and start time.');
  const selection = directorySelection(input, timezone, now);
  const wall = utcToZonedMysqlWall(now, timezone);
  if (!selection.endTime || selection.date !== wall.slice(0, 10) || selection.selectedAt.slice(0,16) < wall.slice(0,16)) {
    throw fail(400, 'Choose a start and end time today, starting now or later.');
  }
  const instant = time => wallMysqlToUtcMysql(`${selection.date} ${time}:00`, timezone);
  return { ...selection, startAt: instant(selection.time), endAt: instant(selection.endTime) };
}
// Split at every assignment boundary so a multi-hour reservation preserves each
// standing owner's identity without overwriting the unbooked remainder of a slot.
export function bookingSegments(startAt, endAt, assignments) {
  const points = [...new Set([startAt, endAt, ...assignments.flatMap(a => [a.startAt, a.endAt]).filter(t => t > startAt && t < endAt)])].sort();
  return points.slice(0,-1).map((from,i) => ({ startAt: from, endAt: points[i+1], assignedProviderId: assignments.find(a => a.startAt <= from && a.endAt > from)?.assignedProvider?.id || null }));
}
export async function bookOfficeToday({ user, locationId, roomId, date, time, endTime }) {
  const location = await OfficeLocation.findById(locationId);
  if (!location?.is_active) throw fail(404, 'Office location not found.');
  const provider = await User.findById(user.id);
  if (!provider?.is_active || provider.status !== 'ACTIVE_EMPLOYEE' || provider.terminated_at || ['client','guardian','kiosk'].includes(provider.role)) throw fail(403, 'A staff account is required to reserve an office.');
  const agencies = await User.getAgencies(user.id);
  if (!await OfficeLocationAgency.userHasAccess({officeLocationId: locationId, agencyIds: agencies.map(a=>a.id)})) throw fail(403, 'Your agency does not have access to this building.');
  const documents = await UserComplianceDocument.findByUser(user.id);
  if (documents.some(d => d.is_blocking && d.expiration_date && new Date(d.expiration_date) < new Date(new Date().toISOString().slice(0,10)))) throw fail(403, 'Scheduling is restricted due to an expired blocking credential.');
  const timezone = location.timezone || 'America/Denver';
  const window = sameDayWindow({date,time,endTime}, timezone);
  return OfficeEvent.withRoomSlotLock({roomId, startAt:window.startAt,endAt:window.endAt}, async conn => {
    sameDayWindow({date,time,endTime},timezone);
    // Serialize this provider’s simultaneous requests for different rooms too.
    await conn.execute('SELECT id FROM users WHERE id = ? FOR UPDATE',[user.id]);
    const [roomRows] = await conn.execute('SELECT id FROM office_rooms WHERE id = ? AND location_id = ? AND is_active = 1 FOR UPDATE', [roomId,locationId]);
    if (!roomRows.length) throw fail(404,'Room not found at this building.');
    const directory = await loadOfficeDirectory(conn, location, {date,time,endTime});
    const room = directory.rooms.find(r=>Number(r.id)===roomId);
    if (!room || room.occupied) throw fail(409,'This office is no longer available for the entire time range. Refresh and choose another room or time.');
    if ((room.current || []).some(entry => entry.assignedProvider)) throw fail(409, 'This office time is assigned. An empty room does not transfer the reservation; choose unassigned office time.');
    const [busy] = await conn.execute(`SELECT id FROM office_events WHERE booked_provider_id = ? AND start_at < ? AND end_at > ? AND status <> 'CANCELLED' AND (status = 'BOOKED' OR slot_state = 'ASSIGNED_BOOKED') LIMIT 1`,[user.id,window.endAt,window.startAt]);
    if (busy.length) throw fail(409,'You already have an office booking during this time.');
    const [overlaps] = await conn.execute(`SELECT * FROM office_events WHERE room_id = ? AND start_at < ? AND end_at > ? AND status <> 'CANCELLED' FOR UPDATE`,[roomId,window.endAt,window.startAt]);
    // Cancel the original occurrence and preserve both outside pieces verbatim.
    // Keeping the original row also preserves its audit/history references.
    for (const row of overlaps) {
      if (row.assigned_provider_id || row.standing_assignment_id) throw fail(409, 'This office time is assigned. Choose unassigned office time.');
      if (row.status === 'BOOKED' || ['ASSIGNED_BOOKED','COMPANY_HOLD'].includes(row.slot_state)) throw fail(409,'This office was just booked. Refresh and choose another time.');
      if (row.client_id || row.clinical_session_id) throw fail(409,'This time has a linked clinical record. Please choose another room or ask scheduling staff for help.');
      await conn.execute("UPDATE office_events SET status = 'CANCELLED' WHERE id = ?",[row.id]);
      const columns = Object.keys(row).filter(k=>!['id','created_at','updated_at'].includes(k) && !k.startsWith('active_guard_'));
      const originalStart = row.start_at instanceof Date ? row.start_at.toISOString().slice(0,19).replace('T',' ') : String(row.start_at);
      const originalEnd = row.end_at instanceof Date ? row.end_at.toISOString().slice(0,19).replace('T',' ') : String(row.end_at);
      for (const [from,to] of [[originalStart,window.startAt],[window.endAt,originalEnd]]) {
        if (from >= to) continue;
        const copy = {...row,start_at:from,end_at:to};
        // Calendar event IDs belong to the original occurrence, not its new fragments.
        for (const field of ['google_provider_event_id','google_provider_calendar_id','google_sync_status','google_sync_error','google_synced_at']) if (field in copy) copy[field] = null;
        await conn.execute(`INSERT INTO office_events (${columns.map(c=>'`'+c+'`').join(',')}) VALUES (${columns.map(()=>'?').join(',')})`,columns.map(c=>copy[c] && typeof copy[c]==='object' && !(copy[c] instanceof Date) ? JSON.stringify(copy[c]) : copy[c]));
      }
    }
    const segments = bookingSegments(window.selectedAt,window.selectedEndAt,room.assignments);
    const ids = [];
    for (const segment of segments) {
      const toUtc = wall => wallMysqlToUtcMysql(wall,timezone);
      const [insert] = await conn.execute(`INSERT INTO office_events (office_location_id,room_id,start_at,end_at,status,slot_state,assigned_provider_id,booked_provider_id,source,created_by_user_id,approved_by_user_id,notes) VALUES (?,?,?,?,'BOOKED','ASSIGNED_BOOKED',?,?,'PROVIDER_REQUEST',?,?,'Same-day office reservation')`,[locationId,roomId,toUtc(segment.startAt),toUtc(segment.endAt),segment.assignedProviderId,user.id,user.id,user.id]);
      ids.push(insert.insertId);
    }
    return {ok:true,kind:'auto_booked',eventIds:ids,date,time,endTime,roomId};
  });
}
