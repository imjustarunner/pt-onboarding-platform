import { beforeEach, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ pool: vi.fn(), acquire: vi.fn(), execute: vi.fn(), begin: vi.fn(),
  commit: vi.fn(), rollback: vi.fn(), release: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: m.pool, getConnection: m.acquire } }));
import ClinicalNote from '../clinical/ClinicalNote.model.js';

const db = { execute: m.execute, beginTransaction: m.begin, commit: m.commit, rollback: m.rollback, release: m.release };
let note;
beforeEach(() => {
  vi.clearAllMocks();
  note = { id: 100, provider_signed_at: '2026-11-06', metadata_json: JSON.stringify({ serviceCode: '90837', digitalShare: { first: 'ref-1' } }) };
  m.acquire.mockResolvedValue(db);
  m.execute.mockImplementation(async (sql, args) => {
    if (sql.startsWith('SELECT')) return [[{ ...note }]];
    note.metadata_json = args[0]; return [{ affectedRows: 1 }];
  });
});

it('preserves signed clinical metadata while permitting operational references in the caller transaction', async () => {
  const result = await ClinicalNote.updatePayload({ noteId: 100,
    metadataJson: { digitalShare: { second: 'ref-2' } } }, { executor: db });
  expect(JSON.parse(result.metadata_json)).toEqual({ serviceCode: '90837', digitalShare: { first: 'ref-1', second: 'ref-2' } });
  expect(m.acquire).not.toHaveBeenCalled(); expect(m.pool).not.toHaveBeenCalled();
  expect(m.begin).not.toHaveBeenCalled(); expect(m.commit).not.toHaveBeenCalled();
  expect(m.rollback).not.toHaveBeenCalled(); expect(m.release).not.toHaveBeenCalled();
});

it('keeps standalone signed operational updates transactional with one release', async () => {
  await ClinicalNote.updatePayload({ noteId: 100, metadataJson: { printUpload: { documentId: 9 } } });
  expect(m.acquire).toHaveBeenCalledOnce(); expect(m.begin).toHaveBeenCalledOnce();
  expect(m.commit).toHaveBeenCalledOnce(); expect(m.release).toHaveBeenCalledOnce(); expect(m.pool).not.toHaveBeenCalled();
});

it('rejects signed clinical changes without committing or releasing a caller transaction', async () => {
  await expect(ClinicalNote.updatePayload({ noteId: 100, metadataJson: { serviceCode: 'H2011', printUpload: { documentId: 9 } } }, { executor: db }))
    .rejects.toMatchObject({ status: 409 });
  expect(m.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
  expect(m.commit).not.toHaveBeenCalled(); expect(m.rollback).not.toHaveBeenCalled(); expect(m.release).not.toHaveBeenCalled();
});

it('keeps unsigned metadata updates on the same caller transaction after the note lock', async () => {
  note.provider_signed_at = null;
  await ClinicalNote.updatePayload({ noteId: 100, metadataJson: { serviceCode: '90837' } }, { executor: db });
  expect(m.execute.mock.calls[0][0]).toContain('FOR UPDATE');
  expect(m.execute.mock.calls[1][0]).toContain('provider_signed_at IS NULL');
  expect(m.pool).not.toHaveBeenCalled(); expect(m.rollback).not.toHaveBeenCalled(); expect(m.release).not.toHaveBeenCalled();
});
