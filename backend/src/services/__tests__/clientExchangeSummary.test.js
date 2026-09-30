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

it('includes the newest finalized imported intake in latest-source selection', async () => {
  mocks.execute.mockImplementation(async sql => [sql.includes('client_intake_note_drafts') ? [{ status: 'final', note_sections_json_enc: JSON.stringify([{ key: 'Presenting Problem', body: 'New imported concern' }]), finalized_at: '2026-09-30' }] : []]);
  mocks.clinical.mockImplementation(async sql => [sql.includes('clinical_treatment_plans') ? [{ status: 'active', presenting_problem: 'Older plan', updated_at: '2026-09-20' }] : []]);
  const summary = await loadClientExchangeSummary({ client: { id: 3, agency_id: 2 } });
  expect(summary).toMatchObject({ presentingProblems: ['New imported concern'], presentingProblemSource: 'Intake' });
});
it('includes only explicitly imported pending intakes and labels review status', async () => {
  mocks.execute.mockImplementation(async sql => [sql.includes('client_intake_note_drafts') ? [
    { status: 'diagnosis_pending', session_context_enc: JSON.stringify({ source: 'client_creation_record_import' }), note_sections_json_enc: JSON.stringify([{ key: 'Presenting Problem', body: 'Imported concern' }]), updated_at: '2026-09-29' },
    { status: 'diagnosis_pending', note_sections_json_enc: JSON.stringify([{ key: 'Presenting Problem', body: 'Unreviewed generated content' }]), updated_at: '2026-09-30' }
  ] : []]);
  const summary = await loadClientExchangeSummary({ client: { id: 3, agency_id: 2 } });
  expect(summary).toMatchObject({ presentingProblems: ['Imported concern'], presentingProblemSource: 'Intake (review pending)' });
});
it('includes persisted scheduling preferences in the summary used for one-click posting', async () => {
  const schedule = { days: ['Wednesday'], periods: ['after_school'], windows: [{ day: 'Wednesday', start: '15:30', end: '17:00' }], timezone: 'America/Denver' };
  const summary = await loadClientExchangeSummary({ client: { id: 3, agency_id: 2, intake_preferences_json: JSON.stringify({ exchangeSchedule: schedule }) } });
  expect(summary.preferences.schedule).toEqual(schedule);
});
it('uses a minimal provider referral until newer clinical records are available', async () => {
  const summary = await loadClientExchangeSummary({ client: { id: 3, agency_id: 2, gender: 'female', intake_preferences_json: { exchangeReferral: { age: 9, diagnoses: 'F41.1', presentingProblem: 'Worry' }, preferredProviderGender: 'female' } } });
  expect(summary).toMatchObject({ demographics: { ageBand: '9', gender: 'female' }, diagnoses: ['F41.1'], presentingProblems: ['Worry'], presentingProblemSource: 'Referral', preferences: { providerGender: 'female' } });
});
