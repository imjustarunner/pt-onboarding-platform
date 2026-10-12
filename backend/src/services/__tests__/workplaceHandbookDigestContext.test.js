import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import pool from '../../config/database.js';
import { getPublishedDigestForAgency } from '../workplaceHandbook.service.js';
beforeEach(() => vi.resetAllMocks());
it.each([{ pushId: 12 }, { adminUpdateId: 7 }, { pushId: 12, adminUpdateId: 7 }])('does not replace an older provider update with the latest month (%j)', async context => {
  pool.execute.mockImplementation(async sql => {
    if (sql.includes('workplace_handbook_documents')) return [[{ id: 1, full_handbook_url: null }]];
    if (sql.includes('COALESCE(published_at')) throw Error('Must not load the newest month');
    return [[]];
  });
  expect(await getPublishedDigestForAgency(2, context)).toMatchObject({ digest: null, entries: [] });
});
