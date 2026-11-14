import {beforeEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({agency:null,persistedTokens:null,publishedHandbookReady:true,execute:vi.fn(),getConnection:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:state.execute,getConnection:state.getConnection}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:vi.fn(async()=>state.agency)}}));
vi.mock('../../models/OfficeLocation.model.js',()=>({default:{findByAgencyMembership:vi.fn(async()=>[{id:7,name:'QA Office',street_address:'200 Fictional Office Road',city:'Colorado Springs',state:'CO',postal_code:'00000'}]),findByAgency:vi.fn(async()=>[])}}));
vi.mock('../../models/HiringResumeParse.model.js',()=>({default:{findLatestStructuredByCandidateUserId:vi.fn(async()=>null)}}));
vi.mock('../../models/PayrollCompensationLevel.model.js',()=>({default:{getForUser:vi.fn(async()=>null),listForAgency:vi.fn(async()=>[{category:1,level:3,label:'QA foundational placement',direct_rate:null,indirect_rate:18,ffs_rate:null}]),getLevelRatesForAgency:vi.fn(async()=>({}))},COMPENSATION_CATEGORIES:{},LEVEL_IDS:[1,2,3,4,5]}));
vi.mock('../../models/PayrollPaySystemRate.model.js',()=>({default:{listForAgency:vi.fn(async()=>[{id:1,agencyId:state.agency.id,category:1,level:3,nluCompensationPolicyVersion:'nlu-four-category-2026-11-21',nluCompensationEffectiveOn:'2026-11-21',creditRate:null,creditRateProbation:null,hcodeRate:null,hcodeRateProbation:null,indirectRate:18,supportActivityRate:18,tierBonus:{1:0,2:0,3:0}}])}}));
vi.mock('../packetBrandChrome.service.js',()=>({resolvePacketBrandChrome:vi.fn(async()=>({bodyFontFamily:'sans-serif'})),packetBodyFontCss:vi.fn(()=> '')}));
import {handbookTenant} from '../handbookTenant.js';
import {getAgencyBuilderDefaults,inferCompensationFromCredential} from '../contractMerge.service.js';
import {previewCandidateContract,generateAndAssignCandidateContract} from '../contractGenerator.service.js';

const flags={qaSandbox:{syntheticOnly:true,program:'tutoring',sourceAgencyId:6}};
const agency=(id=453)=>({id,slug:id===454?'nlu-qa-learning':'nlu-qa-demo',name:'Next Level Up — SYNTHETIC QA',feature_flags:flags,street_address:'100 Fictional HQ Road',city:'Colorado Springs',state:'CO',postal_code:'00000'});
const publication=agencyId=>({document_id:7000+agencyId,version_id:8000+agencyId,version_number:2,published_at:'2026-11-13T12:00:00Z',source_revision:'synthetic-reviewed-handbook-v2'});
const handbookSections=[
 {id:1,slug:'employee-contract-policy',title:'Employment agreements and handbook policies',parent_slug:null,content_status:'ready',body_html:'<p>The individual agreement states the approved duties and compensation.</p>'},
 {id:2,slug:'childcare-role-and-supervision',title:'Childcare role and supervision',parent_slug:null,content_status:'ready',body_html:'<p>Childcare is a separately authorized nonclinical service with its own approved schedule.</p>'}
];
const clauses=[{clause_key:'STARTER_V1_COMPENSATION_HOURLY',body_html:'<h2>Legacy hourly compensation</h2>'},{clause_key:'JOB_DESC_LPC',body_html:'<h2>Generic psychotherapy duties</h2>'},{clause_key:'SIG_BLOCK',body_html:'<p>Electronic acceptance.</p>'}];
beforeEach(()=>{
 vi.clearAllMocks();state.agency=agency();state.persistedTokens=null;state.publishedHandbookReady=true;
 const db={execute:state.execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};state.getConnection.mockResolvedValue(db);
 state.execute.mockImplementation(async(sql,p=[])=>{
  if(sql.startsWith('SELECT user_id FROM user_agencies'))return [[{user_id:70}]];
  if(sql.startsWith('SELECT status FROM users'))return [[{status:'PROSPECTIVE'}]];
  if(sql.includes('FROM users WHERE id'))return [[{id:70,first_name:'Casey',last_name:'QA Childcare',email:'qa.nlu.childcare.a@example.com',role:'staff',title:'Childcare Provider',credential:'',service_focus:'Childcare / Daycare'}]];
  if(sql.includes('FROM agencies WHERE id'))return [[state.agency]];
  if(sql.startsWith('SELECT s.body_html FROM workplace_handbook_documents')){
   expect(p).toEqual([state.agency.id]);return [state.publishedHandbookReady?handbookSections:[]];
  }
  if(sql.includes('FROM workplace_handbook_documents')){
   expect(sql).toContain('v.is_draft=0');expect(p).toEqual([state.agency.id,state.agency.id]);
   return [state.publishedHandbookReady?[publication(state.agency.id)]:[]];
  }
  if(sql.includes('FROM workplace_handbook_sections')){
   expect(p).toEqual([publication(state.agency.id).version_id,state.agency.id]);return [handbookSections];
  }
  if(sql.includes('FROM hiring_profiles hp'))return [[{applied_role:'Childcare Provider',title:'Childcare Provider',role_type:'Staff',description_text:'Synthetic nonclinical childcare work.',job_description_id:31,city:'Colorado Springs',state:'CO'}]];
  if(sql.startsWith('SELECT * FROM contract_configs'))return [[{id:5,agency_id:state.agency.id,is_active:1,pay_mode:'hourly',clause_keys_json:clauses.map(row=>row.clause_key)}]];
  if(sql.startsWith('SELECT * FROM contract_clauses'))return [clauses];
  if(sql.startsWith('SELECT clause_key,title,body_html,is_active FROM contract_clauses'))return [[]];
  if(sql.startsWith('SELECT g.*'))return [[]];
  if(sql.startsWith('SELECT * FROM tasks'))return [[{id:301,status:'pending'}]];
  if(sql.startsWith('INSERT INTO contract_generations')){state.persistedTokens=JSON.parse(p[4]);return [{insertId:401}];}
  if(sql.startsWith('INSERT INTO user_specific_documents'))return [{insertId:201}];
  if(sql.startsWith('INSERT INTO tasks'))return [{insertId:301}];
  if(sql.startsWith('UPDATE user_office_locations')||sql.startsWith('INSERT INTO user_office_locations')||sql.startsWith('UPDATE users SET work_location')||sql.startsWith('UPDATE user_specific_documents'))return [{affectedRows:1}];
  throw new Error(`Unexpected SQL: ${sql}`);
 });
});

describe('exact NLU QA context in the ordinary staff contract journey',()=>{
 it('recognizes only the two retained synthetic NLU identities, preserving live tenants',()=>{
  expect(handbookTenant(agency(453))).toBe('nlu');expect(handbookTenant(agency(454))).toBe('nlu');
  for(const value of [{id:455,slug:'nlu-qa-demo',feature_flags:flags},{id:453,slug:'nlu-qa-demo'},{id:453,slug:'nlu-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:false,program:'tutoring',sourceAgencyId:6}}},{id:453,slug:'nlu-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring',sourceAgencyId:450}}}])expect(handbookTenant(value)).toBeNull();
  expect(handbookTenant({slug:'nlu'})).toBe('nlu');expect(handbookTenant({slug:'itsco'})).toBe('itsco');expect(handbookTenant({slug:'tisi'})).toBe('isi');
 });
 it('retains the needed QA metadata for normal library and placement inference',async()=>{
  const defaults=await getAgencyBuilderDefaults(453);
  expect(defaults.contractTenant).toBe('nlu');expect(defaults.contractServiceRoleOptions.some(role=>role.id==='childcare')).toBe(true);
  expect(defaults.agency.feature_flags).toEqual(flags);
  expect(inferCompensationFromCredential({agency:defaults.agency,credential:'BA',jobTitle:'Childcare Provider',role:'staff'}).compensationCategory).toBe(2);
 });
 it.each([453,454])('generates a normal Staff agreement in QA%d with a structured Category1 childcare schedule and visible four-band rates',async organizationId=>{
  state.agency=agency(organizationId);
  const input={agencyId:organizationId,candidateUserId:70,configId:5,createdByUserId:1435,compensationCategory:1,compensationLevel:3,tokens:{ROLE_LABEL:'Staff',PROBATION_APPLIES:'no',CONTRACT_SERVICE_ROLES:['childcare'],CONTRACT_SERVICE_ROLE_DETAILS:{childcare:{payLevel:3,ratesByBand:{1:21,2:26,3:30,4:33}}}}};
  const preview=await previewCandidateContract(input);
  expect(preview.unresolvedTokens).toEqual([]);
  expect(preview.tokens.COMPENSATION_POLICY_VERSION).toBe('nlu-four-category-2026-11-21');
  expect(preview.tokens.COMPENSATION_SCHEDULE).toMatchObject({category:1,childcareLevel:3,childcareRatesByBand:{1:21,2:26,3:30,4:33},clinicalEligible:false,creditRate:null,hcodeRate:null});
  expect(preview.html).toContain('Childcare and daycare responsibilities');expect(preview.html).toContain('$21.00');expect(preview.html).toContain('$33.00');expect(preview.html).not.toContain('Generic psychotherapy duties');
  expect(preview.html).toContain('Approved compensation schedule for this service');
  expect(preview.tokens.HANDBOOK_PUBLICATION_VERSION_ID).toBe(publication(organizationId).version_id);
  expect(preview.tokens.COMPENSATION_SCHEDULE).toMatchObject({probationApplies:false,minimumWorkloadEnabled:false});
  expect(preview.html).toContain('data-handbook-section="childcare-role-and-supervision"');
  expect(preview.html).toContain(`data-handbook-agency-id="${organizationId}"`);
  expect(preview.html).toContain(`data-handbook-version-id="${publication(organizationId).version_id}"`);
  const result=await generateAndAssignCandidateContract({...input,expectedPreviewHash:preview.previewHash});
  expect(result).toMatchObject({generationId:401,task:{id:301,status:'pending'}});
  expect(state.persistedTokens.COMPENSATION_SCHEDULE).toEqual(preview.tokens.COMPENSATION_SCHEDULE);
  expect(state.persistedTokens.CONTRACT_SERVICE_ROLES).toEqual(['childcare']);
  expect(state.persistedTokens.HANDBOOK_PUBLICATION_VERSION_ID).toBe(publication(organizationId).version_id);
  expect(state.execute.mock.calls.some(([sql])=>/UPDATE users SET status|INSERT INTO childcare_service_grants/.test(sql))).toBe(false);
 });
 it.each([453,454])('keeps the published-handbook requirement for new QA%d childcare agreements',async organizationId=>{
  state.agency=agency(organizationId);state.publishedHandbookReady=false;
  await expect(previewCandidateContract({agencyId:organizationId,candidateUserId:70,configId:5,compensationCategory:1,compensationLevel:3,tokens:{ROLE_LABEL:'Staff',PROBATION_APPLIES:'no',CONTRACT_SERVICE_ROLES:['childcare'],CONTRACT_SERVICE_ROLE_DETAILS:{childcare:{payLevel:3,ratesByBand:{1:21,2:26,3:30,4:33}}}}})).rejects.toMatchObject({status:409,message:expect.stringContaining('Publish this company’s approved Workplace Handbook')});
  expect(state.persistedTokens).toBeNull();
  expect(state.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO contract_generations'))).toBe(false);
 });
});
