import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { getConnection: vi.fn(), execute: vi.fn() } }));
import pool from '../../config/database.js';
import { upsertDraftSection, deleteDraftSection, upsertDigestEntry, deleteDigestEntry, publishDigest } from '../workplaceHandbook.service.js';

let conn;
beforeEach(() => {
  vi.resetAllMocks();
  conn = { execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
  pool.getConnection.mockResolvedValue(conn);
});
describe('handbook content and history protection', () => {
  it('does not edit or delete sections of a published version', async () => {
    conn.execute.mockImplementation(async sql => sql.includes('workplace_handbook_documents') ? [[{ id: 1 }]] : [[{ is_draft: 0 }]]);
    await expect(upsertDraftSection({ agencyId: 2, versionId: 10, sectionId: 3, title: 'Changed', bodyHtml: '<p>Changed</p>' })).rejects.toMatchObject({ status: 409 });
    await expect(deleteDraftSection({ agencyId: 2, versionId: 10, sectionId: 3 })).rejects.toMatchObject({ status: 409 });
    expect(conn.execute.mock.calls.some(([sql]) => /^UPDATE|^DELETE/.test(sql))).toBe(false);
  });
  it('preserves section identity on rename and strips active markup', async () => {
    conn.execute.mockImplementation(async sql => {
      if (sql.includes('workplace_handbook_documents')) return [[{ id: 1 }]];
      if (sql.includes('workplace_handbook_versions')) return [[{ id: 10, is_draft: 1 }]];
      if (sql.startsWith('SELECT slug')) return [[{ slug: 'leave' }]];
      return [{ affectedRows: 1 }];
    });
    await upsertDraftSection({ agencyId: 2, versionId: 10, sectionId: 3, title: 'Time off', slug: 'a-new-name', bodyHtml: '<script>bad()</script><p>Policy</p>' });
    const [sql, params] = conn.execute.mock.calls.find(([query]) => query.startsWith('UPDATE'));
    expect(sql).not.toContain('slug =');
    expect(params[1]).toBe('<p>Policy</p>');
    expect(conn.commit).toHaveBeenCalledOnce();
  });
  it('does not allow a published digest to be changed, deleted, or republished', async () => {
    conn.execute.mockResolvedValue([[{ id: 5, status: 'published' }]]);
    for (const action of [() => upsertDigestEntry({ agencyId: 2, digestId: 5, entryId: 4, subject: 'Changed' }), () => deleteDigestEntry({ agencyId: 2, digestId: 5, entryId: 4 }), () => publishDigest({ agencyId: 2, digestId: 5 })]) await expect(action()).rejects.toMatchObject({ status: 409 });
    expect(conn.execute.mock.calls.some(([sql]) => /^UPDATE|^DELETE/.test(sql))).toBe(false);
  });
  it('keeps generated before/after wording immutable even while the digest is a draft', async () => {
    conn.execute.mockImplementation(async sql => sql.includes('SELECT * FROM workplace_handbook_digests') ? [[{ id: 5, status: 'draft' }]] : [[{ id: 4, handbook_version_id: 10, changed_content: '<p>Published policy</p>', handbook_section_slug: 'leave' }]]);
    await expect(upsertDigestEntry({ agencyId: 2, digestId: 5, entryId: 4, subject: 'Changed', changedContent: '<p>Different policy</p>' })).rejects.toMatchObject({ status: 409 });
    await expect(deleteDigestEntry({ agencyId: 2, digestId: 5, entryId: 4 })).rejects.toMatchObject({ status: 409 });
    expect(conn.commit).not.toHaveBeenCalled();
  });
  it('does not publish an empty digest', async () => {
    conn.execute.mockImplementation(async sql => sql.includes('SELECT * FROM workplace_handbook_digests') ? [[{ id: 5, status: 'draft' }]] : [[]]);
    await expect(publishDigest({ agencyId: 2, digestId: 5 })).rejects.toMatchObject({ status: 400 });
    expect(conn.commit).not.toHaveBeenCalled();
  });
});
