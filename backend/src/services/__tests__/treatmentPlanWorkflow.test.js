import test from 'node:test';
import assert from 'node:assert/strict';
import clinicalPool from '../../config/clinicalDatabase.js';
import ClinicalTreatmentPlan from '../../models/clinical/ClinicalTreatmentPlan.model.js';
import { normalizeRenewalPolicy, renewalStatus } from '../treatmentPlanRenewal.service.js';
import { splitTreatmentPlanSections } from '../treatmentPlanSections.service.js';
import { buildAnonymousRenewalContext, proposeTreatmentPlanUpdate } from '../treatmentPlanUpdater.service.js';
import { fillEmptyKioskPrompts, verifiedObjectiveQuestion } from '../kioskObjectivePrompt.service.js';

test('healthcare defaults require renewal on day 90, with configurable flags, deadlines and enforcement', () => {
  const policy = normalizeRenewalPolicy({ organization_type: 'clinical' });
  assert.equal(policy.forceUpdate, true);
  assert.equal(policy.renewAfterDays, 90);
  const plan = { effective_date: new Date('2026-06-16T00:00:00Z'), updated_at: '2026-09-14' };
  assert.equal(renewalStatus(plan, policy, '2026-09-13').expired, false);
  assert.equal(renewalStatus(plan, policy, '2026-09-14').required, true);
  assert.equal(renewalStatus(plan, { ...policy, forceUpdate: false }, '2026-09-14').required, false);
  assert.equal(renewalStatus({ effective_date: '2026-09-01' }, { ...policy, renewByDate: '2026-09-14' }, '2026-09-14').required, true);
  assert.equal(renewalStatus({ effective_date: '2026-09-14' }, { ...policy, renewByDate: '2026-09-14' }, '2026-09-14').required, false);
  assert.equal(normalizeRenewalPolicy({ organization_type: 'learning' }).forceUpdate, false);
});

test('legacy combined discharge content separates without losing narrative', () => {
  const sections = splitTreatmentPlanSections({ discharge_plan: 'Presenting Problem\nOngoing concerns.\n\nPrescribed Frequency of Treatment\nWeekly\n\nDischarge Criteria/Planning\nSustained progress.' });
  assert.deepEqual(sections, { presentingProblem: 'Ongoing concerns.', prescribedFrequency: 'Weekly', dischargePlan: 'Sustained progress.' });
  assert.equal(splitTreatmentPlanSections({ presenting_problem: 'Updated concern.', discharge_plan: 'Discharge criteria remain.' }).presentingProblem, 'Updated concern.');
});

const privatePlan = { id: 982345, client_id: 783456, presenting_problem: 'SyntheticName at 123 Test Street', diagnoses: [{ description: 'SyntheticName' }], goals: [{ goal_text: 'SyntheticName', objectives: [{ id: 77881, objective_text: 'SyntheticName improves communication with spouse at ExampleCorp.', scale_current: 7, scale_target: 3, interventions: ['Role play'] }] }] };
const privateNote = { note_payload: JSON.stringify({ sections: { Subjective: 'SyntheticName reports unchanged communication with spouse; private@example.test, DOB 1982-12-10.', Objective: 'Observed practicing communication. 303-555-0199. 123 Test Street.' } }) };
test('renewal context contains only predefined themes, anonymous references and scales across the full chronology', () => {
  const context = buildAnonymousRenewalContext({ currentPlan: privatePlan, notes: Array(35).fill(privateNote), ratings: [{ objective_id: 77881, scale_value: 7 }, { objective_id: 77881, scale_value: 7 }], providerNarrative: 'Call SyntheticName at 303-555-0199 about communication.' });
  assert.equal(context.sessions.length, 35);
  assert.deepEqual(context.objectives[0].ratings, [7, 7]);
  assert.ok(context.sessions[0].subjective.languageCues.includes('mentions lack of change'));
  assert.ok(context.sessions[0].objective.themes.includes('communication'));
  const serialized = JSON.stringify(context);
  for (const text of ['SyntheticName', 'ExampleCorp', 'private@example.test', '1982', '303', '123', '77881', '982345', '783456']) assert.ok(!serialized.includes(text), text);
});

test('AI renewal request preserves local plan and attaches reviewable recommendations for every objective', async (t) => {
  t.mock.method(clinicalPool, 'execute', async (sql) => sql.includes('FROM clinical_notes') ? [[privateNote]] : [[{ objective_id: 77881, scale_value: 7 }]]);
  const result = await proposeTreatmentPlanUpdate({ agencyId: 9, clientId: 783456, currentPlan: privatePlan, providerNarrative: 'SyntheticName', generate: async ({ prompt }) => {
    assert.ok(!prompt.includes('SyntheticName'));
    assert.ok(!prompt.includes('77881'));
    assert.ok(prompt.includes('mentions lack of change'));
    return { text: JSON.stringify({ recommendation: 'Review barriers and consider practicing communication in session.', suggestedObjective: 'Practice communication strategies.', interventions: ['Communication rehearsal'] }) };
  } });
  assert.equal(result.proposed.goals[0].objectives[0].objectiveText, privatePlan.goals[0].objectives[0].objective_text);
  assert.equal(result.proposed.goals[0].objectives[0].scaleCurrent, 7);
  assert.match(result.proposed.goals[0].objectives[0].renewalRecommendation, /Review barriers/);
  assert.deepEqual(result.proposed.goals[0].objectives[0].interventions, ['Role play']);
});

test('question generation excludes source text and identifiers, and questions require separate verification', async () => {
  const [question] = await fillEmptyKioskPrompts({ clientName: 'SyntheticName', objectives: privatePlan.goals[0].objectives, generate: async ({ prompt }) => {
    for (const secret of ['SyntheticName', 'ExampleCorp', '77881']) assert.ok(!prompt.includes(secret));
    return { text: '{"items":[{"ref":"1","client":"How would you rate your communication with your partner on a scale of 1–10?","other":"How would you rate the client’s communication on a scale of 1–10?"}]}' };
  } });
  assert.match(question.kiosk_prompt, /^How would you rate/);
  assert.equal(verifiedObjectiveQuestion(question), '');
  const verified = { ...question, kiosk_prompt_verified_at: '2026-09-14', kiosk_prompt_verified_by: 3 };
  assert.equal(verifiedObjectiveQuestion(verified), question.kiosk_prompt);
  assert.equal(verifiedObjectiveQuestion(verified, true), '');
});

test('editing a question atomically revokes its verification', async (t) => {
  let query;
  t.mock.method(clinicalPool, 'execute', async (sql, params) => { query = { sql, params }; return [{ affectedRows: 1 }]; });
  await ClinicalTreatmentPlan.updateObjectiveKioskPrompts(88, { kioskPrompt: 'Revised question?' });
  assert.match(query.sql, /kiosk_prompt_verified_at = NULL/);
  assert.match(query.sql, /kiosk_prompt_verified_by = NULL/);
  assert.deepEqual(query.params, ['Revised question?', 88]);
  assert.doesNotMatch(query.sql, /kiosk_prompt_other_verified_at = NULL/);
});
