import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCounselingCoupleEnSteps,
  COUNSELING_COUPLE_STEP_PREFIX
} from '../counselingIntakeCoupleEn.js';
import {
  buildCounselingFamilyEnSteps,
  COUNSELING_FAMILY_STEP_PREFIX
} from '../counselingIntakeFamilyEn.js';
import { mergeCounselingOfficeEnIntoSteps } from '../counselingIntakeDependentEn.js';
import {
  COUPLE_QUICK_CONCERN_OPTIONS,
  FAMILY_QUICK_CONCERN_OPTIONS
} from '../../constants/adaptiveQuickConcerns.js';

describe('counseling couple EN intake', () => {
  it('composes shared couple pages plus per-partner private safety', () => {
    const steps = buildCounselingCoupleEnSteps();
    assert.ok(steps.length >= 10);
    assert.ok(steps.some((s) => s.id === `${COUNSELING_COUPLE_STEP_PREFIX}about_relationship`));
    assert.ok(steps.some((s) => s.id === `${COUNSELING_COUPLE_STEP_PREFIX}what_brings_you`));
    assert.ok(steps.some((s) => s.id === `${COUNSELING_COUPLE_STEP_PREFIX}how_relationship_going`));
    assert.ok(steps.some((s) => s.id === `${COUNSELING_COUPLE_STEP_PREFIX}private_safety_1`));
    assert.ok(steps.some((s) => s.id === `${COUNSELING_COUPLE_STEP_PREFIX}private_safety_2`));
    const safety = steps.find((s) => s.id === `${COUNSELING_COUPLE_STEP_PREFIX}private_safety_1`);
    assert.equal(safety.privatePerPartner, true);
    assert.ok(safety.fields.every((f) => f.privateToRespondent === true || f.key?.startsWith('p1_')));
    const brings = steps.find((s) => s.id === `${COUNSELING_COUPLE_STEP_PREFIX}what_brings_you`);
    const concerns = brings.fields.find((f) => f.key === 'couple_concerns');
    assert.equal(concerns.options.length, COUPLE_QUICK_CONCERN_OPTIONS.length);
    const keys = steps.flatMap((s) => (s.fields || []).map((f) => f.key).filter(Boolean));
    assert.equal(new Set(keys).size, keys.length);
  });
});

describe('counseling family EN intake', () => {
  it('composes roster, functioning, and member-scoped pages', () => {
    const steps = buildCounselingFamilyEnSteps();
    assert.ok(steps.some((s) => s.id === `${COUNSELING_FAMILY_STEP_PREFIX}primary_contact`));
    assert.ok(steps.some((s) => s.type === 'family_roster' || s.id === `${COUNSELING_FAMILY_STEP_PREFIX}family_roster`));
    assert.ok(steps.some((s) => s.id === `${COUNSELING_FAMILY_STEP_PREFIX}how_family_doing`));
    assert.ok(steps.some((s) => s.audience === 'family_member' && s.repeatPerClient));
    const brings = steps.find((s) => s.id === `${COUNSELING_FAMILY_STEP_PREFIX}what_brings`);
    const concerns = brings.fields.find((f) => f.key === 'family_concerns');
    assert.equal(concerns.options.length, FAMILY_QUICK_CONCERN_OPTIONS.length);
  });
});

describe('office merge includes couple and family composition', () => {
  it('injects couple and family audiences without dropping self/dependent', () => {
    const merged = mergeCounselingOfficeEnIntoSteps([]);
    assert.ok(merged.some((s) => String(s.id || '').startsWith('counseling_self_')));
    assert.ok(merged.some((s) => String(s.id || '').startsWith('counseling_dep_')));
    assert.ok(merged.some((s) => String(s.id || '').startsWith(COUNSELING_COUPLE_STEP_PREFIX)));
    assert.ok(merged.some((s) => String(s.id || '').startsWith(COUNSELING_FAMILY_STEP_PREFIX)));
    assert.ok(merged.some((s) => s.type === 'provider_match'));
  });
});
