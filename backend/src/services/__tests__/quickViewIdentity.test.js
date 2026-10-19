import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
import User from '../../models/User.model.js';
import { quickViewRequiresPassword, assertQuickViewAccountMatch } from '../quickViewIdentity.service.js';
const user = { id: 7, role: 'provider', password_hash: 'old-provisioned-hash' };
beforeEach(() => { vi.resetAllMocks(); User.getAgencies.mockResolvedValue([]); });
it('lets a verified Google session confirm without an app password, even with an old hash', async () => {
  expect(await quickViewRequiresPassword(user, { authMethod: 'google' })).toBe(false);
  expect(await quickViewRequiresPassword(user, { loginMethod: 'google' })).toBe(false);
});
it('recognizes required SSO policy for older sessions without a login-method claim', async () => {
  User.getAgencies.mockResolvedValue([{feature_flags:{googleSsoEnabled:true,googleSsoRequiredRoles:['provider']}}]);
  expect(await quickViewRequiresPassword(user)).toBe(false);
  expect(await quickViewRequiresPassword({...user,sso_password_override:1})).toBe(true);
  expect(await quickViewRequiresPassword({...user,login_is_group_email:1})).toBe(true);
});
it('keeps password confirmation for password accounts and fails closed on policy lookup errors', async () => {
  expect(await quickViewRequiresPassword(user)).toBe(true);
  User.getAgencies.mockRejectedValue(new Error('Policy unavailable'));
  await expect(quickViewRequiresPassword(user)).rejects.toThrow('Policy unavailable');
});
it('does not request a nonexistent password from passwordless accounts', async () => {
  expect(await quickViewRequiresPassword({...user,password_hash:null})).toBe(false);
});

it('allows an invitation reset only for its expected signed-in account',()=>{
 expect(()=>assertQuickViewAccountMatch({user:{id:7},body:{expectedUserId:7}})).not.toThrow();
 expect(()=>assertQuickViewAccountMatch({user:{id:99},body:{expectedUserId:7}})).toThrow('account named on this Provider Update');
 expect(()=>assertQuickViewAccountMatch({user:{id:7,switchedFromUserId:99},body:{expectedUserId:7}})).toThrow('own account');
 expect(()=>assertQuickViewAccountMatch({user:{id:7},body:{}})).not.toThrow();
});
