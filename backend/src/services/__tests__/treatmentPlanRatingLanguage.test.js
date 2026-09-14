import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScalePair, parseTreatmentPlanText } from '../treatmentPlanImport.service.js';
import { parseNoteSections } from '../clinicalNoteSections.service.js';

const objective = 'Within 6 months, reduce time spent worrying from up to 2 hours daily to less than 30 minutes daily. The client currently rates their ability to manage worry as an 8 on a 10-point scale, where 10 represents constant, overwhelming worry and 1 represents full control over their thought process. The client will work to reduce this self-reported rating to a 3 or lower.';
test('rating language wins over time measurements and anchor definitions', () => {
  assert.deepEqual(parseScalePair(objective), { scaleCurrent: 8, scaleTarget: 3 });
  assert.deepEqual(parseScalePair('Moving from a current self-rated 4 to a target of 8 on a 10-point scale.'), { scaleCurrent: 4, scaleTarget: 8 });
  assert.deepEqual(parseScalePair('Within 6 months, reduce 2 hours to 30 minutes. On a 10-point scale, 10 means severe and 1 means minimal.'), { scaleCurrent: null, scaleTarget: null });
});
test('generated and imported plan sections retain each objective intervention', () => {
  const text = `Goal 1:\nImprove coping.\nObjective 1.1:\n${objective}\nInterventions 1.1:\nMindfulness Training\nCognitive Refocusing\nProjected Time to Completion 1:\n6 months\nDischarge Plan:\nSustained improvement.`;
  const sections = parseNoteSections(text, { intake: true });
  assert.equal(sections['Objective 1.1'], objective);
  assert.equal(sections['Interventions 1.1'], 'Mindfulness Training\nCognitive Refocusing');
  const imported = parseTreatmentPlanText(text);
  assert.equal(imported.goals[0].objectives[0].scaleCurrent, 8);
  assert.equal(imported.goals[0].objectives[0].scaleTarget, 3);
  assert.deepEqual(imported.goals[0].objectives[0].interventions, ['Mindfulness Training', 'Cognitive Refocusing']);
});
