import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ appointments: [], participants: [], events: [], failLink: true }));
vi.mock('../../config/database.js', () => ({ onTableWrite: vi.fn(), default: { execute: vi.fn(async (sql, params) => {
  if (sql.includes('SELECT DISTINCT a.*')) return [state.appointments.filter(appointment => appointment.agency_id === params[0] && appointment.provider_user_id === params[1]
    && (appointment.source === params[2] || (appointment.start_at === params[3] && appointment.end_at === params[4] && state.participants.some(participant => participant.appointment_id === appointment.id && participant.client_id === params[5]))))];
  if (sql.includes('SELECT * FROM appointment_participants')) return [state.participants.filter(participant => participant.appointment_id === params[0])];
  if (sql.includes('FROM provider_schedule_events pse')) return [state.events.filter(event => event.reason_code === params[0] && event.agency_id === params[1] && event.provider_id === params[2]).map(event => ({ ...event, linked_appointment_id: state.appointments.find(appointment => appointment.provider_schedule_event_id === event.id)?.id || null }))];
  if (sql.includes('SELECT a.id FROM appointments a JOIN appointment_participants')) return [[]];
  throw new Error(`Unexpected query in synthetic recovery fixture: ${sql.slice(0, 80)}`);
} ) } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: vi.fn(async () => ({ id: 19, email: 'provider@example.test' })) } }));
vi.mock('../sameDayServiceWarning.service.js', () => ({ confirmSameDayServiceWarnings: vi.fn(async () => true), sameDayServiceWarnings: vi.fn(async () => []) }));
vi.mock('../schedulingBillingAccess.service.js', () => ({ hasSchedulingBillingAccess: vi.fn(async () => true), schedulingResponseForUser: vi.fn(async (_user, _agencyId, payload) => payload) }));
vi.mock('../googleCalendar.service.js', () => ({ default: { upsertProviderPrimaryCalendarEvent: vi.fn(async () => ({ skipped: true })) } }));
vi.mock('../appointmentClinicalLink.service.js', () => ({ ensureAppointmentClinicalLink: vi.fn(async () => []) }));
vi.mock('../appointmentConflict.service.js', () => ({
  appointmentOccupiesTime: () => true, withAppointmentWindow: vi.fn(),
  assertAppointmentWindowAvailable: vi.fn(async (_db, row) => {
    if (state.events.some(event => event.provider_id === row.providerUserId && event.start_at < row.endAt && event.end_at > row.startAt && event.id !== row.providerScheduleEventId)) {
      throw Object.assign(new Error('Calendar event conflicts with this appointment'), { status: 409 });
    }
  })
}));
vi.mock('../../models/ProviderScheduleEvent.model.js', () => ({ default: { create: vi.fn(async input => {
  const event = { id: state.events.length + 501, agency_id: input.agencyId, provider_id: input.providerId, client_id: input.clientId, start_at: input.startAt,
    end_at: input.endAt, reason_code: input.reasonCode?.toUpperCase() || null, kind: input.kind, status: 'ACTIVE' };
  state.events.push(event); return { id: event.id };
}) } }));
vi.mock('../appointment.service.js', () => ({
  createAppointment: vi.fn(async input => {
    const { wallMysqlToUtcMysql } = await import('../../utils/zonedWallTime.util.js');
    const appointment = { id: state.appointments.length + 101, agency_id: input.agencyId, provider_user_id: input.providerUserId, source: input.source,
      start_at: wallMysqlToUtcMysql(input.startAt, input.timeZone), end_at: wallMysqlToUtcMysql(input.endAt, input.timeZone), status: 'scheduled',
      service_location_id: input.serviceLocationId, tenant_service_id: input.tenantServiceId, modality: input.modality, provider_schedule_event_id: null };
    state.appointments.push(appointment);
    state.participants.push({ id: state.participants.length + 1, appointment_id: appointment.id, client_id: input.participants[0].clientId, role: 'client', sort_order: 0 });
    const { default: Appointment } = await import('../../models/Appointment.model.js');
    return { ...Appointment.mapRow(appointment), participants: input.participants };
  }),
  linkProviderScheduleEvent: vi.fn(async (appointmentId, eventId) => {
    if (state.failLink) { state.failLink = false; throw new Error('Synthetic connection failure after calendar insert'); }
    state.appointments.find(appointment => appointment.id === appointmentId).provider_schedule_event_id = eventId;
  }),
  getAppointmentBundle: vi.fn(async id => { const { default: Appointment } = await import('../../models/Appointment.model.js'); return Appointment.mapRow(state.appointments.find(appointment => appointment.id === id)); }),
  updateAppointment: vi.fn(), cancelAppointment: vi.fn(), settleAppointment: vi.fn()
}));
import { createAuricwellAgendaImporter } from '../auricwellAgendaImport.service.js';
import { createAppointmentHandler } from '../../controllers/appointment.controller.js';
import ProviderScheduleEvent from '../../models/ProviderScheduleEvent.model.js';
import { linkProviderScheduleEvent } from '../appointment.service.js';

const actor = { id: 7, role: 'super_admin' };
const input = () => ({ agencyId: 2, providerId: 19, weekStart: '2026-11-16', timeZone: 'America/Denver', text: 'Monday | 09:00 | 09:50 | DEMO QA Avery', defaults: { tenantServiceId: 3, serviceLocationId: 5, modality: 'IN_PERSON', recurrence: 'ONCE' } });
let importer;
beforeEach(() => {
  vi.clearAllMocks(); state.appointments = []; state.participants = []; state.events = []; state.failLink = true;
  importer = createAuricwellAgendaImporter({ loadContext: async () => ({ agencyId: 2, providerId: 19, timeZone: 'America/Denver', provider: { id: 19 }, clients: [{ id: 41, full_name: 'DEMO QA Avery', status: 'active' }], services: [{ id: 3, name: 'Therapy', serviceCode: '90834', modality: 'EITHER' }], locations: [{ id: 5, name: 'DEMO office', place_of_service: '11' }] }),
    lock: async (_, work) => work(), clientLock: async (_, work) => work(), sameDay: async () => [], now: () => Date.parse('2026-11-10T12:00:00Z') });
});

describe('agenda calendar recovery through the real shared appointment handler', () => {
  it('recovers an event inserted before linkage failed without creating another appointment or event', async () => {
    const data = input(), preview = await importer.preview({ actor, input: data });
    const commit = { ...data, rows: preview.rows, confirm: true, previewToken: preview.previewToken };
    expect(await importer.commit({ actor, input: commit })).toMatchObject({ complete: false, savedAppointmentIds: [101] });
    expect(state.events).toHaveLength(1); expect(state.appointments).toHaveLength(1);
    expect(state.appointments[0].provider_schedule_event_id).toBeNull();
    expect(state.events[0].reason_code).toMatch(/^AW_AGENDA:101:[A-F0-9]{32}$/);
    expect(state.events[0].reason_code.length).toBeLessThanOrEqual(64);
    const retryPreview = await importer.preview({ actor, input: data });
    expect(retryPreview.summary).toMatchObject({ blockedRows: 0, existingAppointments: 1 });
    const result = await importer.commit({ actor, input: { ...data, rows: retryPreview.rows, confirm: true, previewToken: retryPreview.previewToken } });
    expect(result).toMatchObject({ complete: true, existingCount: 1, createdCount: 0 });
    expect(state.appointments[0].provider_schedule_event_id).toBe(501);
    expect(ProviderScheduleEvent.create).toHaveBeenCalledTimes(1);
    expect(linkProviderScheduleEvent).toHaveBeenCalledTimes(2);
  });

  it('does not recover an unrelated identical calendar event without the authenticated source identity', async () => {
    const data = input(), preview = await importer.preview({ actor, input: data });
    await importer.commit({ actor, input: { ...data, rows: preview.rows, confirm: true, previewToken: preview.previewToken } });
    state.events[0].reason_code = 'UNRELATED';
    const retry = await importer.preview({ actor, input: data });
    expect(retry.summary.blockedRows).toBe(1); expect(retry.previewToken).toBeNull();
    expect(state.appointments[0].provider_schedule_event_id).toBeNull();
    expect(ProviderScheduleEvent.create).toHaveBeenCalledTimes(1);
  });

  it('ignores request-body attempts to inject the trusted calendar identity hook', async () => {
    state.failLink = false;
    let response;
    const res = { status() { return this; }, json(value) { response = value; return this; } };
    await createAppointmentHandler({ user: actor, params: {}, body: { agencyId: 2, providerUserId: 19, tenantServiceId: 3, startAt: '2026-11-16T16:00:00Z', endAt: '2026-11-16T16:50:00Z',
      timeZone: 'America/Denver', modality: 'IN_PERSON', serviceLocationId: 5, participants: [{ clientId: 41, role: 'client' }], source: 'staff_grid',
      appointmentCalendarIdentity: 'AW_AGENDA:FORGED', reasonCode: 'AW_AGENDA:FORGED' } }, res, error => { throw error; });
    expect(response.ok).toBe(true);
    expect(state.events[0].reason_code).toBeNull();
  });
});
