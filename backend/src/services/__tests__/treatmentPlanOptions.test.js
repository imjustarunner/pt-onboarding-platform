import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import Frequency, { TREATMENT_FREQUENCIES } from '../../models/ClinicalTreatmentFrequency.model.js';
import { recommendObjectiveInterventions } from '../treatmentInterventionRecommendations.service.js';
import { CLINICAL_INTERVENTION_SEED } from '../../config/clinicalInterventionSeed.js';
import ClinicalEligibilityService from '../clinicalEligibility.service.js';
import { suggestObjectiveInterventions, addTreatmentFrequency } from '../../controllers/treatmentPlanOptions.controller.js';

test('AI recommendations use both goal and objective themes without source text or identifiers', async () => {
  const index = CLINICAL_INTERVENTION_SEED.indexOf('Mindfulness Training');
  const result = await recommendObjectiveInterventions({ goalText: 'SyntheticName improves communication at ExampleCorp.', objectiveText: 'SyntheticName manages intrusive thoughts. private@example.test 303-555-0199 1982-12-10', generate: async ({ prompt }) => {
    for (const secret of ['SyntheticName', 'ExampleCorp', 'private@example', '303-555', '1982-12']) assert.ok(!prompt.includes(secret));
    assert.ok(prompt.includes('communication'));
    assert.ok(prompt.includes('coping with intrusive thoughts'));
    return { text: JSON.stringify({ indices: [index, index, -1, 500, '1'], unsafeText: 'Not a catalog item' }) };
  } });
  assert.deepEqual(result.interventions, ['Mindfulness Training']);
});
test('insufficient anonymous context avoids an AI request and unsupported output is rejected', async () => {
  const result = await recommendObjectiveInterventions({ goalText: 'SyntheticName', objectiveText: 'Unspecified', generate: () => { throw new Error('Must not call AI'); } });
  assert.deepEqual(result.interventions, []);
  await assert.rejects(recommendObjectiveInterventions({ goalText: 'Manage worry', objectiveText: 'Manage worry', generate: async () => ({ text: '{"indices":[-1]}' }) }), /No usable/);
});
test('frequency options are persisted and queried only for the authenticated user and agency', async (t) => {
  const calls = [];
  t.mock.method(pool, 'execute', async (sql, params) => { calls.push({ sql, params }); return sql.startsWith('SELECT') ? [[{ name: 'Every six weeks' }]] : [{ affectedRows: 1 }]; });
  const result = await Frequency.add({ agencyId: 7, userId: 501, name: 'Every six weeks' });
  assert.deepEqual(calls[0].params, [7, 501, 'Every six weeks']);
  assert.match(calls[1].sql, /agency_id = \? AND user_id = \?/);
  assert.deepEqual(calls[1].params, [7, 501]);
  assert.deepEqual(result, [...TREATMENT_FREQUENCIES, 'Every six weeks']);
});
test('agency authorization failure prevents option writes and AI calls', async (t) => {
  const denied = new Error('Access denied');
  t.mock.method(ClinicalEligibilityService, 'ensureAgencyAccess', async () => { throw denied; });
  t.mock.method(Frequency, 'add', () => { throw new Error('Must not write'); });
  for (const handler of [addTreatmentFrequency, suggestObjectiveInterventions]) {
    let error;
    await handler({ method: 'POST', body: { agencyId: 7 }, user: { id: 501 } }, {}, (value) => { error = value; });
    assert.equal(error, denied);
  }
});
