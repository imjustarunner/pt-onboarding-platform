import {describe,it,expect} from 'vitest';
import {searchClinicalDiagnoses} from '../clinicalDiagnosisSearch.service.js';
import {isBillableDiagnosisCode} from '../clinicalDiagnosisCatalog.js';
describe('versioned CMS diagnosis search',()=>{
 it.each(['gene','generalized anx','anxeity','GAD','F41.1','F411'])('finds canonical generalized anxiety matches for %s',query=>{
  const result=searchClinicalDiagnoses(query,{dateOfService:'2026-11-09'});
  expect(result.items[0]).toEqual({code:'F41.1',description:'Generalized anxiety disorder'});
  expect(result.items.every(item=>isBillableDiagnosisCode(item.code,'2026-11-09'))).toBe(true);
 });
 it('searches all ICD chapters and ranks actual codes over fuzzy text matches',()=>{
  expect(searchClinicalDiagnoses('E119',{dateOfService:'2026-01-15'}).items[0].code).toBe('E11.9');
  expect(searchClinicalDiagnoses('ADHD',{dateOfService:'2026-11-09'}).items.every(item=>item.code.startsWith('F90.'))).toBe(true);
  expect(searchClinicalDiagnoses('depresssion',{dateOfService:'2026-11-09'}).items.some(item=>item.code==='F32.A')).toBe(true);
 });
 it('returns only the applicable edition, bounds results, and never invents an unknown match',()=>{
  expect(searchClinicalDiagnoses('F41',{dateOfService:'2026-01-15',limit:2})).toMatchObject({edition:{effectiveFrom:'2025-10-01'},items:expect.any(Array)});
  expect(searchClinicalDiagnoses('F41',{dateOfService:'2026-11-09',limit:2}).items).toHaveLength(2);
  expect(searchClinicalDiagnoses('zzzzzxyzzzzz',{dateOfService:'2026-11-09'}).items).toEqual([]);
  expect(()=>searchClinicalDiagnoses('F41',{dateOfService:'2020-01-01'})).toThrow('No ICD-10-CM edition');
 });
});
