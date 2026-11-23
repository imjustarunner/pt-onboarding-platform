import { expect, it, vi } from 'vitest';
import { requireEnrollmentFollowupReadiness } from '../enrollmentFollowupReadiness.service.js';
it('checks storage without reading client data before the release can become ready', async () => {
  const db = { execute: vi.fn(async () => [[]]) };
  expect(await requireEnrollmentFollowupReadiness(db)).toEqual({ migration: 1867 });
  expect(db.execute).toHaveBeenCalledTimes(2);
  expect(db.execute.mock.calls.every(([sql]) => sql.endsWith('LIMIT 0'))).toBe(true);
});
it('keeps an incomplete schema out of production traffic without exposing database errors', async () => {
  const db = { execute: vi.fn(async () => { throw new Error('private database details'); }) };
  await expect(requireEnrollmentFollowupReadiness(db)).rejects.toMatchObject({ code: 'ENROLLMENT_FOLLOWUP_SCHEMA_REQUIRED', message: expect.not.stringContaining('private') });
});
