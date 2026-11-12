import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn(),access:vi.fn(),policy:vi.fn(),agreements:vi.fn(),authorized:vi.fn(),assignment:vi.fn(),rate:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:m.getConnection}}));
vi.mock('../agencyAccessProfiles.service.js',()=>({readAgencyAccess:m.access}));
vi.mock('../compensationCategories.service.js',async original=>({...await original(),compensationAgencyPolicy:m.policy}));
vi.mock('../employmentAgreementPolicy.service.js',async original=>({...await original(),executedEmploymentAgreements:m.agreements}));
vi.mock('../payrollCompensationAuthorization.service.js',()=>({authorizedCompensationSchedules:m.authorized}));
vi.mock('../../models/PayrollCompensationLevel.model.js',()=>({default:{getForUser:m.assignment}}));
vi.mock('../../models/PayrollPaySystemRate.model.js',()=>({default:{get:m.rate}}));
import {createEmployeeCompensationDraft,employeeCompensationDraftOptions,prospectiveCompensationDate} from '../employeeCompensationDraft.service.js';
import {editCompensationDraft,saveCompensationDraft,releaseCompensationDraft} from '../compensationDraft.service.js';
import {nluAmendmentIssues,renderNluAmendment} from '../../content/nluCompensationAmendment.js';
import {executedAgreement,agreementRateProfile} from '../employmentAgreementPolicy.service.js';
import {computeNluServicePay} from '../../content/nluCompensationPolicy.js';

const VERSION='nlu-four-category-2026-11-21',now=new Date('2026-11-12T20:00:00Z');
let agency,employee,signer,push,connection,open,pending,inserted,releasedRow,staffActive;
beforeEach(()=>{
 vi.clearAllMocks();
 agency={id:453,slug:'nlu-qa-demo',name:'Next Level Up — SYNTHETIC QA',is_active:1,is_archived:0,feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring',sourceAgencyId:6}}};
 employee={id:1496,role:'provider',first_name:'Finley',last_name:'QA Tutor',status:'ACTIVE_EMPLOYEE',is_active:1,is_archived:0,is_demo:1};
 signer={id:1435,role:'admin',first_name:'QA',last_name:'Administrator',status:'ACTIVE_EMPLOYEE',is_active:1,is_archived:0,is_demo:1};
 push={id:30,title:'QA compensation review',section_config_json:{amendments:true},amendment_plan_json:null};
 open=null;pending=null;inserted=null;releasedRow=null;staffActive=true;
 connection={execute:m.execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};m.getConnection.mockResolvedValue(connection);
 m.access.mockImplementation(async uid=>({role:uid===1435?'admin':'provider'}));m.policy.mockResolvedValue({nluCompensationPolicyVersion:VERSION,nluCompensationEffectiveOn:'2026-11-12',categories:{1:{label:'Foundational'},2:{label:'Bachelor'}},serviceCompensation:{version:VERSION}});
 m.agreements.mockResolvedValue([]);m.authorized.mockResolvedValue([]);m.assignment.mockResolvedValue(null);m.rate.mockResolvedValue(null);
 m.execute.mockImplementation(async(sql,params=[])=>{
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('RELEASE_LOCK'))return [[{released:1}]];
  if(sql.startsWith('SELECT candidate_user_id FROM contract_generations'))return [[{candidate_user_id:1496}]];
  if(sql.startsWith('SELECT id FROM users WHERE id='))return [[{id:1496}]];
  if(sql.startsWith('SELECT id,slug,name'))return [[agency]];
  if(sql.startsWith('SELECT u.id,u.role,u.status'))return [[signer]];
  if(sql.startsWith('SELECT u.id,u.first_name'))return [[employee,signer]];
  if(sql.startsWith('SELECT p.id,p.title'))return [[push]];
  if(sql.startsWith('SELECT u.*'))return [[Number(params[0])===1496?employee:signer]];
  if(sql.startsWith('SELECT p.*'))return push?[[push]]:[[]];
  if(sql.startsWith('SELECT id,token_values_json,rendered_html FROM contract_generations'))return [open?[open]:[]];
  if(sql.startsWith('SELECT g.id FROM contract_generations'))return [pending?[{id:pending}]:[]];
  if(sql.startsWith('SELECT * FROM contract_generations'))return [releasedRow?[releasedRow]:[]];
  if(sql.startsWith('INSERT INTO contract_generations')){inserted=JSON.parse(params[2]);return [{insertId:201}];}
  if(sql.startsWith('INSERT INTO user_activity_log'))return [{insertId:801}];
  if(sql.startsWith('SELECT u.id FROM users'))return [staffActive?[{id:1435}]:[]];
  if(sql.includes('FROM provider_update_pushes'))return push?[[push]]:[[]];
  if(sql.includes('FROM provider_update_recipients'))return [[]];
  if(sql.startsWith('SELECT user_id FROM user_agencies'))return [[{user_id:1496}]];
  if(sql.startsWith('INSERT INTO user_specific_documents'))return [{insertId:301}];
  if(sql.startsWith('INSERT INTO tasks'))return [{insertId:params[0].startsWith('Countersign')?402:401}];
  if(sql.startsWith('UPDATE'))return [{affectedRows:1}];
  throw Error(`Unexpected SQL: ${sql}`);
 });
});
const request=()=>({userId:1496,pushId:30,countersignerUserId:1435,effectiveDate:'2026-11-13',initialAgreement:true});
const create=(input=request())=>createEmployeeCompensationDraft(453,input,1435,{now});
const ready=data=>({...data,schedule:{...data.schedule,category:2,level:3,indirectRate:20,supportRate:20,childcareLevel:3,childcareRatesByBand:{1:25,2:31,3:36,4:40}}});

describe('normal scoped employee compensation draft creation',()=>{
 it('offers retained QA demo staff and real scoped signers without exposing salary snapshots',async()=>{
  const options=await employeeCompensationDraftOptions(453,1435,{now});
  expect(options.enabled).toBe(true);expect(options.employees.map(p=>p.id)).toContain(1496);expect(options.countersigners.map(p=>p.id)).toEqual([1435]);expect(options.pushes).toEqual([{id:30,title:push.title}]);
  expect(options.employees[0]).not.toHaveProperty('schedule');expect(options.employees[0]).not.toHaveProperty('email');
 });
 it('creates only an initial unsigned review draft and its audit row, never an approval or new-hire receipt',async()=>{
  const result=await create();expect(result).toMatchObject({id:201,reused:false,auditRowId:801});
  expect(result.data).toMatchObject({initialAgreement:true,createdVia:'employee_compensation_ui',employee:{userId:1496,originalAgreementDate:null},schedule:{clinicalEligible:false,category:null,level:null}});
  expect(result.html).toContain('Initial Individual Compensation Agreement');expect(result.html).not.toContain('Prior agreement: [confirm]');
  expect(result.issues.length).toBeGreaterThan(0);expect(connection.commit).toHaveBeenCalledOnce();
  expect(m.execute.mock.calls.some(([sql])=>/INSERT INTO tasks|UPDATE users|INSERT INTO payroll_compensation_authorizations|hire_journeys/.test(sql))).toBe(false);
 });
 it('reopens an existing edited unsigned draft without resetting its terms or duplicating records',async()=>{
  open={id:17,token_values_json:{...ready({employee:{userId:1496,name:'Existing'},effectiveDate:'2026-11-13'}),nluCompensationPolicyVersion:VERSION},rendered_html:'Preserved draft'};
  const result=await create();expect(result).toMatchObject({id:17,reused:true,html:'Preserved draft'});expect(result.data.schedule.childcareRatesByBand[3]).toBe(36);
  expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
 });
 it('preserves the executed service schedule, tutoring formats, role terms and original history on an amendment',async()=>{
  const prior={id:10,agreementDate:'2026-11-01',effectiveOn:'2026-11-01',data:{compensationPolicyVersion:'itsco-2026-10-service-credit-v2',schedule:{nluCompensationPolicyVersion:VERSION,category:2,level:3,clinicalEligible:false,indirectRate:20,supportRate:20,tutoringLevel:4,tutoringCategory:2,tutoringRates:{virtual:25,in_person:27},serviceRoles:['tutoring']},roleCompensation:{supervisor:null},additionalTerms:'Preserved tutoring terms'}};
  m.agreements.mockResolvedValue([prior]);
  const result=await create({...request(),initialAgreement:false});
  expect(result.data.schedule).toEqual(prior.data.schedule);expect(result.data.source.priorSchedule).toEqual(prior.data.schedule);expect(prior.data.schedule).not.toHaveProperty('childcareLevel');
  const edited=editCompensationDraft(result.data,{schedule:{childcareLevel:3,childcareRatesByBand:{1:21,2:26,3:30,4:33}}},1435,{now});
  expect(edited.schedule.tutoringRates).toEqual({virtual:25,in_person:27});expect(edited.roleCompensation).toEqual(prior.data.roleCompensation);expect(renderNluAmendment(edited)).toContain('In person: $27.00');
 });
 it('requires explicit migration review for an executed legacy schedule without replacing its category or terms',async()=>{
  const legacy=executedAgreement({id:9,token_values_json:{schedule:{category:1,level:3,creditRate:40,indirectRate:20},effectiveDate:'2026-10-01'},metadata:{employmentContract:true},signed_pdf_path:'signed/legacy.pdf',audit_trail:{adminCountersign:{signedAt:'2026-10-02T10:00:00Z'}}});
  m.agreements.mockResolvedValue([legacy]);
  await expect(create({...request(),initialAgreement:false})).rejects.toThrow('migration review');expect(inserted).toBeNull();expect(legacy.data.schedule.category).toBe(1);
 });
 it('roundtrips edited four-band pay through the actual executed-agreement and service-pay readers while retaining prior tutoring terms',async()=>{
  const originalSchedule={nluCompensationPolicyVersion:VERSION,category:2,level:3,clinicalEligible:false,indirectRate:20,supportRate:20,autoIndirectMinutes:20,tier3LevelBonus:9,tutoringLevel:4,tutoringCategory:2,tutoringRates:{virtual:25,in_person:27},childcareLevel:1,childcareRatesByBand:{1:17,2:20,3:22,4:23}};
  const originalTokens={COMPENSATION_POLICY_VERSION:VERSION,COMPENSATION_SCHEDULE:originalSchedule,CONTRACT_SERVICE_ROLES:['tutoring'],EFFECTIVE_DATE:'2026-11-01',additionalTerms:'Existing individual tutoring arrangement.'};
  const prior=executedAgreement({id:10,token_values_json:originalTokens,metadata:{contractGeneration:true},signed_pdf_path:'signed/prior.pdf',audit_trail:{adminCountersign:{signedAt:'2026-11-02T18:00:00Z'}}});
  m.agreements.mockResolvedValue([prior]);
  const created=await create({...request(),initialAgreement:false});
  expect(created.data).not.toHaveProperty('COMPENSATION_SCHEDULE');expect(created.data).not.toHaveProperty('COMPENSATION_POLICY_VERSION');
  const edited=editCompensationDraft(created.data,{schedule:{childcareLevel:3,childcareRatesByBand:{1:21,2:26,3:30,4:33}}},1435,{now});
  const executed=executedAgreement({id:201,token_values_json:JSON.stringify(edited),metadata:{contractGeneration:true},signed_pdf_path:'signed/new.pdf',audit_trail:{adminCountersign:{signedAt:'2026-11-13T18:00:00Z'}}});
  const profile=agreementRateProfile({},executed);
  expect(profile).toMatchObject({childcareLevel:3,childcareRatesByBand:{1:21,2:26,3:30,4:33},tutoringLevel:4,tutoringRates:{virtual:25,in_person:27},clinicalEligible:false});
  for(const children of [1,2,3,4])expect(computeNluServicePay({profile,status:{asOfDate:'2026-11-13'},serviceCode:'CHILDCARE',actualMinutes:90,serviceContext:{children,caregivers:1,minimumHourlyRate:15,wageFloorJurisdiction:'Synthetic QA policy fixture'}})).toMatchObject({rate:edited.schedule.childcareRatesByBand[children],amount:edited.schedule.childcareRatesByBand[children]*1.5,autoIndirectAmount:0});
  const tutoringPay=computeNluServicePay({profile,status:{asOfDate:'2026-11-13'},serviceCode:'TUTORING',actualMinutes:60,serviceContext:{format:'in_person',minimumHourlyRate:15,wageFloorJurisdiction:'Synthetic QA policy fixture'}});
  expect(tutoringPay).toMatchObject({rate:27,amount:27,autoIndirectHours:20/60});expect(edited.schedule.tier3LevelBonus).toBe(9);expect(renderNluAmendment(edited)).toContain('receives 20 indirect minutes');
  expect(edited.source.priorSchedule).toEqual(originalSchedule);expect(originalTokens.COMPENSATION_SCHEDULE.childcareLevel).toBe(1);expect(edited.schedule.serviceRoles).toEqual(['tutoring','childcare']);
 });
 it.each(['signed future','authorized future'])('blocks replacement before an existing %s cutover even when it is not effective for current payroll',async kind=>{
  const future={id:14,effectiveOn:'2026-11-21',agreementDate:'2026-11-21',data:{schedule:{nluCompensationPolicyVersion:VERSION,category:2,level:3,tutoringLevel:4}}};
  if(kind==='signed future')m.agreements.mockResolvedValue([future]);else m.authorized.mockResolvedValue([future]);
  await expect(create({...request(),initialAgreement:false,priorAgreementReference:'external reference'})).rejects.toThrow('future compensation schedule');expect(inserted).toBeNull();
 });
 it('does not label an explicitly payroll-authorized schedule an initial agreement',async()=>{
  m.authorized.mockResolvedValue([{id:15,effectiveOn:'2026-11-01',data:{schedule:{nluCompensationPolicyVersion:VERSION,category:2,level:3}}}]);
  await expect(create()).rejects.toThrow('Existing approved compensation terms');expect(inserted).toBeNull();
 });
 it('does not fabricate a signed prior agreement from an unexecuted payroll authorization',async()=>{
  m.authorized.mockResolvedValue([{id:15,payrollAuthorizationId:6,executed:false,effectiveOn:'2026-11-01',agreementDate:'2026-10-29',data:{compensationPolicyVersion:'itsco-2026-10-service-credit-v2',schedule:{nluCompensationPolicyVersion:VERSION,category:2,level:3}}}]);
  await expect(create({...request(),initialAgreement:false})).rejects.toThrow('no executed employee agreement');expect(inserted).toBeNull();
 });
 it('requires migration review for malformed legacy policy data even when its schedule has an NLU marker',async()=>{
  m.agreements.mockResolvedValue([{id:15,effectiveOn:'2026-11-01',agreementDate:'2026-10-29',data:{compensationPolicyVersion:'unsupported-legacy',schedule:{nluCompensationPolicyVersion:VERSION,category:2,level:3}}}]);
  await expect(create({...request(),initialAgreement:false})).rejects.toThrow('migration review');expect(inserted).toBeNull();
 });
 it('keeps the signed source reference immutable but permits a documented external prior reference to be reviewed',()=>{
  const source={employee:{originalAgreementDate:'2026-11-01 · agreement 10'},source:{priorAgreement:{id:10}},schedule:{}};
  expect(()=>editCompensationDraft(source,{originalAgreementDate:'different agreement'},1435,{now})).toThrow('immutable');
  expect(editCompensationDraft({employee:{originalAgreementDate:'paper reference'},schedule:{}},{originalAgreementDate:'Reviewed external paper agreement'},1435,{now}).employee.originalAgreementDate).toBe('Reviewed external paper agreement');
 });
 it.each(['actor role','pending actor','terminated actor','pending hire','wrong organization','QA source changed','QA marker missing','inactive employee','self countersign','inactive countersigner','private update','amendments disabled','already issued','initial over signed terms','missing prior reference','early policy date'])('does not create a document when blocked by %s',async reason=>{
  const input=request();
  if(reason==='actor role')m.access.mockResolvedValue({role:'staff'});
  if(reason==='pending actor')signer.status='ONBOARDING';
  if(reason==='terminated actor')signer.terminated_at='2026-11-12T18:00:00Z';
  if(reason==='pending hire')employee.status='ONBOARDING';
  if(reason==='wrong organization')m.execute.mockImplementation(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.startsWith('SELECT id,slug')?[[agency]]:[[]]);
  if(reason==='QA source changed')agency.feature_flags.qaSandbox.sourceAgencyId=7;
  if(reason==='QA marker missing')agency.feature_flags.qaSandbox.syntheticOnly=false;
  if(reason==='inactive employee')employee.is_active=0;
  if(reason==='self countersign')input.countersignerUserId=1496;
  if(reason==='inactive countersigner')signer.status='INACTIVE_EMPLOYEE';
  if(reason==='private update')push=null;
  if(reason==='amendments disabled')push.section_config_json.amendments=false;
  if(reason==='already issued')pending=15;
  if(reason==='initial over signed terms')m.agreements.mockResolvedValue([{id:10,effectiveOn:'2026-11-01',data:{schedule:{}}}]);
  if(reason==='missing prior reference')input.initialAgreement=false;
  if(reason==='early policy date')m.policy.mockResolvedValue({nluCompensationPolicyVersion:VERSION,nluCompensationEffectiveOn:'2026-11-21'});
  await expect(create(input)).rejects.toThrow();expect(inserted).toBeNull();expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
 });
 it.each(['2026-02-30','2026-11-11','not a date'])('rejects a backdated or impossible effective date %s',date=>expect(()=>prospectiveCompensationDate(date,{now})).toThrow());
 it('allows nonclinical Category2 tutoring and childcare without inventing clinical pay authority',()=>{
  const data=ready({initialAgreement:true,employee:{name:'QA staff'},effectiveDate:'2026-11-13',schedule:{clinicalEligible:false}});expect(nluAmendmentIssues(data)).toEqual([]);expect(renderNluAmendment(data)).not.toContain('<th>Clinical Session Rate</th>');
  data.schedule.creditRate=44;expect(nluAmendmentIssues(data).some(issue=>issue.includes('nonclinical-only'))).toBe(true);
 });
 it('preserves unchanged dormant clinical matrix fields from the signed nonclinical source but cannot introduce or increase them',()=>{
  const data=ready({initialAgreement:false,employee:{name:'QA staff',originalAgreementDate:'2026-11-01 · agreement 10'},createdVia:'employee_compensation_ui',effectiveDate:'2026-11-13',source:{priorAgreement:{id:10},priorSchedule:{creditRate:44,hcodeRate:32}},schedule:{clinicalEligible:false,creditRate:44,hcodeRate:32}});
  expect(nluAmendmentIssues(data)).toEqual([]);expect(renderNluAmendment(data)).not.toContain('<th>Clinical Session Rate</th>');
  data.schedule.creditRate=45;expect(nluAmendmentIssues(data).some(issue=>issue.includes('nonclinical-only'))).toBe(true);
 });
});

describe('reviewed draft save and signature release',()=>{
 it('rolls back a stale editor before any mutation or audit',async()=>{
  const created=await create();open={id:201,token_values_json:created.data,rendered_html:'Newer saved terms'};m.execute.mockClear();
  await expect(saveCompensationDraft(453,201,{expectedHtml:'Old page'},1435)).rejects.toMatchObject({status:409});expect(m.execute.mock.calls.some(([sql])=>/^(UPDATE|INSERT)/.test(sql))).toBe(false);
 });
 it('releases a complete nonclinical agreement only into separate employee and employer signature tasks',async()=>{
  const created=await create(),data=ready(created.data);releasedRow={id:201,candidate_user_id:1496,token_values_json:data,rendered_html:renderNluAmendment(data)};m.execute.mockClear();
  const result=await releaseCompensationDraft(453,201,{expectedHtml:releasedRow.rendered_html,pushId:30},1435);
  expect(result).toMatchObject({taskId:401,countersignerUserId:1435,messagesSent:0,auditRowId:801});
  const tasks=m.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO tasks'));expect(tasks).toHaveLength(2);expect(tasks[0][1][2]).toBe(1496);expect(tasks[1][1][2]).toBe(1435);
  expect(m.execute.mock.calls.some(([sql])=>/UPDATE users|INSERT INTO payroll|UPDATE payroll/.test(sql))).toBe(false);
 });
 it('returns the same released task on an uncertain transport retry without duplicate signature assignments',async()=>{
  const data=ready({draftKind:'provider_update_compensation',createdVia:'employee_compensation_ui',initialAgreement:true,employee:{userId:1496,name:'QA'},effectiveDate:'2026-11-13',countersignerUserId:1435,releasedAt:'2026-11-12T20:00:00Z'}),html=renderNluAmendment(data);
  releasedRow={id:201,candidate_user_id:1496,task_id:401,user_specific_document_id:301,token_values_json:data,rendered_html:html.replace('<p><strong>Editable draft — not issued or signed.</strong></p>','')};
  expect(await releaseCompensationDraft(453,201,{expectedHtml:html,pushId:30},1435)).toMatchObject({taskId:401,reused:true});expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
 });
 it.each(['terminated','family role','assistant','agency disabled','policy disabled','counter inactive','counter revoked','update disabled','different update','new signed agreement'])('rechecks current eligibility and preserves the saved draft when %s before release',async reason=>{
  const created=await create(),data=ready(created.data);releasedRow={id:201,candidate_user_id:1496,token_values_json:data,rendered_html:renderNluAmendment(data)};
  if(reason==='terminated')employee.terminated_at='2026-11-12T20:00:00Z';
  if(reason==='family role')employee.role='guardian';
  if(reason==='assistant')employee.is_assistant_account=1;
  if(reason==='agency disabled')agency.is_active=0;
  if(reason==='policy disabled')m.policy.mockResolvedValue({});
  if(reason==='counter inactive')signer.status='INACTIVE_EMPLOYEE';
  if(reason==='counter revoked')m.access.mockImplementation(async uid=>({role:uid===1435?'staff':'provider'}));
  if(reason==='update disabled')push.section_config_json.amendments=false;
  if(reason==='new signed agreement')m.agreements.mockResolvedValue([{id:42,effectiveOn:'2026-11-12',data:{schedule:{nluCompensationPolicyVersion:VERSION,category:2,level:3}}}]);
  m.execute.mockClear();await expect(releaseCompensationDraft(453,201,{expectedHtml:releasedRow.rendered_html,pushId:reason==='different update'?31:30},1435)).rejects.toThrow();
  expect(m.execute.mock.calls.some(([sql])=>/^(INSERT|UPDATE)/.test(sql))).toBe(false);expect(connection.rollback).toHaveBeenCalled();
 });
 it('serializes create against release so an issued agreement cannot be duplicated by a concurrent new draft',async()=>{
  const created=await create(),data=ready(created.data);releasedRow={id:201,candidate_user_id:1496,token_values_json:data,rendered_html:renderNluAmendment(data)};open={id:201,token_values_json:data,rendered_html:releasedRow.rendered_html};
  const original=m.execute.getMockImplementation();let held=false,waiter,locked,proceed;const locks=[];
  const releasedLocked=new Promise(resolve=>{locked=resolve;}),mayProceed=new Promise(resolve=>{proceed=resolve;});
  m.execute.mockImplementation(async(sql,params)=>{
   if(sql.includes('GET_LOCK')){locks.push(params[0]);if(held)await new Promise(resolve=>{waiter=resolve;});held=true;return [[{acquired:1}]];}
   if(sql.includes('RELEASE_LOCK')){held=false;waiter?.();return [[{released:1}]];}
   if(sql.startsWith('SELECT * FROM contract_generations')){locked();await mayProceed;}
   if(sql.startsWith('UPDATE contract_generations SET task_id=')){open=null;pending=201;}
   return original(sql,params);
  });
  const releasing=releaseCompensationDraft(453,201,{expectedHtml:releasedRow.rendered_html,pushId:30},1435);await releasedLocked;const creating=create();proceed();
  const [released,newDraft]=await Promise.allSettled([releasing,creating]);
  expect(released.status).toBe('fulfilled');expect(newDraft.status).toBe('rejected');expect(newDraft.reason.message).toContain('already issued');expect(locks).toEqual(['employee-compensation:453:1496','employee-compensation:453:1496']);
 });
});
