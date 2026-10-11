import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { getConnection: vi.fn(), execute: vi.fn() } }));
vi.mock('../../models/EmployeeEvaluationTemplate.model.js', () => ({ default: { listForAgency: vi.fn() } }));
import EmployeeEvaluationTemplate from '../../models/EmployeeEvaluationTemplate.model.js';
import pool from '../../config/database.js';
import { publishHandbookVersion, stageHandbookSource, sourceForAgency } from '../workplaceHandbookWorkflow.service.js';
import { getHandbookSource } from '../workplaceHandbookContent.js';

let conn;
const makeSection = (body) => ({ slug: 'welcome', title: 'Welcome', body_html: `<p>${body}</p>`, content_status: 'ready', sort_order: 0, parent_slug: null });
function arrange({ initial = false, alreadyPublished = false, failInsert = false, draftDigest = 8 } = {}) {
  conn.execute.mockImplementation(async (sql, params) => {
    if (sql.includes('SELECT * FROM workplace_handbook_documents')) return [[{ id: 1, agency_id: 2, published_version_id: initial ? null : 10 }]];
    if (sql.includes('SELECT * FROM workplace_handbook_versions')) return [[{ id: 11, document_id: 1, agency_id: 2, version_number: 2, is_draft: alreadyPublished ? 0 : 1 }]];
    if (sql.includes('SELECT version_number FROM workplace_handbook_versions')) return [[{ version_number: 1 }]];
    if (sql.includes('SELECT * FROM workplace_handbook_sections')) return [[makeSection(params[0] === 10 ? 'Previous policy' : 'Updated policy')]];
    if (sql.includes('SELECT id FROM workplace_handbook_digests')) return [draftDigest ? [{ id: draftDigest }] : []];
    if (sql.includes('SELECT COALESCE(MAX(sort_order)')) return [[{ last_order: 2 }]];
    if (sql.includes('INSERT INTO workplace_handbook_digest_entries') && failInsert) throw new Error('Storage failure');
    return [{ insertId: 12, affectedRows: 1 }];
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  EmployeeEvaluationTemplate.listForAgency.mockResolvedValue(undefined);
  conn = { execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
  pool.getConnection.mockResolvedValue(conn);
});
describe('atomic handbook publication', () => {
  it('publishes a version and adds its exact before/after wording to the open digest', async () => {
    arrange();
    const result = await publishHandbookVersion({ agencyId: 2, versionId: 11, publishedByUserId: 4, changelog: 'Approved reason' });
    expect(result).toMatchObject({ digestId: 8, changeCount: 1 });
    const write = conn.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO workplace_handbook_digest_entries'));
    expect(write[1]).toEqual([8,2,3,'Welcome — updated','Approved reason','<p>Updated policy</p>','welcome',11,'updated','<p>Previous policy</p>']);
    expect(conn.commit).toHaveBeenCalledOnce();
    expect(conn.rollback).not.toHaveBeenCalled();
  });
  it('does not announce the first import as a set of policy changes', async () => {
    arrange({ initial: true });
    const result = await publishHandbookVersion({ agencyId: 2, versionId: 11 });
    expect(result.initialImport).toBe(true);
    expect(result.changeCount).toBe(0);
    expect(conn.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO workplace_handbook_digests'))).toBe(false);
  });
  it('rolls back publication when an update entry fails', async () => {
    arrange({ failInsert: true });
    await expect(publishHandbookVersion({ agencyId: 2, versionId: 11 })).rejects.toThrow('Storage failure');
    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.execute.mock.calls.some(([sql]) => sql.includes('SET published_version_id'))).toBe(false);
    expect(conn.release).toHaveBeenCalledOnce();
  });
  it('does not create duplicate updates when publication is retried', async () => {
    arrange({ alreadyPublished: true });
    expect(await publishHandbookVersion({ agencyId: 2, versionId: 11 })).toMatchObject({ alreadyPublished: true });
    expect(conn.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO workplace_handbook_digest_entries'))).toBe(false);
  });
  it('creates a new draft when there is no matching open digest', async () => {
    arrange({ draftDigest: null });
    expect(await publishHandbookVersion({ agencyId: 2, versionId: 11 })).toMatchObject({ digestId: 12 });
    const query = conn.execute.mock.calls.find(([sql]) => sql.includes('SELECT id FROM workplace_handbook_digests'))[0];
    expect(query).toContain("status = 'draft'");
    expect(query).toContain('ORDER BY updated_at DESC, id DESC');
  });
  it('rejects publication of a version from another organization', async () => {
    arrange();
    const execute = conn.execute.getMockImplementation();
    conn.execute.mockImplementation((sql, params) => sql.includes('SELECT * FROM workplace_handbook_versions') ? Promise.resolve([[]]) : execute(sql, params));
    await expect(publishHandbookVersion({ agencyId: 2, versionId: 99 })).rejects.toMatchObject({ status: 404 });
    expect(conn.commit).not.toHaveBeenCalled();
  });
  it('refuses to publish an older abandoned draft over a newer handbook', async () => {
    arrange();
    const execute = conn.execute.getMockImplementation();
    conn.execute.mockImplementation((sql, params) => sql.includes('SELECT version_number FROM workplace_handbook_versions') ? Promise.resolve([[{ version_number: 3 }]]) : execute(sql, params));
    await expect(publishHandbookVersion({ agencyId: 2, versionId: 11 })).rejects.toMatchObject({ status: 409 });
    expect(conn.commit).not.toHaveBeenCalled();
  });
});
describe('handbook source staging', () => {
  it('loads NLU source with NLU templates and never substitutes ITSCO role defaults', async () => {
    pool.execute.mockResolvedValue([[{ id: 3, slug: 'nlu' }]]);
    EmployeeEvaluationTemplate.listForAgency.mockResolvedValue([]);
    const source = await sourceForAgency(3);
    expect(source.organization).toBe('Next Level Up');
    expect(EmployeeEvaluationTemplate.listForAgency).toHaveBeenCalledWith(3);
    expect(source.forms.employeeSelfAssessments).toEqual([]);
    expect(source.reviewUpdates.every(e => e.id.startsWith('nlu-source-'))).toBe(true);
  });
  it('uses only the selected agency’s latest saved blank form definitions', async () => {
    pool.execute.mockResolvedValue([[{ id: 2, slug: 'itsco' }]]);
    EmployeeEvaluationTemplate.listForAgency.mockResolvedValue([{ slug: 'counselor', name: 'Counselor', version: 8, rubric_json: { sections: [] } }]);
    const source = await sourceForAgency(2);
    expect(EmployeeEvaluationTemplate.listForAgency).toHaveBeenCalledWith(2);
    expect(source.forms.employeeSelfAssessments).toHaveLength(1);
    expect(source.forms.employeeSelfAssessments[0].version).toBe(8);
  });
  it('does not allow another tenant to stage ITSCO content', async () => {
    pool.execute.mockImplementation(async sql => sql.includes('FROM agencies') ? [[{ id: 3, slug: 'demo' }]] : [[]]);
    await expect(stageHandbookSource({ agencyId: 3 })).rejects.toMatchObject({ status: 404 });
    expect(pool.getConnection).not.toHaveBeenCalled();
  });
  it('requires the source revision that the administrator reviewed', async () => {
    pool.execute.mockResolvedValue([[{ id: 2, slug: 'itsco' }]]);
    await expect(stageHandbookSource({ agencyId: 2, sourceRevision: 'old' })).rejects.toMatchObject({ status: 409 });
    expect(pool.getConnection).not.toHaveBeenCalled();
  });
  it('rejects a stale published version before touching draft content', async () => {
    arrange();
    pool.execute.mockResolvedValue([[{ id: 2, slug: 'itsco' }]]);
    await expect(stageHandbookSource({ agencyId: 2, expectedPublishedVersionId: 9, sourceRevision: getHandbookSource({slug:'itsco'}).revision })).rejects.toMatchObject({ status: 409 });
    expect(conn.execute.mock.calls.some(([sql]) => sql.startsWith('DELETE'))).toBe(false);
  });
});
