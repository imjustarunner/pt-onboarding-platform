import {describe,it,expect} from 'vitest';
import {serviceLegalContext} from '../serviceLegalContext.js';
import {tenantLegalProfiles} from '../../content/tenantLegalProfiles.js';
import {legalDocumentsForProfile} from '../../content/tenantLegalDocuments.js';
describe('service-specific terms across tenant hosts',()=>{
 it('shows school terms for school staff on ITSCO without losing ITSCO notices',()=>{
  const context=serviceLegalContext({host:'app.itsco.health',role:'school_staff'});
  expect(context.name).toBe('SchoolCareBridge');
  expect(context.links.map(x=>x.href)).toContain('https://mh4kidz.org/schoolcarebridge/terms');
  expect(context.links.map(x=>x.href)).toContain('https://www.itsco.health/itsco/terms');
 });
 it.each([{host:'schoolcarebridge.org',organizationSlug:'arbitrary-school'},{host:'app.itsco.health',path:'/schoolcarebridge/app/test'},{host:'app.itsco.health',schoolPortal:true}])('keeps the school service identity in %j',input=>{
  expect(serviceLegalContext(input).name).toBe('SchoolCareBridge');
 });
 it('retains practice terms alongside AuricWell platform terms for clinical staff',()=>{
  const context=serviceLegalContext({host:'app.nextleveluplcc.com',role:'provider'});
  expect(context.name).toBe('AuricWell');
  expect(context.links.map(x=>x.href)).toContain('https://plottwisthq.com/auricwell/terms');
  expect(context.links.map(x=>x.href)).toContain('https://nextleveluplcc.com/nlu/terms');
 });
 it('publishes the education-record boundary and separates user notices from organization signatures',()=>{
  const docs=legalDocumentsForProfile(tenantLegalProfiles.schoolcarebridge);
  expect(JSON.stringify(docs.terms)).toContain('FERPA');
  expect(JSON.stringify(docs.terms)).toContain('does not execute a BAA');
  expect(JSON.stringify(docs.privacy||docs.privacypolicy)).toContain('donors');
 });
});
