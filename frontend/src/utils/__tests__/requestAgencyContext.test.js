import {expect,it} from 'vitest';
import {requestAgencyId} from '../requestAgencyContext.js';

it('keeps an explicitly scoped request out of a different stored workspace',()=>{
  expect(requestAgencyId({headers:{'X-Agency-Id':'7'}},99)).toBe(7);
  expect(requestAgencyId({headers:{'x-agency-id':'7'}},99)).toBe(7);
  expect(requestAgencyId({headers:{get:()=> '7'}},99)).toBe(7);
  expect(requestAgencyId({params:{agencyId:7}},99)).toBe(7);
  expect(requestAgencyId({data:{agencyId:7}},99)).toBe(7);
  const form=new FormData();form.append('agencyId','7');
  expect(requestAgencyId({data:form},99)).toBe(7);
});
it('uses the navigation workspace only without a request tenant, and never rescues an invalid explicit tenant',()=>{
  expect(requestAgencyId({},99)).toBe(99);
  expect(requestAgencyId({data:{agencyId:'invalid'}},99)).toBeNull();
  expect(requestAgencyId({params:{agencyId:-7}},99)).toBeNull();
});
