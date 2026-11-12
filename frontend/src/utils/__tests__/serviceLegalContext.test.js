import {describe,it,expect} from 'vitest';
import {serviceLegalContext} from '../serviceLegalContext.js';
import {tenantLegalProfiles} from '../../content/tenantLegalProfiles.js';
import {legalDocumentsForProfile} from '../../content/tenantLegalDocuments.js';
describe('service-specific terms across tenant hosts',()=>{
 it('shows school terms for school staff on ITSCO without losing ITSCO notices',()=>{
  const context=serviceLegalContext({host:'app.itsco.health',role:'school_staff'});
  expect(context.name).toBe('SchoolCareBridge');
  expect(context.notice).toContain('stored through AuricWell');
  expect(context.links.map(x=>x.href)).toContain('https://auricwell.com/auricwell/privacypolicy');
  expect(context.links.map(x=>x.href)).toContain('https://schoolcarebridge.org/schoolcarebridge/terms');
  expect(context.links.map(x=>x.href)).toContain('https://www.itsco.health/itsco/terms');
 });
 it.each([{host:'schoolcarebridge.org',organizationSlug:'arbitrary-school'},{host:'app.itsco.health',path:'/schoolcarebridge/app/test'},{host:'app.itsco.health',schoolPortal:true}])('keeps the school service identity in %j',input=>{
  expect(serviceLegalContext(input).name).toBe('SchoolCareBridge');
 });
 it('retains practice terms alongside AuricWell platform terms for clinical staff',()=>{
  const context=serviceLegalContext({host:'app.nextleveluplcc.com',role:'provider'});
  expect(context.name).toBe('AuricWell');
  expect(context.links.map(x=>x.href)).toContain('https://auricwell.com/auricwell/terms');
  expect(context.links.map(x=>x.href)).toContain('https://nextleveluplcc.com/nlu/terms');
 });
 it.each([
  {host:'app.nextleveluplcc.com',path:'/nlu-qa-demo/tutoring-profile',role:'provider'},
  {host:'app.itsco.health',organizationSlug:'nlu-qa-demo',path:'/nlu-qa-demo/students',role:'provider'},
  {host:'auricwell.com',organizationSlug:'nlu',path:'/nlu/guardian',role:'client_guardian',serviceType:'tutoring'},
  {host:'app.itsco.health',organizationSlug:'nlu-qa-learning',path:'/nlu-qa-learning/childcare',role:'staff'}
 ])('uses NLU service notices without inherited clinical links for %j',input=>{
  const context=serviceLegalContext(input);
  expect(context.name).toBe('Next Level Up');expect(context.nonclinical).toBe(true);
  expect(context.links.every(link=>link.href.startsWith('https://nextleveluplcc.com/nlu/'))).toBe(true);
  expect(context.links.some(link=>/auricwell|platformhipaa/i.test(link.href))).toBe(false);
  expect(context.notice).toContain('does not grant access to clinical records');
 });
 it('publishes the education-record boundary and separates user notices from organization signatures',()=>{
  const docs=legalDocumentsForProfile(tenantLegalProfiles.schoolcarebridge);
  expect(JSON.stringify(docs.terms)).toContain('FERPA');
  expect(JSON.stringify(docs.terms)).toContain('does not execute a BAA');
  expect(JSON.stringify(docs.privacy||docs.privacypolicy)).toContain('donors');
 });
});
