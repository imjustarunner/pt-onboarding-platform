import {it,expect} from 'vitest';
import {clinicalMatchingSpecialties,specialtiesOverlap,hasExcludedSpecialty} from '../clientMatching.js';
it.each(['Major Depressive Disorder','MDD','F33.1 — Major depressive disorder, recurrent, moderate','F32.9'])('maps diagnosis %s to Depression and a compatible Mood Disorders specialty',diagnosis=>{
 const needs=clinicalMatchingSpecialties({diagnoses:[diagnosis]});expect(needs).toContain('Depression');expect(specialtiesOverlap(needs,['Depression'])).toBe(true);expect(specialtiesOverlap(needs,['Mood Disorders'])).toBe(true);expect(specialtiesOverlap(needs,['Bipolar Disorder'])).toBe(false);
});
it('understands structured diagnoses and common aliases without equating sibling conditions',()=>{
 expect(clinicalMatchingSpecialties({diagnoses:[{icd10_code:'F41.1',description:'Generalized anxiety disorder'}]})).toEqual(['Anxiety']);
 expect(clinicalMatchingSpecialties({presentingProblems:['PTSD and grief; ADHD']})).toEqual(expect.arrayContaining(['Trauma / PTSD','Grief & Loss','ADHD']));
 expect(specialtiesOverlap(['Bipolar Disorder'],['Depression'])).toBe(false);
 expect(hasExcludedSpecialty(['Depression'],['Mood Disorders'])).toBe(true);
 expect(hasExcludedSpecialty(['Depression'],['Bipolar Disorder'])).toBe(false);
});
it('does not turn negated, rule-out or family-history mentions into client needs',()=>{
 for(const text of ['No depression','Denies anxiety and depression','Rule out major depressive disorder','Family history of bipolar disorder'])expect(clinicalMatchingSpecialties({presentingProblems:[text]})).toEqual([]);
 expect(clinicalMatchingSpecialties({presentingProblems:['No depression, but anxiety is the presenting concern.']})).toEqual(['Anxiety']);
 expect(clinicalMatchingSpecialties({presentingProblems:['Trouble concentrating and feeling sad']})).toEqual([]);
});
it('does not mistake part of a specific diagnosis for a separate broad topic',()=>{
 expect(clinicalMatchingSpecialties({diagnoses:['post-traumatic stress disorder']})).toEqual(['Trauma / PTSD']);
 expect(clinicalMatchingSpecialties({diagnoses:['bipolar depression']})).toEqual(['Bipolar Disorder']);
});
it.each([['F43.10','Trauma / PTSD'],['F90.2','ADHD'],['F42.9','Obsessive-Compulsive Disorder (OCD)'],['F84.0','Autism Spectrum / Autism Support']])('maps recorded code %s to its profile topic', (code,topic)=>{
 expect(clinicalMatchingSpecialties({diagnoses:[code]})).toEqual([topic]);
});
it('leaves distinct conditions outside the curated code mapping unknown',()=>{
 expect(clinicalMatchingSpecialties({diagnoses:['F42.3','F84.3','F43.20']})).toEqual([]);
});
