import { describe, it, expect } from 'vitest';
import { asqFieldCopy } from '../asqRespondentCopy.js';
import { withSchoolEnrollmentReview, pscReviewStatus } from '../schoolEnrollmentReview.js';
describe('respondent-specific safety questions', () => {
 it('keeps parent observations and patient answers distinct in both languages', () => {
  const field={key:'asq_3',instrument:'asq',label:'In the past few weeks, has your child been having thoughts about killing themselves?'};
  expect(asqFieldCopy(field,{locale:'en',self:false}).label).toBe(field.label);
  expect(asqFieldCopy(field,{locale:'es',self:false}).label).toContain('su hijo/a');
  expect(asqFieldCopy(field,{locale:'es',self:false}).helperText).toContain('observaciones');
  expect(asqFieldCopy(field,{locale:'es',self:true}).label).toBe('En la última semana, ¿ha estado pensando en suicidarse?');
  expect(asqFieldCopy(field,{locale:'en',self:true}).label).toContain('past week, have you');
  expect(asqFieldCopy(field,{locale:'es',self:true}).options.map(o=>o.value)).toEqual(['yes','no']);
  expect(asqFieldCopy({...field,instrument:'psc17'})).toBeNull();
 });
});
describe('school enrollment review', () => {
 it('adds review only to school enrollment, preserving standalone signing', () => {
  const steps=[{type:'communications'}];
  expect(withSchoolEnrollmentReview(steps,{school:true}).at(-1).type).toBe('school_review');
  expect(withSchoolEnrollmentReview(steps,{school:true,standalone:true})).toBe(steps);
  expect(withSchoolEnrollmentReview(steps,{school:false})).toBe(steps);
 });
 it('counts zero Never responses as completed without borrowing sibling answers', () => {
  const complete=Object.fromEntries(Array.from({length:17},(_,i)=>[`psc_${i+1}`,0]));
  expect(pscReviewStatus(complete)).toBe('PSC-17 complete');
  expect(pscReviewStatus({psc_1:0},'es')).toContain('1 de 17');
  expect(pscReviewStatus({})).toContain('no answers');
 });
});
