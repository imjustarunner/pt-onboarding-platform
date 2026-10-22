import { expect, it } from 'vitest';
import { canAccessClientAccountSupport, canAccessMedicalBilling, canAccessBillingWorkspace } from '../../config/medicalBillingAccess.js';
it('support can manage accounts in its agency without enabling billing history, claims or the workspace',()=>{
  const user={role:'support',agencies:[{id:2,is_active:1}],billingAgencyIds:[]};
  expect(canAccessClientAccountSupport(user,2)).toBe(true);expect(canAccessClientAccountSupport(user,3)).toBe(false);
  expect(canAccessMedicalBilling(user,2)).toBe(false);expect(canAccessBillingWorkspace(user)).toBe(false);
});
it.each(['provider','provider_plus','staff','school_staff','client','client_guardian'])('does not expose the support panel to %s',role=>{
  expect(canAccessClientAccountSupport({role,agencies:[{id:2}]},2)).toBe(false);
});
it('requires active membership, ignores billing-only delegation, and accepts loaded membership IDs',()=>{
  expect(canAccessClientAccountSupport({role:'support',billingAgencyIds:[2]},2)).toBe(false);
  expect(canAccessClientAccountSupport({role:'support',agencies:[{id:2,is_active:0}]},2)).toBe(false);
  expect(canAccessClientAccountSupport({role:'admin'},2,[{id:2}])).toBe(true);
  expect(canAccessClientAccountSupport({role:'support',agencyIds:[2]},2)).toBe(true);
});
