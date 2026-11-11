import { createHash, createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import config from '../config/config.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import AgencyServiceLocation from '../models/AgencyServiceLocation.model.js';
import Appointment from '../models/Appointment.model.js';
import { assertAppointmentWindowAvailable } from './appointmentConflict.service.js';
import { sameDayServiceWarnings } from './sameDayServiceWarning.service.js';
import { requireClientSessionBooking } from './clientSessionBookingRollout.service.js';
import { withClientSchedulingLock } from './clientSchedulingGuard.service.js';
import { expandAppointmentRecurrence } from '../utils/appointmentRecurrence.js';
import { agendaClock, agendaDate, addAgendaDays, parseAuricwellAgendaPaste, validateAgendaWeek } from '../utils/auricwellAgendaPaste.js';
import { isValidTimeZone, wallMysqlToUtcMysql, utcMysqlToZonedWallMysql } from '../utils/zonedWallTime.util.js';

const fail = (status, message, code = 'AGENDA_IMPORT_REVIEW') => Object.assign(new Error(message), { status, code });
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const normName = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const sqlTime = value => value instanceof Date ? value.toISOString().slice(0, 19).replace('T', ' ') : String(value || '').replace('T', ' ').replace(/Z$/, '').slice(0, 19);
const validId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const recurrences = new Set(['ONCE', 'WEEKLY', 'BIWEEKLY']);
const sourceFor = row => `aw_agenda:${digest([row.agencyId, row.providerId, row.clientId, row.startAt, row.endAt, row.tenantServiceId, row.serviceLocationId, row.modality]).slice(0, 50)}`;
function calendarIdentity(appointment, row) {
  const signature = createHmac('sha256', config.jwt.secret).update(JSON.stringify(['aw-agenda-calendar-v1', Number(appointment.id), row.source, row.agencyId, row.providerId, row.clientId, row.startAt, row.endAt])).digest('hex').slice(0, 32);
  return `AW_AGENDA:${Number(appointment.id)}:${signature}`.toUpperCase();
}
const seriesFor = row => {
  const hex = digest([row.agencyId, row.providerId, row.clientId, row.date, row.startTime, row.tenantServiceId, row.serviceLocationId, row.recurrence]);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

async function loadContext({ actor, agencyId, providerId }) {
  if (!['admin', 'super_admin'].includes(String(actor?.role || '').toLowerCase())) throw fail(403, 'Practice administrator access is required for an agenda import.');
  if (!validId(agencyId) || !validId(providerId)) throw fail(400, 'Select a practice and provider.');
  if (actor.role !== 'super_admin' && !(await User.getAgencies(actor.id)).some(agency => Number(agency.id) === agencyId && ![false, 0, '0'].includes(agency.is_active))) throw fail(403, 'You do not administer this practice.');
  const [providers] = await pool.execute(`SELECT u.id,u.first_name,u.last_name,u.role,u.status,u.is_active,u.is_archived
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1
    WHERE u.id=? LIMIT 1`, [agencyId, providerId]);
  const provider = providers[0];
  if (!provider || !Number(provider.is_active) || Number(provider.is_archived) || ['terminated', 'inactive'].includes(provider.status)) throw fail(403, 'Select an active provider assigned to this practice.');
  // The shared rollout gate also checks active tenant membership, the assigned
  // care role/provider access, and Sees clients. It supports staff with dual roles.
  await requireClientSessionBooking(agencyId, providerId);
  const [clients] = await pool.execute(`SELECT DISTINCT c.id,c.full_name,c.initials,c.client_type,c.status,c.client_status_id,c.provider_id,c.updated_at
    FROM clients c WHERE c.agency_id=? AND c.compliance_archived_at IS NULL AND UPPER(COALESCE(c.status,''))<>'ARCHIVED'
      AND (c.provider_id=? OR EXISTS (SELECT 1 FROM client_provider_assignments ca WHERE ca.client_id=c.id AND ca.provider_user_id=? AND ca.is_active=1))
    ORDER BY c.full_name,c.id LIMIT 501`, [agencyId, providerId, providerId]);
  if (clients.length > 500) throw fail(409, 'This provider has more than 500 clients. Review and narrow the active caseload before importing the agenda.');
  const { resolveBookingOptions } = await import('./appointment.service.js');
  const booking = await resolveBookingOptions({ agencyId, providerId });
  const services = booking.services.filter(service => service.isActive && service.isStaffBookable && service.allowsIndividual && service.serviceCode
    && !['90785', '90833', '90836', '90838', '90840', '99051'].includes(String(service.serviceCode).toUpperCase()));
  const locations = await AgencyServiceLocation.listByAgency(agencyId);
  let schoolSlots = [];
  if (locations.some(location => Number(location.school_organization_id))) {
    [schoolSlots] = await pool.execute(`SELECT s.id,s.school_organization_id,s.client_id,s.weekday,s.start_time,s.end_time
      FROM soft_schedule_slots s JOIN clients c ON c.id=s.client_id AND c.agency_id=?
      WHERE s.provider_user_id=? ORDER BY s.school_organization_id,s.weekday,s.slot_index LIMIT 1000`, [agencyId, providerId]);
  }
  const agency = await Agency.findById(agencyId);
  return { agencyId, providerId, provider, clients, services, locations, schoolSlots, timeZone: agency?.timezone || 'America/Denver' };
}

async function findExisting(row) {
  const [found] = await pool.execute(`SELECT DISTINCT a.* FROM appointments a WHERE a.agency_id=? AND a.provider_user_id=?
    AND (a.source=? OR (a.start_at=? AND a.end_at=? AND EXISTS (SELECT 1 FROM appointment_participants p WHERE p.appointment_id=a.id AND p.client_id=?)))
    ORDER BY a.id LIMIT 3`, [row.agencyId, row.providerId, row.source, row.startAt, row.endAt, row.clientId]);
  if (found.length > 1) throw fail(409, 'Multiple existing appointments match this row. Resolve the duplicate appointments before importing.');
  if (!found.length) return null;
  const appointment = Appointment.mapRow(found[0]);
  const participants = await Appointment.listParticipants(appointment.id);
  if (appointment.productOrigin !== 'full_suite' || !['scheduled', 'confirmed', 'client_confirmed', 'reschedule_requested', 'cancellation_requested'].includes(appointment.status) || sqlTime(appointment.startAt) !== row.startAt || sqlTime(appointment.endAt) !== row.endAt
    || appointment.tenantServiceId !== row.tenantServiceId || appointment.serviceLocationId !== row.serviceLocationId
    || appointment.modality !== row.modality || participants.filter(item => ['client', 'student'].includes(item.role)).length !== 1
    || !participants.some(item => Number(item.clientId) === row.clientId)) {
    throw fail(409, `Appointment #${appointment.id} already matches this import but has different details or an incomplete setup. Review that appointment before retrying.`, 'AGENDA_EXISTING_CHANGED');
  }
  if (appointment.source === row.source && !appointment.providerScheduleEventId && !appointment.officeEventId) {
    appointment.agendaRecoverableEventId = (await findOwnedCalendarEvent(row, appointment))?.id || null;
  }
  return appointment;
}

async function findOwnedCalendarEvent(row, appointment) {
  const [events] = await pool.execute(`SELECT pse.id,pse.agency_id,pse.provider_id,pse.client_id,pse.start_at,pse.end_at,pse.status,pse.kind,a.id AS linked_appointment_id
    FROM provider_schedule_events pse LEFT JOIN appointments a ON a.provider_schedule_event_id=pse.id
    WHERE pse.reason_code=? AND pse.agency_id=? AND pse.provider_id=? LIMIT 3`, [calendarIdentity(appointment, row), row.agencyId, row.providerId]);
  if (!events.length) return null;
  const event = events[0];
  if (events.length !== 1 || Number(event.client_id) !== row.clientId || sqlTime(event.start_at) !== row.startAt || sqlTime(event.end_at) !== row.endAt
    || event.kind !== 'PERSONAL_EVENT' || event.status !== 'ACTIVE' || (event.linked_appointment_id && Number(event.linked_appointment_id) !== Number(appointment.id))) {
    throw fail(409, `Calendar recovery for appointment #${appointment.id} needs review. Its saved event identity or details changed.`, 'AGENDA_CALENDAR_RECOVERY_REVIEW');
  }
  return { id: Number(event.id) };
}

async function checkConflict(row, existing) {
  await assertAppointmentWindowAvailable(pool, { agencyId: row.agencyId, providerUserId: row.providerId, status: 'scheduled', startAt: row.startAt, endAt: row.endAt,
    sourceTimezone: row.timeZone, providerScheduleEventId: existing?.providerScheduleEventId || existing?.agendaRecoverableEventId || null, officeEventId: existing?.officeEventId || null }, existing?.id || null);
  const [clientBookings] = await pool.execute(`SELECT a.id FROM appointments a JOIN appointment_participants p ON p.appointment_id=a.id
    WHERE p.client_id=? AND a.start_at<? AND a.end_at>? AND a.id<>?
      AND a.status NOT IN ('draft','canceled_by_provider','canceled_by_client','canceled_by_guardian','canceled_by_organization','late_canceled','rescheduled','voided') LIMIT 1`,
  [row.clientId, row.endAt, row.startAt, existing?.id || 0]);
  if (clientBookings.length) throw fail(409, 'This client already has an overlapping appointment.');
}

async function canonicalBook({ actor, row, acknowledgeSameDayServices }) {
  const { createAppointmentHandler } = await import('../controllers/appointment.controller.js');
  let status = 200, body;
  const response = { status(value) { status = value; return this; }, json(value) { body = value; return this; } };
  await createAppointmentHandler({ user: actor, params: {}, appointmentCalendarIdentity: appointment => calendarIdentity(appointment, row), body: {
    agencyId: row.agencyId, providerUserId: row.providerId, tenantServiceId: row.tenantServiceId,
    serviceCode: row.serviceCode, startAt: `${row.startAt.replace(' ', 'T')}Z`, endAt: `${row.endAt.replace(' ', 'T')}Z`,
    timeZone: row.timeZone, modality: row.modality, serviceLocationId: row.serviceLocationId,
    participants: [{ clientId: row.clientId, role: 'client' }], recurrence: 'ONCE', occurrenceCount: 1,
    source: row.source, title: 'Session', createProviderScheduleEvent: true, acknowledgeSameDayServices
  } }, response, error => { throw error; });
  if (status >= 400 || !body?.appointment?.id) throw Object.assign(fail(status >= 400 ? status : 500, body?.error?.message || 'The appointment could not be completed.', body?.error?.code), { createdAppointmentIds: body?.createdAppointmentIds || [] });
  return body.appointment;
}

async function completeFacets({ actor, row, appointment }) {
  const { ensureAppointmentClinicalLink } = await import('./appointmentClinicalLink.service.js');
  await ensureAppointmentClinicalLink(appointment.id, actor.id);
  // Only repair calendar linkage for this importer’s durable source. Existing appointments keep their own series.
  if (appointment.source === row.source && !appointment.providerScheduleEventId && !appointment.officeEventId) {
    const { default: ProviderScheduleEvent } = await import('../models/ProviderScheduleEvent.model.js');
    const { linkProviderScheduleEvent } = await import('./appointment.service.js');
    const recovered = await findOwnedCalendarEvent(row, appointment);
    const saved = recovered || await ProviderScheduleEvent.create({ agencyId: row.agencyId, providerId: row.providerId, clientId: row.clientId,
      eventTimezone: row.timeZone, kind: 'PERSONAL_EVENT', title: 'Session', description: null, isPrivate: false, allDay: false,
      reasonCode: calendarIdentity(appointment, row), startAt: row.startAt, endAt: row.endAt, createdByUserId: actor.id });
    await linkProviderScheduleEvent(appointment.id, saved.id);
    appointment.providerScheduleEventId = Number(saved.id);
  }
  if (appointment.source === row.source && appointment.providerScheduleEventId && row.seriesKey) {
    await pool.execute(`UPDATE provider_schedule_events SET recurrence_series_id=?,recurrence_frequency=?,recurrence_policy='future_only',recurrence_index=? WHERE id=? AND provider_id=? AND agency_id=?`,
      [row.seriesKey, row.recurrence, row.recurrenceIndex, appointment.providerScheduleEventId, row.providerId, row.agencyId]);
  }
  return appointment;
}

async function importLock({ agencyId, providerId }, work) {
  const connection = await pool.getConnection(), key = `aw-agenda-import:${agencyId}:${providerId}`;
  let acquired = false;
  try {
    const [[row]] = await connection.execute('SELECT GET_LOCK(?,8) AS acquired', [key]);
    acquired = Number(row?.acquired) === 1;
    if (!acquired) throw fail(409, 'Another agenda import for this provider is running. Wait for its result before retrying.');
    return await work();
  } finally {
    if (acquired) await connection.execute('SELECT RELEASE_LOCK(?)', [key]).catch(() => {});
    connection.release();
  }
}

function strictInstant(date, time, timeZone) {
  const wall = `${date} ${time}:00`, instant = wallMysqlToUtcMysql(wall, timeZone);
  if (!instant || utcMysqlToZonedWallMysql(instant, timeZone) !== wall) throw fail(400, 'This local time does not exist because of a daylight-saving change. Choose a valid time.');
  // Refuse repeated fall-back wall times instead of silently selecting one offset.
  const epoch = Date.parse(`${instant.replace(' ', 'T')}Z`);
  for (const offset of [-7200000, -3600000, -1800000, 1800000, 3600000, 7200000]) {
    if (utcMysqlToZonedWallMysql(new Date(epoch + offset), timeZone) === wall) throw fail(400, 'This time repeats during a daylight-saving change. Book that occurrence individually with an explicit offset.');
  }
  return instant;
}

export function createAuricwellAgendaImporter(overrides = {}) {
  const deps = {
    loadContext, findExisting, checkConflict, book: canonicalBook, completeFacets, lock: importLock,
    clientLock: (row, work) => withClientSchedulingLock([row.clientId], work),
    sameDay: async ({ actor, row, existing }) => sameDayServiceWarnings({ agencyId: row.agencyId, user: actor, participants: [{ clientId: row.clientId, role: 'client' }], occurrences: [{ startAt: `${row.startAt.replace(' ', 'T')}Z` }], timeZone: row.timeZone, excludeAppointmentId: existing?.id || 0 }),
    checkSchool: async input => (await import('./schoolAppointmentTransition.service.js')).schoolAgendaLinkContext(input),
    linkSchool: async input => (await import('./schoolAppointmentTransition.service.js')).linkSchoolAppointment(input),
    sign: claims => jwt.sign(claims, config.jwt.secret, { expiresIn: '15m', audience: 'auricwell-agenda-import' }),
    verify: token => jwt.verify(token, config.jwt.secret, { audience: 'auricwell-agenda-import' }),
    now: () => Date.now(), ...overrides
  };

  async function options({ actor, agencyId, providerId }) {
    const context = await deps.loadContext({ actor, agencyId: Number(agencyId), providerId: Number(providerId) });
    return { agencyId: context.agencyId, providerId: context.providerId, timeZone: context.timeZone,
      clients: context.clients.map(client => ({ id: Number(client.id), label: client.full_name || client.initials || `Client #${client.id}` })),
      services: context.services.map(service => ({ id: service.id, name: service.name, serviceCode: service.serviceCode, modality: service.modality })),
      locations: context.locations.map(location => ({ id: Number(location.id), name: location.name, placeOfService: location.place_of_service, schoolId: Number(location.school_organization_id) || null })),
      schoolSlots: (context.schoolSlots || []).map(slot => ({ id: Number(slot.id), schoolId: Number(slot.school_organization_id), clientId: Number(slot.client_id), weekday: slot.weekday,
        label: `${slot.weekday} ${String(slot.start_time || '').slice(0, 5)}–${String(slot.end_time || '').slice(0, 5)} · slot #${slot.id}` })) };
  }

  async function prepare({ actor, input, issueToken = true }) {
    const agencyId = Number(input.agencyId), providerId = Number(input.providerId);
    const context = await deps.loadContext({ actor, agencyId, providerId });
    const weekStart = validateAgendaWeek(input.weekStart), timeZone = String(input.timeZone || '');
    if (!isValidTimeZone(timeZone)) throw fail(400, 'Choose the agenda’s IANA time zone explicitly.');
    const supplied = input.rows || parseAuricwellAgendaPaste(input.text, weekStart);
    if (!Array.isArray(supplied) || !supplied.length || supplied.length > 100) throw fail(400, 'Review between 1 and 100 appointment rows at a time.');
    const defaults = input.defaults || {}, rows = [], occurrences = [], seen = new Map();
    for (const [index, suppliedRow] of supplied.entries()) {
      if (suppliedRow.include === false) continue;
      const row = {
        rowId: String(suppliedRow.rowId || `row-${index + 1}`).slice(0, 50), sourceLine: String(suppliedRow.sourceLine || '').slice(0, 500), clientInput: String(suppliedRow.clientInput || '').slice(0, 150),
        clientId: validId(suppliedRow.clientId), date: suppliedRow.date || '', startTime: agendaClock(suppliedRow.startTime) || '', endTime: agendaClock(suppliedRow.endTime) || '',
        durationMinutes: Number(suppliedRow.durationMinutes || defaults.durationMinutes) || null,
        tenantServiceId: validId(suppliedRow.tenantServiceId || defaults.tenantServiceId), serviceLocationId: validId(suppliedRow.serviceLocationId || defaults.serviceLocationId),
        modality: String(suppliedRow.modality || defaults.modality || '').toUpperCase(), recurrence: String(suppliedRow.recurrence || defaults.recurrence || '').toUpperCase(),
        occurrenceCount: Number(suppliedRow.occurrenceCount || defaults.occurrenceCount) || 1, schoolSlotId: validId(suppliedRow.schoolSlotId), errors: [], warnings: []
      };
      rows.push(row);
      try {
        if (Array.isArray(suppliedRow.parseErrors) && suppliedRow.parseErrors.length) throw fail(400, suppliedRow.parseErrors.join(' '));
        let clientId = validId(suppliedRow.clientId);
        if (!clientId && row.clientInput) {
          const matches = context.clients.filter(client => normName(client.full_name) === normName(row.clientInput));
          if (matches.length === 1) clientId = Number(matches[0].id);
        }
        row.clientId = clientId;
        const client = context.clients.find(client => Number(client.id) === clientId);
        if (!client) throw fail(400, 'Choose a client from this provider’s current caseload. Names with multiple matches require an explicit selection.');
        row.clientLabel = client.full_name || client.initials || `Client #${clientId}`;
        if (/archived|terminated|inactive/i.test(String(client.status || ''))) throw fail(409, 'Review this client’s active status before scheduling.');
        row.date = agendaDate(suppliedRow.date);
        row.startTime = agendaClock(suppliedRow.startTime);
        row.endTime = agendaClock(suppliedRow.endTime);
        if (!row.date || row.date < weekStart || row.date > addAgendaDays(weekStart, 6)) throw fail(400, 'Choose an appointment date within the selected week.');
        if (!row.startTime) throw fail(400, 'Enter a start time using 24-hour time or explicit AM/PM.');
        let minutes = Number(suppliedRow.durationMinutes || defaults.durationMinutes);
        if (row.endTime) minutes = (Number(row.endTime.slice(0, 2)) * 60 + Number(row.endTime.slice(3))) - (Number(row.startTime.slice(0, 2)) * 60 + Number(row.startTime.slice(3)));
        if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240) throw fail(400, 'Enter an end time or an explicit duration between 5 and 240 minutes.');
        row.durationMinutes = minutes;
        if (!row.endTime) {
          const endMinutes = Number(row.startTime.slice(0, 2)) * 60 + Number(row.startTime.slice(3)) + minutes;
          if (endMinutes >= 1440) throw fail(400, 'Book appointments crossing midnight individually.');
          row.endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
        }
        row.tenantServiceId = validId(suppliedRow.tenantServiceId || defaults.tenantServiceId);
        const service = context.services.find(service => Number(service.id) === row.tenantServiceId);
        if (!service) throw fail(400, 'Choose an active individual service assigned to this provider.');
        row.serviceCode = service.serviceCode;
        row.modality = String(suppliedRow.modality || defaults.modality || '').toUpperCase();
        if (!['IN_PERSON', 'TELEHEALTH'].includes(row.modality) || !['EITHER', row.modality].includes(service.modality)) throw fail(400, 'Choose an in-person or telehealth setting allowed for this service.');
        row.serviceLocationId = validId(suppliedRow.serviceLocationId || defaults.serviceLocationId);
        const location = context.locations.find(location => Number(location.id) === row.serviceLocationId);
        if (!location) throw fail(400, 'Choose an active service location in this practice.');
        const remoteLocation = ['02', '10'].includes(String(location.place_of_service));
        if ((row.modality === 'TELEHEALTH') !== remoteLocation) throw fail(400, 'Choose a location whose place of service matches in-person or telehealth care.');
        row.locationLabel = location.name;
        row.schoolId = Number(location.school_organization_id) || null;
        row.recurrence = String(suppliedRow.recurrence || defaults.recurrence || '').toUpperCase();
        row.occurrenceCount = row.recurrence === 'ONCE' ? 1 : Number(suppliedRow.occurrenceCount || defaults.occurrenceCount);
        if (!recurrences.has(row.recurrence) || !Number.isInteger(row.occurrenceCount) || row.occurrenceCount < 1 || row.occurrenceCount > 52) throw fail(400, 'Choose once, weekly, or every two weeks and an explicit count from 1 to 52.');
        const expanded = expandAppointmentRecurrence({ startAt: `${row.date} ${row.startTime}:00`, endAt: `${row.date} ${row.endTime}:00`, timeZone, recurrence: row.recurrence, occurrenceCount: row.occurrenceCount });
        row.schoolSlotId = validId(suppliedRow.schoolSlotId);
        row.newCount = 0; row.existingCount = 0;
        const seriesKey = expanded.length > 1 ? seriesFor({ ...row, agencyId, providerId }) : null;
        for (const [recurrenceIndex, occurrence] of expanded.entries()) {
          const candidate = { ...row, agencyId, providerId, timeZone, seriesKey, recurrenceIndex, date: occurrence.startAt.slice(0, 10),
            startAt: strictInstant(occurrence.startAt.slice(0, 10), row.startTime, timeZone), endAt: strictInstant(occurrence.endAt.slice(0, 10), row.endTime, timeZone) };
          if (Date.parse(`${candidate.startAt.replace(' ', 'T')}Z`) <= deps.now()) throw fail(400, 'The agenda import creates future appointments. Review historical sessions separately.');
          candidate.source = sourceFor(candidate);
          if (seen.has(candidate.source)) throw fail(409, `This appointment is repeated in row ${seen.get(candidate.source)}. Remove the duplicate row.`);
          for (const prior of occurrences) if (prior.startAt < candidate.endAt && prior.endAt > candidate.startAt) throw fail(409, `This time overlaps another imported appointment in row ${prior.rowNumber}.`);
          if (candidate.schoolId) {
            if (timeZone !== context.timeZone) throw fail(400, 'Use the practice time zone for school agenda appointments.');
            const school = await deps.checkSchool({ agencyId, providerId, clientId, schoolId: candidate.schoolId, slotId: row.schoolSlotId, date: candidate.date });
            candidate.schoolSlotId = Number(school.slotId); row.schoolSlotId = Number(school.slotId);
            candidate.schoolTransitionState = digest(school);
          }
          const existing = await deps.findExisting(candidate);
          await deps.checkConflict(candidate, existing);
          const warnings = await deps.sameDay({ actor, row: candidate, existing });
          if (warnings.length) row.warnings.push('This client already has another service on this date. Review the same-day service warning.');
          if (occurrences.some(prior => prior.clientId === clientId && prior.date === candidate.date)) row.warnings.push('Another imported row schedules this client on the same date.');
          seen.set(candidate.source, index + 1);
          candidate.existingAppointmentId = existing?.id || null;
          candidate.existingState = existing ? digest([existing.id, existing.status, existing.providerUserId, sqlTime(existing.startAt), sqlTime(existing.endAt), existing.tenantServiceId, existing.serviceLocationId, existing.modality, existing.providerScheduleEventId, existing.officeEventId, existing.agendaRecoverableEventId]) : null;
          candidate.rowNumber = index + 1;
          occurrences.push(candidate);
          if (existing) row.existingCount += 1; else row.newCount += 1;
          if (occurrences.length > 200) throw fail(400, 'Import at most 200 appointment occurrences at a time.');
        }
      } catch (error) { row.errors.push(error.message); }
      row.warnings = [...new Set(row.warnings)];
      row.status = row.errors.length ? 'blocked' : row.newCount ? 'ready' : 'existing';
    }
    if (!rows.length) throw fail(400, 'Select at least one appointment row to import.');
    const plan = occurrences.map(({ agencyId, providerId, clientId, startAt, endAt, tenantServiceId, serviceLocationId, modality, source, seriesKey, recurrence, recurrenceIndex, schoolSlotId, schoolTransitionState }) => ({ agencyId, providerId, clientId, startAt, endAt, tenantServiceId, serviceLocationId, modality, source, seriesKey, recurrence, recurrenceIndex, schoolSlotId, schoolTransitionState }));
    const claims = { kind: 'auricwell-agenda-preview', actorId: Number(actor.id), agencyId, providerId, weekStart, timeZone,
      planHash: digest(plan), snapshotHash: digest([context.provider, context.clients, context.services, context.locations, context.schoolSlots]),
      existingStates: Object.fromEntries(occurrences.filter(row => row.existingState).map(row => [row.source, row.existingState])) };
    const summary = { rows: rows.length, appointments: occurrences.length, newAppointments: rows.reduce((sum, row) => sum + (row.newCount || 0), 0), existingAppointments: rows.reduce((sum, row) => sum + (row.existingCount || 0), 0), blockedRows: rows.filter(row => row.errors.length).length, sameDayWarning: rows.some(row => row.warnings.length) };
    return { rows, summary, occurrences, claims, previewToken: issueToken && !summary.blockedRows ? deps.sign(claims) : null, expiresInSeconds: 900 };
  }

  async function preview({ actor, input }) {
    const result = await prepare({ actor, input });
    const { occurrences, claims, ...response } = result;
    return response;
  }

  async function commit({ actor, input }) {
    if (input.confirm !== true) throw fail(400, 'Confirm the reviewed appointments before scheduling.');
    let claims;
    try { claims = deps.verify(String(input.previewToken || '')); } catch { throw fail(409, 'This agenda preview expired or is invalid. Preview the appointments again.', 'AGENDA_PREVIEW_EXPIRED'); }
    if (claims.kind !== 'auricwell-agenda-preview' || Number(claims.actorId) !== Number(actor.id) || claims.agencyId !== Number(input.agencyId) || claims.providerId !== Number(input.providerId)) throw fail(403, 'This preview belongs to another user, practice, or provider.');
    return deps.lock({ agencyId: claims.agencyId, providerId: claims.providerId }, async () => {
      const prepared = await prepare({ actor, input, issueToken: false });
      if (prepared.summary.blockedRows) throw Object.assign(fail(409, 'Some appointments now need review. Preview again before scheduling.'), { preview: { rows: prepared.rows, summary: prepared.summary } });
      if (claims.planHash !== prepared.claims.planHash || claims.snapshotHash !== prepared.claims.snapshotHash || claims.weekStart !== prepared.claims.weekStart || claims.timeZone !== prepared.claims.timeZone) throw fail(409, 'The agenda or practice records changed. Preview the appointments again.', 'AGENDA_PREVIEW_STALE');
      for (const [source, state] of Object.entries(claims.existingStates || {})) {
        if (prepared.claims.existingStates[source] !== state) throw fail(409, 'An existing appointment changed after this preview. Preview the appointments again.', 'AGENDA_PREVIEW_STALE');
      }
      if (prepared.summary.sameDayWarning && input.acknowledgeSameDayServices !== true) throw fail(409, 'Review and acknowledge the same-day service warning before scheduling.', 'SAME_DAY_SERVICE_WARNING');
      const appointments = [];
      for (const row of prepared.occurrences) {
        let appointment;
        try {
          await deps.clientLock(row, async () => {
            const existing = await deps.findExisting(row);
            await deps.checkConflict(row, existing);
            appointment = existing || await deps.book({ actor, row, acknowledgeSameDayServices: input.acknowledgeSameDayServices === true });
            appointment = await deps.completeFacets({ actor, row, appointment });
            if (row.schoolId) await deps.linkSchool({ agencyId: row.agencyId, schoolId: row.schoolId, slotId: row.schoolSlotId, appointmentId: appointment.id, actorUserId: actor.id, seriesKey: row.seriesKey });
            appointments.push({ id: Number(appointment.id), clientId: row.clientId, rowId: row.rowId, startAt: row.startAt, existing: !!existing });
          });
        } catch (error) {
          return { ok: false, complete: false, appointments, failedRowId: row.rowId, error: error.message,
            savedAppointmentIds: [...new Set([...appointments.map(item => item.id), appointment?.id, ...(error.createdAppointmentIds || [])].filter(Boolean))],
            message: 'Some appointments may already be saved. Preview and retry this same agenda; matching appointments will be reused.' };
        }
      }
      return { ok: true, complete: true, appointments, createdCount: appointments.filter(item => !item.existing).length, existingCount: appointments.filter(item => item.existing).length };
    });
  }
  return { options, preview, commit };
}

export const auricwellAgendaImporter = createAuricwellAgendaImporter();
