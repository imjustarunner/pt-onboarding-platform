import { beforeEach,it,expect,vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../googleWorkspaceDirectory.service.js',()=>({default:{isConfigured:()=>true,getClient:vi.fn(),listGroupMembers:vi.fn(),createGroup:vi.fn(),addGroupMember:vi.fn(),removeGroupMember:vi.fn(),applyGroupAccessSettings:vi.fn(),setGroupMemberDeliverySettings:vi.fn()}}));
vi.mock('../personalMailbox.service.js',()=>({ensurePersonalMailboxForAddress:vi.fn()}));
vi.mock('../departmentalSenderReadiness.service.js',()=>({ensureDepartmentalSenderReady:vi.fn(async()=>({ready:true,transport:'workspace_smtp_relay'}))}));
import pool from '../../config/database.js';
import Directory from '../googleWorkspaceDirectory.service.js';
import {reconcileManagedWorkspaceGroups,retryNewGroupPropagation} from '../managedWorkspaceGroups.service.js';
import {ensureDepartmentalSenderReady} from '../departmentalSenderReadiness.service.js';
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

it('automatically includes configured departments without enrolling unrelated managed groups', async () => {
 const original=pool.execute.getMockImplementation();
 pool.execute.mockImplementation(async sql=>sql.includes('FROM email_sender_identities esi')?[[{agency_id:2,identity_key:'payroll',from_email:'payroll@itsco.health'}]]:original(sql));
 roster=[{...staff,has_payroll_access:1}];
 const [report]=await reconcileManagedWorkspaceGroups({enrolledOnly:true});
 expect(report.groups.map(g=>g.groupKey)).toEqual(['payroll']);
 expect(report.groups[0]).toMatchObject({subscription:'NONE',added:[staff.email]});
});

it('removes a former payroll manager when their app permission is revoked', async () => {
 const original=pool.execute.getMockImplementation();
 pool.execute.mockImplementation(async sql=>sql.includes('FROM email_sender_identities esi')?[[{agency_id:2,identity_key:'payroll',from_email:'payroll@itsco.health'}]]:original(sql));
 Directory.listGroupMembers.mockResolvedValue([{email:staff.email,role:'MANAGER'}]);
 const [report]=await reconcileManagedWorkspaceGroups({enrolledOnly:true});
 expect(report.groups[0].removed).toEqual([staff.email]);
});

it('never treats a personal login Group identity as permission to manage a department', async () => {
 const original=pool.execute.getMockImplementation();
 pool.execute.mockImplementation(async sql=>sql.includes('FROM email_sender_identities esi')?[[{agency_id:2,identity_key:'personal_12',from_email:'payroll@itsco.health',kind:'personal',owner_user_id:12}]]:original(sql));
 expect(await reconcileManagedWorkspaceGroups({enrolledOnly:true})).toEqual([]);
});

it('adds a non-SSO login Group as a muted nested member and silences preserved legacy recipients', async () => {
 const original=pool.execute.getMockImplementation();
 pool.execute.mockImplementation(async sql=>sql.includes('FROM email_sender_identities esi')?[[{agency_id:2,identity_key:'payroll',from_email:'payroll@itsco.health'}]]:original(sql));
 roster=[{...staff,has_payroll_access:1,login_is_group_email:1}];
 client.users.get.mockRejectedValue(Object.assign(new Error('not a user'),{code:404}));
 client.members={get:vi.fn(async ({memberKey})=>({data:{email:memberKey,role:memberKey==='michael@plottwistco.com'?'OWNER':memberKey==='ai@plottwistco.com'?'MANAGER':'MEMBER',delivery_settings:memberKey==='michael@plottwistco.com'?'NONE':'ALL_MAIL'}}))};
 Directory.listGroupMembers.mockResolvedValue([{email:'legacy@example.org',role:'MEMBER'},{email:'ai@plottwistco.com',role:'MANAGER'}]);
 pool.getConnection=vi.fn(async()=>({beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>sql.startsWith('SELECT * FROM managed_workspace_groups')?[[{id:4,contact_id:5,chat_thread_id:6,meeting_group_id:7}]]:[[]])}));
 const [report]=await reconcileManagedWorkspaceGroups({apply:true,enrolledOnly:true,groupKeys:['payroll']});
 expect(report.groups[0].error).toBeNull();
 expect(Directory.addGroupMember).toHaveBeenCalledWith(expect.objectContaining({groupEmail:'payroll@itsco.health',memberEmail:staff.email,memberType:'GROUP',deliverySettings:'NONE'}));
 expect(Directory.setGroupMemberDeliverySettings).toHaveBeenCalledWith(expect.objectContaining({memberEmail:staff.email,deliverySettings:'NONE'}));
 expect(Directory.setGroupMemberDeliverySettings).toHaveBeenCalledWith(expect.objectContaining({memberEmail:'legacy@example.org',deliverySettings:'NONE'}));
 expect(Directory.removeGroupMember).not.toHaveBeenCalledWith(expect.objectContaining({memberEmail:'legacy@example.org'}));
 expect(ensureDepartmentalSenderReady).toHaveBeenCalledWith({email:'payroll@itsco.health',displayName:'Payroll'});
 expect(report.groups[0].sender).toEqual({ready:true,transport:'workspace_smtp_relay'});
});

it('includes Technology and Compliance but leaves configured and previously managed People Operations alone', async () => {
 const original=pool.execute.getMockImplementation();
 pool.execute.mockImplementation(async sql=>{
  if(sql.includes('FROM email_sender_identities esi'))return [[
   {agency_id:2,identity_key:'technology',from_email:'technology@itsco.health'},
   {agency_id:2,identity_key:'compliance',from_email:'compliance@itsco.health'},
   {agency_id:2,identity_key:'po',from_email:'po@itsco.health'}
  ]];
  if(sql.startsWith('SELECT group_key,email,member_emails'))return [[{group_key:'people_operations',email:'po@itsco.health',member_emails:'[]'}]];
  return original(sql);
 });
 const [report]=await reconcileManagedWorkspaceGroups({enrolledOnly:true});
 expect(report.groups.map(group=>group.groupKey)).toEqual(['technology','compliance']);
 expect(Directory.listGroupMembers.mock.calls.some(([email])=>email==='po@itsco.health')).toBe(false);
 expect(ensureDepartmentalSenderReady).not.toHaveBeenCalled();
});

it('removes previously mirrored departmental members after their agency membership is deleted', async () => {
 roster=[];
 const original=pool.execute.getMockImplementation();
 pool.execute.mockImplementation(async sql=>{
  if(sql.includes('FROM email_sender_identities esi'))return [[{agency_id:2,identity_key:'payroll',from_email:'payroll@itsco.health'}]];
  if(sql.startsWith('SELECT group_key,email,member_emails'))return [[{group_key:'payroll',email:'payroll@itsco.health',member_emails:JSON.stringify([staff.email])}]];
  return original(sql);
 });
 Directory.listGroupMembers.mockResolvedValue([{email:staff.email,role:'MEMBER'}]);
 const [report]=await reconcileManagedWorkspaceGroups({enrolledOnly:true});
 expect(report.groups[0].removed).toEqual([staff.email]);
});
