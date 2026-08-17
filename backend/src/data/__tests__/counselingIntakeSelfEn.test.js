import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCounselingSelfEnSteps,
  flattenIntakeFields
} from '../counselingIntakeSelfEn.js';

describe('counseling self EN intake', () => {
  it('builds consolidated pages with unique keys and wired symptom follow-ups', () => {
    const steps = buildCounselingSelfEnSteps();
    assert.equal(steps.length, 7);
    assert.deepEqual(steps.map((s) => s.label), [
      'About You',
      'What Brings You Here?',
      'How You Feel & How Life Is Going',
      'History, Health & Substances',
      'Your Life & History',
      'Safety',
      'Standard Questionnaires'
    ]);
    const keys = steps.flatMap((s) => (s.fields || []).map((f) => f.key).filter(Boolean));
    assert.equal(new Set(keys).size, keys.length);

    const about = steps.find((s) => s.id === 'counseling_self_about_you');
    const zipIdx = about.fields.findIndex((f) => f.key === 'address_zip');
    const cityIdx = about.fields.findIndex((f) => f.key === 'address_city');
    assert.ok(zipIdx >= 0 && cityIdx > zipIdx);
    assert.equal(
      about.fields.find((f) => f.key === 'preferred_name')?.label,
      'If you prefer a different name, please enter it here.'
    );
    assert.ok(about.fields.some((f) => f.key === 'emergency_contact_name'));
    assert.equal(about.fields.some((f) => f.key === 'time_spent_doing'), false);

    const brings = steps.find((s) => s.id === 'counseling_self_what_brings_you');
    assert.ok(brings.fields.some((f) => f.key === 'readiness_0_10'));
    assert.ok(brings.fields.some((f) => f.key === 'know_before_first_session'));
    assert.equal(brings.fields.some((f) => f.key === 'help_with_first'), false);
    const affecting = brings.fields.find((f) => f.key === 'how_much_affecting');
    assert.equal(affecting.options.length, 11);

    const feeling = steps.find((s) => s.id === 'counseling_self_symptoms_and_life');
    const most = feeling.fields.find((f) => f.key === 'bothering_most');
    assert.deepEqual(most.showIf, { fieldKey: 'recent_symptoms', notEquals: 'none', minSelected: 2 });
    const lifeWork = feeling.fields.find((f) => f.key === 'life_work_school');
    assert.equal(lifeWork.defaultValue, 'going_well');

    const history = steps.find((s) => s.id === 'counseling_self_history_health');
    const alcoholIdx = history.fields.findIndex((f) => f.key === 'alcohol_use');
    const problemsIdx = history.fields.findIndex((f) => f.key === 'substance_causes_problems');
    const nicotineIdx = history.fields.findIndex((f) => f.key === 'nicotine_use');
    assert.ok(problemsIdx > alcoholIdx && problemsIdx < nicotineIdx);
    assert.ok(history.fields.some((f) => f.key === 'substance_causes_problems_which'));

    const life = steps.find((s) => s.id === 'counseling_self_life_and_history');
    assert.equal(life.fields.some((f) => f.key === 'relationships_major_stress'), false);
    assert.equal(life.fields.some((f) => f.key === 'caring_for_someone'), false);
    assert.equal(life.fields.some((f) => f.key === 'high_risk_work'), false);

    const safety = steps.find((s) => s.id === 'counseling_self_safety');
    const denyAll = safety.fields.find((f) => f.key === 'safety_deny_all');
    assert.ok(denyAll);
    assert.equal(denyAll.type, 'deny_all');
    assert.equal(denyAll.denyAllOverrides?.feel_physically_safe, 'yes');
    assert.ok(denyAll.denyAllKeys.includes('feel_physically_safe'));
    const cssrs = safety.fields.filter((f) => f.instrument === 'cssrs_screener');
    assert.equal(cssrs.length, 6);

    const questionnaires = steps.find((s) => s.type === 'clinical_questions');
    assert.equal(questionnaires.fields.some((f) => f.instrument === 'phq9'), true);
    assert.equal(questionnaires.fields.some((f) => f.instrument === 'gad7'), true);
    const flat = flattenIntakeFields(steps);
    assert.ok(flat.length > 60);
  });
});
