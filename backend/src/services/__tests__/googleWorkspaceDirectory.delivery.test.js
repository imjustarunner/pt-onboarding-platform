import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../googleWorkspaceAuth.service.js', () => ({ buildImpersonatedJwtClient: vi.fn(), logGoogleUnauthorizedHint: vi.fn(), parseGoogleWorkspaceServiceAccountFromEnv: vi.fn(), GOOGLE_WORKSPACE_DIRECTORY_SCOPES: [], GOOGLE_WORKSPACE_GROUPS_SETTINGS_SCOPE: '' }));
import Directory from '../googleWorkspaceDirectory.service.js';
const get = vi.fn();
const update = vi.fn();
const patch = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Directory, 'getClient').mockResolvedValue({ members: { get, update, patch } });
  get.mockReset();
});
it('uses update, preserves role, and reads back actual delivery', async () => {
  get.mockResolvedValueOnce({ data: { role: 'MANAGER', delivery_settings: 'NONE' } }).mockResolvedValueOnce({ data: { role: 'MANAGER', delivery_settings: 'ALL_MAIL' } });
  const result = await Directory.setGroupMemberDeliverySettings({ groupEmail: 'school@example.org', memberEmail: 'staff@example.org', deliverySettings: 'ALL_MAIL' });
  expect(update).toHaveBeenCalledWith({ groupKey: 'school@example.org', memberKey: 'staff@example.org', requestBody: { email: 'staff@example.org', role: 'MANAGER', delivery_settings: 'ALL_MAIL' } });
  expect(patch).not.toHaveBeenCalled();
  expect(get).toHaveBeenCalledTimes(2);
  expect(result.delivery_settings).toBe('ALL_MAIL');
});
it('rejects a successful API call that did not change delivery', async () => {
  get.mockResolvedValue({ data: { role: 'MEMBER', delivery_settings: 'NONE' } });
  await expect(Directory.setGroupMemberDeliverySettings({ groupEmail: 'school@example.org', memberEmail: 'staff@example.org', deliverySettings: 'ALL_MAIL' })).rejects.toThrow('could not be verified');
});
it('keeps operational mail enabled when an older reconciliation requests NONE, without changing the existing role', async () => {
  get.mockResolvedValueOnce({data:{role:'MEMBER',delivery_settings:'NONE'}}).mockResolvedValueOnce({data:{role:'MEMBER',delivery_settings:'ALL_MAIL'}});
  const result=await Directory.setGroupMemberDeliverySettings({groupEmail:'STAFF@MH4KIDZ.COM',memberEmail:'michael@plottwistco.com',deliverySettings:'NONE'});
  expect(update).toHaveBeenCalledWith(expect.objectContaining({groupKey:'staff@mh4kidz.com',requestBody:{email:'michael@plottwistco.com',role:'MEMBER',delivery_settings:'ALL_MAIL'}}));
  expect(result.delivery_settings).toBe('ALL_MAIL');
});
it('does not enable unrelated owner group traffic', async () => {
  get.mockResolvedValue({data:{role:'OWNER',delivery_settings:'NONE'}});
  await Directory.setGroupMemberDeliverySettings({groupEmail:'portal@itsco.health',memberEmail:'michael@plottwistco.com',deliverySettings:'ALL_MAIL'});
  expect(update).toHaveBeenCalledWith(expect.objectContaining({requestBody:expect.objectContaining({role:'OWNER',delivery_settings:'NONE'})}));
});
it('uses the group address for subscriptions when creation returns an opaque ID', async () => {
  const state=new Map();
  const admin={groups:{insert:vi.fn(async()=>({data:{id:'123456789',email:'support@innerstrengthin.com'}}))},members:{
    get:vi.fn(async({memberKey})=>{if(!state.has(memberKey))throw {code:404};return {data:state.get(memberKey)};}),
    insert:vi.fn(async({requestBody})=>state.set(requestBody.email,requestBody)),
    update:vi.fn(async({requestBody})=>state.set(requestBody.email,requestBody))
  }};
  Directory.getClient.mockResolvedValue(admin);
  vi.spyOn(Directory,'applyGroupAccessSettings').mockResolvedValue({});
  await Directory.createGroup({email:'support@innerstrengthin.com',name:'Support'});
  expect(state.get('michael@plottwistco.com').delivery_settings).toBe('ALL_MAIL');
  expect(admin.members.insert).toHaveBeenCalledWith(expect.objectContaining({groupKey:'support@innerstrengthin.com',requestBody:expect.objectContaining({email:'michael@plottwistco.com',delivery_settings:'ALL_MAIL'})}));
});
it.each([undefined, '', 'bad'])('does not silently mute when delivery is %s', async deliverySettings => {
  await expect(Directory.setGroupMemberDeliverySettings({ groupEmail: 'school@example.org', memberEmail: 'staff@example.org', deliverySettings })).rejects.toThrow('explicit valid');
  expect(update).not.toHaveBeenCalled();
});
