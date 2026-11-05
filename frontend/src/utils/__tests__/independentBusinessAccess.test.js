import { expect, it } from 'vitest';
import { ownsIndependentBusiness } from '../independentBusinessAccess.js';
const owner={id:4001,role:'provider'},practice={id:7001,organization_type:'life_coach',account_owner_user_id:4001,is_active:1,is_archived:0};
it('shows package billing only in the owned independent business while preserving the the employer employee role',()=>{
  expect(ownsIndependentBusiness(owner,7001,[practice,{id:7002,organization_type:'agency'}])).toBe(true);
  expect(ownsIndependentBusiness(owner,7002,[practice,{id:7002,organization_type:'agency'}])).toBe(false);
  expect(ownsIndependentBusiness({id:999,role:'provider'},7001,[practice])).toBe(false);
  expect(owner.role).toBe('provider');
});
it('does not show owner controls for an inactive business, membership or ordinary care agency',()=>{
  for(const change of [{is_active:0},{is_archived:1},{membership_active:0},{organization_type:'agency'},{account_owner_user_id:999}])expect(ownsIndependentBusiness(owner,7001,[{...practice,...change}])).toBe(false);
});
