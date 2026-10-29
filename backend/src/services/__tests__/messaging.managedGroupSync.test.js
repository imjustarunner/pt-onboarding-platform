import { beforeEach,it,expect,vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../googleWorkspaceDirectory.service.js',()=>({default:{isConfigured:()=>true,getClient:vi.fn(),listGroupMembers:vi.fn(),createGroup:vi.fn(),addGroupMember:vi.fn(),removeGroupMember:vi.fn(),applyGroupAccessSettings:vi.fn(),setGroupMemberDeliverySettings:vi.fn()}}));
vi.mock('../personalMailbox.service.js',()=>({ensurePersonalMailboxForAddress:vi.fn()}));
import pool from '../../config/database.js';
import Directory from '../googleWorkspaceDirectory.service.js';
import {reconcileManagedWorkspaceGroups,retryNewGroupPropagation} from '../managedWorkspaceGroups.service.js';
const staff={id:12,first_name:'Staff',email:'staff-person@itsco.health',personal_email:'personal@example.org',mailbox_emails:'staff-person@itsco.health',role:'provider',status:'ACTIVE_EMPLOYEE',is_active:1,is_archived:0,is_demo:0,membership_active:1,credential:'MA, LPCC'};
let roster,client;
beforeEach(()=>{
 vi.clearAllMocks();roster=[staff];
 pool.execute.mockImplementation(async sql=>{
  if(sql.includes('FROM agencies WHERE'))return [[{id:2,slug:'itsco',is_active:1,organization_type:'agency'}]];
  if(sql.includes('FROM user_agencies ua'))return [roster];
  return [[]];
 });
 client={users:{get:vi.fn(async()=>({data:{id:'user'}}))},groups:{get:vi.fn(async()=>({data:{id:'group'}}))}};
 Directory.getClient.mockResolvedValue(client);
 Directory.listGroupMembers.mockImplementation(async email=>email==='staff@itsco.health'?[{email:'staff-person@itsco.health',role:'MEMBER'},{email:'personal@example.org',role:'MEMBER'},{email:'ai@plottwistco.com',role:'MANAGER'}]:[]);
});
it('removes a known personal address while keeping the verified app/work mailbox',async()=>{
 const [report]=await reconcileManagedWorkspaceGroups();const group=report.groups.find(g=>g.email==='staff@itsco.health');
 expect(group.removed).toEqual(['personal@example.org']);expect(group.added).toEqual([]);expect(report.error).toBeNull();
 expect(Directory.removeGroupMember).not.toHaveBeenCalled();
});
it('removes inactive staff and moves a candidate out of the former intern group',async()=>{
 Directory.listGroupMembers.mockResolvedValue([{email:staff.email,role:'MEMBER'}]);
 let [report]=await reconcileManagedWorkspaceGroups();
 expect(report.groups.find(g=>g.email==='interns@itsco.health').removed).toEqual([staff.email]);
 expect(report.groups.find(g=>g.email==='prelicensed@itsco.health').removed).toEqual([]);
 roster=[{...staff,is_active:0}];[report]=await reconcileManagedWorkspaceGroups();
 expect(report.groups.find(g=>g.email==='staff@itsco.health').removed).toContain(staff.email);
});
it('reports missing relay managers without promoting them on existing groups',async()=>{
 Directory.listGroupMembers.mockResolvedValue([]);const [report]=await reconcileManagedWorkspaceGroups();
 expect(report.groups.every(g=>g.aiRole==='ABSENT')).toBe(true);expect(Directory.addGroupMember).not.toHaveBeenCalled();
});
it('does not fall back to personal email when the work mailbox is missing',async()=>{
 client.users.get.mockRejectedValue(Object.assign(new Error('missing'),{code:404}));
 client.groups.get.mockImplementation(async ({groupKey})=>{if(groupKey===staff.email)throw Object.assign(new Error('missing'),{code:404});return {data:{id:'group'}};});
 const [report]=await reconcileManagedWorkspaceGroups();expect(report.missingMailbox).toEqual([12]);
 expect(report.groups.every(g=>!g.added.includes(staff.personal_email))).toBe(true);
});
it('reports a directory authorization error instead of treating it as permission to create a group',async()=>{
 client.groups.get.mockRejectedValue(Object.assign(new Error('Not authorized'),{code:403}));
 const [report]=await reconcileManagedWorkspaceGroups();expect(report.groups.every(g=>g.error==='Not authorized')).toBe(true);
 expect(Directory.createGroup).not.toHaveBeenCalled();
});

it('waits for a newly created Google group to propagate but never retries permission failures',async()=>{
 vi.useFakeTimers();
 try {
  const op=vi.fn().mockRejectedValueOnce(Object.assign(new Error('not propagated'),{code:404})).mockResolvedValue({id:'ready'});
  const pending=retryNewGroupPropagation(op,true);await vi.runAllTimersAsync();expect(await pending).toEqual({id:'ready'});expect(op).toHaveBeenCalledTimes(2);
  const denied=vi.fn().mockRejectedValue(Object.assign(new Error('denied'),{code:403}));
  await expect(retryNewGroupPropagation(denied,true)).rejects.toMatchObject({code:403});expect(denied).toHaveBeenCalledTimes(1);
 }finally{vi.useRealTimers();}
});
it('creation-only mode never changes preexisting groups',async()=>{
 const [report]=await reconcileManagedWorkspaceGroups({apply:true,createMissingOnly:true});
 expect(report.groups.every(g=>g.skipped==='existing_group_unchanged')).toBe(true);
 for(const method of ['addGroupMember','removeGroupMember','applyGroupAccessSettings','setGroupMemberDeliverySettings'])expect(Directory[method]).not.toHaveBeenCalled();
});
it('background reconciliation ignores tenants until explicitly enrolled',async()=>{
 expect(await reconcileManagedWorkspaceGroups({apply:true,enrolledOnly:true})).toEqual([]);
 expect(Directory.listGroupMembers).not.toHaveBeenCalled();
});
it('recognizes a selected tenant alias when Directory lists the primary account',async()=>{
 roster=[{...staff,email:'staff-person@plottwistco.com',work_email:staff.email}];
 client.users.get.mockResolvedValue({data:{primaryEmail:'staff-person@plottwistco.com'}});
 Directory.listGroupMembers.mockResolvedValue([{email:'staff-person@plottwistco.com',role:'MEMBER'}]);
 const [report]=await reconcileManagedWorkspaceGroups();
 const group=report.groups.find(g=>g.email==='staff@itsco.health');
 expect(group.added).toEqual([]);expect(group.removed).toEqual([]);
});

it('uses the verified application owner even when absent from a tenant roster',async()=>{
 client.users.get.mockResolvedValue({data:{primaryEmail:'michael@plottwistco.com'}});
 client.groups.aliases={list:vi.fn(async()=>({data:{aliases:[{alias:'espanol@itsco.health'}]}}))};
 // Stop after verifying the owner and support membership, before app persistence.
 Directory.addGroupMember.mockImplementation(async ({memberEmail})=>{
  if(memberEmail==='support@itsco.health')throw new Error('support membership reached');
 });
 const [report]=await reconcileManagedWorkspaceGroups({apply:true,groupKeys:['spanish']});
 expect(Directory.addGroupMember).toHaveBeenCalledWith(expect.objectContaining({
  groupEmail:'spanish@itsco.health',memberEmail:'michael@plottwistco.com',role:'OWNER',memberType:'USER'
 }));
 expect(report.groups[0].error).toBe('support membership reached');
});

it('never chooses another tenant employee just because their name matches the owner',async()=>{
 roster=[{...staff,first_name:'Michael',last_name:'Mendez'}];
 client.users.get.mockImplementation(async ({userKey})=>{
  if(userKey==='michael@plottwistco.com')throw Object.assign(new Error('missing'),{code:404});
  return {data:{primaryEmail:staff.email}};
 });
 const [report]=await reconcileManagedWorkspaceGroups({apply:true,groupKeys:['spanish']});
 expect(report.groups[0].error).toContain('michael@plottwistco.com is unavailable');
 expect(Directory.addGroupMember).not.toHaveBeenCalled();
});

it('does not assign a suspended Workspace account as the Spanish group owner',async()=>{
 client.users.get.mockResolvedValue({data:{primaryEmail:'michael@plottwistco.com',suspended:true}});
 const [report]=await reconcileManagedWorkspaceGroups({apply:true,groupKeys:['spanish']});
 expect(report.groups[0].error).toContain('unavailable in Google Workspace');
 expect(Directory.addGroupMember).not.toHaveBeenCalled();
});

it('limits background reconciliation to the explicitly selected groups of a disabled tenant',async()=>{
 const original=pool.execute.getMockImplementation();
 pool.execute.mockImplementation(async sql=>sql.includes('FROM agencies WHERE')?[[{id:2,slug:'itsco',is_active:1,organization_type:'agency',feature_flags:{managedWorkspaceGroupsEnabled:false,workspaceEmailDomain:'itsco.health',managedWorkspaceGroupKeys:['clinical','denver']}}]]:original(sql));
 const [report]=await reconcileManagedWorkspaceGroups({enrolledOnly:true});
 expect(report.groups.map(g=>g.email)).toEqual(['clinical@itsco.health','denver@itsco.health']);
 expect(report.groups[0].added).toEqual([staff.email]);
 expect(Directory.listGroupMembers.mock.calls.map(([email])=>email)).toEqual(['clinical@itsco.health','denver@itsco.health']);
});

it('preserves existing active clinical recipients with conflicting care flags for review',async()=>{
 roster=[{...staff,sees_clients:0}];
 const original=pool.execute.getMockImplementation();
 pool.execute.mockImplementation(async sql=>sql.includes('FROM agencies WHERE')?[[{id:2,slug:'itsco',is_active:1,organization_type:'agency',feature_flags:{managedWorkspaceGroupsEnabled:false,workspaceEmailDomain:'itsco.health',managedWorkspaceGroupKeys:['clinical']}}]]:original(sql));
 Directory.listGroupMembers.mockResolvedValue([{email:staff.email,role:'MEMBER'}]);
 const [report]=await reconcileManagedWorkspaceGroups({enrolledOnly:true});
 expect(report.groups[0]).toMatchObject({removed:[],preserved:[staff.email]});
});
