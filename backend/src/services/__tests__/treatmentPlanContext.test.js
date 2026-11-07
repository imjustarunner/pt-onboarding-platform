import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTreatmentPlanText } from '../treatmentPlanImport.service.js';

test('retains supplied plan context and objective interventions without requiring a diagnosis code', () => {
  const parsed = parseTreatmentPlanText(`Presenting Problem: Difficulty coping with stress.
Diagnostic Justification: More assessment is needed to clarify the reported symptoms.
Prescribed Frequency: Weekly sessions.
Goal 1: Improve coping.
Objective 1.1: Practice a reviewed coping skill at least three times weekly.
Interventions 1.1: Cognitive Refocusing
Mindfulness Training
Discharge Plan: Independent use of coping strategies.`);
  assert.equal(parsed.presentingProblem, 'Difficulty coping with stress.');
  assert.equal(parsed.diagnosticJustification, 'More assessment is needed to clarify the reported symptoms.');
  assert.equal(parsed.prescribedFrequency, 'Weekly sessions.');
  assert.deepEqual(parsed.diagnoses, []);
  assert.deepEqual(parsed.goals[0].objectives[0].interventions, ['Cognitive Refocusing', 'Mindfulness Training']);
});
