import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
import { readFileSync } from 'node:fs';
import { nluLearningMeasures } from '../../data/nluLearningMeasures.js';
import { getOutcomeMeasure } from '../../data/outcomeMeasures.js';
import { scoreOutcomeMeasure } from '../outcomeMeasureScoring.js';
import { normalizePilotContext, assertPilotCatalogAgency, isNluAgency } from '../nluLearningAccess.service.js';
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
const student = getOutcomeMeasure('nlu-learning-student'), caregiver = getOutcomeMeasure('nlu-learning-caregiver');
const scores = (measure, answers) => scoreOutcomeMeasure(measure, answers).result;
const fill = value => Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`q${i+1}`, value]));
const task = { subject: 'reading_accuracy', task_family: 'synthetic-reading', task_form: 'A', difficulty: 'Synthetic level', unit: 'word', presented: '100', attempted: '80', correct: '60', support: 'independent', conditions: 'Synthetic first exposure' };
describe('NLU original pilot scoring', () => {
 it('keeps the 19/17 originals separate and labels every new instrument unvalidated', () => {
  const original = JSON.parse(readFileSync(new URL('../../content/nlu-learning-pilot/legacy-source.json', import.meta.url)));
  expect(original.student.items).toHaveLength(19); expect(original.caregiver.items).toHaveLength(17);
  expect(original.student.actualRawRange).toEqual([19,95]); expect(original.caregiver.actualRawRange).toEqual([17,85]);
  for (const m of nluLearningMeasures) { expect(m.validated).toBe(false); expect(m.ageRange).toEqual({min:8,max:17}); expect(m.version).toMatch(/^[a-f0-9]{20}$/); }
 });
 it.each([student, caregiver])('keeps distress and strengths separate in $id', measure => {
  const low = scores(measure, fill('0')), high = scores(measure, fill('4'));
  expect(low.total).toBeNull(); expect(high.total).toBeNull(); expect(high.band).toBeUndefined();
  expect(high.domains).toEqual({'Learning-related distress':4,'Regulation and support':4,'Learning participation':4});
  expect(low.domains['Learning-related distress']).toBe(0);
  expect(high.domainDetails['Learning-related distress'].direction).toBe('lower');
 });
 it('withholds only affected domain scores for missing or unobserved items, never zeros them', () => {
  const a = fill('4'); delete a.q1; a.q5 = 'not_observed';
  expect(scores(student,a)).toMatchObject({complete:false,missing:['q1'],unobserved:['q5'],total:null,domains:{'Learning-related distress':null,'Regulation and support':null,'Learning participation':4}});
  expect(scores(student,fill('not_observed'))).toMatchObject({complete:true,domains:{'Learning-related distress':null}});
 });
 it('rejects invalid frequency responses and unknown items', () => {
  for (const answers of [{q1:'5'}, {q1:4}, {q1:true}, {q13:'2'}]) expect(() => scores(student, answers)).toThrow();
 });
 it('calculates task accuracy and completion with different denominators', () => {
  const r=scores(getOutcomeMeasure('nlu-academic-observation'),task);
  expect(r).toMatchObject({complete:true,total:null,domains:{'Task accuracy (%)':75,'Task completion (%)':80}});
  expect(r.band).toBeUndefined();
 });
 it('distinguishes no attempts, no presentation and incomplete records', () => {
  const m=getOutcomeMeasure('nlu-academic-observation');
  expect(scores(m,{...task,attempted:'0',correct:'0'}).domains).toEqual({'Task accuracy (%)':null,'Task completion (%)':0});
  expect(scores(m,{...task,presented:'0',attempted:'0',correct:'0'}).domains).toEqual({'Task accuracy (%)':null,'Task completion (%)':null});
  expect(scores(m,{...task,task_form:''})).toMatchObject({complete:false,domains:{'Task accuracy (%)':null}});
 });
 it('rejects impossible counts, mismatched units, and malformed numeric answers', () => {
  const m=getOutcomeMeasure('nlu-academic-observation');
  for (const patch of [{attempted:'101'}, {correct:'81'}, {correct:'-1'}, {correct:'3.5'}, {correct:'1e2'}, {correct:1}, {correct:'10001'}, {unit:'question'}]) expect(() => scores(m,{...task,...patch})).toThrow();
 });
});
describe('pilot context and scope', () => {
 const valid={age:12,observedOn:'2026-01-15',respondentSeries:'caregiver_1',programConfirmed:true};
 it('requires the agreed age, date, program and caregiver identity', () => {
  expect(normalizePilotContext(caregiver,valid,{id:7})).toMatchObject({respondent:'caregiver',respondentSeries:'caregiver_1'});
  for (const patch of [{age:7},{age:18},{age:12.5},{age:'12'},{observedOn:'2026-02-30'},{observedOn:'2099-01-01'},{programConfirmed:false},{respondentSeries:'same'}]) expect(() => normalizePilotContext(caregiver,{...valid,...patch},{id:7})).toThrow();
 });
 it('derives observer identity from the authenticated recorder', () => {
  expect(normalizePilotContext(getOutcomeMeasure('nlu-academic-observation'), {...valid,respondentSeries:'someone-else'}, {id:7}).respondentSeries).toBe('observer:7');
 });
 it('verifies agency access and configured slug, never caller names', async () => {
  User.getAgencies.mockResolvedValue([{id:6}]);
  await expect(assertPilotCatalogAgency({id:7,role:'provider'},99)).rejects.toMatchObject({status:403});
  await expect(assertPilotCatalogAgency({id:7,role:'provider'},6)).resolves.toBeUndefined();
  pool.execute.mockResolvedValueOnce([[{id:6,slug:'nlu'}]]).mockResolvedValueOnce([[{id:99,slug:'itsco',name:'NLU'}]]);
  expect(await isNluAgency(6)).toBe(true); expect(await isNluAgency(99)).toBe(false);
 });
});

describe('NLU pilot Library resource', () => {
 it('is searchable source content for NLU only, with no onboarding assignment', async () => {
  const { referenceSource } = await import('../companyReferenceContent.js');
  const { trainingDefinitionsFor } = await import('../documentTrainingContent.js');
  const source = referenceSource({slug:'nlu'},'nlu-learning-pilot-guide');
  expect(source.sections).toHaveLength(8);
  expect(source.learningPurpose).toBe('reference-only');
  for(const slug of ['itsco','tisi','unknown']) expect(referenceSource({slug},'nlu-learning-pilot-guide',{packageAssigned:true})).toBeNull();
  expect(trainingDefinitionsFor({slug:'nlu'}).some(d=>d.documentKey==='nlu-learning-pilot-guide')).toBe(false);
 });
});

describe('offline exploratory study summary', () => {
 it('counts children rather than visits and separates respondent forms', async () => {
  const { summarizeNluPilotStudy } = await import('../nluPilotStudySummary.js');
  const first={participantCode:'P-001',measureId:student.id,version:student.version,administration:'self',age:12,observedOn:'2026-01-01',answers:fill('2')};
  const r=summarizeNluPilotStudy([first,{...first,observedOn:'2026-01-08',answers:fill('4')}]);
  expect(r.validated).toBe(false);expect(r.groups[0]).toMatchObject({participants:1,administrations:2});expect(r.groups[0].domains[0]).toMatchObject({mean:2,alphaExploratory:null});
  expect(()=>summarizeNluPilotStudy([first,first])).toThrow('Duplicate');
 });
 it('calculates alpha without treating it as proof of validity, and handles no variance', async () => {
  const {cronbachAlpha,summarizeNluPilotStudy}=await import('../nluPilotStudySummary.js');
  expect(cronbachAlpha([[0,0,0,0],[2,2,2,2],[4,4,4,4]])).toBeCloseTo(1);
  expect(cronbachAlpha([[2,2,2,2],[2,2,2,2]])).toBeNull();
  const rows=Array.from({length:30},(_,i)=>({participantCode:`P-${i}`,measureId:student.id,version:student.version,administration:'self',age:12,observedOn:'2026-01-01',answers:fill(String(i%5))}));
  expect(summarizeNluPilotStudy(rows).groups[0].domains[0].alphaExploratory).toBeCloseTo(1);
 });
});
