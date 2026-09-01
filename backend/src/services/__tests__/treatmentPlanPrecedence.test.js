import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickAuthoritativeTreatmentPlan,
  presentingProblemFromPlan,
  resolvePrimaryDiagnosisForChart,
  isNoteAidPlanImport
} from '../treatmentPlanPrecedence.service.js';

test('pickAuthoritativeTreatmentPlan prefers note_aid_plan_import over intake draft', () => {
  const plans = [
    { id: 2, title: 'Intake Treatment Plan — 90791', source_tool_id: 'clinical_90791_intake_plan' },
    { id: 1, title: 'Imported Treatment Plan', source_tool_id: 'note_aid_plan_import' }
  ];
  const picked = pickAuthoritativeTreatmentPlan(plans);
  assert.equal(picked.id, 1);
  assert.equal(isNoteAidPlanImport(picked), true);
});

test('resolvePrimaryDiagnosisForChart uses plan primary + justification', () => {
  const diagnoses = [
    { id: 10, icd10_code: 'F41.1', is_primary: 1, is_active: 1, justification: 'From intake' },
    { id: 11, icd10_code: 'F41.8', is_primary: 0, is_active: 1, justification: null }
  ];
  const plan = {
    primary_diagnosis_id: 11,
    diagnostic_justification: 'From treatment plan'
  };
  const primary = resolvePrimaryDiagnosisForChart({ diagnoses, plan });
  assert.equal(primary.id, 11);
  assert.equal(primary.justification, 'From treatment plan');
  assert.equal(primary.is_primary, 1);
});

test('presentingProblemFromPlan reads discharge_plan block', () => {
  const plan = {
    discharge_plan: 'Presenting Problem\nAnxiety at school.\n\nPrescribed Frequency of Treatment\nWeekly'
  };
  assert.match(presentingProblemFromPlan(plan), /Anxiety at school/);
});
