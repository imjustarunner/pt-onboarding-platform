import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  inferScaleDirection,
  parseDurationMonths,
  parseTreatmentPlanText,
  completionDateFromDurationMonths,
  isObjectiveScaleValid
} from '../treatmentPlanImport.service.js';
import { parseIntakeSections, parseIntakeDiagnoses } from '../intakeImport.service.js';

describe('treatmentPlanImport.service', () => {
  it('parses duration months and computes completion from today', () => {
    const d = parseDurationMonths('Estimated completion: 3 months');
    assert.ok(d);
    assert.equal(d.months, 3);
    assert.match(d.label, /3 months/);
    const iso = completionDateFromDurationMonths(3, new Date('2026-08-26T12:00:00Z'));
    assert.equal(iso, '2026-11-26');
  });

  it('flags objectives missing valid 1-10 scales', () => {
    assert.equal(isObjectiveScaleValid(9, 5), true);
    assert.equal(isObjectiveScaleValid(5, 5), false);
    assert.equal(isObjectiveScaleValid(11, 5), false);
  });

  it('parses dated plan with ordered diagnoses, direction, and goals', () => {
    const text = `
Effective Date: 2026-03-15
Diagnosis: F41.1 Generalized Anxiety Disorder
Justification: Persistent worry interfering with school.
Diagnosis: F32.1 Major Depressive Disorder, Moderate
Discharge Plan: Step down to monthly sessions when scales improve.
Goal 1: Reduce anxiety
Estimated completion: 4 months
Objective 1: Use coping skills 4x/week (4 → 8 increase)
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
    assert.equal(parsed.goals[0].durationMonths, 4);
    assert.ok(parsed.goals[0].projectedCompletion);
    const obj = parsed.goals[0].objectives[0];
    assert.equal(obj.scaleCurrent, 4);
    assert.equal(obj.scaleTarget, 8);
    assert.equal(obj.scaleDirection, 'increase');
    assert.equal(obj.scaleNeedsRewrite, false);
    assert.equal(inferScaleDirection(8, 3), 'decrease');
  });

  it('attaches stacked diagnosis names to each code, not the shared justification', () => {
    const text = `
Diagnosis
F41.1
Generalized Anxiety Disorder
F33.1
Major Depressive Disorder, Recurrent episode, Moderate

Diagnostic Justification
Shared narrative covering both diagnoses.

Goal 1: Reduce anxiety
Objective 1: Use coping skills 4x/week (4 → 8 increase)
`;
    const parsed = parseTreatmentPlanText(text);
    assert.equal(parsed.diagnoses.length, 2);
    assert.equal(parsed.diagnoses[0].icd10Code, 'F41.1');
    assert.match(String(parsed.diagnoses[0].description), /Generalized Anxiety/i);
    assert.equal(parsed.diagnoses[1].icd10Code, 'F33.1');
    assert.match(String(parsed.diagnoses[1].description), /Major Depressive/i);
    assert.match(String(parsed.diagnoses[0].justification || ''), /Shared narrative/i);
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

  it('parses stacked ICD-10 + description lines and Current Mental Status as MSE', () => {
    const text = `
Presenting Problem
The client reports a recent spiral into depression.

Current Mental Status
Orientation
X3: Oriented to Person, Place, and Time
General Appearance
Appropriate
Mood
Euthymic
Affect
Congruent

Risk Assessment
Patient denies all areas of risk.

Objective Content
The client consented to services.

Diagnosis
F41.1
Generalized Anxiety Disorder
F33.1
Major Depressive Disorder, Recurrent episode, Moderate

Diagnostic Justification
The client meets the criteria for Generalized Anxiety Disorder due to lifelong worry. Additionally, the client exhibits symptoms consistent with Major Depressive Disorder.

Plan
Resume weekly sessions.
`;
    const parsed = parseIntakeSections(text);
    const presenting = parsed.sections.find((s) => s.key === 'Presenting Problem');
    assert.match(String(presenting?.content || ''), /spiral into depression/i);
    assert.ok(!/Orientation/i.test(String(presenting?.content || '')));
    const mse = parsed.sections.find((s) => s.key === 'Mental Status Examination');
    assert.ok(mse);
    assert.match(String(mse.content), /Orientation: X3/i);
    assert.match(String(mse.content), /Mood: Euthymic/i);
    assert.equal(parsed.diagnoses.length, 2);
    assert.equal(parsed.diagnoses[0].code, 'F41.1');
    assert.match(String(parsed.diagnoses[0].description), /Generalized Anxiety/i);
    assert.equal(parsed.diagnoses[1].code, 'F33.1');
    assert.match(String(parsed.diagnoses[1].description), /Major Depressive/i);
    assert.match(String(parsed.diagnoses[0].justification), /meets the criteria/i);
    assert.equal(String(parsed.diagnoses[1].justification || ''), '');
  });
});
