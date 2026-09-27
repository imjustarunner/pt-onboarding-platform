import test from 'node:test';
import assert from 'node:assert/strict';
import Ratings from '../../models/clinical/ClinicalTreatmentObjectiveRating.model.js';
import clinicalPool from '../../config/clinicalDatabase.js';
test('loads prior ratings by service date and rater instead of latest entry time', async t => {
  const previous = { id: 12, scale_value: 4, date_of_service: '2026-09-01' };
  const execute = t.mock.method(clinicalPool, 'execute', async (sql, params) => {
    assert.match(sql, /date_of_service < \?/);
    assert.match(sql, /ORDER BY date_of_service DESC, rated_at DESC, id DESC/);
    assert.match(sql, /disposition = 'rated'/);
    assert.deepEqual(params, [11, 'other', 'other', 'Guardian', '2026-09-15']);
    return [[previous]];
  });
  assert.deepEqual(await Ratings.findPreviousSession({ objectiveId: 11, raterKind: 'other', raterLabel: 'Guardian', dateOfService: '2026-09-15' }), previous);
  assert.equal(execute.mock.callCount(), 1);
});
test('does not substitute an undated objective current score for session history', async t => {
  const execute = t.mock.method(clinicalPool, 'execute', async () => { throw new Error('Unexpected query'); });
  assert.equal(await Ratings.findPreviousSession({ objectiveId: 11 }), null);
  assert.equal(execute.mock.callCount(), 0);
});
