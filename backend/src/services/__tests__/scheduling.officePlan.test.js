import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { getConnection: vi.fn(), execute: vi.fn() } }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../appointmentContext.service.js', () => ({ ensureAppointmentContext: vi.fn() }));
vi.mock('../appointmentClinicalLink.service.js', () => ({ assertAppointmentClients: vi.fn() }));
vi.mock('../../models/BookingPackage.model.js', () => ({ default: { findEntitlementById: vi.fn() } }));
import pool from '../../config/database.js';
import BookingPackage from '../../models/BookingPackage.model.js';
import Materializer from '../officeScheduleMaterializer.service.js';
import { officeSessionPlanDates, saveOfficeSessionPlanContext } from '../officeSessionPlan.service.js';
import { ensureAppointmentContext } from '../appointmentContext.service.js';
const assignment = { id: 7, weekday: 1, hour: 10, assigned_frequency: 'WEEKLY', availability_mode: 'AVAILABLE', office_location_id: 2, timezone: 'America/Denver' };
const context = { agencyId: 1, clientId: 4, packageEntitlementId: 2 };
const plan = { id: 3, standing_assignment_id: 7, is_active: 1, booking_start_date: '2099-01-05', booked_frequency: 'WEEKLY', booked_occurrence_count: 3, session_context_json: context };
describe('finite office client series', () => {
  it('honors an explicit weekly occurrence count', () => {
    expect(officeSessionPlanDates(plan, assignment)).toEqual(['2099-01-05', '2099-01-12', '2099-01-19']);
  });
  it('does not append a replacement after an occurrence is canceled or moved', () => {
    expect(officeSessionPlanDates({ ...plan, skipped_dates_json: '["2099-01-12"]' }, assignment)).toEqual(['2099-01-05', '2099-01-19']);
  });
  it('honors the end date for a weekly patient plan', () => {
    expect(officeSessionPlanDates({ ...plan, active_until_date: '2099-01-12' }, assignment)).toHaveLength(2);
  });
});
describe('office series package finalization', () => {
  let conn;
  let existing;
  beforeEach(() => {
    vi.clearAllMocks();
    existing = [];
    vi.spyOn(Materializer, 'materializeWeek').mockResolvedValue({ ok: true });
    conn = { release: vi.fn(), execute: vi.fn(async (sql) => {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.startsWith('SELECT * FROM office_booking_plans')) return [[plan]];
      if (sql.startsWith('SELECT a.*, l.timezone')) return [[assignment]];
      if (sql.startsWith('SELECT a.id, a.package')) return [existing];
      if (sql.startsWith('SELECT id FROM office_events')) return [[{ id: 10 }]];
      return [[]];
    }) };
    pool.getConnection.mockResolvedValue(conn);
    BookingPackage.findEntitlementById.mockResolvedValue({ id: 2, clientId: 4, sessionsRemaining: 3, status: 'ACTIVE' });
    ensureAppointmentContext.mockResolvedValue({ ensured: true });
  });
  it('rejects an undersized package before changing patient context or reserving any occurrence', async () => {
    BookingPackage.findEntitlementById.mockResolvedValue({ clientId: 4, sessionsRemaining: 2, status: 'ACTIVE' });
    await expect(saveOfficeSessionPlanContext(3, context, 9)).rejects.toThrow('3 available sessions');
    expect(ensureAppointmentContext).not.toHaveBeenCalled();
    expect(conn.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    expect(conn.release).toHaveBeenCalled();
  });
  it('links and reserves every occurrence before reporting a completed plan', async () => {
    expect(await saveOfficeSessionPlanContext(3, context, 9)).toEqual({ linkedEventIds: [10, 10, 10] });
    expect(ensureAppointmentContext).toHaveBeenCalledTimes(3);
  });
  it('reports partial linkage with the same plan ID for retry', async () => {
    ensureAppointmentContext.mockResolvedValueOnce({ ensured: true }).mockRejectedValueOnce(new Error('database unavailable'));
    await expect(saveOfficeSessionPlanContext(3, context, 9)).rejects.toMatchObject({ bookingPlanId: 3, linkedEventIds: [10] });
  });
  it('does not demand additional package capacity for already reserved occurrences', async () => {
    existing = ['2099-01-05', '2099-01-12', '2099-01-19'].map((date) => ({ package_entitlement_id: 2, client_id: 4, start_at: `${date} 17:00:00` }));
    BookingPackage.findEntitlementById.mockResolvedValue({ clientId: 4, sessionsRemaining: 0, status: 'ACTIVE' });
    await expect(saveOfficeSessionPlanContext(3, context, 9)).resolves.toHaveProperty('linkedEventIds');
  });
});
