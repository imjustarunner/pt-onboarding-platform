import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),connection:vi.fn(),ready:vi.fn(),strength:vi.fn(),hash:vi.fn(),notice:vi.fn(),lifecycle:vi.fn(),submitted:vi.fn(),enroll:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:m.connection},onTableWrite:vi.fn()}));
vi.mock('../hirePortalWorkflow.service.js',()=>({assertOnboardingPasswordReady:m.ready}));
vi.mock('../../utils/passwordValidation.js',()=>({validatePasswordStrength:m.strength}));
vi.mock('bcrypt',()=>({default:{hash:m.hash}}));
vi.mock('../credentialChangeNotification.service.js',()=>({recordCredentialChangeNotice:m.notice}));
vi.mock('../accountLifecycle.service.js',()=>({changeAccountLifecycle:args=>m.lifecycle(args)}));
vi.mock('../hireJourney.service.js',async original=>({...await original(),requireOnboardingSubmitted:m.submitted}));
vi.mock('../futureHirePay.service.js',()=>({enrollCompletedFutureHire:m.enroll}));
import {appOnlyHireDomain,checkAppHireEmail,suggestAppHireEmails,finalizeAppHirePassword,assertAppHireStaffAccess,assertAppHireActivationReady,assertAppHirePasswordEntry,recordAppHireJourney} from '../hireAppAccount.service.js';
import User from '../../models/User.model.js';
const agency=(id=453)=>({id,slug:id===454?'nlu-qa-learning':'nlu-qa-demo',is_active:1,is_archived:0,feature_flags:{hireAccountMode:'app_only',workspaceEmailDomain:'example.com',qaSandbox:{syntheticOnly:true,program:'tutoring',sourceAgencyId:6}}});
let current,organization,journey,db,collision,alias,recoveryCollision,hasHiringHistory;
beforeEach(()=>{
 vi.resetAllMocks();organization=agency();collision=null;alias=null;recoveryCollision=null;hasHiringHistory=true;journey={onboarding_completed_at:null};
 current={id:80,role:'staff',status:'ONBOARDING',identity_product:'full_suite',is_active:1,is_archived:0,work_email:'qa.nlu.casey.work@example.com',email:'qa.nlu.childcare.a@example.com',personal_email:'qa.nlu.childcare.a@example.com',password_hash:null,sso_password_override:0,login_is_group_email:0};
 db={execute:m.execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};m.connection.mockResolvedValue(db);m.ready.mockResolvedValue();m.hash.mockResolvedValue('new-qa-hash');m.strength.mockResolvedValue({valid:true});
 m.lifecycle.mockImplementation(async args=>args.mutate(db,current));m.submitted.mockResolvedValue();m.enroll.mockResolvedValue();
 m.execute.mockImplementation(async(sql,args=[])=>{
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('RELEASE_LOCK'))return [[{released:1}]];
  if(sql.startsWith('SELECT * FROM users'))return [[current]];
  if(sql.includes('FROM agencies a LEFT JOIN hire_journeys'))return [hasHiringHistory?[{...organization,hire_onboarding_completed_at:journey?.onboarding_completed_at}]:[]];
  if(sql.includes('FROM agencies a JOIN user_agencies')||sql.startsWith('SELECT id,slug,is_active,is_archived,feature_flags FROM agencies'))return [[organization]];
  if(sql.startsWith('SELECT onboarding_completed_at'))return [journey?[journey]:[]];
  if(sql.startsWith('SELECT id FROM users WHERE id<>')){const owner=args[1]===current.personal_email?recoveryCollision:collision;return [owner?[{id:owner}]:[]];}
  if(sql.startsWith('SELECT user_id FROM user_login_emails'))return [alias?[{user_id:alias}]:[]];
  if(sql.startsWith('SELECT id FROM email_inbound_routes'))return [[]];
  if(sql.startsWith('UPDATE users')||sql.startsWith('INSERT INTO user_login_emails')||sql.startsWith('INSERT INTO user_activity_log')||sql.startsWith('INSERT INTO hire_journeys'))return [{affectedRows:1}];
  throw new Error(`Unexpected test SQL: ${sql}`);
 });
});
describe('explicit synthetic app-only account namespace',()=>{
 it.each([453,454])('supports only exact ready QA%d without claiming a mailbox',id=>expect(appOnlyHireDomain(agency(id))).toBe('example.com'));
 it.each(['live agency','wrong slug','missing marker','wrong domain','inactive'])('rejects unsupported configuration: %s',reason=>{
  if(reason==='live agency')organization.id=6;
  if(reason==='wrong slug')organization.slug='nlu';
  if(reason==='missing marker')organization.feature_flags.qaSandbox={};
  if(reason==='wrong domain')organization.feature_flags.workspaceEmailDomain='itsco.health';
  if(reason==='inactive')organization.is_active=0;
  expect(()=>appOnlyHireDomain(organization)).toThrow();
 });
 it('does not infer app-only from an unset or group mode',()=>{
  organization.feature_flags.hireAccountMode=null;expect(appOnlyHireDomain(organization)).toBeNull();
  organization.feature_flags.hireAccountMode='group_password';expect(appOnlyHireDomain(organization)).toBeNull();
 });
 it('uses separate available app aliases and catches user, login alias and route collisions',async()=>{
  const result=await suggestAppHireEmails({user:{...current,first_name:'Casey'},agency:organization,limit:2});
  expect(result).toMatchObject({appIdentityOnly:true,directoryConfigured:false,domain:'example.com'});expect(result.suggestions.map(s=>s.email)).toEqual(['qa.nlu.casey.work@example.com','qa.nlu.casey.work1@example.com']);
  collision=81;expect(await checkAppHireEmail({email:current.work_email,userId:80,agency:organization})).toMatchObject({available:false,reason:'taken_in_app'});
  collision=null;alias=81;expect(await checkAppHireEmail({email:current.work_email,userId:80,agency:organization})).toMatchObject({available:false});
  m.execute.mockImplementation(async sql=>sql.includes('email_inbound_routes')?[[{id:4}]]:[[]]);
  expect(await checkAppHireEmail({email:current.work_email,userId:80,agency:organization})).toMatchObject({available:false});
 });
 it.each(['person@itsco.health','person..two@example.com','.bad@example.com'])('rejects invalid or unapproved app identity %s before access checks',async email=>{
  expect(await checkAppHireEmail({email,userId:80,agency:organization})).toMatchObject({available:false});expect(m.execute).not.toHaveBeenCalled();
 });
});
describe('normal app-only password preparation and activation',()=>{
 const prepare=()=>finalizeAppHirePassword({user:{...current},agency:organization,password:'Synthetic83!Grove-Window'});
 it('sets the same person’s app identity only after persisted onboarding readiness, retaining recovery and pending status',async()=>{
  const result=await prepare();expect(result).toMatchObject({appIdentityOnly:true,passwordSet:true,workEmail:current.work_email,personalEmail:current.personal_email});
  expect(m.ready).toHaveBeenCalledTimes(2);expect(db.commit).toHaveBeenCalledOnce();
  const write=m.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE users'));
  expect(write[0]).toContain('login_is_group_email=0');expect(write[1]).toEqual(['new-qa-hash',current.work_email,current.work_email,current.personal_email,80]);
  expect(write[0]).not.toMatch(/SET status|is_active\s*=/);expect(m.notice).toHaveBeenCalledWith({userId:80,kind:'password',initialSetup:true});
 });
 it('does not prepare a password while required onboarding remains incomplete',async()=>{
  m.ready.mockRejectedValue(new Error('Required handbook is incomplete'));
  await expect(prepare()).rejects.toThrow('Required handbook');expect(m.connection).not.toHaveBeenCalled();expect(m.hash).not.toHaveBeenCalled();
 });
 it('does not retain another person’s primary/work/personal identity as a recovery login alias',async()=>{
  recoveryCollision=99;
  await expect(prepare()).rejects.toMatchObject({code:'EMAIL_UNAVAILABLE'});
  expect(m.execute.mock.calls.some(([sql])=>/^(UPDATE|INSERT)/.test(sql))).toBe(false);
  const acquired=m.execute.mock.calls.filter(([sql])=>sql.includes('GET_LOCK')).map(([,args])=>args[0]);
  expect(acquired).toHaveLength(2);expect(acquired).toEqual([...acquired].sort());expect(db.rollback).toHaveBeenCalledOnce();
 });
 it.each(['submitted','changed username','disabled','collision','prepared password','other product','revoked membership'])('rolls back a stale or unauthorized password request: %s',async reason=>{
  const input={...current};
  if(reason==='submitted')journey.onboarding_completed_at='2026-11-12';
  if(reason==='changed username')current.work_email='qa.nlu.other.work@example.com';
  if(reason==='disabled')current.is_active=0;
  if(reason==='collision')collision=81;
  if(reason==='prepared password')current.password_hash='prior';
  if(reason==='other product')current.identity_product='ehr';
  if(reason==='revoked membership')m.execute.mockImplementation(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.startsWith('SELECT * FROM users')?[[current]]:[[]]);
  await expect(finalizeAppHirePassword({user:input,agency:organization,password:'Synthetic83!Grove-Window'})).rejects.toThrow();expect(db.commit).not.toHaveBeenCalled();expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE users'))).toBe(false);
 });
 it('preserves the stored checklist boundary if readiness changes while waiting for the lock',async()=>{
  m.ready.mockResolvedValueOnce().mockRejectedValueOnce(new Error('Required work changed'));
  await expect(prepare()).rejects.toThrow('Required work changed');expect(db.rollback).toHaveBeenCalledOnce();expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE users'))).toBe(false);
 });
 it('keeps pending app users blocked after reset token rotation and prepared passwords',async()=>{
  current.password_hash='prepared';current.sso_password_override=1;current.passwordless_token_purpose='reset';
  await expect(assertAppHireStaffAccess(current)).rejects.toMatchObject({code:'HIRE_ACTIVATION_REQUIRED'});
  await expect(assertAppHireActivationReady(current)).rejects.toThrow('Submit completed onboarding');
  journey.onboarding_completed_at='2026-11-12';await expect(assertAppHireActivationReady(current)).resolves.toMatchObject({id:453});
  current.status='ACTIVE_EMPLOYEE';current.completed_at='2026-11-12';await expect(assertAppHireStaffAccess(current)).resolves.toBeUndefined();
 });
 it.each(['PROSPECTIVE','pending','ready_for_review','PENDING_SETUP','PREHIRE_OPEN','PREHIRE_REVIEW'])('rejects direct activation of a %s QA applicant before any status write',async status=>{
  current.status=status;journey=null;
  const find=vi.spyOn(User,'findById').mockResolvedValue(current);
  try{await expect(User.updateStatus(current.id,'ACTIVE_EMPLOYEE',1435)).rejects.toMatchObject({code:'APP_HIRE_NOT_READY'});}
  finally{find.mockRestore();}
  expect(m.execute.mock.calls.some(([sql])=>/^(UPDATE|INSERT|DELETE)/.test(sql))).toBe(false);
 });
 it.each(['active','ACTIVE','completed','COMPLETED'])('rejects the login-active status alias %s before any status write',async target=>{
  current.status='PROSPECTIVE';journey=null;
  const find=vi.spyOn(User,'findById').mockResolvedValue(current);
  try{await expect(User.updateStatus(current.id,target,1435)).rejects.toMatchObject({code:'APP_HIRE_NOT_READY'});}
  finally{find.mockRestore();}
  expect(m.execute.mock.calls.some(([sql])=>/^(UPDATE|INSERT|DELETE)/.test(sql))).toBe(false);
 });
 it.each(['markUserActive','movePendingToActive'])('rejects the legacy %s control before credential or username writes',async handler=>{
  current.status='ready_for_review';const find=vi.spyOn(User,'findById').mockResolvedValue(current);
  const { [handler]:activate }=await import('../../controllers/user.controller.js');
  const res={status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();
  try{await activate({params:{id:String(current.id)},body:{workEmail:current.work_email},user:{id:1435,role:'admin'}},res,next);}
  finally{find.mockRestore();}
  expect(next).toHaveBeenCalledWith(expect.objectContaining({code:'APP_HIRE_ACTIVATION_ROUTE'}));
  expect(m.execute.mock.calls.some(([sql])=>/^(UPDATE|INSERT|DELETE)/.test(sql))).toBe(false);
 });
 it('rejects the current-employee completion shortcut before rotating a pending hire portal token',async()=>{
  current.status='PENDING_SETUP';const find=vi.spyOn(User,'findById').mockResolvedValue(current);
  const {markUserComplete}=await import('../../controllers/user.controller.js');
  const token=vi.spyOn(User,'generatePasswordlessToken').mockResolvedValue({token:'unused'});
  const res={status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();
  try{await markUserComplete({params:{id:String(current.id)},body:{},user:{id:1435,role:'admin'}},res,next);}
  finally{find.mockRestore();token.mockRestore();}
  expect(next).toHaveBeenCalledWith(expect.objectContaining({code:'APP_HIRE_NOT_READY'}));
  expect(m.execute.mock.calls.some(([sql])=>/^(UPDATE|INSERT|DELETE)/.test(sql))).toBe(false);
 });
 it('does not let a generic setup link prepare an app-only password ahead of the required workflow',async()=>{
  await expect(assertAppHirePasswordEntry(current)).rejects.toMatchObject({code:'USE_HIRING_PORTAL'});
  current.password_hash='prepared';current.sso_password_override=1;await expect(assertAppHirePasswordEntry(current)).resolves.toBeUndefined();
 });
 it('preserves family setup, existing group hires and legacy non-group access',async()=>{
  for(const user of [{...current,role:'client_guardian'},{...current,login_is_group_email:1}])await expect(assertAppHireStaffAccess(user)).resolves.toBeUndefined();
  hasHiringHistory=false;await expect(assertAppHireStaffAccess({...current,status:'ACTIVE_EMPLOYEE'})).resolves.toBeUndefined();hasHiringHistory=true;
  organization.feature_flags.hireAccountMode=null;await expect(assertAppHireStaffAccess(current)).resolves.toBeUndefined();
 });
 it.each(['INACTIVE_EMPLOYEE','TERMINATED_PENDING','ACTIVE_EMPLOYEE','active','completed'])('retains the new-hire boundary after status becomes %s and memberships are detached',async status=>{
  current.status=status;current.password_hash='prepared';current.sso_password_override=1;
  await expect(assertAppHireStaffAccess(current)).rejects.toMatchObject({code:'HIRE_ACTIVATION_REQUIRED'});
  await expect(assertAppHireActivationReady(current)).rejects.toMatchObject({code:'APP_HIRE_NOT_READY'});
  expect(m.execute.mock.calls.some(([sql])=>sql.includes('COALESCE(j.agency_id,jd.agency_id)'))).toBe(true);
 });
 it('allows ordinary restoration only for a previously approved, completed app hire',async()=>{
  current.status='INACTIVE_EMPLOYEE';current.completed_at='2026-11-12';current.password_hash='prepared';current.sso_password_override=1;journey.onboarding_completed_at='2026-11-12';
  await expect(assertAppHireActivationReady(current)).resolves.toMatchObject({id:453});
  await expect(assertAppHireStaffAccess(current)).rejects.toMatchObject({code:'HIRE_ACTIVATION_REQUIRED'});
 });
 it('uses the saved live hiring owner even if another QA membership has been added',async()=>{
  organization={id:6,slug:'nlu',is_active:1,feature_flags:{hireAccountMode:'group_password'}};
  await expect(assertAppHireStaffAccess(current)).resolves.toBeUndefined();
  await expect(assertAppHireActivationReady(current)).resolves.toBeUndefined();
 });
 it('records only the new synthetic candidate’s hiring owner, without any completion or activation',async()=>{
  current.status='PROSPECTIVE';await recordAppHireJourney({user:current,agencyId:453,newApplicant:true});
  const write=m.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO hire_journeys'));
  expect(write[1]).toEqual([80,453]);expect(write[0]).not.toMatch(/completed|started|snapshot/);
  m.execute.mockClear();current.status='ACTIVE_EMPLOYEE';await recordAppHireJourney({user:current,agencyId:453});expect(m.execute).not.toHaveBeenCalled();
 });
 it('anchors every new QA app-only staff applicant, including a non-prefixed example identity',async()=>{
  current.status='PROSPECTIVE';current.email=current.personal_email='casey.synthetic@example.com';
  await recordAppHireJourney({user:current,agencyId:453,newApplicant:true});
  expect(m.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO hire_journeys'))?.[1]).toEqual([80,453]);
 });
 it.each(['journey_agency_id','job_agency_id'])('preserves an existing live hiring owner recorded in %s on reapply',async ownerKey=>{
  current.status='PROSPECTIVE';m.execute.mockImplementation(async sql=>sql.startsWith('SELECT id,slug')?[[organization]]:sql.startsWith('SELECT j.agency_id')?[[{[ownerKey]:6}]]:[[]]);
  await recordAppHireJourney({user:current,agencyId:453});
  expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
 });
 it('normalizes an approved app-only active alias through canonical completion and its existing hooks',async()=>{
  current.password_hash='prepared';current.sso_password_override=1;journey.onboarding_completed_at='2026-11-12';
  const find=vi.spyOn(User,'findById').mockResolvedValue(current);
  try{await User.updateStatus(current.id,'active',1435);}finally{find.mockRestore();}
  const write=m.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE users SET'));
  expect(write[1][0]).toBe('ACTIVE_EMPLOYEE');expect(write[0]).toContain('completed_at');expect(write[0]).toContain('passwordless_token = NULL');
  expect(m.submitted).toHaveBeenCalledWith(80);expect(m.enroll).toHaveBeenCalledOnce();
 });
 it('retains legacy active spelling and activation behavior outside app-only QA',async()=>{
  organization.feature_flags.hireAccountMode=null;
  const find=vi.spyOn(User,'findById').mockResolvedValue(current);
  try{await User.updateStatus(current.id,'active',1435);}finally{find.mockRestore();}
  const write=m.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE users SET status'));
  expect(write[1][0]).toBe('active');expect(m.submitted).not.toHaveBeenCalled();expect(m.enroll).not.toHaveBeenCalled();
 });
});
