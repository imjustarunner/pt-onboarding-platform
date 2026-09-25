import { describe,expect,it,vi,beforeEach } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import pool from '../../config/database.js';
import { managedDomain,staffGroupKeys,buildManagedGroupPlan } from '../managedWorkspaceGroupPolicy.js';
import { managedGroupEnvelope,assertManagedChatPost } from '../managedWorkspaceGroupAccess.service.js';
import { meetingInvitationContent } from '../meetingInvitationPolicy.js';
const staff={id:12,first_name:'Brittany',role:'provider',status:'ACTIVE_EMPLOYEE',is_active:1,is_archived:0,is_demo:0,membership_active:1,credential:'BA, Intern'};
const agency={slug:'itsco',is_active:1,organization_type:'agency'};
describe('managed staff membership',()=>{
 it('enrolls current managed tenants and explicitly enrolled future tenants only',()=>{
  expect(managedDomain(agency)).toBe('itsco.health');
  expect(managedDomain({...agency,slug:'selfservice',feature_flags:{workspaceEmailDomain:'itsco.health',googleSsoEnabled:true}})).toBeNull();
  expect(managedDomain({...agency,slug:'new',feature_flags:{managedWorkspaceGroupsEnabled:true,workspaceEmailDomain:'new.example'}})).toBe('new.example');
  expect(managedDomain({...agency,feature_flags:{managedWorkspaceGroupsEnabled:false}})).toBeNull();
  expect(managedDomain({...agency,is_active:0})).toBeNull();
 });
 it('moves interns to candidates to licensed without stale credential memberships',()=>{
  expect(staffGroupKeys(staff)).toEqual(expect.arrayContaining(['staff','interns','unlicensed']));
  expect(staffGroupKeys({...staff,credential:'MA, LPCC',agency_position:'Intern'})).toEqual(['staff','prelicensed']);
  expect(staffGroupKeys({...staff,credential:'MA, LPC',supervision_is_prelicensed:1})).toEqual(['staff','licensed']);
 });
 it('does not misread a degree as a license or enroll demo, inactive, guardian, or prospective users',()=>{
  expect(staffGroupKeys({...staff,credential:'MFA'})).toEqual(['staff']);
  for(const change of [{is_demo:1},{membership_active:0},{is_active:0},{is_archived:1},{status:'PROSPECTIVE'},{role:'client_guardian'}])expect(staffGroupKeys({...staff,...change})).toEqual([]);
 });
 it('includes onboarding employees once provisioned and uses work offices, including both cities',()=>{
  expect(staffGroupKeys({...staff,status:'ONBOARDING',locations:[{city:'Denver',state:'CO'},{city:'Colorado Springs',state:'CO'}]})).toEqual(expect.arrayContaining(['staff','costaff','denver','cosprings']));
  expect(staffGroupKeys({...staff,home_city:'Denver',home_state:'CO'})).not.toContain('denver');
 });
 it('reconciles supervisor relationships and disambiguates identical first names',()=>{
  const rows=[{...staff,id:1,has_supervisor_privileges:1},{...staff,id:2,has_supervisor_privileges:1},{...staff,id:3,first_name:'Intern'}];
  const plan=buildManagedGroupPlan({domain:'itsco.health',rows,assignments:[{supervisor_id:1,supervisee_id:3}]});
  expect(plan.find(g=>g.key==='supervisor:1')).toMatchObject({email:'brittany1supervisees@itsco.health',userIds:[1,3]});
  expect(plan.find(g=>g.key==='supervisor:2').email).toBe('brittany2supervisees@itsco.health');
  expect(plan.find(g=>g.key==='supervisees').userIds).toEqual([3]);
 });
});
describe('manager-only distribution',()=>{
 const group={...agency,id:7,agency_id:2,email:'staff@itsco.health',manager_user_ids:[12],member_emails:['one@itsco.health','app-only@itsco.health']};
 beforeEach(()=>{vi.clearAllMocks();pool.execute.mockImplementation(async sql=>[sql.includes('FROM managed_workspace_groups')?[group]:[staff]]);});
 it('hides member addresses in Bcc and preserves nested personal Group addresses',async()=>{
  expect(await managedGroupEnvelope({to:'Staff <staff@itsco.health>',cc:'other@example.org',actorUserId:12})).toEqual({to:'',cc:'other@example.org',bcc:'one@itsco.health, app-only@itsco.health'});
 });
 it('rejects non-managers, background mail without an actor, and inactive managers',async()=>{
  for(const actorUserId of [null,25])await expect(managedGroupEnvelope({to:group.email,actorUserId})).rejects.toMatchObject({code:'GROUP_MANAGER_REQUIRED'});
  pool.execute.mockImplementation(async sql=>[sql.includes('FROM managed_workspace_groups')?[group]:[{...staff,is_active:0}]]);
  await expect(assertManagedChatPost(2,12)).rejects.toMatchObject({code:'GROUP_MANAGER_REQUIRED'});
 });
 it('does not alter unrelated recipients',async()=>{
  pool.execute.mockResolvedValue([[]]);const input={to:'Name <person@example.org>',cc:null,bcc:null,actorUserId:12};
  expect(await managedGroupEnvelope(input)).toEqual({to:input.to,cc:null,bcc:null});
 });
});
it('shows attendee names without email addresses, response statuses, or staff roles',()=>{
 const result=meetingInvitationContent({events:[{id:1,title:'Initial interview',start_at:'2026-09-25T15:00:00Z'}],joinUrl:'https://example.org/join',participants:[{name:'Kelly Wagle',email:'candidate@example.org',rsvp:'pending',is_required:1},{name:'Haley Inyart',email:'host@example.org',isHost:true}]});
 expect(result.text).toContain('Attendees: Kelly Wagle, Haley Inyart');
 expect(result.html).not.toMatch(/candidate@example|host@example|mandatory|pending/);
});
