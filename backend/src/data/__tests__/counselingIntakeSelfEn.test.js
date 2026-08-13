import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCounselingSelfEnSteps,
  flattenIntakeFields
} from '../counselingIntakeSelfEn.js';

describe('counseling self EN intake', () => {
  it('builds 14 pages with unique keys and wired symptom follow-ups', () => {
    const steps = buildCounselingSelfEnSteps();
    assert.equal(steps.length, 14);
    assert.deepEqual(steps.map((s) => s.label), [
      'About You',
      'What Brings You Here?',
      'How You Have Been Feeling',
      'How Life Is Going',
      'Mental Health & Treatment History',
      'Health, Medications & Substance Use',
      'Your Life & Your People',
      'Your History',
      'Safety',
      'What Helps You',
      'How You Want Therapy to Work',
      'What Do You Want to Change?',
      'Standard Questionnaires',
      'Anything We Missed?'
    ]);
    const keys = steps.flatMap((s) => (s.fields || []).map((f) => f.key).filter(Boolean));
    assert.equal(new Set(keys).size, keys.length);
    const feeling = steps.find((s) => s.id === 'counseling_self_how_feeling');
    const most = feeling.fields.find((f) => f.key === 'bothering_most');
    assert.deepEqual(most.showIf, { fieldKey: 'recent_symptoms', notEquals: 'none' });
    const cssrs = steps
      .find((s) => s.id === 'counseling_self_safety')
      .fields.filter((f) => f.instrument === 'cssrs_screener');
    assert.equal(cssrs.length, 6);
    const questionnaires = steps.find((s) => s.type === 'clinical_questions');
    assert.equal(questionnaires.fields.some((f) => f.instrument === 'phq9'), true);
    assert.equal(questionnaires.fields.some((f) => f.instrument === 'gad7'), true);
    const flat = flattenIntakeFields(steps);
    assert.ok(flat.length > 80);
  });
});
