import { describe, it, expect } from 'vitest';
import { referenceDeadline, normalizeReferenceAnswers as normalizeLegacyAnswers, normalizeReferenceQuestionnaire, legacyReferenceQuestionnaire as referenceQuestionnaire } from '../hiringReferenceQuestionnaire.js';
const normalizeReferenceAnswers = body => normalizeLegacyAnswers(body, referenceQuestionnaire);
import { formatContractDate, jobLocationOffice } from '../contractPresentation.js';
const response = () => ({ referenceName:'A Reference', relationshipType:'manager', wouldHire:'yes', traits:Object.fromEntries(referenceQuestionnaire.traits.map(t => [t.key, 4])) });
describe('reference questionnaire', () => {
  it('uses the five requested dimensions for phone and online answers', () => { expect(Object.keys(normalizeReferenceAnswers(response()).traits)).toEqual(['trustworthy','independent','organized','capable','selfMotivated']); });
  it('allows unobserved work', () => { const body = response(); body.traits.independent = 'not_observed'; expect(normalizeReferenceAnswers(body).traits.independent).toBe('not_observed'); });
  it.each([0,6,2.5,true,'','strong',null])('rejects invalid rating %s', value => { const body = response(); body.traits.capable = value; expect(() => normalizeReferenceAnswers(body)).toThrow('Capable'); });
  it('requires a hiring recommendation and relationship description', () => { expect(() => normalizeReferenceAnswers({ ...response(), wouldHire:'' })).toThrow('hire'); expect(() => normalizeReferenceAnswers({ ...response(), relationshipType:'other' })).toThrow('relationship'); });
  it('does not copy arbitrary incoming fields', () => { expect(normalizeReferenceAnswers({ ...response(), agencyId:99 })).not.toHaveProperty('agencyId'); });
  it('defaults to five weekdays while retaining the time', () => { expect(referenceDeadline(new Date('2026-10-09T18:00:00Z')).toISOString()).toBe('2026-10-16T18:00:00.000Z'); expect(referenceDeadline(new Date('2026-10-10T18:00:00Z')).toISOString()).toBe('2026-10-16T18:00:00.000Z'); });
});
describe('contract presentation', () => {
  it('formats ISO dates without timezone day shifts', () => { expect(formatContractDate('2026-10-06')).toBe('October 6, 2026'); expect(formatContractDate('2026-02-30')).toBe('2026-02-30'); });
  it('defaults an office only for a unique city/state match', () => { const office = { id:1, city:'Colorado Springs', state:'CO' }; const job = { city:'colorado springs', state:'co' }; expect(jobLocationOffice([office],job)).toEqual(office); expect(jobLocationOffice([office,{...office,id:2}],job)).toBeNull(); expect(jobLocationOffice([office], {city:'Denver',state:'CO'})).toBeNull(); });
});

describe('prepared reference questions', () => {
  it('validates written answers against the saved questions', () => {
    const questionnaire = normalizeReferenceQuestionnaire({ ...referenceQuestionnaire, questions:[{key:'example',label:'Describe a deadline they managed.',required:true}] });
    expect(() => normalizeLegacyAnswers(response(), questionnaire)).toThrow('deadline');
    const answers = normalizeLegacyAnswers({...response(),customAnswers:{example:'They planned the handoff clearly.',ignored:'private'}}, questionnaire);
    expect(answers.customAnswers).toEqual({example:'They planned the handoff clearly.'});
    expect(normalizeReferenceAnswers(response()).traits).toEqual(response().traits);
  });
  it('rejects missing labels and duplicate question keys', () => {
    expect(() => normalizeReferenceQuestionnaire({...referenceQuestionnaire,traits:[{key:'same',label:'',question:'?'}]})).toThrow('title');
    expect(() => normalizeReferenceQuestionnaire({...referenceQuestionnaire,questions:[{key:'trustworthy',label:'Duplicate'}]})).toThrow('unique');
  });
});

import { referenceQuestionnaire as screenshotQuestions } from '../hiringReferenceQuestionnaire.js';
describe('reference questions from the approved example', () => {
  const answer = () => ({referenceName:'QA Reference',relationshipType:'manager',relationshipDuration:'1_2_years',strengths:'They communicate clearly and follow through.',traits:Object.fromEntries(screenshotQuestions.traits.map(t=>[t.key,4]))});
  it('uses the four specified areas and collects strengths and time known', () => {
    expect(screenshotQuestions.traits.map(t=>t.label)).toEqual(['Reliability & dependability','Communication','Teamwork & collaboration','Professionalism & judgment']);
    expect(normalizeLegacyAnswers(answer(),screenshotQuestions)).toMatchObject({questionnaireVersion:3,relationshipDuration:'1_2_years',strengths:answer().strengths,wouldHire:''});
  });
  it('requires the fields marked required in the example', () => {
    expect(()=>normalizeLegacyAnswers({...answer(),strengths:''},screenshotQuestions)).toThrow('strengths');
    expect(()=>normalizeLegacyAnswers({...answer(),relationshipDuration:''},screenshotQuestions)).toThrow('how long');
  });
});
