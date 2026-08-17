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
    assert.equal(steps.filter((s) => s.type === 'upload').length, 0);
    const childPages = steps.filter((s) => s.audience === 'dependent' && s.type === 'questions');
    assert.equal(childPages.length, 9);
    assert.equal(steps.some((s) => s.type === 'child_review'), true);
    assert.equal(steps.some((s) => String(s.id || '').includes('goals_prefs')), false);
    assert.equal(steps.some((s) => String(s.id || '').includes('anything_missed')), false);
    assert.ok(childPages.find((s) => s.id === `${COUNSELING_DEP_STEP_PREFIX}about_child`)
      ?.fields.some((f) => f.key === 'child_interests_and_strengths'));
    assert.ok(childPages.find((s) => s.id === `${COUNSELING_DEP_STEP_PREFIX}about_child`)
      ?.fields.some((f) => f.key === 'how_child_usually'));
    assert.ok(!childPages.find((s) => s.id === `${COUNSELING_DEP_STEP_PREFIX}about_child`)
      ?.fields.some((f) => f.key === 'describe_this_child' || f.key === 'child_interests'));
    const presenting = steps.find((s) => s.id === `${COUNSELING_DEP_STEP_PREFIX}presenting`);
    assert.ok(presenting.fields.some((f) => f.key === 'main_reason_and_concerns'));
    assert.ok(presenting.fields.some((f) => f.key === 'actually_helping'));
    assert.ok(!presenting.fields.some((f) => f.key === 'main_reason_seeking'));
    const health = steps.find((s) => s.id === `${COUNSELING_DEP_STEP_PREFIX}health_history`);
    assert.ok(!health.fields.some((f) => f.key === 'pregnancy_complications' || f.key === 'development_delays'));
    const prefsStep = steps.find((s) => s.id === `${COUNSELING_DEP_STEP_PREFIX}provider_prefs`);
    assert.ok(prefsStep.fields.some((f) => f.key === 'child_would_tell_provider'));
    assert.ok(!prefsStep.fields.find((f) => f.key === 'preferred_service_format')?.options
      ?.some((o) => o.value === 'school_based'));
    const substance = steps.find((s) => s.id === `${COUNSELING_DEP_STEP_PREFIX}substance`);
    assert.equal(substance.showWhen, 'substance_indicated');
    const aboutYou = steps.find((s) => s.id === `${COUNSELING_DEP_STEP_PREFIX}about_you`);
    assert.ok(!aboutYou.fields.some((f) => f.key === 'legal_authority' || f.key === 'custody_arrangement_notes'));
    assert.ok(!aboutYou.fields.some((f) => f.key === 'appointment_reminder_who'));
    const prefs = steps.find((s) => s.id === `${COUNSELING_DEP_STEP_PREFIX}scheduling_prefs`);
    assert.equal(prefs.type, 'reminder_contacts');
    const safetyDeny = steps
      .find((s) => s.id === `${COUNSELING_DEP_STEP_PREFIX}safety`)
      .fields.find((f) => f.key === 'safety_deny_all');
    assert.equal(safetyDeny.type, 'deny_all');
    assert.ok(Array.isArray(safetyDeny.denyAllKeys) && safetyDeny.denyAllKeys.includes('self_harm'));
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
    assert.equal(steps.some((s) => String(s.id || '').includes('emotional')), false);
    assert.equal(steps.filter((s) => String(s.id || '').includes('provider_prefs')).length, 1);
    const daily = steps.find((s) => s.id === `${COUNSELING_DEP_STEP_PREFIX}daily_context`);
    assert.equal(daily.fields.find((f) => f.key === 'school_name')?.type, 'school');
    assert.ok(!daily.fields.some((f) => f.key === 'child_school'));
  });

  it('merges with self pages and keeps packet steps', () => {
    const merged = mergeCounselingOfficeEnIntoSteps([
      { id: 'packet_informed_group_consent', type: 'packet_informed_group_consent', label: 'Informed' },
      { id: 'office_communications', type: 'communications', label: 'Communications' },
      { id: 'legacy_custody', type: 'upload', label: 'Upload custody documentation, if applicable' },
      { id: `${COUNSELING_SELF_STEP_PREFIX}old`, type: 'questions', fields: [] },
      { id: `${COUNSELING_DEP_STEP_PREFIX}old`, type: 'questions', fields: [] }
    ]);
    const selfCount = merged.filter((s) => String(s.id || '').startsWith(COUNSELING_SELF_STEP_PREFIX)).length;
    const depCount = merged.filter((s) => String(s.id || '').startsWith(COUNSELING_DEP_STEP_PREFIX)).length;
    assert.equal(selfCount, 7);
    assert.equal(depCount, 12);
    assert.equal(merged.some((s) => s.type === 'packet_informed_group_consent'), true);
    assert.equal(merged.some((s) => /custody/i.test(`${s.id || ''} ${s.label || ''}`)), false);
    const commsIdx = merged.findIndex((s) => s.type === 'communications');
    const familyIdx = merged.findIndex((s) => String(s.id || '').startsWith(COUNSELING_DEP_STEP_PREFIX) && s.audience === 'guardian');
    const prefsIdx = merged.findIndex((s) => String(s.id || '').includes('scheduling_prefs'));
    const providersIdx = merged.findIndex((s) => s.type === 'provider_match');
    const childIdx = merged.findIndex((s) => String(s.id || '').includes('about_child'));
    assert.ok(commsIdx > familyIdx && commsIdx < prefsIdx);
    assert.ok(prefsIdx < providersIdx && providersIdx < childIdx);
    assert.equal(merged[commsIdx].campaigns?.programUpdates, false);
  });
});
