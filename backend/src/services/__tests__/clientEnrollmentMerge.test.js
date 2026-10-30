import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {}, onTableWrite: vi.fn() }));
import { authorizeClientMerge, assertCompatibleGuardianLinks, moveEnrollmentRecords } from '../clientEnrollmentMerge.service.js';

it('allows support to merge clients only in their own single agency', async () => {
  const deps = { db: { execute: vi.fn(async () => [[{ id: 1, agency_id: 450 }, { id: 2, agency_id: 450 }]]) }, users: { getAgencies: vi.fn(async () => [{ id: 450 }]) } };
  expect(await authorizeClientMerge({ id: 8, role: 'support' }, 1, [2], deps)).toBe(450);
  deps.users.getAgencies.mockResolvedValue([{ id: 2 }]);
  await expect(authorizeClientMerge({ id: 8, role: 'support' }, 1, [2], deps)).rejects.toHaveProperty('status', 403);
  deps.db.execute.mockResolvedValue([[{ id: 1, agency_id: 450 }, { id: 2, agency_id: 2 }]]);
  await expect(authorizeClientMerge({ id: 8, role: 'super_admin' }, 1, [2], deps)).rejects.toHaveProperty('status', 403);
  await expect(authorizeClientMerge({ id: 8, role: 'client_guardian' }, 1, [2], deps)).rejects.toHaveProperty('status', 403);
});
it('blocks incompatible guardian permissions instead of broadening access', () => {
  const link = { access_enabled: 1, relationship_type: 'guardian', permissions_json: { intakeLink: 10 } };
  expect(() => assertCompatibleGuardianLinks(link, { ...link, permissions_json: { intakeLink: 11 } })).not.toThrow();
  expect(() => assertCompatibleGuardianLinks(link, { ...link, access_enabled: 0 })).toThrow();
  expect(() => assertCompatibleGuardianLinks(link, { ...link, permissions_json: { noView: true } })).toThrow();
});
it('retains both guardians and moves every enrollment artifact without changing signers or files', async () => {
  const link = { guardian_user_id: 8, access_enabled: 1, relationship_type: 'guardian', permissions_json: {} };
  const db = { execute: vi.fn(async sql => sql.startsWith('SELECT') ? [[{ ...link, client_id: 1 }, { ...link, client_id: 2 }, { ...link, client_id: 2, guardian_user_id: 9 }]] : [{ affectedRows: 1 }]) };
  await moveEnrollmentRecords(db, 1, 2);
  expect(db.execute).toHaveBeenCalledWith('DELETE FROM client_guardians WHERE client_id = ? AND guardian_user_id = ?', [2, 8]);
  expect(db.execute).toHaveBeenCalledWith('UPDATE client_guardians SET client_id = ? WHERE client_id = ? AND guardian_user_id = ?', [1, 2, 9]);
  for (const table of ['intake_submissions', 'intake_submission_clients', 'intake_submission_documents', 'client_phi_documents']) {
    expect(db.execute).toHaveBeenCalledWith(`UPDATE ${table} SET client_id = ? WHERE client_id = ?`, [1, 2]);
  }
  const sql = db.execute.mock.calls.map(([query]) => query).join('\n');
  expect(sql).not.toMatch(/SET (guardian_user_id|signed_pdf_path|bundle_pdf_path|payload_encrypted)/);
});
it('propagates document-transfer failures so the caller rolls back instead of archiving a partial merge', async () => {
  const db = { execute: vi.fn(async sql => {
    if (sql.startsWith('SELECT')) return [[]];
    if (sql.startsWith('UPDATE intake_submission_documents')) throw new Error('storage unavailable');
    return [{ affectedRows: 1 }];
  }) };
  await expect(moveEnrollmentRecords(db, 1, 2)).rejects.toThrow('storage unavailable');
  expect(db.execute.mock.calls.some(([sql]) => sql.includes('DELETE FROM co_guardian'))).toBe(false);
});
