import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GUARDIAN_WAIVER_ESIGN_KEY,
  GUARDIAN_WAIVER_SECTION_KEYS,
  computeAgeYearsFromDob,
  evaluateWaiverCompleteness,
  guardianWaiverSectionKeysFromLink,
  isDobAdultLocked,
  isSectionSatisfied,
  linkHasGuardianWaiverStep,
  resolveRequiredSectionKeys
} from '../guardianWaivers.utils.js';

test('resolveRequiredSectionKeys: null site and event => full default list', () => {
  const keys = resolveRequiredSectionKeys(null, null);
  assert.deepEqual(keys, GUARDIAN_WAIVER_SECTION_KEYS);
});

test('resolveRequiredSectionKeys: site JSON array wins', () => {
  const keys = resolveRequiredSectionKeys(JSON.stringify(['esignature_consent', 'pickup_authorization']), null);
  assert.deepEqual(keys, ['esignature_consent', 'pickup_authorization']);
});

test('resolveRequiredSectionKeys: event override wins over site', () => {
  const keys = resolveRequiredSectionKeys(JSON.stringify(['meal_preferences']), JSON.stringify(['emergency_contacts']));
  assert.deepEqual(keys, ['emergency_contacts']);
});

test('isSectionSatisfied: esign only', () => {
  const sections = { [GUARDIAN_WAIVER_ESIGN_KEY]: { status: 'active' } };
  assert.equal(isSectionSatisfied(GUARDIAN_WAIVER_ESIGN_KEY, sections), true);
  assert.equal(isSectionSatisfied('pickup_authorization', sections), false);
});

test('isSectionSatisfied: pickup requires active esign', () => {
  const sections = {
    [GUARDIAN_WAIVER_ESIGN_KEY]: { status: 'active' },
    pickup_authorization: { status: 'active' }
  };
  assert.equal(isSectionSatisfied('pickup_authorization', sections), true);
});

test('evaluateWaiverCompleteness: missing esign marks all non-esign as missing', () => {
  const sectionsJson = { pickup_authorization: { status: 'active', payload: {} } };
  const { complete, missing } = evaluateWaiverCompleteness(sectionsJson, [
    GUARDIAN_WAIVER_ESIGN_KEY,
    'pickup_authorization'
  ]);
  assert.equal(complete, false);
  assert.ok(missing.includes(GUARDIAN_WAIVER_ESIGN_KEY));
  assert.ok(missing.includes('pickup_authorization'));
});

test('computeAgeYearsFromDob: birthday not yet reached in reference year', () => {
  const asOf = new Date(Date.UTC(2025, 6, 1));
  const age = computeAgeYearsFromDob('2007-12-15', asOf);
  assert.equal(age, 17);
});

test('isDobAdultLocked: 18th birthday on as-of day counts as adult', () => {
  const asOf = new Date(Date.UTC(2025, 3, 10));
  assert.equal(isDobAdultLocked('2007-04-10', asOf), true);
});

test('isDobAdultLocked: unknown DOB is not locked', () => {
  assert.equal(isDobAdultLocked(null), false);
});

test('linkHasGuardianWaiverStep detects guardian_waiver step', () => {
  assert.equal(linkHasGuardianWaiverStep({ intake_steps: [{ type: 'document' }] }), false);
  assert.equal(linkHasGuardianWaiverStep({ intake_steps: [{ type: 'guardian_waiver' }] }), true);
});

test('guardianWaiverSectionKeysFromLink falls back to defaults', () => {
  const keys = guardianWaiverSectionKeysFromLink({ intake_steps: [{ type: 'guardian_waiver', sectionKeys: [] }] });
  assert.deepEqual(keys, GUARDIAN_WAIVER_SECTION_KEYS);
});
