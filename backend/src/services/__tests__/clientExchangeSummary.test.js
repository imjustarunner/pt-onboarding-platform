import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), clinical: vi.fn(), billing: vi.fn(), decrypt: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: mocks.clinical } }));
vi.mock('../billingReportIngest.service.js', () => ({ listBillingDiagnosesForClient: mocks.billing }));
vi.mock('../intakeResponsesEncryption.service.js', () => ({ decryptIntakeSubmissionRows: mocks.decrypt }));
import { loadClientExchangeSummary } from '../clientExchangeSummary.service.js';
beforeEach(() => { vi.clearAllMocks(); mocks.execute.mockResolvedValue([[]]); mocks.clinical.mockResolvedValue([[]]); mocks.billing.mockResolvedValue([]); });
it('uses active clinical diagnoses and latest plan over older intake', async () => {
  mocks.clinical.mockImplementation(async sql => [sql.includes('clinical_diagnoses') ? [{ icd10_code: 'F41.1', description: 'Anxiety' }] : [{ status: 'active', presenting_problem: 'Plan concern', updated_at: '2026-09-20' }]]);
  const summary = await loadClientExchangeSummary({ client: { id: 3, agency_id: 2, intake_preferences_json: { presentingConcern: 'Intake concern', submittedAt: '2026-08-01' } } });
  expect(summary).toMatchObject({ diagnoses: ['F41.1 — Anxiety'], presentingProblems: ['Plan concern'], presentingProblemSource: 'Treatment plan' });
  expect(mocks.billing).not.toHaveBeenCalled();
  expect(mocks.clinical.mock.calls.every(([, args]) => args[0] === 2 && args[1] === 3)).toBe(true);
});
it('decrypts intake before extracting concerns and uses billing diagnoses as a fallback', async () => {
  mocks.execute.mockResolvedValueOnce([[{ id: 6, client_id: 3, submitted_at: '2026-09-29', payload_encrypted: 'encrypted' }]]).mockResolvedValueOnce([[{ intake_submission_id: 6, client_id: 3 }]]);
  mocks.decrypt.mockImplementation(rows => { rows[0].intake_data = { responses: { clients: [{ main_reason_for_therapy: 'Latest intake' }] } }; });
  mocks.billing.mockResolvedValue([{ code: 'F43.2' }]);
  const summary = await loadClientExchangeSummary({ client: { id: 3, agency_id: 2 } });
  expect(summary).toMatchObject({ diagnoses: ['F43.2'], presentingProblems: ['Latest intake'], presentingProblemSource: 'Intake' });
});
it('tolerates unprovisioned clinical tables, but surfaces database failures', async () => {
  mocks.clinical.mockRejectedValue({ code: 'ER_NO_SUCH_TABLE' });
  expect((await loadClientExchangeSummary({ client: { id: 3, agency_id: 2 } })).diagnoses).toEqual([]);
  mocks.clinical.mockRejectedValue(new Error('Connection failed'));
  await expect(loadClientExchangeSummary({ client: { id: 3, agency_id: 2 } })).rejects.toThrow('Connection failed');
});
