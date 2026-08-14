import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCounselingDependentEnSteps,
  mergeCounselingOfficeEnIntoSteps,
  COUNSELING_DEP_STEP_PREFIX
} from '../counselingIntakeDependentEn.js';
import { flattenIntakeFields, COUNSELING_SELF_STEP_PREFIX } from '../counselingIntakeSelfEn.js';

describe('counseling dependent EN intake', () => {
  it('builds consolidated family and child pages, review, and unique keys', () => {
    const steps = buildCounselingDependentEnSteps();
    assert.equal(steps.filter((s) => s.audience === 'guardian').length, 2);
    assert.equal(steps.filter((s) => s.type === 'upload').length, 1);
    const childPages = steps.filter((s) => s.audience === 'dependent' && s.type === 'questions');
    assert.equal(childPages.length, 10);
    assert.equal(steps.some((s) => s.type === 'child_review'), true);
    const substance = steps.find((s) => s.id === `${COUNSELING_DEP_STEP_PREFIX}substance`);
    assert.equal(substance.showWhen, 'substance_indicated');
    const about = steps.find((s) => s.id === `${COUNSELING_DEP_STEP_PREFIX}presenting`);
    const biggest = about.fields.find((f) => f.key === 'biggest_concern_now');
    assert.deepEqual(biggest.showIf, { fieldKey: 'presenting_concerns', notEquals: 'none_describe', minSelected: 2 });
    const other = about.fields.find((f) => f.key === 'presenting_concerns_other');
    assert.deepEqual(other.showIf, { fieldKey: 'presenting_concerns', includes: 'something_else' });
    const psc = steps
      .find((s) => s.id === `${COUNSELING_DEP_STEP_PREFIX}questionnaires`)
      .fields.filter((f) => String(f.key || '').startsWith('psc_'));
    assert.equal(psc.length, 17);
    assert.equal(psc[0].label, 'Fidgety, unable to sit still');
    assert.equal(psc[0].scope, 'client');
    const asq = steps
      .find((s) => s.id === `${COUNSELING_DEP_STEP_PREFIX}safety`)
      .fields.filter((f) => f.instrument === 'asq');
    assert.equal(asq.length, 5);
    const keys = steps.flatMap((s) => (s.fields || []).map((f) => f.key).filter(Boolean));
    assert.equal(new Set(keys).size, keys.length);
    const flat = flattenIntakeFields(steps);
    assert.ok(flat.some((f) => f.scope === 'guardian'));
    assert.ok(flat.some((f) => f.scope === 'client' && f.key === 'psc_1'));
  });

  it('merges with self pages and keeps packet steps', () => {
    const merged = mergeCounselingOfficeEnIntoSteps([
      { id: 'packet_informed_group_consent', type: 'packet_informed_group_consent', label: 'Informed' },
      { id: `${COUNSELING_SELF_STEP_PREFIX}old`, type: 'questions', fields: [] },
      { id: `${COUNSELING_DEP_STEP_PREFIX}old`, type: 'questions', fields: [] }
    ]);
    const selfCount = merged.filter((s) => String(s.id || '').startsWith(COUNSELING_SELF_STEP_PREFIX)).length;
    const depCount = merged.filter((s) => String(s.id || '').startsWith(COUNSELING_DEP_STEP_PREFIX)).length;
    assert.equal(selfCount, 9);
    assert.equal(depCount, 13);
    assert.equal(merged.some((s) => s.type === 'packet_informed_group_consent'), true);
    assert.equal(merged.some((s) => s.id === `${COUNSELING_DEP_STEP_PREFIX}old`), false);
  });
});
