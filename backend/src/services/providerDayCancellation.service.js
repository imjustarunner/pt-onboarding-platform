import { cancellationNoticePreview } from './cancellationNoticePreview.service.js';
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
import { cancellationRecipients, reviewedMessage } from './cancellationRecipients.service.js';
import { cancellationSchoolNotices } from './cancellationSchoolNotice.service.js';
import { cancellationSchoolRoster } from './cancellationSchoolRoster.service.js';
import { validateCancellationChoices } from './cancellationFollowUp.service.js';
import { dayAbsenceMessage } from './dayAbsencePolicy.service.js';
import { plannedOutParticipation } from './plannedOutParticipation.service.js';

import { ensureDayCancellationTask, completeDayCancellationTask } from './dayCancellationFollowupTask.service.js';
import { dayCancellationContactFollowup,missingDayCancellationContacts } from './dayCancellationContactFollowup.service.js';

export const DAY_CANCELLATION_CATEGORIES = Object.freeze({ provider_unavailable: 'Unexpected provider absence', illness: 'Health-related absence', weather: 'Weather conditions', emergency: 'Emergency', facility: 'Facility closure', holiday: 'Scheduled holiday', planned_out: 'Planned absence' });

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const utc = value => value instanceof Date ? value : new Date(/[zZ]|[+-]\d\d:\d\d$/.test(String(value)) ? value : String(value).replace(' ', 'T') + 'Z');
const stamp = value => value ? utc(value).toISOString() : null;
const ymd = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const tables = { weekly: 'provider_virtual_working_hours', virtual: 'provider_virtual_slot_availability', inPerson: 'provider_in_person_slot_availability' };
const cancellable = new Set(['draft', 'scheduled', 'confirmed', 'client_confirmed', 'reschedule_requested', 'cancellation_requested']);
const isCanceled = status => /^(canceled|cancelled|late_canceled|void)/.test(String(status).toLowerCase());
const fingerprint = items => createHash('sha256').update(JSON.stringify(items.map(({ key, startAt, endAt, source }) => ({ key, startAt, endAt, source })))).digest('hex');
const confirmedUnsentFamily = (item,result) => {
  const delivery=result?.notificationDelivery;
  return item.kind==='school_roster' && result?.status==='completed' && Number(delivery?.skipped)>0
    && !Number(delivery?.sent || 0) && !Number(delivery?.held || 0) && !Number(delivery?.failed || 0)
    && (!delivery?.deliveries?.length || delivery.deliveries.every(row=>row.status==='skipped' && !row.external_message_id));
};

export function dayBounds(date, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw fail('Choose a valid date.');
  const bounds = { start: wallMysqlToUtcMysql(`${date} 00:00:00`, timeZone), end: wallMysqlToUtcMysql(`${addDaysYmd(date, 1)} 00:00:00`, timeZone) };
  if (!bounds.start || !bounds.end) throw fail('Could not resolve this day’s timezone.');
  return bounds;
}

export function dayCancellationFacts(input = {}) {
  const reasonCategory = input.reasonCategory || 'provider_unavailable';
  if (!Object.hasOwn(DAY_CANCELLATION_CATEGORIES, reasonCategory)) throw fail('Choose a cancellation category.');
  const clientFacingReason = DAY_CANCELLATION_CATEGORIES[reasonCategory];
  const urgent = input.urgent !== false;
  if (urgent && ['holiday', 'planned_out'].includes(reasonCategory)) throw fail('Use nonurgent cancellation or Planned Out for a scheduled absence.');
  if (input.absenceSource && !['cancel_day', 'planned_out'].includes(input.absenceSource)) throw fail('Choose a supported absence source.');
  const followUpAction = input.urgent === false ? 'none' : input.followUpAction || 'none';
  if (!['client_contact_support', 'none', 'keep_next_or_support', 'private_slots'].includes(followUpAction)) throw fail('Choose a supported follow-up option.');
  const notification = validateCancellationChoices({ ...input, followUpAction, eventType: 'canceled' });
  return { eventType: 'canceled', initiator: 'provider', reasons: ['provider_unavailable'],
    reasonOther: '', reasonCategory, clientFacingReason, ...notification, urgent, emailOnly: true,
    absenceSource: input.absenceSource || 'cancel_day',
    offerDays: input.offerDays || 2, offeredSlots: input.offeredSlots || [], followUpAction, followUpMessage: String(input.followUpMessage || '').trim().slice(0, 1000), signatureConfirmed: true };
}

// Dependencies are injectable so recovery and authorization can be exercised without sending notifications.
export function createDayCancellationService(overrides = {}) {
  const db = overrides.database || pool;
  const deps = {
    now: () => new Date(), timeZone: agencyId => Availability.resolveAgencyTimeZone({ agencyId }),
    participation: args => plannedOutParticipation.list(args), updateParticipation: plannedOutParticipation.apply,
    providerName: async id => { const u = await (await import('../models/User.model.js')).default.findById(id); return [u?.preferred_name || u?.first_name, u?.last_name].filter(Boolean).join(' ') || 'Your provider'; },
    schoolName: async a => {
      if (!a.serviceLocationId) return a.schoolName || null;
      const [[row]] = await db.execute('SELECT school.name FROM agency_service_locations sl JOIN agencies school ON school.id=sl.school_organization_id WHERE sl.id=? AND sl.agency_id=?', [a.serviceLocationId,a.agencyId]);
      return row?.name || null;
    },
    encrypt: maybeEncryptNotePayload, decrypt: maybeDecryptNotePayload,
    listAppointments: args => Appointment.listForAgencyInWindow(args),
    getAppointment: id => Appointment.findById(id), participants: id => Appointment.listParticipants(id),
    previewAppointment: previewAppointmentChange, completeAppointment: completeAppointmentChange,
    editPublication: editAvailabilityPublication, cancelMeetings: cancelMeetingOccurrences,
    contacts: (...args) => cancellationRecipients.review(...args),
    roster: args => cancellationSchoolRoster.list(args), rosterReview: cancellationSchoolRoster.review, notifyRoster: cancellationSchoolRoster.send,
    schools: args => cancellationSchoolNotices.list(args), schoolReview: cancellationSchoolNotices.review, notifySchool: cancellationSchoolNotices.send,
    validateOffer: async (...args) => (await import('./cancellationFollowUp.service.js')).cancellationFollowUp.validateOffer(...args),
    noticePreview: cancellationNoticePreview,
    contactFollowUp: dayCancellationContactFollowup,
    cancellationMessage: async (...args) => (await import('./appointmentCancellationNotification.service.js')).buildCancellationNotification(...args),
    ensureTask: ensureDayCancellationTask, completeTask: completeDayCancellationTask,
    plannedOutSaved: async token => { const [[row]]=await db.execute('SELECT id FROM planned_outs WHERE cancellation_review_token=? LIMIT 1',[token]);return !!row; },
    notifyAppointment: async (id, facts, actorUserId) => (await import('./appointmentScheduleNotice.service.js')).appointmentScheduleNotices.queue(id, { eventType: 'canceled', facts: { ...facts, reviewedDeferredCancellation: true }, actorUserId, sendImmediately: true }),
    notifyMeetings: sendMeetingScheduleChange, invalidate: invalidateAvailabilityReminders, ...overrides
  };

  async function inventory(plan, actor, authorizeAppointment) {
    const items = [], unchanged = [];
    const now = deps.now();
    const windows = new Map();
    for (const scope of plan.scopes) {
      const rows = await deps.listAppointments({ agencyId: scope.agencyId, providerUserId: plan.providerId, windowStart: scope.start, windowEnd: scope.end });
      if (rows.length >= 500) throw fail('This day has too many appointments to review together. Use individual cancellation.', 409);
      windows.set(scope, rows);
    }
    const excludedAppointments = [...new Set([...windows.values()].flat().filter(a => (!plan.appointmentIds || plan.appointmentIds.includes(Number(a.id)))
      && cancellable.has(String(a.status).toLowerCase()) && utc(a.startAt) > now).map(a => Number(a.id)))];
    for (const scope of plan.scopes) {
      const { agencyId, timeZone, start, end } = scope;
      const date = scope.date || plan.date;
      const appointments = windows.get(scope);
      for (const a of appointments) {
        if (isCanceled(a.status) || items.some(i => i.key === `appointment:${a.id}`)) continue;
        if (plan.appointmentIds && !plan.appointmentIds.includes(Number(a.id))) continue;
        await authorizeAppointment(actor, a);
        const item = { key: `appointment:${a.id}`, kind: 'appointment', id: a.id, agencyId, timeZone, date,
          title: a.title || 'Client appointment', startAt: stamp(a.startAt), endAt: stamp(a.endAt), source: { status: a.status, updatedAt: stamp(a.updatedAt), participants: await deps.participants(a.id) } };
        item.recipients = item.source.participants.filter(p => p.clientId).map(p => p.displayName || `Client record #${p.clientId}`);
        if (!cancellable.has(String(a.status).toLowerCase()) || utc(a.startAt) <= now) {
          unchanged.push({ ...item, detail: 'Started, completed, or otherwise locked; review individually.' }); continue;
        }
        item.clients = [];
        for (const clientId of [...new Set(item.source.participants.map(p => Number(p.clientId)).filter(Boolean))]) {
          item.clients.push(await deps.contacts(clientId, agencyId, plan.contactChoices?.[clientId], { required: plan.messagesReviewed && plan.facts.notificationMode !== 'none', allowMissingEmail: true }));
        }
        for (const client of item.clients) {
          if (client.channels.some(c => c !== 'email')) throw fail('Cancel day sends email only. Text messages are not enabled.');
          client.emailOnly = true;
        }
        item.facts = { ...plan.facts, followUpAfterAt: null, followUpExcludedAppointmentIds: excludedAppointments,
          notificationRecipients: item.clients.map(c => ({ clientId: c.clientId, mode: c.mode, channels: c.channels, recipients: c.recipients })),
          reviewedCancellation: true };
        if (plan.facts.followUpAction === 'private_slots') {
          if (item.clients.length !== 1) throw fail('Offer replacement times to individual client sessions. Review group sessions separately.');
          if (item.clients[0].mode === 'none') throw fail('Choose a contact for every client receiving replacement times.');
          await deps.validateOffer(a, item.facts);
          for (const slot of plan.facts.offeredSlots) if (plan.scopeMode === 'days' && plan.scopes.some(s => utc(slot.startAt) < utc(s.end) && utc(slot.endAt) > utc(s.start))) throw fail('Replacement times must be outside the canceled days.');
        }
        const generated = await deps.cancellationMessage({ ...a, sourceTimezone: timeZone }, item.facts);
        const providerName = a.providerName || (await deps.providerName(plan.providerId));
        const letter = { urgent: plan.facts.urgent, providerName, providerAuthored: plan.facts.providerAuthored, clientName: item.clients.length === 1 ? item.clients[0].clientName : null, reasonCategory: plan.facts.reasonCategory, schoolName: await deps.schoolName(a), date, when: `${generated.when} (${timeZone})`, reason: plan.facts.clientFacingReason, note: plan.facts.followUpMessage };
        const guardian = dayAbsenceMessage({ ...letter, audience: 'guardian' });
        const clientLetter = dayAbsenceMessage({ ...letter, audience: 'client' });
        Object.assign(generated, guardian);
        item.message = reviewedMessage(plan.messages?.[item.key], { subject: generated.subject, text: generated.text, client: clientLetter, guardian });
        item.facts.reviewedMessage = item.message;
        item.source.contacts = item.clients.map(c => c.contacts);
        // Run the actual cancellation preview: missing client links/clinical constraints cannot be hidden by a bulk action.
        const preview = await deps.previewAppointment(a.id, item.facts, { actorUserId: actor.id, actorRole: actor.role });
        item.note = preview.narrative;
        const previewOffer = plan.facts.followUpAction === 'private_slots' ? { status: 'open', expires_at: new Date(Math.min(+now + plan.facts.offerDays * 86400000, Math.max(...plan.facts.offeredSlots.map(s => +utc(s.startAt))))).toISOString() } : null;
        const emailPreview = await deps.cancellationMessage({ ...a, sourceTimezone: timeZone }, item.facts, { nextAppointment: preview.nextAppointment, offer: previewOffer });
        item.followUpPreview = plan.facts.followUpAction && plan.facts.followUpAction !== 'none' ? emailPreview.followUpText : '';
        items.push(item);
      }
      if (plan.scopeMode === 'days') {
        // A real appointment (including started/completed/canceled sessions) takes precedence over the soft roster.
        const scheduledClients = new Set();
        for (const appointment of appointments) for (const p of await deps.participants(appointment.id)) if (p.clientId) scheduledClients.add(Number(p.clientId));
        for (const row of await deps.roster({ agencyId, providerId: plan.providerId, date })) {
          if (plan.windowStart && row.slots?.length && !row.slots.some(s => !s.startTime || !s.endTime || (wallMysqlToUtcMysql(`${date} ${s.startTime}`, timeZone) < end && wallMysqlToUtcMysql(`${date} ${s.endTime}`, timeZone) > start))) continue;
          if (scheduledClients.has(Number(row.client_id))) continue;
          const key = `school_roster:${agencyId}:${plan.providerId}:${date}:${row.client_id}:${row.school_id}`;
          if (plan.windowStart && !row.slots?.some(s => s.startTime && s.endTime) && !plan.includeUntimedKeys?.includes(key)) {
            unchanged.push({key,kind:'school_roster',agencyId,date,title:`${row.client_name || row.client_initials || 'Client'} — ${row.school_name}`,needsTimeReview:true,
              detail:'No saved session time. Explicitly include this family after checking whether this absence affects them.'});
            continue;
          }
          const reviewed = await deps.rosterReview(row, { agencyId, providerId: plan.providerId, date, timeZone,
            windowStart: plan.windowStart ? start : null, windowEnd: plan.windowStart ? end : null,
            reason: plan.facts.clientFacingReason, choices: plan.contactChoices?.[row.client_id], message: plan.messages?.[key],
            required: plan.messagesReviewed && plan.facts.notificationMode !== 'none',
            urgent: plan.facts.urgent, providerAuthored: plan.facts.providerAuthored, reasonCategory: plan.facts.reasonCategory, absenceSource: plan.facts.absenceSource,
            followUpAction: plan.facts.followUpAction, followUpMessage: plan.facts.followUpMessage });
          items.push({ ...reviewed, timeZone, startAt: stamp(start), endAt: stamp(end) });
        }
      }
      if (plan.facts.urgent !== false && (plan.scopeMode === 'days' || items.some(i => i.kind === 'appointment' && i.date === date && i.agencyId === agencyId))) {
        for (const school of await deps.schools({ providerId: plan.providerId, agencyId, date, reason: plan.facts.clientFacingReason, reasonCategory: plan.facts.reasonCategory, providerAuthored: plan.facts.providerAuthored, wholeDay: plan.scopeMode === 'days', note: plan.facts.followUpMessage })) {
          const reviewed = deps.schoolReview(school, plan.schoolChoices?.[school.key], false);
          items.push({ ...reviewed, providerId:plan.providerId,notificationScope:plan.scopeMode === 'sessions' ? `sessions:${plan.appointmentIds.join(',')}` : 'days', timeZone, source: { recipients: school.recipients }, startAt: stamp(start), endAt: stamp(end) });
        }
      }
      if (plan.scopeMode === 'sessions') continue;
      for (const kind of ['meeting', 'supervision']) {
        const table = kind === 'meeting' ? 'provider_schedule_events' : 'supervision_sessions';
        const host = kind === 'meeting' ? 'provider_id' : 'supervisor_user_id';
        const [rows] = await db.execute(`SELECT * FROM ${table} WHERE agency_id=? AND ${host}=? AND status<> 'CANCELLED'
          AND ${kind === 'meeting' ? "((start_at<? AND end_at>?) OR (all_day=1 AND start_date<=? AND end_date>?)) AND kind IN ('TEAM_MEETING','HUDDLE') AND client_id IS NULL" : 'start_at<? AND end_at>?'} ORDER BY id`, kind === 'meeting' ? [agencyId, plan.providerId, end, start, date, date] : [agencyId, plan.providerId, end, start]);
        for (const row of rows) {
          const [attendees] = await db.execute(kind === 'meeting'
            ? 'SELECT user_id FROM provider_schedule_event_attendees WHERE event_id=? ORDER BY user_id'
            : "SELECT user_id,status FROM supervision_session_attendees WHERE session_id=? AND status NOT IN ('REMOVED','WITHDRAWN','CANCELLED') ORDER BY user_id", [row.id]);
          const item = { key: `${kind}:${row.id}`, kind, id: Number(row.id), agencyId, timeZone, date,
            title: row.title || (kind === 'supervision' ? 'Supervision' : 'Meeting'), startAt: stamp(row.start_at || start), endAt: stamp(row.end_at || end),
            source: { status: row.status, updatedAt: stamp(row.updated_at), startAt: stamp(row.start_at), endAt: stamp(row.end_at), attendees }, meetingSnapshot: row };
          if (row.all_day && (ymd(row.start_date) < date || ymd(row.end_date) > addDaysYmd(date, 1))) unchanged.push({ ...item, detail: 'Spans multiple dates; review individually to preserve the other days.' });
          else if (utc(item.startAt) <= now || row.finalized_at || row.meeting_completed_at || row.live_started_at) unchanged.push({ ...item, detail: 'Already started or completed; review individually.' });
          else items.push(item);
        }
      }
      if (plan.facts.absenceSource === 'planned_out') {
        for (const item of await deps.participation({ agencyId,providerId:plan.providerId,start,end,date,timeZone })) if (!items.some(i => i.key === item.key)) items.push(item);
        continue;
      }
      for (const kind of Object.keys(tables)) {
        const [rows] = await db.execute(kind === 'weekly'
          ? `SELECT *, DATE_FORMAT(start_date,'%Y-%m-%d') start_date, DATE_FORMAT(end_date,'%Y-%m-%d') end_date FROM ${tables[kind]} WHERE agency_id=? AND provider_id=? ORDER BY id`
          : `SELECT * FROM ${tables[kind]} WHERE agency_id=? AND provider_id=? AND is_active=1 AND start_at<? AND end_at>? ORDER BY id`,
        kind === 'weekly' ? [agencyId, plan.providerId] : [agencyId, plan.providerId, end, start]);
        const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(date + 'T12:00:00Z').getUTCDay()];
        for (const row of rows) {
          if (kind === 'weekly' && (row.day_of_week !== weekday || !availabilityOccursOn(row, date))) continue;
          items.push({ key: `${kind}:${row.id}${plan.dates.length > 1 ? `:${date}` : ''}`, kind, id: Number(row.id), agencyId, timeZone, date,
            title: kind === 'inPerson' ? 'Published in-person opening' : 'Published virtual opening',
            startAt: stamp(kind === 'weekly' ? wallMysqlToUtcMysql(`${date} ${row.start_time}`, timeZone) : row.start_at),
            endAt: stamp(kind === 'weekly' ? wallMysqlToUtcMysql(`${date} ${row.end_time}`, timeZone) : row.end_at),
            source: kind === 'weekly' ? { start: row.start_time, end: row.end_time, frequency: row.frequency, excluded: row.excluded_dates_json } : { start: stamp(row.start_at), end: stamp(row.end_at) } });
        }
      }
    }
    items.sort((a, b) => Number(a.kind === 'school') - Number(b.kind === 'school') || a.key.localeCompare(b.key));
    return { items, unchanged, fingerprint: fingerprint(items) };
  }

  function response(row, plan, results) {
    // Never expose internal notes, full meeting records, or signed financial facts in this review endpoint.
    const display = ({ id, key, kind, title, agencyId, timeZone, date, startAt, endAt, note, detail, needsTimeReview, recipients, clients, message, followUpPreview, emailPreviews }) => ({ id, key, kind, title, agencyId, timeZone, date, startAt, endAt, note, detail, needsTimeReview, recipients, clients, message, followUpPreview, emailPreviews });
    const followUpPreview=row.status==='preview' && plan.facts.notificationMode!=='none'
      ? [...new Set(plan.scopes.map(scope=>Number(scope.agencyId)))].flatMap(agencyId=>missingDayCancellationContacts(plan,Object.fromEntries(plan.items.map(item=>[item.key,{status:'completed'}])),agencyId)).map(({initials,date,reason})=>({initials,date,reason})) : [];
    return { token: row.token, status: row.status, date: plan.date, providerId: plan.providerId,contactFollowUpPreview:followUpPreview,
      notificationsOnly: !!plan.notificationsOnly, deferredToken: plan.deferredToken || null, notificationTaskId: results.notificationTaskId || null, reasonCategory: plan.facts.reasonCategory || 'provider_unavailable',
      urgent: plan.facts.urgent !== false, absenceSource: plan.facts.absenceSource || 'cancel_day', dates: plan.dates || [plan.date], scopeMode: plan.scopeMode || 'days', messagesReviewed: plan.messagesReviewed, offeredSlots: plan.facts.offeredSlots, offerDays: plan.facts.offerDays, scopes: plan.scopes, notificationMode: plan.facts.notificationMode || 'send', clientFacingReason: plan.facts.clientFacingReason, followUpAction: plan.facts.followUpAction, followUpMessage: plan.facts.followUpMessage, items: plan.items.map(display),
      unchanged: plan.unchanged.map(display), results,unsentFamilyNotices:plan.items.filter(item=>confirmedUnsentFamily(item,results[item.key])).length,
      contactFollowUps:Object.entries(results).filter(([key])=>key.startsWith('contact_followup:')).map(([,value])=>value), remaining: plan.items.filter(i => !results[i.key]).length };
  }

  async function preview(input, actor, authorize, authorizeAppointment) {
    if (input.deferredToken || input.unsentToken) return previewDeferred(input, actor, authorize, authorizeAppointment);
    const providerId = Number(input.providerId), agencyIds = [...new Set((input.agencyIds || []).map(Number))].sort((a, b) => a - b);
    if (!Number.isSafeInteger(providerId) || providerId < 1 || !agencyIds.length || agencyIds.length > 30 || agencyIds.some(id => !Number.isSafeInteger(id) || id < 1)) throw fail('Choose a provider and at least one agency.');
    await authorize(actor, providerId, agencyIds);
    const dates = [...new Set(input.dates || [input.date])].sort();
    const dateLimit = input.absenceSource === 'planned_out' ? 90 : 14;
    if (!dates.length || dates.length > dateLimit) throw fail(`Choose between one and ${dateLimit} dates.`);
    if (input.windowStart && (input.absenceSource !== 'planned_out' || !Number.isFinite(+utc(input.windowStart)) || !Number.isFinite(+utc(input.windowEnd)) || utc(input.windowEnd) <= utc(input.windowStart))) throw fail('Choose a valid planned-out time window.');
    const scopeMode = input.scopeMode || 'days';
    if (!['days', 'sessions'].includes(scopeMode)) throw fail('Choose selected days or individual sessions.');
    const appointmentIds = scopeMode === 'sessions' ? [...new Set((input.appointmentIds || []).map(Number))] : null;
    if (appointmentIds && (!appointmentIds.length || appointmentIds.some(id => !Number.isSafeInteger(id) || id < 1))) throw fail('Select at least one session.');
    const plan = { providerId, date: input.date || dates[0], dates, scopeMode, appointmentIds, windowStart: input.windowStart, windowEnd: input.windowEnd, includeUntimedKeys:input.includeUntimedKeys || [],
      contactFollowUpVersion:1, followupOwner: input.followupOwner === 'support' ? 'support' : 'provider', messagesReviewed: input.messagesReviewed === true, contactChoices: input.contactChoices || {}, schoolChoices: input.schoolChoices || {}, messages: input.messages || {}, facts: { ...dayCancellationFacts(input), providerAuthored: Number(actor.id) === providerId }, internalReason: String(input.internalReason || '').trim().slice(0, 2000), scopes: [] };
    for (const agencyId of agencyIds) for (const date of dates) {
      const timeZone = input.absenceSource === 'planned_out' && input.timeZone ? input.timeZone : await deps.timeZone(agencyId), bounds = dayBounds(date, timeZone);
      if (plan.windowStart) {
        bounds.start = bounds.start > input.windowStart ? bounds.start : input.windowStart;
        bounds.end = bounds.end < input.windowEnd ? bounds.end : input.windowEnd;
        if (bounds.start >= bounds.end) continue;
      }
      if (utc(bounds.end) <= deps.now()) { if (plan.facts.absenceSource === 'planned_out') continue; throw fail('Choose today or a future day.'); }
      plan.scopes.push({ agencyId, timeZone, date, ...bounds });
    }
    Object.assign(plan, await inventory(plan, actor, authorizeAppointment));
    if (plan.facts.notificationMode !== 'none') for (const item of plan.items) item.emailPreviews = await deps.noticePreview(item);
    if (appointmentIds && appointmentIds.some(id => !plan.items.some(i => i.kind === 'appointment' && Number(i.id) === id))) throw fail('A selected session is outside these dates, inaccessible, or cannot be canceled.');
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
        if (plan.facts.absenceSource === 'planned_out' && !await deps.plannedOutSaved(token)) throw fail('Save the reviewed Planned Out before processing its cancellations.',409);
        if (!plan.messagesReviewed) throw fail('Review the recipients and editable emails before confirming.');
        if (utc(row.expires_at) <= deps.now()) throw fail('This review expired. Review the current schedule again.', 409);
        // The same provider lock is used by appointment booking. Install the day block before releasing it.
        await lock(`public-provider-selection:${plan.providerId}`);
        await lock(`supervision-time:${plan.providerId}`);
        const current = plan.notificationsOnly ? await deferredInventory(plan, actor, authorizeAppointment) : await inventory(plan, actor, authorizeAppointment);
        if (current.fingerprint !== plan.fingerprint) throw fail('The schedule changed. Review the day again before canceling.', 409);
        await conn.beginTransaction();
        try {
          for (const scope of plan.notificationsOnly || plan.scopeMode === 'sessions' || plan.facts.absenceSource === 'planned_out' ? [] : plan.scopes) {
            await conn.execute(`INSERT INTO provider_schedule_events
              (agency_id,provider_id,kind,title,description,is_private,all_day,start_at,end_at,start_date,end_date,event_timezone,status,created_by_user_id,updated_by_user_id)
              VALUES (?,?,'SCHEDULE_HOLD','Unavailable',NULL,1,1,?,?,?,?,?,'ACTIVE',?,?)`,
            [scope.agencyId, plan.providerId, scope.start, scope.end, scope.date || plan.date, addDaysYmd(scope.date || plan.date, 1), scope.timeZone, actor.id, actor.id]);
          }
          await deps.invalidate(conn, plan.providerId);
          await conn.execute("UPDATE provider_day_cancellations SET status='processing',signed_at=UTC_TIMESTAMP() WHERE token=?", [token]);
          await conn.commit();
          row.status = 'processing';
        } catch (error) { await conn.rollback(); throw error; }
        // Do not retain provider booking locks while the signed appointment flow takes its own locks.
        for (const key of locks.splice(1).reverse()) await conn.execute('SELECT RELEASE_LOCK(?)', [key]);
      }
      if (plan.facts.notificationMode === 'none' && !results.notificationTaskId) {
        results.notificationTaskId = await deps.ensureTask(token, plan, actor);
        await conn.execute('UPDATE provider_day_cancellations SET results_json=?,status=? WHERE token=?', [JSON.stringify(results), row.status, token]);
      }
      if (input.retryFailed === true) {
        for (const [key, result] of Object.entries(results)) if (result.status === 'failed') delete results[key];
      }
      const item = plan.items.find(i => !results[i.key]);
      if (item) {
        try {
          let delivery;
          const reviewedProof = {reviewedCancellationToken:token,reviewedCancellationItemKey:item.key};
          if (item.kind === 'appointment') {
            if (item.clients?.some(c => c.channels.some(channel => channel !== 'email'))) throw fail('Review this cancellation using email only before continuing.',409);
            const appointment = await deps.getAppointment(item.id);
            if (!appointment || appointment.agencyId !== item.agencyId || appointment.providerUserId !== plan.providerId || stamp(appointment.startAt) !== item.startAt || stamp(appointment.endAt) !== item.endAt) throw fail('This appointment changed. Review it individually.', 409);
            await authorizeAppointment(actor, appointment);
            if (plan.notificationsOnly && !isCanceled(appointment.status)) throw fail('This session is no longer canceled. Review it individually.', 409);
            if ((plan.notificationsOnly || !isCanceled(appointment.status)) && (stamp(appointment.updatedAt) !== item.source.updatedAt || JSON.stringify(await deps.participants(item.id)) !== JSON.stringify(item.source.participants))) throw fail('This appointment or its recipients changed. Review it individually.', 409);
            if (utc(appointment.startAt) <= deps.now() && !isCanceled(appointment.status)) throw fail('This appointment has started. Review it individually.', 409);
            for (const c of item.clients || []) {
              const fresh = await deps.contacts(c.clientId, item.agencyId, plan.contactChoices?.[c.clientId], { required: plan.facts.notificationMode !== 'none', allowMissingEmail: true });
              if (JSON.stringify(fresh.contacts) !== JSON.stringify(c.contacts)) throw fail('This client’s contacts changed. Review the session individually.', 409);
            }
            const facts = {...(item.facts || { ...plan.facts, followUpAfterAt: plan.scopes.find(s => s.agencyId === item.agencyId)?.end }),...reviewedProof};
            const completed = await (plan.notificationsOnly ? deps.notifyAppointment : deps.completeAppointment)(item.id, facts, plan.notificationsOnly ? actor.id : { actorUserId: actor.id, actorRole: actor.role });
            delivery = plan.notificationsOnly ? completed : completed.notificationDelivery || completed.result?.notificationDelivery;
          } else if (item.kind === 'participation') {
            delivery = await deps.updateParticipation(item, actor.id);
          } else if (item.kind === 'school_roster') {
            delivery = await deps.notifyRoster(plan.deferredToken || token, item, actor.id, { suppressed: plan.facts.notificationMode === 'none',...reviewedProof });
          } else if (item.kind === 'school') {
            if (plan.scopeMode === 'sessions' && plan.items.some(i => i.kind === 'appointment' && i.agencyId === item.agencyId && i.date === item.date && results[i.key]?.status !== 'completed')) throw fail('Finish the selected session cancellations before sending this school notice.', 409);
            delivery = plan.facts.notificationMode === 'none' ? { suppressed: 1, sent: 0 } : await deps.notifySchool(plan.deferredToken || token, {...item,...reviewedProof}, actor.id);
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
            delivery = plan.facts.notificationMode === 'none' ? { suppressed: 1, sent: 0 }
              : await deps.notifyMeetings(rows.map(r => ({ ...r, cancel_reason: plan.facts.clientFacingReason })), 'cancelled', { scope: 'single' });
          } else {
            const table = tables[item.kind];
            const [[current]] = await conn.execute(`SELECT * ${item.kind === 'weekly' ? ",DATE_FORMAT(start_date,'%Y-%m-%d') start_date,DATE_FORMAT(end_date,'%Y-%m-%d') end_date" : ''} FROM ${table} WHERE id=? AND agency_id=? AND provider_id=?`, [item.id, item.agencyId, plan.providerId]);
            // A removed occurrence is already complete. Never re-create or remove a sibling occurrence.
            const removed = !current || (item.kind === 'weekly' ? !availabilityOccursOn(current, item.date || plan.date) : !Number(current.is_active));
            if (!removed) {
              if (item.kind === 'weekly' && (current.start_time !== item.source.start || current.end_time !== item.source.end || current.frequency !== item.source.frequency)) throw fail('This recurring opening changed. Review it individually.', 409);
              if (item.kind !== 'weekly' && (stamp(current.start_at) !== item.startAt || stamp(current.end_at) !== item.endAt)) throw fail('This opening changed. Review it individually.', 409);
              await deps.editPublication({ agencyId: item.agencyId, providerId: plan.providerId, kind: item.kind, id: item.id, action: 'delete', scope: 'single', occurrenceDate: item.date || plan.date });
            }
          }
          results[item.key] = { status: 'completed', notificationDelivery: delivery || null };
        } catch (error) {
          results[item.key] = { status: 'failed', message: error.status ? error.message : 'Could not complete this item. Retry or open the event to review.' };
        }
      }
      row.status = plan.items.some(i => !results[i.key]) ? 'processing' : Object.values(results).some(r => r.status === 'failed') ? 'partial' : 'completed';
      await conn.execute('UPDATE provider_day_cancellations SET results_json=?,status=? WHERE token=?', [JSON.stringify(results), row.status, token]);
      // Versioned server plans prevent retroactive notices for cancellations already completed before this workflow existed.
      if (row.status !== 'processing' && plan.contactFollowUpVersion === 1 && plan.facts.notificationMode !== 'none') {
        for (const agencyId of [...new Set(plan.scopes.map(scope=>Number(scope.agencyId)))]) {
          const key = `contact_followup:${agencyId}`;
          if (results[key]?.status === 'sending') {
            results[key] = {status:'held',message:'Contact follow-up delivery was interrupted. Review Communications before sending again.'};
            await conn.execute('UPDATE provider_day_cancellations SET results_json=?,status=? WHERE token=?', [JSON.stringify(results),row.status,token]);
          }
          if (results[key]) continue;
          // Persist before transport so an interrupted request cannot send the summary twice.
          results[key] = {status:'sending'};
          await conn.execute('UPDATE provider_day_cancellations SET results_json=?,status=? WHERE token=?', [JSON.stringify(results),row.status,token]);
          try { results[key] = await deps.contactFollowUp({token,plan,results,agencyId,actorUserId:actor.id}); }
          catch (error) { results[key] = {status:'held',message:'The cancellation is recorded. Contact follow-up email needs review in Communications.'}; }
          await conn.execute('UPDATE provider_day_cancellations SET results_json=?,status=? WHERE token=?', [JSON.stringify(results),row.status,token]);
        }
      }
      if (plan.notificationsOnly && row.status === 'completed' && !Object.values(results).some(r => r?.notificationDelivery && (r.notificationDelivery.held || r.notificationDelivery.failed || r.notificationDelivery.skipped))) await deps.completeTask(plan.deferredToken);
      return response(row, plan, results);
    } finally {
      for (const key of locks.reverse()) await conn.execute('SELECT RELEASE_LOCK(?)', [key]).catch(() => {});
      conn.release();
    }
  }
  async function deferredInventory(plan, actor, authorizeAppointment) {
    const items = [];
    for (const saved of plan.items.filter(i => i.kind === 'appointment')) {
      const a = await deps.getAppointment(saved.id);
      if (!a || !isCanceled(a.status) || Number(a.agencyId) !== Number(saved.agencyId) || Number(a.providerUserId) !== plan.providerId) throw fail('A canceled session changed. Review it individually.', 409);
      await authorizeAppointment(actor, a);
      const clients = [];
      for (const p of await deps.participants(a.id)) if (p.clientId && !clients.some(c => c.clientId === p.clientId)) clients.push(await deps.contacts(p.clientId, a.agencyId, plan.contactChoices?.[p.clientId], { required: plan.messagesReviewed }));
      let fallback = saved.message;
      if (saved.facts?.providerAuthored !== plan.facts.providerAuthored) {
        const generated=await deps.cancellationMessage({...a,sourceTimezone:saved.timeZone},plan.facts);
        fallback=dayAbsenceMessage({urgent:plan.facts.urgent,providerAuthored:plan.facts.providerAuthored,
          providerName:a.providerName || await deps.providerName(plan.providerId),clientName:clients.length === 1 ? clients[0].clientName : null,
          schoolName:await deps.schoolName(a),date:saved.date,when:`${generated.when} (${saved.timeZone})`,reason:plan.facts.clientFacingReason,reasonCategory:plan.facts.reasonCategory,note:plan.facts.followUpMessage});
      }
      const message = reviewedMessage(plan.messages?.[saved.key], fallback);
      items.push({ ...saved, clients, message, source: { ...saved.source, updatedAt: stamp(a.updatedAt), participants: await deps.participants(a.id), contacts: clients.map(c => c.contacts) },
        facts: { ...saved.facts, ...plan.facts, notificationMode: 'send', reviewedCancellation: true, reviewedMessage: message,
          notificationRecipients: clients.map(c => ({ clientId: c.clientId, mode: c.mode, channels: c.channels, recipients: c.recipients })) } });
    }
    // Deferred outreach stays limited to the roster reviewed at cancellation, never newly assigned families.
    for (const saved of plan.items.filter(i => i.kind === 'school_roster')) {
      const rows = await deps.roster({ agencyId: saved.agencyId, providerId: plan.providerId, date: saved.date });
      const row = rows.find(r => Number(r.client_id) === saved.clientId && Number(r.school_id) === saved.schoolId);
      if (!row) throw fail('A school-day assignment changed. Review that family separately.', 409);
      items.push({ ...await deps.rosterReview(row, { agencyId: saved.agencyId, providerId: plan.providerId, date: saved.date, timeZone: saved.timeZone,
        windowStart: plan.windowStart ? saved.startAt : null, windowEnd: plan.windowStart ? saved.endAt : null,
        reason: plan.facts.clientFacingReason, choices: plan.contactChoices?.[saved.clientId], message: plan.messages?.[saved.key],
        required: plan.messagesReviewed, urgent: plan.facts.urgent, providerAuthored: plan.facts.providerAuthored, reasonCategory: plan.facts.reasonCategory, absenceSource: plan.facts.absenceSource, followUpAction: plan.facts.followUpAction, followUpMessage: plan.facts.followUpMessage }),
        timeZone: saved.timeZone, startAt: saved.startAt, endAt: saved.endAt });
    }
    for (const scope of !plan.unsentRecovery && plan.facts.urgent !== false ? plan.scopes : []) for (const school of await deps.schools({ providerId: plan.providerId, agencyId: scope.agencyId, date: scope.date || plan.date, reason: plan.facts.clientFacingReason, reasonCategory: plan.facts.reasonCategory, providerAuthored: plan.facts.providerAuthored, wholeDay: plan.scopeMode === 'days', note: plan.facts.followUpMessage })) {
      if (plan.scopeMode === 'sessions' && !items.some(i => i.agencyId === scope.agencyId && i.date === (scope.date || plan.date))) continue;
      items.push({ ...deps.schoolReview(school, plan.schoolChoices?.[school.key], false), source: { recipients: school.recipients }, timeZone: scope.timeZone });
    }
    return { items, unchanged: [], fingerprint: fingerprint(items) };
  }
  async function previewDeferred(input, actor, authorize, authorizeAppointment) {
    const sourceToken=input.unsentToken || input.deferredToken;
    const [[source]] = await db.execute('SELECT * FROM provider_day_cancellations WHERE token=?', [sourceToken]);
    if (!source) throw fail('Cancellation follow-up not found.', 404);
    const original = JSON.parse(deps.decrypt(typeof source.plan_json === 'string' ? source.plan_json : JSON.stringify(source.plan_json)));
    if (Number(input.providerId) !== original.providerId) throw fail('Cancellation follow-up not found.', 404);
    await authorize(actor, original.providerId, original.scopes.map(s => s.agencyId));
    if (source.status !== 'completed' || (!input.unsentToken && original.facts.notificationMode !== 'none')) throw fail('Finish canceling these sessions before reviewing their emails.', 409);
    const results = parse(source.results_json) || {};
    const unsentItems=original.items.filter(item=>confirmedUnsentFamily(item,results[item.key]));
    if (input.unsentToken && !unsentItems.length) throw fail('No confirmed unsent family notices are available. Review Communications before retrying uncertain or previously sent messages.',409);
    const plan = { ...original, contactFollowUpVersion:1, notificationsOnly: true, unsentRecovery:!!input.unsentToken,deferredToken: sourceToken,
      items: input.unsentToken ? unsentItems : original.items.filter(i => i.kind !== 'appointment' || results[i.key]?.status === 'completed'),
      facts: { ...original.facts, providerAuthored: original.facts.providerAuthored === true && Number(actor.id) === original.providerId, notificationMode: 'send', suppressionReason: '' }, messagesReviewed: input.messagesReviewed === true,
      contactChoices: input.contactChoices || {}, schoolChoices: input.schoolChoices || {}, messages: input.messages || {} };
    Object.assign(plan, await deferredInventory(plan, actor, authorizeAppointment));
    for (const item of plan.items) item.emailPreviews = await deps.noticePreview(item);
    const row = { token: randomUUID(), status: 'preview' };
    await db.execute(`INSERT INTO provider_day_cancellations (token,provider_id,actor_user_id,cancellation_date,plan_json,results_json,expires_at)
      VALUES (?,?,?,?,?,'{}',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE))`, [row.token, plan.providerId, actor.id, plan.date, deps.encrypt(JSON.stringify(plan))]);
    return response(row, plan, {});
  }
  async function resume({ providerId, date, token }, actor, authorize) {
    dayBounds(date, 'UTC');
    const [rows] = await db.execute(`SELECT * FROM provider_day_cancellations WHERE provider_id=? AND actor_user_id=? AND ${token ? "token=? AND status IN ('preview','processing','partial','completed')" : "status IN ('processing','partial','completed')"} ORDER BY id DESC LIMIT 100`, [providerId, actor.id, ...(token ? [token] : [])]);
    // A multi-day absence must reopen from any reviewed date, including dates
    // before or after its original calendar anchor. Plans remain encrypted.
    for (const row of rows) {
      const plan=JSON.parse(deps.decrypt(typeof row.plan_json === 'string' ? row.plan_json : JSON.stringify(row.plan_json)));
      if (!(plan.dates || [plan.date]).includes(date)) continue;
      await authorize(actor,plan.providerId,plan.scopes.map(s=>s.agencyId));
      return {review:response(row,plan,parse(row.results_json) || {})};
    }
    return { review:null };
  }
  async function plannedOutReview(input, token, actor, authorize) {
    if (!/^[a-f0-9-]{36}$/.test(String(token))) throw fail('Review the affected sessions and recipients before submitting Planned Out.',409);
    const [[row]] = await db.execute("SELECT * FROM provider_day_cancellations WHERE token=? AND actor_user_id=? AND status='preview'", [token,actor.id]);
    if (!row) throw fail('This Planned Out review is unavailable. Review it again.',409);
    const plan = JSON.parse(deps.decrypt(typeof row.plan_json === 'string' ? row.plan_json : JSON.stringify(row.plan_json)));
    await authorize(actor,plan.providerId,plan.scopes.map(s=>s.agencyId));
    if (!plan.messagesReviewed || plan.facts.absenceSource !== 'planned_out' || utc(row.expires_at) <= deps.now()
      || plan.providerId !== Number(input.providerId) || JSON.stringify(plan.dates) !== JSON.stringify(input.dates)
      || plan.scopes.some(s => !input.agencyIds.includes(s.agencyId) || s.timeZone !== input.timeZone)
      || (plan.windowStart || null) !== (input.windowStart || null) || (plan.windowEnd || null) !== (input.windowEnd || null)) throw fail('Planned Out changed or its review expired. Review the affected items again.',409);
    return response(row,plan,{});
  }
  return { preview, apply, resume, plannedOutReview };
}

export default createDayCancellationService();
