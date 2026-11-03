import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCounselingSelfEnSteps } from '../counselingIntakeSelfEn.js';
import { buildCounselingDependentEnSteps, mergeCounselingOfficeEnIntoSteps } from '../counselingIntakeDependentEn.js';
import { buildCounselingCoupleEnSteps } from '../counselingIntakeCoupleEn.js';
import { buildCounselingFamilyEnSteps } from '../counselingIntakeFamilyEn.js';

describe('office counseling starts without clinical answers', () => {
  for (const [subject, build] of [
    ['self', buildCounselingSelfEnSteps],
    ['dependent', buildCounselingDependentEnSteps],
    ['couple', buildCounselingCoupleEnSteps],
    ['family', buildCounselingFamilyEnSteps]
  ]) {
    it(`leaves ${subject} ratings and history choices unanswered`, () => {
      const steps = build();
      const fields = steps.flatMap(step => step.fields || []);
      assert.ok(fields.length > 20);
      assert.deepEqual(fields.filter(field => field.defaultValue !== undefined).map(field => field.key), []);
      assert.ok(fields.some(field => field.options?.some(option => option.value === 'going_well')));
      assert.equal(steps.some(step => /start as Going well|for convenience/i.test(step.helperText || '')), false);
    });
  }

  it('keeps explicit deny-all actions while never applying them as initial answers', () => {
    for (const build of [buildCounselingSelfEnSteps, buildCounselingDependentEnSteps]) {
      const fields = build().flatMap(step => step.fields || []);
      const deny = fields.find(field => field.type === 'deny_all');
      assert.ok(deny);
      assert.ok(deny.denyAllKeys.length > 0);
      assert.equal(deny.defaultValue, undefined);
      const history = fields.filter(field => field.options?.some(option => /Deny all|None/i.test(option.label)));
      assert.ok(history.length > 0);
      assert.ok(history.every(field => field.defaultValue === undefined));
    }
  });

  it('replaces stale generated clinical defaults when rebuilding an office master', () => {
    const staleSteps = [{
      id: 'counseling_dep_daily_context',
      type: 'questions',
      audience: 'dependent',
      fields: [{ key: 'daily_sleep', type: 'radio', defaultValue: 'going_well' }]
    }];
    const rebuilt = mergeCounselingOfficeEnIntoSteps(staleSteps);
    const fields = rebuilt.flatMap(step => step.fields || []);
    assert.ok(rebuilt.some(step => step.id === 'counseling_dep_daily_context'));
    assert.ok(fields.every(field => field.defaultValue === undefined));
  });
});
