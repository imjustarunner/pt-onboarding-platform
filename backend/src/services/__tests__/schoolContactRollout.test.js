import {expect,it} from 'vitest';
import {isSchoolContactAgencyEnabled,isSchoolContactProviderEnabled,schoolContactDelivery} from '../schoolContactRollout.js';
const live={id:2,slug:'itsco',is_active:1,is_archived:0,feature_flags:{schoolContactPlanPilot:{enabled:true,providerIds:[8,465,477,567]}}};
it('admits precisely the approved live cohort while preserving exact QA isolation',()=>{
  for(const id of [8,465,477,567])expect(isSchoolContactProviderEnabled(live,id)).toBe(true);
  for(const id of [9,501,1433])expect(isSchoolContactProviderEnabled(live,id)).toBe(false);
  expect(isSchoolContactProviderEnabled({...live,id:450,slug:'auricwell-qa-demo'},1433)).toBe(true);
  for(const changed of [{id:3},{slug:'other'},{is_active:0},{is_archived:1},{feature_flags:{}},{feature_flags:{schoolContactPlanPilot:{enabled:true,providerIds:['8']}}}])expect(isSchoolContactAgencyEnabled({...live,...changed})).toBe(false);
});
it('keeps every QA destination sandboxed but preserves scoped live destinations and rejects other tenants',()=>{
  const recipients={to:'family@synthetic.test',cc:'support@synthetic.test',bcc:'provider@synthetic.test'};
  expect(schoolContactDelivery(450,recipients)).toEqual({to:'testing@itsco.health',cc:'testing@itsco.health',bcc:'testing@itsco.health'});
  expect(schoolContactDelivery(2,recipients)).toEqual(recipients);
  expect(()=>schoolContactDelivery(3,recipients)).toThrow('unavailable');
});

it('supports an assigned-school audience only for the explicitly enabled ITSCO tenant',()=>{
 const expanded={...live,feature_flags:{schoolContactPlanPilot:{enabled:true,audience:'assigned_school_providers'}}};
 expect(isSchoolContactProviderEnabled(expanded,1433)).toBe(true);
 expect(isSchoolContactAgencyEnabled({...expanded,id:3})).toBe(false);
 expect(isSchoolContactAgencyEnabled({...expanded,slug:'other'})).toBe(false);
});
