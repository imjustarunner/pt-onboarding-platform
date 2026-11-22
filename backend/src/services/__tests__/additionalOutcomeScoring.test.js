import { describe, it, expect } from 'vitest';
import { getOutcomeMeasure, outcomeMeasures } from '../../data/outcomeMeasures.js';
import { scoreOutcomeMeasure, measureItemVisible } from '../outcomeMeasureScoring.js';
import { familyOutcomeMeasure } from '../familySharingCatalog.js';
const score = (id, answers) => scoreOutcomeMeasure(getOutcomeMeasure(id), answers).result;
const q = (n, value, prefix = 'q') => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}${i + 1}`, String(value)]));
const initialId = 'nichq-vanderbilt-assessment-scale-parent-informant-vadrs';
const followId = 'vanderbilt-parent-follow-up';
const vanderbilt = follow => ({ informant: 'Synthetic caregiver', medication: '2', ...q(follow ? 18 : 47, 0), ...q(8, 1, 'p'), ...(follow ? q(12, 0, 'side') : {}) });
describe('edition-specific scoring', () => {
  it('compares identical Vanderbilt core scores across initial and follow-up while keeping other symptoms separate', () => {
    for (const id of [initialId, followId]) {
      const follow = id === followId;
      expect(score(id, vanderbilt(follow))).toMatchObject({ total: 0, average: 1, complete: true });
      const high = { ...vanderbilt(follow), ...q(follow ? 18 : 47, 3), ...q(8, 5, 'p'), ...(follow ? q(12, 3, 'side') : {}) };
      expect(score(id, high)).toMatchObject({ total: 54, average: 5, complete: true });
      delete high.p8;
      expect(score(id, high)).toMatchObject({ total: null, average: null, complete: false, missing: ['p8'] });
    }
  });
  it('only flags initial screening patterns when both symptoms and impaired performance meet published thresholds', () => {
    const answers = { ...vanderbilt(false), ...q(6, 2) };
    expect(score(initialId, answers).flags).toHaveLength(0);
    answers.p1 = '4';
    expect(score(initialId, answers).flags).toEqual([expect.objectContaining({ key: 'vanderbilt_1', urgent: false })]);
    const follow = { ...vanderbilt(true), side12: '1' };
    expect(score(followId, follow).total).toBe(0);
    expect(score(followId, follow).flags[0].key).toBe('perceptual_symptoms');
  });
  it('applies original ASRS item-specific shading and the four-response threshold', () => {
    expect(score('asrs', q(6, 0)).total).toBe(0);
    expect(score('asrs', q(6, 2))).toMatchObject({ total: 3, interpretation: expect.stringContaining('Fewer than four') });
    expect(score('asrs', { ...q(6, 2), q4: '3' })).toMatchObject({ total: 4, interpretation: expect.stringContaining('Four or more') });
    expect(score('asrs', q(6, 4)).total).toBe(6);
    expect(score('asrs', q(5, 4)).total).toBeNull();
    expect(getOutcomeMeasure('asrs').items.map(item => item.options.filter(option => option.shaded).map(option => option.value))).toEqual([['2','3','4'],['2','3','4'],['2','3','4'],['3','4'],['3','4'],['3','4']]);
  });
  it('reverse scores RSES using its original item order and gives no invented diagnostic bands', () => {
    const high = q(10, 3), low = q(10, 0);
    for (const i of [1,2,4,6,7]) { high[`q${i}`] = '0'; low[`q${i}`] = '3'; }
    expect(score('rses', high)).toMatchObject({ total: 30, complete: true });
    expect(score('rses', low)).toMatchObject({ total: 0, complete: true });
    expect(score('rses', high).band).toBeUndefined();
  });
  it.each([['phq-2',2,6], ['gad-2',2,6], ['phq-4',4,12], ['phq-8',8,24]])('%s scores its own item set', (id, n, max) => {
    expect(score(id, q(n, 0))).toMatchObject({ total: 0, complete: true });
    expect(score(id, q(n, 3))).toMatchObject({ total: max, complete: true });
    expect(score(id, q(n - 1, 3))).toMatchObject({ total: null, complete: false });
  });
  it.each(['phq-9-parent', 'phq-9-modified-teens', 'phq-9-adolescent'])('%s keeps supplementary items out of the symptom total and flags safety even on an incomplete form', id => {
    const answers = { ...q(9, 0), informant: 'Synthetic parent', past_year: '1', difficulty: '3', past_month: '1', lifetime_attempt: '1' };
    if (id !== 'phq-9-parent') delete answers.informant;
    expect(score(id, answers)).toMatchObject({ total: 0, complete: true });
    expect(score(id, answers).flags.filter(f => f.urgent)).toHaveLength(2);
    delete answers.q1;
    expect(score(id, answers)).toMatchObject({ total: null, complete: false });
    expect(score(id, answers).flags.filter(f => f.urgent)).toHaveLength(2);
  });
  it('does not apply youth self-report bands to the parent PHQ', () => {
    const r = score('phq-9-parent', { ...q(9,3), informant: 'Synthetic parent', past_year:'0',difficulty:'0',past_month:'0',lifetime_attempt:'0' });
    expect(r.total).toBe(27); expect(r.band).toBeUndefined();
  });
  it('requires only visible full-PHQ questions and clears stale nested branches', () => {
    const negative = { ...q(13,0,'s'), ...q(9,0,'d'), panic1:'0', anxiety1:'0', eating1:'0',eating2:'0',drinking:'0' };
    const { answers, result } = scoreOutcomeMeasure(getOutcomeMeasure('phq'), { ...negative, panicFollow1:'1', attack1:'1', anxietyFollow1:'2', eatingFrequency:'1',compensatory1:'1',compensatoryFrequency:'1',alcohol1:'1' });
    expect(answers).toEqual(negative);
    expect(result).toMatchObject({ total:null, complete:true, flags:[], domains: { 'Depression symptoms (0–27)':0, 'Physical symptoms reported as bothersome (of 13)':0 } });
    const positive = { ...negative,panic1:'1',...q(3,1,'panicFollow'),...q(11,1,'attack'),anxiety1:'2',...q(6,2,'anxietyFollow'),eating1:'1',eating2:'1',eatingFrequency:'1',...q(4,0,'compensatory'),compensatory2:'1',compensatoryFrequency:'1',drinking:'1',...q(5,1,'alcohol'),d9:'1' };
    const scored = score('phq',positive);
    expect(scored.complete).toBe(true); expect(scored.total).toBeNull();
    expect(scored.flags.map(f => f.key)).toEqual(expect.arrayContaining(['safety_follow_up','panic_review','eating_review','compensatory_review','alcohol_review']));
    expect(measureItemVisible(getOutcomeMeasure('phq').items.find(i => i.key === 'compensatoryFrequency'), positive)).toBe(true);
    delete positive.compensatoryFrequency;
    expect(score('phq',positive).missing).toContain('compensatoryFrequency');
  });
  it('makes reviewed measures assignable with an explicit respondent and leaves unreviewed variants unavailable', () => {
    for (const measure of outcomeMeasures) expect(familyOutcomeMeasure(measure.id)).toMatchObject({ id: measure.id, respondent: measure.respondent || 'self', version: measure.version });
    expect(familyOutcomeMeasure('asrs-5')).toBeUndefined();
    expect(familyOutcomeMeasure('sogs')).toBeUndefined();
  });
});
