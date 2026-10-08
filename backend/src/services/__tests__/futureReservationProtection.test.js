import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { assertAppointmentWindowAvailable, appointmentOccupiesTime } from '../appointmentConflict.service.js';

const row = { providerUserId: 9, startAt: '2026-12-03 17:00:00', endAt: '2026-12-03 18:00:00', status: 'scheduled' };
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-08T12:00:00Z')); });
afterEach(() => vi.useRealTimers());

it('blocks another booking eight weeks ahead even though the guardian displays only six', async () => {
  const db = { execute: vi.fn(async () => [[{ id: 42 }]]) };
  expect(appointmentOccupiesTime('scheduled')).toBe(true);
  await expect(assertAppointmentWindowAvailable(db, row)).rejects.toMatchObject({ code: 'PROVIDER_TIME_CONFLICT' });
  expect(db.execute.mock.calls[0][1]).toEqual([9,row.endAt,row.startAt,null,null]);
  expect(db.execute.mock.calls[0][0]).not.toContain('LIMIT 6');
});

it('blocks a client office reservation before its appointment link is created', async () => {
  const db = { execute: vi.fn(async sql => sql.includes('FROM office_events') ? [[{ id: 53 }]] : [[]]) };
  await expect(assertAppointmentWindowAvailable(db, row)).rejects.toMatchObject({ code: 'PROVIDER_TIME_CONFLICT' });
  expect(db.execute.mock.calls[1][0]).toContain('client_id IS NOT NULL');
});

it('allows linking the same office booking without treating it as a competing reservation', async () => {
  const db = { execute: vi.fn(async () => [[]]) };
  await expect(assertAppointmentWindowAvailable(db, { ...row,officeEventId:53 },42)).resolves.toBeUndefined();
  expect(db.execute.mock.calls[1][1]).toEqual([9,9,row.endAt,row.startAt,53,53]);
  expect(db.execute.mock.calls.every(([sql]) => sql.trimStart().startsWith('SELECT'))).toBe(true);
});
