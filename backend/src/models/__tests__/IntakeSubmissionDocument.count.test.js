import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), decrypt: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../services/intakeResponsesEncryption.service.js', () => ({ decryptIntakeSubmissionRows: mocks.decrypt }));
import IntakeSubmissionDocument from '../IntakeSubmissionDocument.model.js';

beforeEach(() => vi.resetAllMocks());

it.each([false, true])('counts all matching documents without loading or decrypting records (restricted=%s)', async excludeMedicalRecords => {
  mocks.execute.mockResolvedValue([[{ count: '137' }]]);
  expect(await IntakeSubmissionDocument.countUnassigned({ agencyId: 2, excludeMedicalRecords })).toBe(137);
  const [sql, params] = mocks.execute.mock.calls[0];
  expect(sql).toContain('SELECT COUNT(*) AS count');
  expect(sql).not.toMatch(/payload_encrypted|signer_email|isd\.\*|LIMIT|ORDER BY/);
  expect(sql).toContain('isd.client_id IS NULL');
  expect(sql).toContain('isd.signed_pdf_path IS NOT NULL');
  expect(sql).toContain("il.scope_type = 'agency'");
  expect(sql).toContain('agency_schools');
  expect(sql).toContain('organization_affiliations');
  expect(params).toEqual([2, 2, 2]);
  expect(sql.includes("il.form_type != 'medical_records_request'")).toBe(excludeMedicalRecords);
  expect(mocks.decrypt).not.toHaveBeenCalled();
});

it('keeps the document list paginated and decrypted for the document-management page', async () => {
  const rows = [{ id: 4, signer_email: 'fixture@example.test' }];
  mocks.execute.mockResolvedValue([rows]);
  expect(await IntakeSubmissionDocument.listUnassigned({ agencyId: 2, limit: 25, offset: 50 })).toBe(rows);
  expect(mocks.execute.mock.calls[0][0]).toContain('LIMIT 25 OFFSET 50');
  expect(mocks.decrypt).toHaveBeenCalledWith(rows);
});
