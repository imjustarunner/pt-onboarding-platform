import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: mocks }));
vi.mock('../../models/OfficeLocation.model.js', () => ({ default: {} }));
vi.mock('../../models/ProviderPublicProfile.model.js', () => ({ default: {} }));
vi.mock('../providerClinicalFacets.service.js', () => ({ listClinicalFacetsForUsers: async () => new Map(), listClinicalFacetsForUser: vi.fn() }));
vi.mock('../providerAcceptedInsurance.service.js', () => ({ listProviderAcceptedInsurancesForDisplay: vi.fn() }));
vi.mock('../publicCounselingRate.service.js', () => ({ getPublicCounselingHourlyRate: vi.fn() }));
import { officeToday } from '../officeLobby.service.js';

const location = { id: 1, name: 'Windchime', agency_id: 2, timezone: 'America/Denver' };
const event = { event_id: 10, start_at: '2026-10-06 21:00:00', end_at: '2026-10-06 22:00:00', assigned_provider_id: 7, booked_provider_id: 7, status: 'BOOKED', slot_state: 'ASSIGNED_BOOKED', room_number: '4' };
let events, people, arrivals;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-06T20:45:00Z'));
  events = [{ ...event, session_context_json: '{"agencyId":6}' }]; arrivals = [];
  people = [2, 6].map(agency_id => ({ id: 7, first_name: 'Jordan', last_name: 'Rivera', agency_id, sees_clients: 1, role: 'provider', office_booked: 1 }));
  mocks.execute.mockImplementation(async sql => {
    if (sql.includes('FROM agencies a')) return [[{ id: 2, name: 'ITSCO' }, { id: 6, name: 'Next Level Up' }]];
    if (sql.includes('FROM users u')) return [people];
    if (sql.includes('FROM office_event_checkins')) return [arrivals];
    if (sql.includes('FROM office_events e JOIN office_rooms')) return [events];
    throw new Error(`Unexpected query: ${sql}`);
  });
});
afterEach(() => vi.useRealTimers());
describe('app-owned multi-agency kiosk bookings', () => {
  it('lists a shared provider under NLU when NLU owns the booking', async () => {
    const { providers } = await officeToday(location);
    expect(providers).toHaveLength(1);
    expect(providers[0]).toMatchObject({ id: 7, agencyId: 6, agencyName: 'Next Level Up', currentSlot: { eventId: 10 } });
  });
  it('keeps the day’s times separated by booking agency instead of hiding the second agency', async () => {
    events.push({ ...event, event_id: 11, start_at: '2026-10-06 23:00:00', end_at: '2026-10-07 00:00:00', booking_agency_id: 2 });
    const { providers } = await officeToday(location, { view: 'today' });
    expect(providers.map(p => [p.agencyId, p.bookings.map(b => b.eventId)])).toEqual([[2, [11]], [6, [10]]]);
    expect((await officeToday(location)).providers.map(p => p.agencyId)).toEqual([6]);
  });
  it.each(['booking_agency_id', 'client_agency_id', 'appointment_agency_id'])('uses the app’s %s even without a Google event', async key => {
    events = [{ ...event, [key]: 6 }];
    expect((await officeToday(location)).providers[0].agencyId).toBe(6);
  });
  it('gives a linked appointment precedence over old office allocation context', async () => {
    events[0].session_context_json = '{"agencyId":2}'; events[0].appointment_agency_id = 6;
    expect((await officeToday(location)).providers[0].agencyId).toBe(6);
  });
  it('does not substitute another agency for an unaffiliated booking', async () => {
    events[0].session_context_json = '{"agencyId":999}';
    expect((await officeToday(location)).providers).toEqual([]);
  });
  it('keeps legacy agency-less bookings visible once, without duplicate cards', async () => {
    events = [{ ...event }];
    expect((await officeToday(location)).providers.map(p => p.agencyId)).toEqual([2]);
  });
  it('keeps staff-only profiles out of client check-in', async () => {
    people = people.map(p => ({ ...p, sees_clients: 0 }));
    expect((await officeToday(location)).providers).toEqual([]);
  });
  it('retains checked-in status after switching organization cards', async () => {
    arrivals = [{ provider_id: 7, slot_start_at: event.start_at }];
    expect((await officeToday(location)).providers[0].currentSlot.checkedIn).toBe(true);
  });
});
