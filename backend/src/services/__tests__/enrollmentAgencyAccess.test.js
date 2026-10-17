import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
mock.module('../../models/User.model.js',{defaultExport:{getAgencies:async()=>[{id:5}]}});
const {assertEnrollmentAgencyMembership}=await import('../enrollmentAgencyAccess.service.js');
test('agency enrollment administrators can edit their own agency only',async()=>{
 for(const role of ['admin','support','staff']){
  await assertEnrollmentAgencyMembership({id:10,role},5);
  await assert.rejects(assertEnrollmentAgencyMembership({id:10,role},6),{status:403});
 }
 await assert.rejects(assertEnrollmentAgencyMembership(null,5),{status:403});
});
test('platform administrators can configure a newly added agency',async()=>{
 await assertEnrollmentAgencyMembership({id:1,role:'super_admin'},6);
});
