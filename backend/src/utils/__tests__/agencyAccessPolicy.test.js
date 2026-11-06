import { describe, expect, it } from 'vitest';
import { applyAgencyAccess, resolveAgencyAccess, validateAgencyAccessPatch } from '../agencyAccessPolicy.js';
const profile = { role_baseline:'provider', permissions_baseline:{has_hiring_access:true,has_payroll_access:false},permissions_overrides:{} };
describe('agency access precedence and preservation',()=>{
 it('preserves existing grants when platform defaults have not been selected',()=>{
  const result=resolveAgencyAccess(profile,{enabled:false,role:'admin',permissions_json:{has_hiring_access:false}});
  expect(result.role).toBe('provider');expect(result.permissions.has_hiring_access).toBe(true);
  expect(result.sources.has_hiring_access).toBe('preserved_agency_access');
 });
 it('inherits only selected defaults and preserves unrelated permissions',()=>{
  const result=resolveAgencyAccess(profile,{enabled:true,role:'support',permissions_json:{has_payroll_access:true}});
  expect(result.role).toBe('support');expect(result.permissions.has_payroll_access).toBe(true);
  expect(result.permissions.has_hiring_access).toBe(true);expect(result.sources.has_payroll_access).toBe('platform_default');
 });
 it('lets explicit company Off override a platform On without changing the baseline',()=>{
  const copy=structuredClone(profile);copy.permissions_overrides={has_hiring_access:false};copy.role_override='staff';
  const result=resolveAgencyAccess(copy,{enabled:true,role:'admin',permissions_json:{has_hiring_access:true}});
  expect(result.role).toBe('staff');expect(result.permissions.has_hiring_access).toBe(false);
  expect(result.sources.has_hiring_access).toBe('agency_override');expect(copy.permissions_baseline.has_hiring_access).toBe(true);
 });
 it('accepts serialized database JSON and does not mistake a zero for On',()=>{
  const result=resolveAgencyAccess({...profile,permissions_baseline:JSON.stringify({has_hiring_access:'0'}),permissions_overrides:'{}'});
  expect(result.permissions.has_hiring_access).toBe(false);
 });
 it('preserves platform superadmin authority while changing a working role',()=>{
  const access=resolveAgencyAccess({...profile,role_override:'staff'});
  expect(applyAgencyAccess({role:'super_admin'},access).role).toBe('super_admin');
  expect(applyAgencyAccess({role:'admin'},access).role).toBe('staff');
 });
 it.each([{role:'super_admin',revision:1},{permissions:{unknown:true},revision:1},{permissions:{has_hiring_access:'false'},revision:1},{revision:1,agencyId:999},{permissions:[],revision:1},{role:'admin'}])('rejects forged or stale access input %j',input=>expect(()=>validateAgencyAccessPatch(input)).toThrow());
 it('accepts an explicit inheritance reset without treating it as Off',()=>expect(validateAgencyAccessPatch({role:null,permissions:{has_hiring_access:null},revision:1})).toMatchObject({permissions:{has_hiring_access:null}}));
});
