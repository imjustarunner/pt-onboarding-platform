import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hydrateOfficeQuestionnaireSteps } from '../officeQuestionnaireSteps.js';

describe('hydrateOfficeQuestionnaireSteps', () => {
  it('fills an empty office questionnaire with adult screens and adds PSC-17 for kids', () => {
    const steps = hydrateOfficeQuestionnaireSteps(
      [{ id: 'questionnaires', type: 'clinical_questions', label: 'Standard Questionnaires', fields: [] }],
      { isOffice: true }
    );
    const adult = steps.find((s) => String(s.audience || '') === 'self');
    const child = steps.find((s) => String(s.audience || '') === 'dependent');
    assert.ok(adult?.fields?.some((f) => String(f.key || '').startsWith('phq')));
    assert.ok(child?.fields?.some((f) => f.key === 'psc_1'));
    assert.equal(child.repeatPerClient, true);
  });

  it('does not invent a PSC-17 page on school packets', () => {
    const steps = hydrateOfficeQuestionnaireSteps(
      [{ id: 'questionnaires', type: 'questions', label: 'Questionnaires', fields: [] }],
      { isOffice: false }
    );
    assert.equal(steps.some((s) => (s.fields || []).some((f) => f.key === 'psc_1')), false);
  });

  it('replaces a dummy questionnaire page with real instruments', () => {
    const steps = hydrateOfficeQuestionnaireSteps(
      [{ id: 'questionnaires', type: 'clinical_questions', label: 'Standard Questionnaires', fields: [{ key: 'placeholder', type: 'info' }] }],
      { isOffice: true }
    );
    const adult = steps.find((s) => (s.fields || []).some((f) => String(f.key || '').startsWith('phq')));
    assert.ok(adult);
  });

  it('leaves an existing PSC-17 step in place', () => {
    const existing = {
      id: 'counseling_dep_questionnaires',
      type: 'questions',
      audience: 'dependent',
      fields: [{ key: 'psc_1', label: 'Fidgety, unable to sit still' }]
    };
    const steps = hydrateOfficeQuestionnaireSteps([existing], { isOffice: true });
    assert.equal(steps.filter((s) => (s.fields || []).some((f) => f.key === 'psc_1')).length, 1);
  });
});
