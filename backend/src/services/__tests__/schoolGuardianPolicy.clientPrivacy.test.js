import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { completedGuardianAccess } from '../enrollmentGuardianAccess.service.js';
const input = { clientId: 4, guardianUserId: 8,
  link: { access_enabled: 0, permissions_json: { pendingGuardianVerification: true, portalAccessDecision:'none' } } };

it.each([{ independent_client: 1 }, { latest_clinical_choice: 'client_restriction_requested' }])('preserves a recorded client privacy choice: %j', async choice => {
  const execute=vi.fn(async()=>[[choice]]);
  expect(await completedGuardianAccess(input,{execute})).toMatchObject({accessEnabled:false,permissionsJson:input.link.permissions_json});
  expect(execute.mock.calls[0][1]).toEqual([4,4,8]);
});
it('restores full care access when no client privacy restriction exists',async()=>{
  const result=await completedGuardianAccess(input,{execute:async()=>[[]]});
  expect(result).toMatchObject({accessEnabled:true,permissionsJson:{canViewDocs:true,canMessage:true,enrollmentAccessConfirmed:true,portalAccessDecision:'care'}});
  expect(input.link.permissions_json.pendingGuardianVerification).toBe(true);
});
it('checks privacy for new guardian links as well as existing ones',async()=>{
  expect(await completedGuardianAccess({...input,link:null},{execute:async()=>[[{independent_client:1}]]})).toMatchObject({accessEnabled:false});
});
it('keeps the client’s own self relationship separate from parent privacy choices',async()=>{
  const execute=vi.fn();
  const result=await completedGuardianAccess({...input,link:{relationship_type:'self',access_enabled:1,permissions_json:{}}},{execute});
  expect(result.accessEnabled).toBe(true);expect(execute).not.toHaveBeenCalled();
});
it('does not restore access if the privacy record cannot be checked',async()=>{
  await expect(completedGuardianAccess(input,{execute:async()=>{throw new Error('Privacy lookup unavailable');}})).rejects.toThrow('Privacy lookup unavailable');
});
