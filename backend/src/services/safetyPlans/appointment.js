import pool from '../../config/database.js';
import { clientAccess } from './access.js';
import { fail, positiveId } from './template.js';

export async function appointmentPrefill(user, { eventType, eventId, appointmentId, agencyId, clientId } = {}) {
  if (!eventId) return null;
  if (!['office', 'provider'].includes(eventType)) fail(400, 'Select an office or provider appointment.');
  const sql = eventType === 'office'
    ? 'SELECT e.*,o.name AS location_name,o.timezone AS event_timezone FROM office_events e JOIN office_locations o ON o.id=e.office_location_id WHERE e.id=?'
    : 'SELECT * FROM provider_schedule_events WHERE id=?';
  const [[event]] = await pool.execute(sql, [positiveId(eventId)]);
  if (!event) fail(404, 'This appointment is no longer available.');
  const column = eventType === 'office' ? 'office_event_id' : 'provider_schedule_event_id';
  const selectedId = appointmentId ? positiveId(appointmentId) : null;
  const [appointments] = await pool.execute(`SELECT a.id,a.agency_id,a.start_at,a.end_at,a.source_timezone,a.modality,a.status,l.name AS location_name
    FROM appointments a LEFT JOIN office_locations l ON l.id=a.office_location_id
    WHERE a.${column}=? AND (? IS NULL OR a.id=?) ORDER BY a.id DESC LIMIT 2`, [Number(eventId), selectedId, selectedId]);
  if (selectedId && !appointments.length) fail(404, 'This session does not belong to the selected calendar event.');
  if (appointments.length > 1) fail(409, 'Select the specific client session before preparing its letter.');
  const appointment = appointments[0];
  let linkedClientId = event.client_id;
  if (appointment) {
    const [participants] = await pool.execute('SELECT DISTINCT client_id FROM appointment_participants WHERE appointment_id=? AND client_id IS NOT NULL ORDER BY client_id LIMIT 50', [appointment.id]);
    const ids = participants.map(row => Number(row.client_id));
    if (clientId && !ids.includes(Number(clientId))) fail(403, 'The client is not a participant in this appointment.');
    linkedClientId = clientId || (ids.includes(Number(event.client_id)) ? event.client_id : ids.length === 1 ? ids[0] : null);
  }
  if (!linkedClientId) fail(404, 'Select a linked client session to prepare its letter.');
  const client = await clientAccess(user, linkedClientId, { write: true });
  if ((agencyId && Number(client.agency_id) !== Number(agencyId)) || (clientId && Number(clientId) !== Number(client.id))
      || (appointment?.agency_id && Number(appointment.agency_id) !== Number(client.agency_id))) {
    fail(403, 'The appointment and client must belong to the current organization.');
  }
  if ([event.status,appointment?.status].some(status=>/CANCEL|RELEASED|NO_?SHOW/.test(String(status).toUpperCase()))) fail(409, 'A cancelled or missed appointment cannot verify attendance.');
  const zone = appointment?.source_timezone || event.event_timezone || event.source_timezone || event.time_zone || 'America/Denver';
  const parse = value => value instanceof Date ? value : new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(String(value)) ? value : String(value).replace(' ', 'T') + 'Z');
  const start = parse(appointment?.start_at || event.start_at), end = parse(appointment?.end_at || event.end_at);
  if (!Number.isFinite(+start) || !Number.isFinite(+end)) fail(400, 'The appointment needs a valid start and end time.');
  const fmt = (date, options) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, ...options }).format(date);
  return {
    client: { id: client.id, name: client.full_name || client.initials || '', agencyId: client.agency_id },
    source: { eventType, eventId: Number(eventId), ...(appointment ? { appointmentId: Number(appointment.id) } : {}), startAt: start.toISOString(), endAt: end.toISOString() },
    data: { personLabel: client.full_name || client.initials || '', appointmentDate: fmt(start, { year: 'numeric', month: '2-digit', day: '2-digit' }),
      startTime: fmt(start, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), endTime: fmt(end, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
      timezone: zone, location: appointment?.location_name || event.location_name || (/VIRTUAL|TELEHEALTH|VIDEO|PHONE/.test(String(appointment?.modality||event.modality).toUpperCase()) ? 'Virtual visit' : ''),
      attendanceStatus: 'Not yet confirmed', letterType: 'Scheduled appointment', issuerName: `${user.first_name || ''} ${user.last_name || ''}`.trim(), excuseRequested: 'Yes' }
  };
}
