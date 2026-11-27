import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTreatmentPlanForEncounter, projectedGoalDeadline } from '../../../../frontend/src/utils/treatmentPlanEncounterEligibility.js';
import { objectiveTargetReached, ensureTreatmentPlanAchievementTask, queueSignedObjectiveAchievements } from '../treatmentPlanAchievement.service.js';
import { terminationObjectiveOutcomes, terminationChartContext, treatmentHistoryText } from '../noteAidTermination.service.js';
import { treatmentPlanApprovalState, treatmentPlanContentHash, attestTreatmentPlanProvider } from '../treatmentPlanApproval.service.js';
import { loadEncounterTreatmentPlanEligibility, assertEncounterTreatmentPlanEligibility } from '../treatmentPlanEncounterEligibility.service.js';
import ClinicalTreatmentPlan from '../../models/clinical/ClinicalTreatmentPlan.model.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import { loadTreatmentPlanReview } from '../narrivaTreatmentPlanReview.service.js';
import { loadClinicalMseHistory } from '../clinicalMseHistory.service.js';

const plan = { id: 10, agency_id: 4, client_id: 50, created_by_user_id: 8, status: 'active', effective_date: '2026-11-17', goals: [{ id: 20, goal_text: 'Synthetic coping goal', objectives: [{ id: 30, objective_text: 'Practice a coping skill', scale_start: 2, scale_target: 8, scale_direction: 'increase' }] }] };
test('encounter eligibility blocks missing/draft plans and permits the actual-date seven-day exception', () => {
  assert.equal(evaluateTreatmentPlanForEncounter({ plans: [], dateOfService: '2026-11-16' }).code, 'treatment_plan_required');
  assert.equal(evaluateTreatmentPlanForEncounter({ plans: [{ ...plan, status: 'draft' }], dateOfService: '2026-11-16' }).eligible, false);
  const yesterday = evaluateTreatmentPlanForEncounter({ plans: [plan], dateOfService: '2026-11-16' });
  assert.equal(yesterday.eligible, true); assert.equal(yesterday.planDate, '2026-11-17'); assert.equal(yesterday.dateOfService, '2026-11-16'); assert.equal(yesterday.lateByDays, 1);
  assert.equal(evaluateTreatmentPlanForEncounter({ plans: [plan], dateOfService: '2026-11-10' }).eligible, true);
  assert.equal(evaluateTreatmentPlanForEncounter({ plans: [plan], dateOfService: '2026-11-09' }).eligible, false);
  assert.equal(plan.effective_date, '2026-11-17');
});
test('a prior approved plan stays authoritative while a new revision is pending', () => {
  const prior = { ...plan, id: 9, effective_date: '2026-10-17' };
  assert.equal(evaluateTreatmentPlanForEncounter({ plans: [{ ...plan, status: 'draft' }, prior], dateOfService: '2026-11-16' }).planId, 9);
  assert.equal(evaluateTreatmentPlanForEncounter({ plans: [plan, prior], dateOfService: '2026-11-16' }).planId, 9);
});
test('agency review interval and unmet goal deadline each enforce expiry at the encounter date', () => {
  assert.equal(evaluateTreatmentPlanForEncounter({ plans: [plan], dateOfService: '2026-12-17', policy: { renewAfterDays: 30 } }).code, 'treatment_plan_expired');
  const short = { ...plan, goals: [{ projected_completion: '2 weeks', status: 'active' }] };
  assert.equal(evaluateTreatmentPlanForEncounter({ plans: [short], dateOfService: '2026-12-02', policy: { renewAfterDays: 90, forceUpdate: false } }).expiryReason, 'goal_timeframe');
  assert.equal(evaluateTreatmentPlanForEncounter({ plans: [plan], dateOfService: '2026-11-20', policy: { renewAfterDays: 30 } }).eligible, true);
  assert.equal(projectedGoalDeadline({ durationMonths: 1 }, '2026-01-31'), '2026-02-28');
  assert.equal(projectedGoalDeadline({ projected_completion: '2026-12-01', status: 'achieved' }, '2026-11-17'), null);
  assert.equal(evaluateTreatmentPlanForEncounter({ plans: [plan], dateOfService: '2026-02-30' }).code, 'treatment_plan_service_date_required');
});
test('server eligibility loads actual scoped chart plans and fails closed on no plan', async () => {
  const options = { agencyId: 4, clientId: 50, dateOfService: '2026-11-16', policyLoader: async () => ({ renewAfterDays: 90 }), planModel: { listByClient: async () => [{ id: 10, status: 'active' }], findById: async () => plan } };
  assert.equal((await loadEncounterTreatmentPlanEligibility(options)).eligible, true);
  await assert.rejects(assertEncounterTreatmentPlanEligibility({ ...options, planModel: { ...options.planModel, findById: async () => ({ ...plan, agency_id: 99 }) } }), { code: 'treatment_plan_required', status: 422 });
});
test('termination compares each objective by rater and preserves mixed evidence and unknown outcomes', () => {
  const outcomes = terminationObjectiveOutcomes([plan], [
    { id: 1, objective_id: 30, date_of_service: '2026-10-01', scale_value: 2, rater_kind: 'clinician' },
    { id: 2, objective_id: 30, date_of_service: '2026-11-01', scale_value: 5, rater_kind: 'clinician' },
    { id: 3, objective_id: 30, date_of_service: '2026-11-01', scale_value: 8, rater_kind: 'client' }
  ]);
  assert.equal(outcomes.length, 1); assert.equal(outcomes[0].comparisons.length, 2);
  assert.equal(outcomes[0].comparisons.find(item => item.rater.startsWith('clinician')).outcome, 'improved');
  assert.equal(outcomes[0].comparisons.find(item => item.rater.startsWith('client')).outcome, 'met');
  assert.match(terminationObjectiveOutcomes([plan], [])[0].evidenceGap, /do not invent/);
  assert.equal(terminationObjectiveOutcomes([plan], [{ objective_id: 30, scale_value: 9, disposition: 'deferred' }])[0].comparisons.length, 0);
});
test('termination identifies regression over time and avoids comparing changed target definitions', () => {
  const ratings = [{ objective_id: 30, id: 1, date_of_service: '2026-10-01', scale_value: 8, scale_target_at_rating: 8 }, { objective_id: 30, id: 2, date_of_service: '2026-11-01', scale_value: 5, scale_target_at_rating: 8 }];
  assert.equal(terminationObjectiveOutcomes([plan], ratings)[0].comparisons[0].outcome, 'regressed');
  ratings[0].scale_target_at_rating = 9;
  assert.equal(terminationObjectiveOutcomes([plan], ratings)[0].comparisons[0].outcome, 'not_comparable');
});
test('termination source retains presenting problem, distinct diagnoses, interventions and recommendations', () => {
  const p = { ...plan, presenting_problem: 'Documented presenting concern', diagnostic_justification: 'Plan rationale' };
  const notes = [{ id: 90, created_at: '2026-11-01', note_payload: JSON.stringify({ sections: { Interventions: 'Communication rehearsal', Plan: 'Continue the practiced strategy.' } }) }];
  const diagnoses = [{ id: 1, icd10_code: 'SYNTHETIC-A', justification: 'Rationale A', is_active: 1 }, { id: 2, icd10_code: 'SYNTHETIC-B', justification: 'Rationale B', is_active: 1 }];
  assert.equal(terminationChartContext({ plans: [p], notes, diagnoses }).diagnoses[1].justification, 'Rationale B');
  const text = treatmentHistoryText({ plans: [p], notes, diagnoses, ratings: [] });
  for (const value of ['Documented presenting concern', 'Rationale A', 'Rationale B', 'Communication rehearsal', 'Continue the practiced strategy.', 'EVERY historical goal']) assert.ok(text.includes(value));
});
test('an expired current plan cannot fall back to an older unexpired plan', () => {
  const older = { ...plan, id: 1, effective_date: '2026-10-01', goals: [] };
  const current = { ...plan, id: 2, effective_date: '2026-11-01', goals: [{ goal_text: 'Current goal', projected_completion: '2026-11-10', objectives: [] }] };
  const blocked = evaluateTreatmentPlanForEncounter({ plans: [older, current], dateOfService: '2026-11-16', policy: { renewAfterDays: 90 } });
  assert.equal(blocked.eligible, false); assert.equal(blocked.planId, 2); assert.equal(blocked.code, 'treatment_plan_expired');
  assert.equal(evaluateTreatmentPlanForEncounter({ plans: [older, current], dateOfService: '2026-10-20', policy: { renewAfterDays: 90 } }).planId, 1);
  const renewed = { ...plan, id: 3, effective_date: '2026-11-17', goals: [] };
  const allowed = evaluateTreatmentPlanForEncounter({ plans: [older, current, renewed], dateOfService: '2026-11-16', policy: { renewAfterDays: 90 } });
  assert.equal(allowed.eligible, true); assert.equal(allowed.planId, 3); assert.equal(allowed.latePlan, true);
});
test('plan approval always requires distinct actual provider and supervisor attestations on current content', () => {
  const base = { plan, contentHash: 'current', providerSignoff: { provider_user_id: 8, content_hash: 'current', signed_at: '2026-11-17' }, supervisorReview: { provider_user_id: 8, supervisor_user_id: 9, content_hash: 'current', outcome: 'approved' }, supervisorUserId: 9 };
  assert.equal(treatmentPlanApprovalState(base).ready, true); assert.equal(treatmentPlanApprovalState(base).quickSignEligible, false);
  assert.equal(treatmentPlanApprovalState({ ...base, providerSignoff: null }).ready, false);
  assert.equal(treatmentPlanApprovalState({ ...base, contentHash: 'changed' }).ready, false);
  assert.equal(treatmentPlanApprovalState({ ...base, supervisorReview: { ...base.supervisorReview, supervisor_user_id: 8 } }).ready, false);
  assert.equal(treatmentPlanApprovalState({ ...base, supervisorReview: { ...base.supervisorReview, outcome: 'changes_requested' } }).ready, false);
  assert.equal(treatmentPlanApprovalState({ ...base, providerSignoff: null }).legacyRecordOnFile, true);
});
test('plan approval hash ignores changing observations and client acknowledgment, but detects target edits', async () => {
  const hash = await treatmentPlanContentHash(plan);
  const changed = structuredClone(plan); changed.client_ack_status = 'signed'; changed.goals[0].objectives[0].scale_current = 6;
  assert.equal(await treatmentPlanContentHash(changed), hash);
  changed.goals[0].objectives[0].scale_start = 3;
  assert.notEqual(await treatmentPlanContentHash(changed), hash);
  changed.goals[0].objectives[0].scale_start = 2;
  changed.goals[0].objectives[0].scale_target = 9;
  assert.notEqual(await treatmentPlanContentHash(changed), hash);
});
test('provider signoff is explicit, attributed to the actual author, and never manufactured for another user', async () => {
  const calls = [], dependencies = { database: { execute: async (...args) => { calls.push(args); return [{ affectedRows: 1 }]; } }, requireCare: async () => {} };
  const input = { user: { id: 8, role: 'provider' }, plan, contentHash: await treatmentPlanContentHash(plan), reviewedAndAccurate: true };
  await attestTreatmentPlanProvider(input, dependencies); assert.equal(calls[0][1][3], 8);
  await assert.rejects(attestTreatmentPlanProvider({ ...input, user: { id: 9, role: 'super_admin' } }, dependencies), { status: 403 });
  await assert.rejects(attestTreatmentPlanProvider({ ...input, reviewedAndAccurate: false }, dependencies));
  assert.equal(calls.length, 1);
});
test('new plans stay pending even if a caller requests active status', async t => {
  const calls = [];
  t.mock.method(clinicalPool, 'getConnection', async () => ({ beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {}, execute: async (sql, params) => { calls.push({ sql, params }); return [{ insertId: 100, affectedRows: 1 }]; } }));
  t.mock.method(ClinicalTreatmentPlan, 'findById', async () => ({ id: 100, status: 'draft' }));
  await ClinicalTreatmentPlan.create({ agencyId: 4, clientId: 50, createdByUserId: 8, status: 'active' });
  assert.equal(calls.find(call => call.sql.includes('INSERT INTO clinical_treatment_plans')).params[6], 'draft');
});
test('goal achievement handles both scale directions and queues one automated to-do on retries', async () => {
  assert.equal(objectiveTargetReached({ value: 9, target: 8, direction: 'increase' }), true);
  assert.equal(objectiveTargetReached({ value: 2, target: 3, direction: 'decrease' }), true);
  assert.equal(objectiveTargetReached({ value: null, target: 3 }), false);
  let row = null, created;
  const dependencies = { database: { execute: async () => [[...(row ? [row] : [])]] }, taskModel: { create: async data => { created = data; row = { id: 44 }; return row; } } };
  const input = { agencyId: 4, clientId: 50, planId: 10, goalId: 20, objectiveId: 30, providerUserId: 8 };
  assert.equal((await ensureTreatmentPlanAchievementTask(input, dependencies)).taskId, 44);
  assert.equal((await ensureTreatmentPlanAchievementTask(input, dependencies)).deduped, true);
  assert.equal(created.assignedByUserId, null); assert.equal(created.metadata.source, 'narriva_goal_achievement');
});
test('unsigned observations never trigger achievement tasks', async () => {
  let calls = 0;
  assert.deepEqual(await queueSignedObjectiveAchievements({ id: 1 }, { database: { execute: async () => { calls++; return [[]]; } } }), []);
  assert.equal(calls, 0);
});
test('MSE history is scoped to the current client and approved signed snapshots and returns only findings', async () => {
  let query;
  const history = await loadClinicalMseHistory({ agencyId: 4, clientId: 50, dateOfService: '2026-11-16' }, { execute: async (sql, values) => {
    query = { sql, values };
    return [[{ id: 90, source_date: '2026-11-15', mse_json: JSON.stringify({ domains: { Appearance: { status: 'selected', option: 'Neat' } }, unknownPrivateField: 'Not an MSE field' }), note_payload: 'Do not return a whole note' }, { id: 91, source_date: '2026-11-18', mse_json: JSON.stringify({ allNormal: true }) }]];
  } });
  assert.deepEqual(query.values, [4, 50, '2026-11-16']);
  assert.match(query.sql, /provider_signed_at IS NOT NULL/);
  assert.match(query.sql, /r.id=h.effective_revision_id/);
  assert.match(query.sql, /privatePsychotherapyNote/);
  assert.equal(history.length, 1); assert.equal(history[0].noteId, 90);
  assert.ok(!JSON.stringify(history).includes('Not an MSE field')); assert.ok(!JSON.stringify(history).includes('whole note'));
});

test('clinical intervention edits are atomically scoped to the author and pending draft', async () => {
  const execute = clinicalPool.execute, calls = [];
  clinicalPool.execute = async (...args) => { calls.push(args); return [{ affectedRows: 1 }]; };
  try {
    assert.equal(await ClinicalTreatmentPlan.updateDraftObjectiveInterventions({ objectiveId: 30, agencyId: 4, clientId: 50, actorUserId: 8, interventions: [' CBT ', 'CBT'] }), true);
    assert.match(calls[0][0], /p\.status='draft'/); assert.match(calls[0][0], /p\.created_by_user_id=\?/);
    assert.deepEqual(calls[0][1], ['["CBT"]', 30, 4, 50, 8]);
    clinicalPool.execute = async () => [{ affectedRows: 0 }];
    assert.equal(await ClinicalTreatmentPlan.updateDraftObjectiveInterventions({ objectiveId: 30, agencyId: 4, clientId: 50, actorUserId: 8, interventions: [] }), false);
  } finally { clinicalPool.execute = execute; }
});


test('reads scoped documentation results for the signed plan version only', async () => {
  const contentHash = await treatmentPlanContentHash(plan);
  const completedAt = '2026-11-24T18:00:00Z';
  const result = { phase: 'treatment_plan', planId: plan.id, clientId: plan.client_id, scoring: { score: 90,
    criteria: [{ label: 'Goals', message: 'Present', status: 'supported' },
      { label: 'Discharge criteria', message: 'Record discharge criteria.', status: 'missing' }]
  } };
  const database = { execute: async (_sql, params) => {
    assert.deepEqual(params, [plan.agency_id, plan.created_by_user_id, 'treatment-plan-v1', contentHash]);
    return [[{ result_encrypted: JSON.stringify(result), completed_at: completedAt }]];
  } };
  assert.deepEqual(await loadTreatmentPlanReview(plan, contentHash, database), {
    score: 90, completedAt, missing: [{ label: 'Discharge criteria', message: 'Record discharge criteria.' }]
  });
  assert.equal(await loadTreatmentPlanReview({ ...plan, client_id: 51 }, contentHash, database), null);
  assert.equal(await loadTreatmentPlanReview(plan, contentHash, { execute: async () => [[]] }), null);
});
