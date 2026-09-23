import {describe,it,expect} from 'vitest';
import {cleanProfile,publicProfile,matchesSearch,submissionErrors} from '../providerDirectoryProfile.service.js';
const valid=()=>cleanProfile({name:'Test Provider',credentials:'LPC',bio:'A synthetic biography with enough information for a profile review.',publicEmail:'public@example.com',languages:['English','Spanish'],specialties:['Anxiety'],virtual:true,inPerson:true,locations:[{city:'Denver',state:'CO',zip:'80205'}],licenses:[{state:'CO',type:'LPC',number:'PRIVATE123',expires:'2099-12-31'},{state:'NY',type:'LPC',number:'PRIVATE456',expires:'2099-12-31'}]});
const eligibility={heritageRequired:true,heritage:'Latina',optIn:true,verified:true};
describe('directory profile publication boundary',()=>{
 it('exposes only approved public fields, never draft, heritage, account credentials or license numbers',()=>{
  const result=publicProfile({id:9,email:'private@example.com',heritage:'Latina',password_hash:'hash',draft_json:{name:'Unapproved edit'},published_json:{...valid(),adminNotes:'secret',user_id:7,role:'admin'}});
  expect(result.name).toBe('Test Provider');expect(result.publicEmail).toBe('public@example.com');expect(result.licenses).toEqual([{state:'CO',type:'LPC'},{state:'NY',type:'LPC'}]);expect(JSON.stringify(result)).not.toMatch(/PRIVATE|secret|private@|Unapproved|user_id|heritage|password/);
 });
 it('rejects unsupported URL schemes and limits untrusted collections',()=>{
  const p=cleanProfile({website:'javascript:alert(1)',languages:['Spanish','Spanish'],licenses:Array(100).fill({state:'ZZ'}),locations:[{state:'ZZ'}],virtual:'true'});
  expect(p.website).toBe('');expect(p.languages).toEqual(['Spanish']);expect(p.licenses).toHaveLength(60);expect(p.locations[0].state).toBe('');expect(p.virtual).toBe(false);
 });
 it('requires verification, explicit opt-in and self-declared heritage for Latinx submission',()=>{
  expect(submissionErrors(valid(),eligibility)).toEqual([]);
  expect(submissionErrors(valid(),{...eligibility,verified:false,optIn:false,heritage:'Spanish speaking'})).toHaveLength(3);
  expect(submissionErrors(valid(),{...eligibility,heritageRequired:false,heritage:''})).toEqual([]);
 });
 it('requires usable care, public contact and current credentials',()=>{
  const p=valid();p.licenses[0].expires='2000-01-01';p.publicEmail='invalid';p.virtual=false;p.inPerson=false;
  const errors=submissionErrors(p,eligibility);expect(errors.join(' ')).toMatch(/current license/);expect(errors.join(' ')).toMatch(/care/);expect(errors.join(' ')).toMatch(/valid public email/);
 });
 it('filters virtual by licensed states and in-person by physical locations',()=>{
  const p=valid();expect(matchesSearch(p,{state:'NY',care:'virtual'})).toBe(true);expect(matchesSearch(p,{state:'NY',care:'inPerson'})).toBe(false);expect(matchesSearch(p,{state:'CA'})).toBe(false);expect(matchesSearch(p,{state:'CO',care:'inPerson',language:'Spanish',specialty:'Anxiety',search:'80205'})).toBe(true);expect(matchesSearch(p,{language:'French'})).toBe(false);
 });
});
