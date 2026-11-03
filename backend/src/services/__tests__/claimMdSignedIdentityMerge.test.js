import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {}, onTableWrite: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: {} }));
vi.mock('../clientEnrollmentMerge.service.js', () => ({ moveEnrollmentRecords: vi.fn() }));
import { assertClientMergePreservesSignedNotes } from '../identityHygiene.service.js';
it('blocks identity reassignment of any signed source note, including soft-deleted records', async () => {
  const db = { execute: vi.fn().mockResolvedValue([[{ id: 7 }]]) };
  await expect(assertClientMergePreservesSignedNotes(db, [2, 3])).rejects.toMatchObject({ status: 409 });
  expect(db.execute.mock.calls[0][0]).toContain('provider_signed_at IS NOT NULL FOR UPDATE');
  expect(db.execute.mock.calls[0][0]).not.toContain('is_deleted');
});
it('allows a source with no signed note while failing closed on storage errors', async () => {
  const db = { execute: vi.fn().mockResolvedValue([[]]) };
  await expect(assertClientMergePreservesSignedNotes(db, [2])).resolves.toBeUndefined();
  db.execute.mockRejectedValueOnce(Error('Unavailable'));
  await expect(assertClientMergePreservesSignedNotes(db, [2])).rejects.toThrow('Unavailable');
});
