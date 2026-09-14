import test from 'node:test';
import assert from 'node:assert/strict';
import { persistTreatmentPlanSections } from '../treatmentPlanSectionStorage.service.js';
import { splitTreatmentPlanSections } from '../treatmentPlanSections.service.js';
import ClinicalTreatmentPlan from '../../models/clinical/ClinicalTreatmentPlan.model.js';
import clinicalPool from '../../config/clinicalDatabase.js';

const sections = { presentingProblem: 'Ongoing coping difficulties.', prescribedFrequency: 'Weekly', dischargePlan: 'Sustained independent coping.' };
function database(missing = []) {
  const calls = [];
  let stored;
  return {
    calls, get stored() { return stored; },
    async execute(sql, values) {
      calls.push({ sql, values });
      const fields = sql.match(/SET (.*), updated_at = NOW\(\)/)?.[1].split(', ').map((field) => field.split(' = ')[0]);
      const absent = fields?.find((field) => missing.includes(field));
      if (absent) throw Object.assign(new Error(`Unknown column '${absent}' in 'field list'`), { code: 'ER_BAD_FIELD_ERROR' });
      if (fields) stored = Object.fromEntries(fields.map((name, i) => [name, values[i]]));
      return [{ insertId: 42 }];
    }
  };
}
for (const missing of [[], ['presenting_problem', 'prescribed_frequency'], ['presenting_problem'], ['prescribed_frequency']]) {
  test(`plan sections round-trip with missing columns: ${missing.join(', ') || 'none'}`, async () => {
    const db = database(missing);
    await persistTreatmentPlanSections(db, { planId: 42, agencyId: 7, clientId: 202, sections });
    assert.deepEqual(splitTreatmentPlanSections(db.stored), sections);
    assert.equal(db.calls.length, missing.length + 1);
    for (const call of db.calls) assert.deepEqual(call.values.slice(-3), [42, 7, 202]);
  });
}
test('unrelated database errors propagate without a compatibility write', async () => {
  let calls = 0;
  const error = Object.assign(new Error("Unknown column 'unrelated' in 'field list'"), { code: 'ER_BAD_FIELD_ERROR' });
  await assert.rejects(persistTreatmentPlanSections({ execute() { calls++; throw error; } }, { sections }), (actual) => actual === error);
  assert.equal(calls, 1);
});
test('creating a plan commits all sections, goal ratings and interventions on a legacy schema', async (t) => {
  const db = database(['presenting_problem', 'prescribed_frequency']);
  let committed = false;
  let rolledBack = false;
  Object.assign(db, { beginTransaction: async () => {}, commit: async () => { committed = true; }, rollback: async () => { rolledBack = true; }, release: () => {} });
  t.mock.method(clinicalPool, 'getConnection', async () => db);
  t.mock.method(ClinicalTreatmentPlan, 'findById', async () => ({ id: 42 }));
  await ClinicalTreatmentPlan.create({ agencyId: 7, clientId: 202, createdByUserId: 501, ...sections, goals: [{ goalText: 'Coping', objectives: [{ objectiveText: 'Improve coping', scaleCurrent: 8, scaleTarget: 3, scaleDirection: 'decrease', interventions: ['Mindfulness Training'] }] }] });
  assert.equal(committed, true);
  assert.equal(rolledBack, false);
  const planWrite = db.calls.findLast((call) => call.sql.startsWith('UPDATE clinical_treatment_plans'));
  assert.deepEqual(splitTreatmentPlanSections({ discharge_plan: planWrite.values[0] }), sections);
  assert.ok(db.calls.some((call) => call.sql.includes('scale_current, scale_target') && call.values.includes(8) && call.values.includes(3)));
  assert.ok(db.calls.some((call) => call.sql.includes('interventions_json') && call.values.includes('["Mindfulness Training"]')));
});
test('clearing frequency on a partial schema preserves the presenting problem and discharge plan', async (t) => {
  const db = database(['presenting_problem']);
  t.mock.method(clinicalPool, 'execute', db.execute.bind(db));
  t.mock.method(ClinicalTreatmentPlan, 'findById', async () => ({ id: 42, agency_id: 7, client_id: 202, presentingProblem: sections.presentingProblem, prescribed_frequency: 'Weekly', discharge_plan: sections.dischargePlan }));
  await ClinicalTreatmentPlan.updatePrescribedFrequency({ planId: 42, agencyId: 7, clientId: 202, prescribedFrequency: '' });
  assert.deepEqual(splitTreatmentPlanSections(db.stored), { ...sections, prescribedFrequency: '' });
});
