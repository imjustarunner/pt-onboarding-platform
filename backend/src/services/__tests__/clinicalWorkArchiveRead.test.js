import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { attachClinicalWorkArchives, visibleClinicalWork, assertClinicalWorkActive, requireClinicalWorkArchiveSchema, clinicalWorkResourceRefs } from '../clinicalWorkArchiveRead.service.js';

const archived = { resource_type: 'clinical_session', resource_id: 12, archive_id: 7, archived_at: '2026-11-18' };
it('hides every projection of an archived session while retaining normal work', async () => {
  const db = { execute: vi.fn(async () => [[archived]]) };
  const rows = [{ claimId: 31, clinical_session_id: 12 }, { draftId: 41, clinicalSessionId: 12 }, { id: 51, clinical_session_id: 13 }];
  expect(await visibleClinicalWork(rows, { db })).toEqual([rows[2]]);
  const all = await attachClinicalWorkArchives(rows, { db });
  expect(all.slice(0, 2).every(row => row.administrativeArchive.id === 7)).toBe(true);
  expect(await visibleClinicalWork(rows, { db, archiveStatus: 'archived' })).toHaveLength(2);
  expect(await visibleClinicalWork(rows, { db, archiveStatus: 'all' })).toHaveLength(3);
  expect(db.execute.mock.calls[0][0]).toContain('a.restored_at IS NULL');
});
it.each(['appointment', 'office_event', 'provider_schedule_event', 'draft', 'note', 'work_queue'])('supports %s projections with their own primary IDs', async kind => {
  const db = { execute: vi.fn(async () => [[{ ...archived, resource_type: kind, resource_id: 51 }]]) };
  expect(await visibleClinicalWork([{ id: 51 }], { db, kind })).toEqual([]);
  await expect(assertClinicalWorkActive({ id: 51, archiveResourceType: kind }, { db })).rejects.toMatchObject({ status: 409, code: 'CLINICAL_WORK_ARCHIVED' });
});
it('restored work immediately becomes visible and eligible again', async () => {
  const db = { execute: vi.fn(async () => [[]]) };
  await expect(assertClinicalWorkActive({ clinical_session_id: 12 }, { db })).resolves.toBeUndefined();
  expect(await visibleClinicalWork([{ clinical_session_id: 12 }], { db })).toHaveLength(1);
  expect(await visibleClinicalWork([{ clinical_session_id: 12, administrativeArchive: { id: 7 } }], { db })).toEqual([{ clinical_session_id: 12 }]);
});
it('propagates database outages instead of allowing submission through an unavailable guard', async () => {
  const db = { execute: vi.fn(async () => { throw Object.assign(new Error('Unavailable'), { code: 'ECONNREFUSED' }); }) };
  await expect(assertClinicalWorkActive({ claimId: 12 }, { db })).rejects.toThrow('Unavailable');
});
it('allows old readers before installation but blocks a candidate with missing archive storage at startup', async () => {
  const db = { execute: vi.fn(async () => { throw Object.assign(new Error('Missing'), { code: 'ER_NO_SUCH_TABLE' }); }) };
  expect(await visibleClinicalWork([{ claimId: 12 }], { db })).toHaveLength(1);
  await expect(requireClinicalWorkArchiveSchema(db)).rejects.toMatchObject({ requiredMigration: '1846' });
});
it('does not infer a session from client, provider or dates', () => {
  expect(clinicalWorkResourceRefs({ clientId: 12, providerId: 13, date: '2026-11-18', id: 14 })).toEqual([]);
});
it('filters a large billing history without exceeding MySQL parameter limits', async () => {
  const rows = Array.from({ length: 70000 }, (_, index) => ({ claimId: index + 1 }));
  const db = { execute: vi.fn(async (_sql, params) => {
    if (params.length > 65535) throw new Error('Too many prepared-statement placeholders');
    return [params.includes(70000) ? [{ resource_type: 'claim', resource_id: 70000, archive_id: 7 }] : []];
  }) };
  expect((await visibleClinicalWork(rows, { db })).length).toBe(69999);
});
it('fails closed if archive storage disappears after startup verified it', async () => {
  await requireClinicalWorkArchiveSchema({ execute: vi.fn(async () => [[]]) });
  const db = { execute: vi.fn(async () => { throw Object.assign(new Error('Missing installed archive storage'), { code: 'ER_NO_SUCH_TABLE' }); }) };
  await expect(assertClinicalWorkActive({ claimId: 12 }, { db })).rejects.toMatchObject({ code: 'ER_NO_SUCH_TABLE' });
});
