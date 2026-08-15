import { describe, it, expect } from 'vitest';
import {
  indicatedOfficeInstruments,
  instrumentIdForField,
  isOfficeHardRequiredField
} from '../officeQuestionnaireRecommend.js';

describe('officeQuestionnaireRecommend', () => {
  it('recommends PHQ-9 only when depression is indicated', () => {
    const none = indicatedOfficeInstruments({ recent_symptoms: ['none'] });
    expect(none.phq9).toBe(false);
    expect(none.gad7).toBe(false);
    const down = indicatedOfficeInstruments({ recent_symptoms: ['feeling_down'] });
    expect(down.phq9).toBe(true);
    expect(down.gad7).toBe(false);
  });

  it('recommends GAD-7 for anxiety and DAST/PTSD only from those answers', () => {
    const anxiety = indicatedOfficeInstruments({ recent_symptoms: ['worry_on_edge'] });
    expect(anxiety.gad7).toBe(true);
    expect(anxiety.dast10).toBe(false);
    expect(anxiety.pcptsd5).toBe(false);
    const drugs = indicatedOfficeInstruments({ other_substances: 'yes' });
    expect(drugs.dast10).toBe(true);
    expect(drugs.phq9).toBe(false);
    const trauma = indicatedOfficeInstruments({ trauma_experienced: 'yes' });
    expect(trauma.pcptsd5).toBe(true);
    expect(trauma.auditc).toBe(false);
  });

  it('keeps identity and safety as the only hard-required office fields', () => {
    expect(isOfficeHardRequiredField({ key: 'answers_misunderstood_what' })).toBe(false);
    expect(isOfficeHardRequiredField({ key: 'email_address' })).toBe(true);
    expect(isOfficeHardRequiredField({ key: 'safety_immediate_danger' })).toBe(true);
    expect(instrumentIdForField({ key: 'phq9_1' })).toBe('phq9');
  });
});
