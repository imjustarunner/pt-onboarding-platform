import { expect, it } from 'vitest';
import { latestPresentingProblem, intakePresentingProblems } from '../clientCareSummary.js';
import { buildExchangeEmail } from '../clientExchangeSummary.js';
it('uses the newest nonempty recorded concern, whether intake or treatment plan', () => {
  const plans = [{ status: 'active', updated_at: '2026-09-15', discharge_plan: 'Presenting Problem\nCurrent plan concern\n\nPrescribed Frequency\nWeekly' },
    { status: 'active', updated_at: '2026-09-20', presenting_problem: '' }];
  const intakes = [{ recordedAt: '2026-08-01', values: ['Older intake concern'] }];
  expect(latestPresentingProblem({ plans, intakes })).toMatchObject({ presentingProblems: ['Current plan concern'], presentingProblemSource: 'Treatment plan', presentingProblemUpdatedAt: '2026-09-15' });
  intakes.push({ recordedAt: '2026-09-29', values: ['New intake concern'] });
  expect(latestPresentingProblem({ plans, intakes }).presentingProblems).toEqual(['New intake concern']);
});
it('ignores draft/inactive plans and prefers a treatment plan on equal timestamps', () => {
  const plans = [{ status: 'draft', updated_at: '2026-10-01', presenting_problem: 'Draft' }, { status: 'inactive', updated_at: '2026-10-01', presenting_problem: 'Inactive' }, { status: 'active', updated_at: '2026-09-01', presenting_problem: 'Plan' }];
  expect(latestPresentingProblem({ plans, intakes: [{ recordedAt: '2026-09-01', values: ['Intake'] }] }).presentingProblems).toEqual(['Plan']);
  expect(latestPresentingProblem({ preferences: { presentingConcern: 'Office intake', submittedAt: '2026-09-02' } }).presentingProblems).toEqual(['Office intake']);
});
it('scopes multi-child intake answers and maps concern codes to their labels', () => {
  const row = { client_id: 11, intake_data: { responses: { submission: { presentingConcern: 'Shared unsafe concern' }, clients: [{ main_reason_and_concerns: 'Sibling concern' }, { presenting_concerns: ['worry'] }] } }, intake_steps: [{ fields: [{ key: 'presenting_concerns', options: [{ value: 'worry', label: 'Worry or anxiety' }] }] }] };
  expect(intakePresentingProblems({ row, clientId: 22, clientIds: [11, 22] })).toEqual(['Worry or anxiety']);
  expect(intakePresentingProblems({ row, clientId: 33, clientIds: [11, 22] })).toEqual([]);
});
it('reads flat self-intake and nested clinical responses', () => {
  expect(intakePresentingProblems({ row: { client_id: 11, intake_data: { submission: { clinicalResponses: { main_reason_for_therapy: 'Stress' } } } }, clientId: 11 })).toEqual(['Stress']);
});
it('includes diagnoses and problems in both email formats and escapes HTML', () => {
  const mail = buildExchangeEmail({ listing: { demographics: { ageBand: '12' }, diagnoses: [{ icd10_code: 'F41.1', description: 'Anxiety' }], presentingProblems: ['Worry <script>'], presentingProblemSource: 'Treatment plan', presentingProblemUpdatedAt: '2026-09-20' }, link: 'https://example.test/client-exchange?listingId=4&agencyId=2' });
  for (const body of [mail.text, mail.html]) { expect(body).toContain('F41.1 — Anxiety'); expect(body).toContain('Treatment plan'); expect(body).toContain('View client and claim'); }
  expect(mail.text).toContain('Age:\n- 12');
  expect(mail.html).toContain('<li style="white-space:pre-wrap">12</li>');
  expect(mail.html).toContain('Worry &lt;script&gt;'); expect(mail.html).not.toContain('<script>');
});
