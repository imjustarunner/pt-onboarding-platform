import { it, expect, vi } from 'vitest';
import { appGroupMemberPolicy,ensureAppGroupOwnership } from '../appGroupOwnership.service.js';
vi.mock('../googleWorkspaceDirectory.service.js',()=>({default:{}}));
import { ensureWorkspaceSenderGroup } from '../workspaceSenderGroup.service.js';
it('gives Michael ownership without email, and AI management with delivery',async()=>{
 const state=new Map();const admin={members:{get:vi.fn(async({memberKey})=>{if(!state.has(memberKey))throw {code:404};return {data:state.get(memberKey)};}),insert:vi.fn(async({requestBody})=>state.set(requestBody.email,requestBody)),update:vi.fn(async({requestBody})=>state.set(requestBody.email,requestBody))}};
 await ensureAppGroupOwnership({admin,groupKey:'g'});
 expect(state.get('michael@plottwistco.com')).toEqual({email:'michael@plottwistco.com',role:'OWNER',delivery_settings:'NONE'});
 expect(state.get('ai@plottwistco.com')).toEqual({email:'ai@plottwistco.com',role:'MANAGER',delivery_settings:'ALL_MAIL'});
 expect(admin.members.insert.mock.calls[0][0].requestBody.delivery_settings).toBe('NONE');
});
it('does not claim an unverified subscription change succeeded',async()=>{
 const admin={members:{get:vi.fn(async()=>({data:{role:'OWNER',delivery_settings:'ALL_MAIL'}})),update:vi.fn()}};
 await expect(ensureAppGroupOwnership({admin,groupKey:'g'})).rejects.toThrow('did not verify');
});
it('leaves ordinary members governed by their agency subscriptions',()=>expect(appGroupMemberPolicy('person@agency.test')).toBeNull());
it('new app senders are groups, with the owner and manager added',async()=>{
 const directory={getUser:vi.fn(async()=>null),getGroup:vi.fn(async()=>null),createGroup:vi.fn(async()=>({id:'g'})),addGroupMember:vi.fn()};
 await ensureWorkspaceSenderGroup({email:'forms@agency.test',displayName:'Forms',directory});
 expect(directory.createGroup).toHaveBeenCalledWith(expect.objectContaining({email:'forms@agency.test',whoCanJoin:'INVITED_CAN_JOIN'}));
 expect(directory.addGroupMember).toHaveBeenCalledWith(expect.objectContaining({memberEmail:'michael@plottwistco.com',role:'OWNER'}));
 expect(directory.addGroupMember).toHaveBeenCalledWith(expect.objectContaining({memberEmail:'ai@plottwistco.com',role:'MANAGER'}));
});
it('does not replace real user accounts or quietly adopt a user alias',async()=>{
 const directory={getGroup:vi.fn(async()=>{throw {code:403};}),getUser:vi.fn(async()=>({primaryEmail:'person@agency.test'})),createGroup:vi.fn()};
 expect(await ensureWorkspaceSenderGroup({email:'person@agency.test',directory})).toEqual({existingUser:true});
 await expect(ensureWorkspaceSenderGroup({email:'alias@agency.test',directory})).rejects.toHaveProperty('code','APP_SENDER_ALIAS_CONFLICT');
 expect(directory.createGroup).not.toHaveBeenCalled();
});

it('resolves groups without querying the user endpoint, which rejects group IDs',async()=>{
 const directory={getGroup:vi.fn(async()=>({id:'g'})),getUser:vi.fn(),addGroupMember:vi.fn()};
 expect(await ensureWorkspaceSenderGroup({email:'portal@agency.test',directory})).toEqual({group:{id:'g'}});
 expect(directory.getUser).not.toHaveBeenCalled();
});
