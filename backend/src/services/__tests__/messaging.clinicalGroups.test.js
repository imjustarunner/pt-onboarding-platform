import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import pool from '../../config/database.js';
import { staffGroupKeys, buildManagedGroupPlan, managedDomain, managedGroupScope } from '../managedWorkspaceGroupPolicy.js';
import { assertManagedChatPost, managedChatPostingAllowed, managedGroupEnvelope } from '../managedWorkspaceGroupAccess.service.js';
const staff={id:12,first_name:'Eden',role:'provider',status:'ACTIVE_EMPLOYEE',is_active:1,is_archived:0,is_demo:0,membership_active:1,sees_clients:1};
const agency={id:2,agency_id:2,slug:'itsco',is_active:1,organization_type:'agency',feature_flags:{managedWorkspaceGroupsEnabled:false,workspaceEmailDomain:'itsco.health',managedWorkspaceGroupKeys:['clinical','denver']}};
beforeEach(()=>vi.clearAllMocks());
it.each(['provider','provider_plus','intern','intern_plus','clinical_practice_assistant','facilitator','clinician','qbha'])('includes client-facing %s staff',role=>{
 expect(staffGroupKeys({...staff,role})).toContain('clinical');
 expect(staffGroupKeys({...staff,role,sees_clients:0})).not.toContain('clinical');
});
it('includes supervisors who do not see clients, including assignment-only supervisors',()=>{
 expect(staffGroupKeys({...staff,sees_clients:0,has_supervisor_privileges:1})).toContain('clinical');
 expect(staffGroupKeys({...staff,sees_clients:0,role:'supervisor'})).toContain('clinical');
 expect(staffGroupKeys({...staff,sees_clients:0},{supervisorIds:new Set([12])})).toContain('clinical');
});
it('requires care evidence for general staff and never enrolls external or inactive accounts',()=>{
 expect(staffGroupKeys({...staff,role:'staff'})).not.toContain('clinical');
 expect(staffGroupKeys({...staff,role:'staff',has_provider_access:1})).toContain('clinical');
 expect(staffGroupKeys({...staff,role:'staff',has_client_assignments:1})).toContain('clinical');
 for(const change of [{is_active:0},{is_archived:1},{is_demo:1},{membership_active:0},{status:'PROSPECTIVE'},{role:'client_guardian'},{role:'school_staff'}])expect(staffGroupKeys({...staff,...change})).not.toContain('clinical');
});
it('builds the requested clinical audience without creating clinical groups for every tenant',()=>{
 const rows=[staff,{...staff,id:13,sees_clients:0,has_supervisor_privileges:1},{...staff,id:14,role:'support'},{...staff,id:15,is_active:0}];
 expect(buildManagedGroupPlan({domain:'itsco.health',rows,includeClinical:true}).find(g=>g.key==='clinical').userIds).toEqual([12,13]);
 expect(buildManagedGroupPlan({domain:'example.org',rows}).some(g=>g.key==='clinical')).toBe(false);
});
it('enrolls only the selected groups while full tenant synchronization stays disabled',()=>{
 expect(managedGroupScope(agency)).toEqual(['clinical','denver']);
 expect(managedDomain(agency)).toBe('itsco.health');
 expect(managedDomain({...agency,group_key:'clinical'})).toBe('itsco.health');
 expect(managedDomain({...agency,group_key:'staff'})).toBeNull();
 expect(managedDomain({...agency,feature_flags:{managedWorkspaceGroupsEnabled:false}})).toBeNull();
});
it('lets an active Denver member chat without email-manager privileges',async()=>{
 const group={...agency,group_key:'denver',email:'denver@itsco.health',manager_user_ids:[99],member_emails:['eden@itsco.health']};
 pool.execute.mockImplementation(async sql=>[sql.includes('FROM managed_workspace_groups')?[group]:[staff]]);
 await expect(assertManagedChatPost(235,12)).resolves.toBeUndefined();
 await expect(managedChatPostingAllowed(235,12)).resolves.toBe(true);
 await expect(managedGroupEnvelope({to:group.email,actorUserId:12})).rejects.toMatchObject({code:'GROUP_MANAGER_REQUIRED'});
 expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('FROM chat_thread_participants'),[2,235,12]);
});
it.each([null,{...staff,is_active:0},{...staff,membership_active:0},{...staff,is_archived:1},{...staff,is_demo:1},{...staff,role:'client_guardian'}])('blocks nonmembers and inactive or external members: %j',async member=>{
 pool.execute.mockImplementation(async sql=>[sql.includes('FROM managed_workspace_groups')?[agency]:member?[member]:[]]);
 await expect(assertManagedChatPost(235,12)).rejects.toMatchObject({status:403,code:'GROUP_MEMBER_REQUIRED'});
 await expect(managedChatPostingAllowed(235,12)).resolves.toBe(false);
});
it('leaves ordinary custom channels governed by their existing channel membership checks',async()=>{
 pool.execute.mockResolvedValue([[]]);await expect(assertManagedChatPost(999,12)).resolves.toBeUndefined();
});
