import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), release: vi.fn(), access: vi.fn(), find: vi.fn(), participants: vi.fn(), evaluate: vi.fn(), cancel: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { getConnection: async () => m, execute: m.execute } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { listClientsForGuardian: m.access, isNoView: p => p?.no_view } }));
vi.mock('../../models/Appointment.model.js', () => ({ default: { findById: m.find, listParticipants: m.participants } }));
vi.mock('../bookingCancellationPolicy.service.js', () => ({ evaluateCancel: m.evaluate }));
vi.mock('../appointment.service.js', () => ({ cancelAppointment: m.cancel }));
import { cancelGuardianAppointments, listGuardianAppointments } from '../guardianAppointments.service.js';
const input = { userId: 9, clientId: 8, appointmentId: 1, scope: 'future', reason: 'Changing our schedule', confirmed: true };
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue([{ client_id: 8, agency_id: 2 }]);
  m.participants.mockResolvedValue([{ clientId: 8 }]);
  m.find.mockImplementation(async id => ({ id, agencyId: 2, providerUserId: 7, status: 'scheduled', startAt: '2099-01-01 10:00:00' }));
  m.evaluate.mockResolvedValue({ allowed: true, feeAmount: 25 });
  m.execute.mockImplementation(async sql => {
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.includes('SELECT p.recurrence_series_id')) return [[{ recurrence_series_id: 'series-a', booking_plan_id: 5 }]];
    if (sql.includes('SELECT DISTINCT a.id')) return [[{ id: 1 }, { id: 2 }]];
    return [[]];
  });
});
it('immediately cancels only the authorized series through the existing policy path', async () => {
  expect(await cancelGuardianAppointments(input)).toMatchObject({ cancelledCount: 2, appointmentIds: [1, 2] });
  expect(m.cancel).toHaveBeenNthCalledWith(1, 1, { actorUserId: 9, actorRole: 'guardian', clientId: 8, reason: input.reason });
  const selection = m.execute.mock.calls.find(([sql]) => sql.includes('SELECT DISTINCT a.id'));
  expect(selection[0]).toContain('a.provider_user_id=?');
  expect(selection[1]).toEqual([8, 2, 7, 'series-a', 'series-a', 5, 5]);
  const stop = m.execute.mock.calls.find(([sql]) => sql.includes('UPDATE office_booking_plans'));
  expect(stop[0]).toContain("'$.clientId'");
  expect(stop[1]).toEqual([5, '8']);
  expect(m.execute.mock.calls.some(([sql]) => sql.includes('UPDATE office_standing_assignments'))).toBe(false);
  expect(m.release).toHaveBeenCalled();
});
it('validates every fee-policy outcome before changing any appointment or plan', async () => {
  m.evaluate.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false, blockReason: 'Policy blocks this cancellation' });
  await expect(cancelGuardianAppointments(input)).rejects.toMatchObject({ status: 403 });
  expect(m.cancel).not.toHaveBeenCalled();
  expect(m.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
});
it('rejects cross-tenant appointments, shared group appointments, and unauthorized guardians', async () => {
  m.find.mockResolvedValueOnce({ id: 1, agencyId: 3 });
  await expect(cancelGuardianAppointments(input)).rejects.toMatchObject({ status: 404 });
  m.participants.mockResolvedValueOnce([{ clientId: 8 }, { clientId: 10 }]);
  await expect(cancelGuardianAppointments(input)).rejects.toMatchObject({ status: 403 });
  m.access.mockResolvedValueOnce([]);
  await expect(cancelGuardianAppointments(input)).rejects.toMatchObject({ status: 403 });
  expect(m.cancel).not.toHaveBeenCalled();
});
it('requires an explicit confirmation and never treats a missing series as all appointments', async () => {
  await expect(cancelGuardianAppointments({ ...input, confirmed: false })).rejects.toMatchObject({ status: 400 });
  m.execute.mockImplementation(async sql => sql.includes('GET_LOCK') ? [[{ acquired: 1 }]] : [[]]);
  await expect(cancelGuardianAppointments(input)).rejects.toMatchObject({ status: 409 });
  expect(m.cancel).not.toHaveBeenCalled();
});
it('releases the connection even if releasing the advisory lock fails', async () => {
  m.execute.mockImplementation(async sql => {
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.includes('RELEASE_LOCK')) throw new Error('connection lost');
    return [[]];
  });
  await expect(cancelGuardianAppointments(input)).rejects.toThrow();
  expect(m.release).toHaveBeenCalled();
});
it('limits the upcoming display to six without changing reservations', async () => {
  m.execute.mockResolvedValue([[]]);
  expect(await listGuardianAppointments({ userId: 9, clientId: 8 })).toEqual([]);
  expect(m.execute.mock.calls[0][0]).toContain('LIMIT 6');
  expect(m.execute.mock.calls[1][0]).toContain('a.start_at<UTC_TIMESTAMP()');
  expect(m.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});
