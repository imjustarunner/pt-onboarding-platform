import { it, expect } from 'vitest';
import { treatmentPlanRenewalStatus, DEFAULT_RENEWAL_POLICY } from '../treatmentPlanRenewal.js';
import { splitTreatmentPlanSections } from '../treatmentPlanSections.js';
import { treatmentPlanPrintHtml } from '../treatmentPlanPrint.js';
it('uses the effective date for flags and mandatory renewal, regardless of incidental edits', () => {
  const plan = { effective_date: '2026-06-16', updated_at: '2026-09-14' };
  expect(treatmentPlanRenewalStatus(plan, {}, '2026-09-14').required).toBe(true);
  expect(treatmentPlanRenewalStatus(plan, { forceUpdate: false }, '2026-09-14').required).toBe(false);
  expect(treatmentPlanRenewalStatus(plan, DEFAULT_RENEWAL_POLICY, '2026-09-01').flagged).toBe(true);
});
it('separates legacy plan narrative into ordinary sections', () => {
  expect(splitTreatmentPlanSections({ discharge_plan: 'Presenting Problem\nConcern.\n\nPrescribed Frequency of Treatment\nWeekly\n\nDischarge Criteria/Planning\nStable progress.' })).toEqual({ presentingProblem: 'Concern.', prescribedFrequency: 'Weekly', dischargePlan: 'Stable progress.' });
});
it('prints only selected clinical content and signatures with agency branding and escaped text', () => {
  const html = treatmentPlanPrintHtml({ agency: { name: 'Example Practice' }, logoUrl: 'https://example.test/logo.png', plan: { effective_date: '2026-09-14', planDiagnoses: [{ icd10_code: 'F00', description: 'Example diagnosis' }], goals: [{ goal_text: 'Daily functioning', objectives: [{ objective_text: '<script>unsafe</script>', interventions: ['Skills practice'], kiosk_prompt: 'Question that must not print', kiosk_prompt_verified_at: '2026-09-14' }] }, { goal_text: 'Superseded goal', superseded_at: '2026-09-01', objectives: [] }] } });
  expect(html).toContain('Example Practice');
  expect(html).toContain('logo.png');
  expect(html).toContain('Skills practice');
  expect(html).toContain('Provider signature');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('Superseded goal');
  expect(html).not.toContain('Question that must not print');
  expect(html).not.toContain('Share via kiosk');
});
