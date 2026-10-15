import { randomUUID, createHash } from 'node:crypto';
import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import Availability from './providerAvailability.service.js';
import { previewAppointmentChange, completeAppointmentChange } from './appointmentChange.service.js';
import { editAvailabilityPublication } from './availabilityPublicationEdit.service.js';
import { cancelMeetingOccurrences } from './recurringScheduleCancellation.service.js';
import { sendMeetingScheduleChange } from './meetingInvitations.service.js';
import { availabilityOccursOn } from '../utils/availabilityRecurrence.js';
import { addDaysYmd } from '../utils/scheduleRecurrence.js';
import { wallMysqlToUtcMysql } from '../utils/zonedWallTime.util.js';
import { invalidateAvailabilityReminders } from '../utils/invalidateAvailabilityReminders.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const utc = value => value instanceof Date ? value : new Date(/[zZ]|[+-]\d\d:\d\d$/.test(String(value)) ? value : String(value).replace(' ', 'T') + 'Z');
const stamp = value => value ? utc(value).toISOString() : null;
const ymd = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const tables = { weekly: 'provider_virtual_working_hours', virtual: 'provider_virtual_slot_availability', inPerson: 'provider_in_person_slot_availability' };
const cancellable = new Set(['draft', 'scheduled', 'confirmed', 'client_confirmed', 'reschedule_requested', 'cancellation_requested']);
const isCanceled = status => /^(canceled|cancelled|late_canceled|void)/.test(String(status).toLowerCase());
const fingerprint = items => createHash('sha256').update(JSON.stringify(items.map(({ key, startAt, endAt, source }) => ({ key, startAt, endAt, source })))).digest('hex');

export function dayBounds(date, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw fail('Choose a valid date.');
  const bounds = { start: wallMysqlToUtcMysql(`${date} 00:00:00`, timeZone), end: wallMysqlToUtcMysql(`${addDaysYmd(date, 1)} 00:00:00`, timeZone) };
  if (!bounds.start || !bounds.end) throw fail('Could not resolve this day’s timezone.');
  return bounds;
}

export function dayCancellationFacts(input = {}) {
  const clientFacingReason = String(input.clientFacingReason || '').trim();
  if (!clientFacingReason || clientFacingReason.length > 500) throw fail('Enter a client-facing reason of 1–500 characters.');
  const followUpAction = input.followUpAction || 'client_contact_support';
  if (!['client_contact_support', 'none'].includes(followUpAction)) throw fail('Choose a supported follow-up option.');
  return { eventType: 'canceled', initiator: 'provider', reasons: ['provider_unavailable'],
    reasonOther: '', clientFacingReason,
    followUpAction, followUpMessage: String(input.followUpMessage || '').trim().slice(0, 1000), signatureConfirmed: true };
}

// Dependencies are injectable so recovery and authorization can be exercised without sending notifications.
export function createDayCancellationService(overrides = {}) {
  const db = overrides.database || pool;
  const deps = {
    now: () => new Date(), timeZone: agencyId => Availability.resolveAgencyTimeZone({ agencyId }),
    encrypt: maybeEncryptNotePayload, decrypt: maybeDecryptNotePayload,
    listAppointments: args => Appointment.listForAgencyInWindow(args),
    getAppointment: id => Appointment.findById(id), participants: id => Appointment.listParticipants(id),
    previewAppointment: previewAppointmentChange, completeAppointment: completeAppointmentChange,
    editPublication: editAvailabilityPublication, cancelMeetings: cancelMeetingOccurrences,
    notifyMeetings: sendMeetingScheduleChange, invalidate: invalidateAvailabilityReminders, ...overrides
  };

  async function inventory(plan, actor, authorizeAppointment) {
    const items = [], unchanged = [];
    const now = deps.now();
    for (const scope of plan.scopes) {
      const { agencyId, timeZone, start, end } = scope;
      const appointments = await deps.listAppointments({ agencyId, providerUserId: plan.providerId, windowStart: start, windowEnd: end });
      if (appointments.length >= 500) throw fail('This day has too many appointments to review together. Use individual cancellation.', 409);
      for (const a of appointments) {
        if (isCanceled(a.status)) continue;
        await authorizeAppointment(actor, a);
        const item = { key: `appointment:${a.id}`, kind: 'appointment', id: a.id, agencyId, timeZone,
          title: a.title || 'Client appointment', startAt: stamp(a.startAt), endAt: stamp(a.endAt), source: { status: a.status, updatedAt: stamp(a.updatedAt), participants: await deps.participants(a.id) } };
        item.recipients = item.source.participants.filter(p => p.clientId).map(p => p.displayName || `Client record #${p.clientId}`);
        if (!cancellable.has(String(a.status).toLowerCase()) || utc(a.startAt) <= now) {
          unchanged.push({ ...item, detail: 'Started, completed, or otherwise locked; review individually.' }); continue;
        }
        // Run the actual cancellation preview: missing client links/clinical constraints cannot be hidden by a bulk action.
        const preview = await deps.previewAppointment(a.id, plan.facts, { actorUserId: actor.id, actorRole: actor.role });
        item.note = preview.narrative;
        items.push(item);
      }
      for (const kind of ['meeting', 'supervision']) {
        const table = kind === 'meeting' ? 'provider_schedule_events' : 'supervision_sessions';
        const host = kind === 'meeting' ? 'provider_id' : 'supervisor_user_id';
        const [rows] = await db.execute(`SELECT * FROM ${table} WHERE agency_id=? AND ${host}=? AND status<> 'CANCELLED'
          AND ${kind === 'meeting' ? "((start_at<? AND end_at>?) OR (all_day=1 AND start_date<=? AND end_date>?)) AND kind IN ('TEAM_MEETING','HUDDLE') AND client_id IS NULL" : 'start_at<? AND end_at>?'} ORDER BY id`, kind === 'meeting' ? [agencyId, plan.providerId, end, start, plan.date, plan.date] : [agencyId, plan.providerId, end, start]);
        for (const row of rows) {
          const [attendees] = await db.execute(kind === 'meeting'
            ? 'SELECT user_id FROM provider_schedule_event_attendees WHERE event_id=? ORDER BY user_id'
            : "SELECT user_id,status FROM supervision_session_attendees WHERE session_id=? AND status NOT IN ('REMOVED','WITHDRAWN','CANCELLED') ORDER BY user_id", [row.id]);
          const item = { key: `${kind}:${row.id}`, kind, id: Number(row.id), agencyId, timeZone,
            title: row.title || (kind === 'supervision' ? 'Supervision' : 'Meeting'), startAt: stamp(row.start_at || start), endAt: stamp(row.end_at || end),
            source: { status: row.status, updatedAt: stamp(row.updated_at), startAt: stamp(row.start_at), endAt: stamp(row.end_at), attendees }, meetingSnapshot: row };
          if (row.all_day && (ymd(row.start_date) < plan.date || ymd(row.end_date) > addDaysYmd(plan.date, 1))) unchanged.push({ ...item, detail: 'Spans multiple dates; review individually to preserve the other days.' });
          else if (utc(item.startAt) <= now || row.finalized_at || row.meeting_completed_at || row.live_started_at) unchanged.push({ ...item, detail: 'Already started or completed; review individually.' });
          else items.push(item);
        }
      }
      for (const kind of Object.keys(tables)) {
        const [rows] = await db.execute(kind === 'weekly'
          ? `SELECT *, DATE_FORMAT(start_date,'%Y-%m-%d') start_date, DATE_FORMAT(end_date,'%Y-%m-%d') end_date FROM ${tables[kind]} WHERE agency_id=? AND provider_id=? ORDER BY id`
          : `SELECT * FROM ${tables[kind]} WHERE agency_id=? AND provider_id=? AND is_active=1 AND start_at<? AND end_at>? ORDER BY id`,
        kind === 'weekly' ? [agencyId, plan.providerId] : [agencyId, plan.providerId, end, start]);
        const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(plan.date + 'T12:00:00Z').getUTCDay()];
        for (const row of rows) {
          if (kind === 'weekly' && (row.day_of_week !== weekday || !availabilityOccursOn(row, plan.date))) continue;
          items.push({ key: `${kind}:${row.id}`, kind, id: Number(row.id), agencyId, timeZone,
            title: kind === 'inPerson' ? 'Published in-person opening' : 'Published virtual opening',
            startAt: stamp(kind === 'weekly' ? wallMysqlToUtcMysql(`${plan.date} ${row.start_time}`, timeZone) : row.start_at),
            endAt: stamp(kind === 'weekly' ? wallMysqlToUtcMysql(`${plan.date} ${row.end_time}`, timeZone) : row.end_at),
            source: kind === 'weekly' ? { start: row.start_time, end: row.end_time, frequency: row.frequency, excluded: row.excluded_dates_json } : { start: stamp(row.start_at), end: stamp(row.end_at) } });
        }
      }
    }
    items.sort((a, b) => a.key.localeCompare(b.key));
    return { items, unchanged, fingerprint: fingerprint(items) };
  }

  function response(row, plan, results) {
    // Never expose internal notes, full meeting records, or signed financial facts in this review endpoint.
    const display = ({ key, kind, title, agencyId, timeZone, startAt, endAt, note, detail, recipients }) => ({ key, kind, title, agencyId, timeZone, startAt, endAt, note, detail, recipients });
    return { token: row.token, status: row.status, date: plan.date, providerId: plan.providerId,
      scopes: plan.scopes, clientFacingReason: plan.facts.clientFacingReason, followUpAction: plan.facts.followUpAction, followUpMessage: plan.facts.followUpMessage, items: plan.items.map(display),
      unchanged: plan.unchanged.map(display), results, remaining: plan.items.filter(i => !results[i.key]).length };
  }

  async function preview(input, actor, authorize, authorizeAppointment) {
    const providerId = Number(input.providerId), agencyIds = [...new Set((input.agencyIds || []).map(Number))].sort((a, b) => a - b);
    if (!Number.isSafeInteger(providerId) || providerId < 1 || !agencyIds.length || agencyIds.length > 30 || agencyIds.some(id => !Number.isSafeInteger(id) || id < 1)) throw fail('Choose a provider and at least one agency.');
    await authorize(actor, providerId, agencyIds);
    const plan = { providerId, date: input.date, facts: dayCancellationFacts(input), internalReason: String(input.internalReason || '').trim().slice(0, 2000), scopes: [] };
    for (const agencyId of agencyIds) {
      const timeZone = await deps.timeZone(agencyId), bounds = dayBounds(input.date, timeZone);
      if (utc(bounds.end) <= deps.now()) throw fail('Choose today or a future day.');
      plan.scopes.push({ agencyId, timeZone, ...bounds });
    }
    Object.assign(plan, await inventory(plan, actor, authorizeAppointment));
    const row = { token: randomUUID(), status: 'preview' };
    await db.execute(`INSERT INTO provider_day_cancellations (token,provider_id,actor_user_id,cancellation_date,plan_json,results_json,expires_at)
      VALUES (?,?,?,?,?,'{}',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE))`, [row.token, providerId, actor.id, plan.date, deps.encrypt(JSON.stringify(plan))]);
    return response(row, plan, {});
  }

  async function apply(token, input, actor, authorize, authorizeAppointment) {
    if (input.signatureConfirmed !== true) throw fail('Review and sign the cancellation before continuing.');
    if (!/^[a-f0-9-]{36}$/.test(String(token))) throw fail('Invalid cancellation review.');
    const conn = await db.getConnection();
    const locks = [];
    try {
      async function lock(key) {
        const [[r]] = await conn.execute('SELECT GET_LOCK(?,5) AS acquired', [key]);
        if (Number(r?.acquired) !== 1) throw fail('This schedule is being updated. Please retry.', 409);
        locks.push(key);
      }
      await lock(`day-cancel:${token}`);
      const [[row]] = await conn.execute('SELECT * FROM provider_day_cancellations WHERE token=? AND actor_user_id=?', [token, actor.id]);
      if (!row) throw fail('Cancellation review not found.', 404);
      const plan = JSON.parse(deps.decrypt(typeof row.plan_json === 'string' ? row.plan_json : JSON.stringify(row.plan_json))), results = parse(row.results_json) || {};
      if (Number(input.providerId) !== plan.providerId) throw fail('Cancellation review not found.', 404);
      await authorize(actor, plan.providerId, plan.scopes.map(s => s.agencyId));
      if (row.status === 'preview') {
        if (utc(row.expires_at) <= deps.now()) throw fail('This review expired. Review the current schedule again.', 409);
        // The same provider lock is used by appointment booking. Install the day block before releasing it.
        await lock(`public-provider-selection:${plan.providerId}`);
        await lock(`supervision-time:${plan.providerId}`);
        const current = await inventory(plan, actor, authorizeAppointment);
        if (current.fingerprint !== plan.fingerprint) throw fail('The schedule changed. Review the day again before canceling.', 409);
        await conn.beginTransaction();
        try {
          for (const scope of plan.scopes) {
            await conn.execute(`INSERT INTO provider_schedule_events
              (agency_id,provider_id,kind,title,description,is_private,all_day,start_at,end_at,start_date,end_date,event_timezone,status,created_by_user_id,updated_by_user_id)
              VALUES (?,?,'SCHEDULE_HOLD','Unavailable',NULL,1,1,?,?,?,?,?,'ACTIVE',?,?)`,
            [scope.agencyId, plan.providerId, scope.start, scope.end, plan.date, addDaysYmd(plan.date, 1), scope.timeZone, actor.id, actor.id]);
          }
          await deps.invalidate(conn, plan.providerId);
          await conn.execute("UPDATE provider_day_cancellations SET status='processing',signed_at=UTC_TIMESTAMP() WHERE token=?", [token]);
          await conn.commit();
          row.status = 'processing';
        } catch (error) { await conn.rollback(); throw error; }
        // Do not retain provider booking locks while the signed appointment flow takes its own locks.
        for (const key of locks.splice(1).reverse()) await conn.execute('SELECT RELEASE_LOCK(?)', [key]);
      }
      if (input.retryFailed === true) {
        for (const [key, result] of Object.entries(results)) if (result.status === 'failed') delete results[key];
      }
      const item = plan.items.find(i => !results[i.key]);
      if (item) {
        try {
          let delivery;
          if (item.kind === 'appointment') {
            const appointment = await deps.getAppointment(item.id);
            if (!appointment || appointment.agencyId !== item.agencyId || appointment.providerUserId !== plan.providerId || stamp(appointment.startAt) !== item.startAt || stamp(appointment.endAt) !== item.endAt) throw fail('This appointment changed. Review it individually.', 409);
            await authorizeAppointment(actor, appointment);
            if (!isCanceled(appointment.status) && (stamp(appointment.updatedAt) !== item.source.updatedAt || JSON.stringify(await deps.participants(item.id)) !== JSON.stringify(item.source.participants))) throw fail('This appointment or its recipients changed. Review it individually.', 409);
            if (utc(appointment.startAt) <= deps.now() && !isCanceled(appointment.status)) throw fail('This appointment has started. Review it individually.', 409);
            const completed = await deps.completeAppointment(item.id, plan.facts, { actorUserId: actor.id, actorRole: actor.role });
            delivery = completed.notificationDelivery || completed.result?.notificationDelivery;
          } else if (['meeting', 'supervision'].includes(item.kind)) {
            const table = item.kind === 'meeting' ? 'provider_schedule_events' : 'supervision_sessions';
            const [[current]] = await conn.execute(`SELECT * FROM ${table} WHERE id=?`, [item.id]);
            const host = item.kind === 'meeting' ? 'provider_id' : 'supervisor_user_id';
            if (!current || Number(current[host]) !== plan.providerId || Number(current.agency_id) !== item.agencyId || stamp(current.start_at) !== item.source.startAt || stamp(current.end_at) !== item.source.endAt || current.finalized_at || current.meeting_completed_at || current.live_started_at) throw fail('This meeting changed. Review it individually.', 409);
            if (current.status !== 'CANCELLED' && stamp(current.updated_at) !== item.source.updatedAt) throw fail('This meeting changed. Review it individually.', 409);
            const [attendees] = await conn.execute(item.kind === 'meeting'
              ? 'SELECT user_id FROM provider_schedule_event_attendees WHERE event_id=? ORDER BY user_id'
              : "SELECT user_id,status FROM supervision_session_attendees WHERE session_id=? AND status NOT IN ('REMOVED','WITHDRAWN','CANCELLED') ORDER BY user_id", [item.id]);
            if (JSON.stringify(attendees) !== JSON.stringify(item.source.attendees)) throw fail('This meeting’s participants changed. Review it individually.', 409);
            if (current.status !== 'CANCELLED' && utc(item.startAt) <= deps.now()) throw fail('This meeting has started. Review it individually.', 409);
            const canceled = await deps.cancelMeetings({ kind: item.kind, eventId: item.id, scope: 'single', actorUserId: actor.id, cancelReason: plan.facts.clientFacingReason });
            // Snapshot fallback recovers delivery after cancellation succeeded but the response was interrupted.
            const rows = canceled.rows.length ? canceled.rows : [item.meetingSnapshot];
            delivery = await deps.notifyMeetings(rows.map(r => ({ ...r, cancel_reason: plan.facts.clientFacingReason })), 'cancelled', { scope: 'single' });
          } else {
            const table = tables[item.kind];
            const [[current]] = await conn.execute(`SELECT * ${item.kind === 'weekly' ? ",DATE_FORMAT(start_date,'%Y-%m-%d') start_date,DATE_FORMAT(end_date,'%Y-%m-%d') end_date" : ''} FROM ${table} WHERE id=? AND agency_id=? AND provider_id=?`, [item.id, item.agencyId, plan.providerId]);
            // A removed occurrence is already complete. Never re-create or remove a sibling occurrence.
            const removed = !current || (item.kind === 'weekly' ? !availabilityOccursOn(current, plan.date) : !Number(current.is_active));
            if (!removed) {
              if (item.kind === 'weekly' && (current.start_time !== item.source.start || current.end_time !== item.source.end || current.frequency !== item.source.frequency)) throw fail('This recurring opening changed. Review it individually.', 409);
              if (item.kind !== 'weekly' && (stamp(current.start_at) !== item.startAt || stamp(current.end_at) !== item.endAt)) throw fail('This opening changed. Review it individually.', 409);
              await deps.editPublication({ agencyId: item.agencyId, providerId: plan.providerId, kind: item.kind, id: item.id, action: 'delete', scope: 'single', occurrenceDate: plan.date });
            }
          }
          results[item.key] = { status: 'completed', notificationDelivery: delivery || null };
        } catch (error) {
          results[item.key] = { status: 'failed', message: error.status ? error.message : 'Could not complete this item. Retry or open the event to review.' };
        }
      }
      row.status = plan.items.some(i => !results[i.key]) ? 'processing' : Object.values(results).some(r => r.status === 'failed') ? 'partial' : 'completed';
      await conn.execute('UPDATE provider_day_cancellations SET results_json=?,status=? WHERE token=?', [JSON.stringify(results), row.status, token]);
      return response(row, plan, results);
    } finally {
      for (const key of locks.reverse()) await conn.execute('SELECT RELEASE_LOCK(?)', [key]).catch(() => {});
      conn.release();
    }
  }
  async function resume({ providerId, date }, actor, authorize) {
    dayBounds(date, 'UTC');
    const [[row]] = await db.execute(`SELECT * FROM provider_day_cancellations WHERE provider_id=? AND actor_user_id=? AND cancellation_date=? AND status IN ('processing','partial') ORDER BY id DESC LIMIT 1`, [providerId, actor.id, date]);
    if (!row) return { review: null };
    const plan = JSON.parse(deps.decrypt(typeof row.plan_json === 'string' ? row.plan_json : JSON.stringify(row.plan_json)));
    await authorize(actor, plan.providerId, plan.scopes.map(s => s.agencyId));
    return { review: response(row, plan, parse(row.results_json) || {}) };
  }
  return { preview, apply, resume };
}

export default createDayCancellationService();
