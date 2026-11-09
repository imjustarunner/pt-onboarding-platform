import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
import {assertAssistantCapabilities,assertNarrativeRelease,assistantDigest,assistantScheduleSlot,normalizeAssistantResult,defaultAssistantSchedule,validateAssistantSchedule,safeWorkerIdentity} from '../assistantTeamPolicy.js';
import {safePayrollClaim,safeOperationalTask} from '../assistantOperationalPackets.service.js';
import {provisionAssistantAccounts,provisionAssistantGroup,selectAssistantProvisioningRoles,assistantManagedDomain} from '../assistantProvisioning.service.js';
describe('selective assistant provisioning',()=>{
 const owner={id:1,email:'michael@plottwistco.com',role:'super_admin',is_active:1,is_archived:0};
 function dryRunDb(){return {execute:vi.fn(async(sql,args)=>{
  if(sql.includes('SELECT id,email,role,is_active,is_archived FROM users'))return [[owner]];
  if(sql.includes('SELECT id,name,slug,is_active,is_archived,organization_type,feature_flags FROM agencies'))return [[{id:args[0],name:'Synthetic agency',slug:({2:'itsco',6:'nlu',377:'tisi'})[args[0]],is_active:1,is_archived:0,organization_type:'agency',feature_flags:{}}]];
  if(sql.includes('COUNT(DISTINCT s.id)'))return [[{n:0}]];
  if(sql.includes('FROM assistant_accounts'))return [[]];
  throw Error('Unexpected database access');
 }),getConnection:vi.fn(()=>{throw Error('Dry run must never write');})};}
 it('plans exactly one payroll identity per selected agency without other department accounts',async()=>{
  const db=dryRunDb(),result=await provisionAssistantAccounts({actor:owner,agencyIds:[2,6,377],subroles:['payroll'],dryRun:true},db);
  expect(result.accounts).toHaveLength(3);expect(result.accounts.map(a=>a.subrole)).toEqual(['payroll','payroll','payroll']);
  expect(result.accounts.map(a=>a.email)).toEqual(['payroll-assistant@itsco.health','payroll-assistant@nextleveluplcc.com','payroll-assistant@innerstrengthin.com']);
  expect(result.accounts.every(a=>a.status==='pending')).toBe(true);expect(db.getConnection).not.toHaveBeenCalled();
 });
 it.each([[],['unknown'],['payroll','unknown'],'payroll',null,[null]])('rejects invalid selections before planning any accounts: %j',async subroles=>{
  const db=dryRunDb();await expect(provisionAssistantAccounts({actor:owner,agencyIds:[2],subroles},db)).rejects.toMatchObject({code:'INVALID_ASSISTANT_SUBROLES'});
  expect(db.execute).toHaveBeenCalledTimes(1);expect(db.getConnection).not.toHaveBeenCalled();
 });
 it('deduplicates selected roles and preserves the original catalog order',()=>{
  expect(selectAssistantProvisioningRoles(['payroll','payroll']).map(r=>r.key)).toEqual(['payroll']);
  expect(selectAssistantProvisioningRoles(['team_lead','payroll']).map(r=>r.key)).toEqual(['payroll','team_lead']);
 });
 it('preserves whole-team provisioning when no filter is supplied',async()=>{
  const result=await provisionAssistantAccounts({actor:owner,agencyIds:[2]},dryRunDb());
  expect(result.accounts).toHaveLength(10);expect(result.accounts.find(a=>a.subrole==='school_support')).toMatchObject({skipped:'NO_LINKED_SCHOOLS'});
 });
 it('enrolls only the requested assistant group while keeping departmental group management disabled',()=>{
  const agency={slug:'nlu',is_active:1,organization_type:'agency',feature_flags:{managedWorkspaceGroupsEnabled:false,workspaceEmailDomain:'nextleveluplcc.com',externalAssistantGroupSubroles:['payroll']}};
  expect(assistantManagedDomain(agency,'payroll')).toBe('nextleveluplcc.com');
  expect(assistantManagedDomain(agency,'billing')).toBeNull();
  expect(agency.feature_flags.managedWorkspaceGroupsEnabled).toBe(false);
  expect(assistantManagedDomain({...agency,feature_flags:{...agency.feature_flags,workspaceEmailDomain:'other.example'}},'payroll')).toBeNull();
  expect(assistantManagedDomain({...agency,is_active:0},'payroll')).toBeNull();
  expect(assistantManagedDomain({...agency,feature_flags:{...agency.feature_flags,externalAssistantGroupSubroles:['payroll','unknown']}},'payroll')).toBeNull();
 });
});
describe('assistant login group setup',()=>{
 function setup(members=[{email:'michael@plottwistco.com',role:'OWNER',type:'USER'},{email:'ai@plottwistco.com',role:'MANAGER',type:'USER'}]){
  const owner={id:1,email:'michael@plottwistco.com',role:'super_admin',is_active:1,is_archived:0};
  const account={id:4,user_id:8,agency_id:2,subrole:'payroll',status:'pending',policy_revision:1,capabilities_json:[],schedule_json:{enabled:false},baa_status:'pending',privacy_policy_json:{},group_status:'pending',email:'payroll-assistant@itsco.health',display_name:'ITSCO Payroll Assistant'};
  const conn={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async()=>[{affectedRows:1}])};
  const db={execute:vi.fn(async sql=>sql.includes('FROM users WHERE id')?[[owner]]:[[account]]),getConnection:vi.fn(async()=>conn)};
  const directory={applyGroupAccessSettings:vi.fn(async()=>({allowExternalMembers:false,whoCanJoin:'INVITED_CAN_JOIN',whoCanViewMembership:'ALL_MANAGERS_CAN_VIEW',whoCanViewGroup:'ALL_MEMBERS_CAN_VIEW',whoCanPostMessage:'ANYONE_CAN_POST',includeInGlobalAddressList:false})),listGroupMembers:vi.fn(async()=>members),setGroupMemberDeliverySettings:vi.fn(async()=>({}))};
  const ensureGroup=vi.fn(async()=>({group:{id:'synthetic-group'}}));const ensureSendAs=vi.fn(()=>{throw Error('Login groups must not configure sending aliases');});
  return{owner,conn,deps:{db,directory,ensureGroup,ensureSendAs}};
 }
 it('verifies a login group without requesting a Gmail sending alias',async()=>{
  const s=setup();expect(await provisionAssistantGroup({actor:s.owner,accountId:4},s.deps)).toMatchObject({groupStatus:'ready',senderRequired:false});
  expect(s.deps.ensureSendAs).not.toHaveBeenCalled();expect(s.conn.commit).toHaveBeenCalledOnce();
  expect(s.deps.directory.setGroupMemberDeliverySettings.mock.calls.map(([arg])=>[arg.memberEmail,arg.deliverySettings])).toEqual([['michael@plottwistco.com','NONE'],['ai@plottwistco.com','ALL_MAIL']]);
 });
 it.each([[{email:'michael@plottwistco.com',role:'OWNER'}],[{email:'michael@plottwistco.com',role:'OWNER'},{email:'ai@plottwistco.com',role:'MEMBER'}],[{email:'michael@plottwistco.com',role:'OWNER'},{email:'outsider@example.com',role:'MANAGER'}]])('blocks incomplete or unexpected group ownership: %j',async members=>{
  const s=setup(members);await expect(provisionAssistantGroup({actor:s.owner,accountId:4},s.deps)).rejects.toMatchObject({code:'ASSISTANT_GROUP_DRIFT'});
  expect(s.conn.execute.mock.calls.some(([sql])=>sql.includes("group_status='ready'"))).toBe(false);
 });
});
describe('external assistant release and scheduling',()=>{
 it('denies cross-department capabilities and all Sales actions',()=>{expect(()=>assertAssistantCapabilities('payroll',['billing.review'])).toThrow();expect(()=>assertAssistantCapabilities('sales',['sales.review'])).toThrow();});
 it('does not accept policy JSON as a substitute for verified account BAA',()=>{const p={enabled:true,approved:true,sampleReviewPassed:true,revision:'v1',baaVerified:true,externalService:'Synthetic provider',baaReference:'synthetic-baa-record',sampleReviewReference:'synthetic-sample-record'};expect(()=>assertNarrativeRelease({baa_status:'pending',privacy_policy_json:p})).toThrow();expect(()=>assertNarrativeRelease({baa_status:'verified',privacy_policy_json:{...p,sampleReviewPassed:false}})).toThrow();expect(assertNarrativeRelease({baa_status:'verified',privacy_policy_json:p}).baaVerified).toBe(true);});
 it('never schedules a disabled duty',()=>{expect(assistantScheduleSlot(defaultAssistantSchedule('payroll'),new Date('2026-11-02T14:10:00Z'))).toBeNull();});
 it('preserves local morning across Denver daylight changes',()=>{const s={enabled:true,timezone:'America/Denver',weekdays:[1,2,3,4,5],localTime:'07:10'};expect(assistantScheduleSlot(s,new Date('2026-10-30T13:09:00Z'))).toBeNull();expect(assistantScheduleSlot(s,new Date('2026-10-30T13:10:00Z'))).toContain('2026-10-30/07:10');expect(assistantScheduleSlot(s,new Date('2026-11-02T14:09:00Z'))).toBeNull();expect(assistantScheduleSlot(s,new Date('2026-11-02T14:10:00Z'))).toContain('2026-11-02/07:10');});
 it('rejects malformed timezone and clocks',()=>{expect(()=>validateAssistantSchedule({timezone:'invented'})).toThrow();expect(()=>validateAssistantSchedule({weekdays:[8],localTime:'07:10'})).toThrow();expect(()=>validateAssistantSchedule({weekdays:[1],localTime:'27:10'})).toThrow();});
 it('canonicalizes configurations across MySQL JSON key ordering',()=>{expect(assistantDigest({a:1,b:{d:4,c:3}})).toBe(assistantDigest({b:{c:3,d:4},a:1}));});
 it('never releases private owner config through worker identity',()=>{const r=safeWorkerIdentity({display_name:'ITSCO Clinical Assistant',agency_name:'ITSCO',subrole:'clinical',status:'active',policy_revision:2,capabilities_json:['clinical.review'],user_id:501,email:'CANARY@example.com',privacy_policy_json:{memberId:'CANARY'}});expect(JSON.stringify(r)).not.toMatch(/CANARY|501|privacy_policy/);});
});
describe('reference-bound results and operational packets',()=>{
 it('rejects findings citing another packet',()=>{expect(()=>normalizeAssistantResult({outcome:'PASS',findings:[{category:'review',severity:'warning',message:'Check evidence',sourceRefs:['other']}]},['current'])).toThrow();});
 it('drops arbitrary evidence and source properties',()=>{const r=normalizeAssistantResult({outcome:'PASS',findings:[],rawChart:'CANARY',evidence:{browser:'Browser',viewport:'1280x900',buildId:'synthetic-build',observedAt:'2026-11-02T21:20:00Z',steps:['Verified the scoped result.'],rawScreenshot:'CANARY'}},[]);expect(JSON.stringify(r)).not.toContain('CANARY');});
 it('rejects invented severity and unbounded output',()=>{for(const f of [{category:'review',severity:'approved',message:'Fine'},{category:'review',severity:'warning',message:'x'.repeat(2001)}])expect(()=>normalizeAssistantResult({outcome:'PASS',findings:[f]},[])).toThrow();});
 it.each([{},{browser:'Browser',viewport:'1280x900',buildId:'build',observedAt:'not a time',steps:['Checked']},{browser:'Browser',viewport:'1280x900',buildId:'build',observedAt:'2026-11-02T21:20:00Z',steps:[]},{browser:'Browser',viewport:'1280x900',buildId:'build',observedAt:'2026-11-02T21:20:00Z',steps:['   ']}])('rejects an unsupported result without complete observation metadata',evidence=>{expect(()=>normalizeAssistantResult({outcome:'PASS',findings:[],evidence},[])).toThrow(/Record the browser/);});
 it('releases approved time quantities without names, dates, narratives, identifiers or addresses',()=>{const r=safePayrollClaim({id:981,user_id:501,status:'submitted',claim_type:'indirect_time',claim_date:'2001-03-04',name:'CANARY_NAME',payload_json:{totalMinutes:45,description:'CANARY_NARRATIVE',address:'CANARY_ADDRESS'},suggested_payroll_period_id:1});expect(r.submittedMinutes).toBe(45);expect(JSON.stringify(r)).not.toMatch(/CANARY|2001-03-04/);});
 it('routes unknown quantities and categories to human review without inventing values',()=>{const r=safePayrollClaim({status:'injected',claim_type:'CANARY',payload_json:{totalMinutes:'not a number'}});expect(r.submittedMinutes).toBeNull();expect(r.category).toBe('other_time');expect(r.validationFlags).toContain('MINUTES_REQUIRE_REVIEW');});
 it('omits identifying task titles, source IDs and recipients',()=>{const r=safeOperationalTask({id:123,status:'pending',title:'CANARY',assigned_to_user_id:456,source_ref_id:'789',created_at:'2026-10-01'},'billing',new Date('2026-11-02'));expect(r.ageBucket).toBe('over_one_week');expect(r).not.toHaveProperty('id');expect(r).not.toHaveProperty('assigned_to_user_id');expect(JSON.stringify(r)).not.toMatch(/CANARY/);});
});
