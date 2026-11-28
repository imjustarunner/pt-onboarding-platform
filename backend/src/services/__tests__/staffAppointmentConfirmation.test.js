import { describe, expect, it, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../appointmentReminder.service.js', () => ({ logCommunication: vi.fn() }));
import { logCommunication } from '../appointmentReminder.service.js';
import { recordStaffAppointmentConfirmation } from '../staffAppointmentConfirmation.service.js';

const appointment = { id: 14, agencyId: 2, providerUserId: 7 };
const scheduled = { status: 'scheduled', upcoming: 1, client_count: 1, product_origin: 'full_suite' };

function harness(row) {
  vi.clearAllMocks();
  const connection = {
    execute: vi.fn().mockResolvedValueOnce([[row]]).mockResolvedValueOnce([{ affectedRows: 1 }]),
    beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn()
  };
  return { connection, db: { getConnection: async () => connection } };
}
describe('staff appointment confirmation', () => {
  it('records the staff actor and does not create an inbound message', async () => {
    const { connection, db } = harness(scheduled);
    expect(await recordStaffAppointmentConfirmation(appointment, 7, db)).toMatchObject({ status: 'client_confirmed' });
    expect(connection.execute.mock.calls[0][1]).toEqual([14, 2, 7]);
    expect(connection.execute.mock.calls[1][1]).toEqual([7, 14]);
    expect(logCommunication).toHaveBeenCalledWith(expect.objectContaining({
      agencyId: 2, appointmentId: 14, direction: 'system', kind: 'staff_confirmation', createdByUserId: 7, db: connection
    }));
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('keeps the existing response when retried or when a client already responded', async () => {
    const { db, connection } = harness({ ...scheduled, status: 'client_confirmed' });
    await recordStaffAppointmentConfirmation(appointment, 7, db);
    expect(connection.execute).toHaveBeenCalledOnce();
    expect(logCommunication).not.toHaveBeenCalled();
  });

  it.each([
    { upcoming: 0 }, { client_count: 2 }, { product_origin: 'auricwell_ehr' },
    { status: 'reschedule_requested', cancellation_recommendation_json: { clientReply: 'confirm' } },
    { status: 'canceled_by_client' }, { status: 'completed' },
    { cancellation_recommendation_json: { clientReply: 'cancel_blocked' } }
  ])('keeps restricted or changed appointments untouched (%j)', async patch => {
    const { db, connection } = harness({ ...scheduled, ...patch });
    await expect(recordStaffAppointmentConfirmation(appointment, 7, db)).rejects.toMatchObject({ status: 409 });
    expect(connection.execute).toHaveBeenCalledOnce();
    expect(connection.rollback).toHaveBeenCalledOnce();
  });

  it('rolls back the RSVP if its audit entry cannot be written', async () => {
    const { db, connection } = harness(scheduled);
    logCommunication.mockRejectedValueOnce(new Error('unavailable'));
    await expect(recordStaffAppointmentConfirmation(appointment, 7, db)).rejects.toThrow('unavailable');
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
  });
});
