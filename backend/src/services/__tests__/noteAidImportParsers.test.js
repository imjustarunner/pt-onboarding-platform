import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inferScaleDirection, parseTreatmentPlanText } from '../treatmentPlanImport.service.js';
import { parseIntakeSections, parseIntakeDiagnoses } from '../intakeImport.service.js';

describe('treatmentPlanImport.service', () => {
  it('parses dated plan with ordered diagnoses, direction, and goals', () => {
    const text = `
Effective Date: 2026-03-15
Diagnosis: F41.1 Generalized Anxiety Disorder
Justification: Persistent worry interfering with school.
Diagnosis: F32.1 Major Depressive Disorder, Moderate
Discharge Plan: Step down to monthly sessions when scales improve.
Goal 1: Reduce anxiety
Objective 1: Use coping skills 4x/week (4 → 8 increase)
Measurement: Client self-report
Goal 2: Improve mood
Objective 1: Complete behavioral activation 3x/week 8 -> 3 decrease
`;
    const parsed = parseTreatmentPlanText(text);
    assert.equal(parsed.effectiveDate, '2026-03-15');
    assert.ok(parsed.diagnoses.length >= 2);
    assert.equal(parsed.diagnoses[0].icd10Code, 'F41.1');
    assert.equal(parsed.diagnoses[0].isPrimary, true);
    assert.match(String(parsed.dischargePlan || ''), /Step down/i);
    assert.ok(parsed.goals.length >= 2);
    const obj = parsed.goals[0].objectives[0];
    assert.equal(obj.scaleCurrent, 4);
    assert.equal(obj.scaleTarget, 8);
    assert.equal(obj.scaleDirection, 'increase');
    assert.equal(inferScaleDirection(8, 3), 'decrease');
  });
});

describe('intakeImport.service', () => {
  it('parses independent intake sections in source order', () => {
    const text = `
Presenting Problem: Anxiety at school
History of Present Illness: Started in fall.
Mental Status Examination: Alert, oriented x3.
Diagnosis: F41.1 GAD
Plan: Weekly therapy
`;
    const parsed = parseIntakeSections(text);
    assert.equal(parsed.sourceOrder[0], 'Presenting Problem');
    assert.ok(parsed.diagnoses.some((d) => d.code === 'F41.1'));
  });

  it('parses biopsychosocial sections, skips Content sub-header, and splits diagnoses', () => {
    const text = `
Presenting Problem
The client withdrew from school.

Objective
Content
The clinician conducted an intake interview with the client.

Psychiatric History
The client has received therapy before.

Diagnosis
F40.10 Social Anxiety Disorder
F41.8 Other Specified Anxiety Disorder
Z55.8 Other problems related to education and literacy

Diagnostic Justification
Primary social anxiety with school avoidance.

Plan
Weekly psychotherapy.
`;
    const parsed = parseIntakeSections(text);
    assert.ok(parsed.sections.some((s) => s.key === 'Psychiatric History'));
    const objective = parsed.sections.find((s) => s.key === 'Objective');
    assert.match(String(objective?.content || ''), /conducted an intake/i);
    assert.ok(!String(objective?.content || '').startsWith('Content'));
    assert.equal(parsed.diagnoses.length, 3);
    assert.equal(parsed.diagnoses[0].code, 'F40.10');
    assert.match(String(parsed.diagnoses[0].justification || ''), /social anxiety/i);
  });
});
