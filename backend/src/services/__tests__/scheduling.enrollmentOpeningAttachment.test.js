import { describe, expect, it, vi } from 'vitest';
import { attachEnrollmentOpeningPreference as attach } from '../enrollmentOpeningPreference.service.js';
import { hashHoldToken } from '../publicProviderHold.service.js';

const preference = {
  providerId: 9, modality: 'VIRTUAL', startAt: '2030-01-08T16:00:00Z', endAt: '2030-01-08T17:00:00Z',
  frequency: 'WEEKLY', timeZone: 'America/Denver', reserved: true, status: 'RESERVED_PENDING_CONFIRMATION'
};
const hold = {
  provider_id: 9, service_type: 'counseling', modality: 'VIRTUAL', frequency: 'BIWEEKLY', time_zone: 'America/Denver',
  start_at: '2030-01-10T16:00:00.000Z', end_at: '2030-01-10T17:00:00.000Z',
  client_id: null, released_at: null, is_expired: 0
};
const input = { agencyId: 2, serviceType: 'counseling', clientId: 14, holdToken: 'opaque', preference };
function setup(row = hold, affectedRows = 1) {
  const connection = {
    beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
    execute: vi.fn(async sql => sql.startsWith('SELECT') ? [row ? [row] : []] : [{ affectedRows }])
  };
  const database = { execute: vi.fn(async () => [[{ id: 9 }]]), getConnection: vi.fn(async () => connection) };
  return { connection, database };
}

describe('enrollment reservation attachment', () => {
  it('uses canonical held time and binds only the selected provider within the enrollment tenant', async () => {
    const { database, connection } = setup();
    const result = await attach(database, input);
    expect(result).toMatchObject({ providerId: 9, startAt: hold.start_at, endAt: hold.end_at,
      frequency: 'BIWEEKLY', reserved: true, holdWasActiveAtSubmission: true, status: 'RESERVED_PENDING_CONFIRMATION' });
    expect(result.reservationNotice).toBeUndefined();
    expect(connection.execute).toHaveBeenNthCalledWith(1, expect.stringContaining('agency_id=? AND provider_id=? AND token_hash=? LIMIT 1 FOR UPDATE'), [2, 9, hashHoldToken('opaque')]);
    expect(connection.execute).toHaveBeenNthCalledWith(2, expect.stringContaining('AND client_id IS NULL'), [14, 2, 9, hashHoldToken('opaque')]);
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it.each([
    ['released', { ...hold, released_at: '2030-01-01T12:00:00Z' }],
    ['expired', { ...hold, is_expired: 1 }],
    ['unknown or outside tenant/provider', null],
    ['already attached to another client', { ...hold, client_id: 88 }],
    ['different service', { ...hold, service_type: 'tutoring' }],
    ['different format', { ...hold, modality: 'IN_PERSON' }]
  ])('completes with an honest preference when the hold is %s', async (_reason, row) => {
    const { database, connection } = setup(row);
    const result = await attach(database, input);
    expect(result).toMatchObject({ providerId: 9, startAt: '2030-01-08T16:00:00.000Z',
      reserved: false, holdWasActiveAtSubmission: false, status: 'PREFERENCE_ONLY_REQUIRES_STAFF_CONFIRMATION' });
    expect(result.reservationNotice).toContain('no longer reserved');
    expect(connection.execute).toHaveBeenCalledTimes(1);
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('supports replay for the same client without rebinding the hold', async () => {
    const { database, connection } = setup({ ...hold, client_id: 14 });
    expect(await attach(database, input)).toMatchObject({ reserved: true, startAt: hold.start_at });
    expect(connection.execute).toHaveBeenCalledTimes(1);
  });

  it('does not claim a reservation if a conditional attachment no longer succeeds', async () => {
    const { database } = setup(hold, 0);
    expect(await attach(database, input)).toMatchObject({ reserved: false, reservationNotice: expect.stringContaining('no longer reserved') });
  });

  it('never trusts a browser reservation claim without a token', async () => {
    const { database } = setup();
    expect(await attach(database, { ...input, holdToken: null })).toMatchObject({ reserved: false, holdWasActiveAtSubmission: false });
    expect(database.getConnection).not.toHaveBeenCalled();
  });

  it('leaves enrollment with no chosen time alone', async () => {
    const { database } = setup();
    expect(await attach(database, { ...input, preference: null })).toBeNull();
    expect(database.execute).not.toHaveBeenCalled();
    expect(database.getConnection).not.toHaveBeenCalled();
  });

  it('never binds a hold when a client was not created', async () => {
    const { database } = setup();
    expect(await attach(database, { ...input, clientId: null })).toMatchObject({ reserved: false });
    expect(database.getConnection).not.toHaveBeenCalled();
  });

  it('rolls back and releases the connection after a database error', async () => {
    const { database, connection } = setup();
    connection.execute.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(attach(database, input)).rejects.toThrow('database unavailable');
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
  });
});
