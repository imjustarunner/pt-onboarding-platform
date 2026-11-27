import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyClinicalPlanStorage } from './check-clinical-plan-schema.mjs';

const target = { sourceCommit: 'a'.repeat(40), revision: 'onboarding-backend-g123a1' };
const version = () => ({
  buildId: target.sourceCommit, revision: target.revision, ready: true,
  clinicalTreatmentObjectiveDateSchema: { migration: '035_treatment_objective_target_dates', dataType: 'date', applied: true },
  clinicalPlanFrequencySchema: { migration: '039_preserve_imported_treatment_frequency', dataType: 'mediumtext', applied: false }
});

test('accepts the exact ready candidate with both verified clinical columns', () => {
  assert.deepEqual(verifyClinicalPlanStorage(version(), target), version());
});
test('accepts an already-applied date migration and a wider frequency column', () => {
  const value = version();
  value.clinicalTreatmentObjectiveDateSchema.applied = false;
  value.clinicalPlanFrequencySchema.dataType = 'longtext';
  assert.deepEqual(verifyClinicalPlanStorage(value, target), value);
});
test('rejects old, different or unready revisions even when schema metadata looks valid', () => {
  for (const patch of [{ buildId: 'b'.repeat(40) }, { revision: 'another-revision' }, { ready: false }]) {
    assert.throws(() => verifyClinicalPlanStorage({ ...version(), ...patch }, target), /not ready/);
  }
});
test('rejects missing or incompatible objective-date evidence before promotion', () => {
  for (const schema of [null, {}, { ...version().clinicalTreatmentObjectiveDateSchema, dataType: 'varchar' },
    { ...version().clinicalTreatmentObjectiveDateSchema, migration: '034_wrong_migration' },
    { ...version().clinicalTreatmentObjectiveDateSchema, applied: undefined }]) {
    assert.throws(() => verifyClinicalPlanStorage({ ...version(), clinicalTreatmentObjectiveDateSchema: schema }, target), /migration 035/);
  }
});
test('retains the frequency migration gate alongside the new date gate', () => {
  for (const schema of [null, { ...version().clinicalPlanFrequencySchema, dataType: 'varchar' },
    { ...version().clinicalPlanFrequencySchema, migration: '035_treatment_objective_target_dates' }]) {
    assert.throws(() => verifyClinicalPlanStorage({ ...version(), clinicalPlanFrequencySchema: schema }, target), /migration 039/);
  }
});
test('requires exact deployment identity rather than an abbreviated commit', () => {
  assert.throws(() => verifyClinicalPlanStorage(version(), { ...target, sourceCommit: 'abcdef123' }), /exact source commit/);
  assert.throws(() => verifyClinicalPlanStorage(version(), { ...target, revision: '' }), /candidate revision/);
});
