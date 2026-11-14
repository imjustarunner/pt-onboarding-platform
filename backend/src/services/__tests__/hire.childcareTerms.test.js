import {beforeEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({execute:vi.fn(),agency:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:state.execute}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:state.agency}}));
vi.mock('../contractCompensation.service.js',()=>({contractCompensationLevels:vi.fn(async()=>[{category:2,level:1,direct_rate:24,indirect_rate:18,paySystem:{category:2,level:1,nluCompensationPolicyVersion:'nlu-four-category-2026-11-21',creditRate:24,creditRateProbation:22,hcodeRate:24,hcodeRateProbation:22,indirectRate:18,supportActivityRate:18}}]),selectedContractCompensation:vi.fn()}));
vi.mock('../packetBrandChrome.service.js',()=>({resolvePacketBrandChrome:async()=>({bodyFontFamily:'sans-serif'}),packetBodyFontCss:()=>''}));
import {renderContractHtml} from '../contractMerge.service.js';
beforeEach(()=>{
 vi.clearAllMocks();
 state.agency.mockResolvedValue({id:6,slug:'nlu',name:'Next Level Up'});
 state.execute.mockImplementation(async sql=>{
  if(sql.includes('FROM contract_configs'))return [[{id:1,is_active:1,pay_mode:'hourly',slug:'employment',clause_keys_json:['INTRO','COMP_HOURLY','JOB_DESC_LPC','SIG_BLOCK']}]];
  if(sql.includes('FROM contract_clauses'))return [[{clause_key:'INTRO',body_html:'<p>Employment agreement.</p>'},{clause_key:'COMP_HOURLY',body_html:'<p>Old compensation.</p>'},{clause_key:'JOB_DESC_LPC',body_html:'<p>Diagnose and provide independent psychotherapy.</p>'},{clause_key:'SIG_BLOCK',body_html:'<p>Employee signature.</p>'}]];
  return [[]];
 });
});
const render=(details={},extra={})=>renderContractHtml({agencyId:6,configId:1,tokens:{COMPENSATION_CATEGORY:'2',COMPENSATION_LEVEL:'1',ROLE_LABEL:'Facilitator',JOB_TITLE:'Learning & Wellness Facilitator',CREDENTIAL:'BA',CONTRACT_SERVICE_ROLES:['bachelors_counseling','tutoring','childcare'],CONTRACT_SERVICE_ROLE_DETAILS:{tutoring:{payLevel:3},childcare:{payLevel:3,...details}},...extra}});
describe('NLU childcare written schedule in a combined-role contract',()=>{
 it('accepts the approved four-band placement without duplicate free text and includes bachelor counseling',async()=>{
  const result=await render();
  expect(result.unresolvedTokens).toEqual([]);
  expect(result.html).toContain('Category 2, approved childcare Level 3.');
  for(const [children,rate] of [[1,24],[2,28],[3,30],[4,32]])expect(result.html).toContain(`${children} child${children===1?'':'ren'} per active caregiver: $${rate}.00/hour`);
  expect(result.html).toContain('no children present use the one-child rate of $24.00/hour');
  expect(result.html).toContain('Bachelor’s-level counseling and skills support');
  expect(result.html).toContain('Tutoring and educational support responsibilities');
  expect(result.html).not.toContain('Diagnose and provide independent psychotherapy.');
  expect(result.clauseManifest).toEqual(expect.arrayContaining([expect.objectContaining({key:'ROLE_PSYCHOTHERAPY',included:false}),expect.objectContaining({key:'ROLE_BACHELORS_COUNSELING',included:true})]));
  expect(result.tokens.COMPENSATION_SCHEDULE).toMatchObject({category:2,level:1,childcareLevel:3,clinicalEligible:false});
 });
 it('uses resolved overrides and preserves separately entered individual terms safely',async()=>{
  const result=await render({hourlyRate:31,ratesByBand:{1:29.5,4:40},compensationTerms:'Approved exception <review #7>.'});
  expect(result.unresolvedTokens).toEqual([]);
  expect(result.html).toContain('1 child per active caregiver: $29.50/hour');
  expect(result.html).toContain('2 children per active caregiver: $31.00/hour');
  expect(result.html).toContain('4 children per active caregiver: $40.00/hour');
  expect(result.html).toContain('no children present use the one-child rate of $29.50/hour');
  expect(result.html).toContain('Approved exception &lt;review #7&gt;.');
 });
 it('recalculates written rates when the childcare level changes instead of reusing prior preview text',async()=>{
  expect((await render({payLevel:1})).html).toContain('1 child per active caregiver: $22.00/hour');
  expect((await render({payLevel:3})).html).toContain('1 child per active caregiver: $24.00/hour');
 });
 it('still blocks a missing childcare placement or invalid band overrides',async()=>{
  await expect(render({payLevel:undefined})).rejects.toThrow('approved NLU service category and pay level');
  await expect(render({ratesByBand:{4:-1}})).rejects.toThrow('positive hourly amount');
 });
 it('resolves Testing pay independently of childcare while requiring Testing assignment approval',async()=>{
  const result=await render({hourlyRate:31}, {CONTRACT_SERVICE_ROLES:['childcare','psychological_testing']});
  expect(result.unresolvedTokens).toEqual(['PSYCHOLOGICAL_TESTING_AUTHORIZATION_TERMS']);
  expect(result.tokens.COMPENSATION_SCHEDULE).toMatchObject({childcareRate:31,testingAdministrationRate:24,testingEvaluationRate:24,testingAuthorized:false});
  expect(result.html).toContain('1 child per active caregiver: $31.00/hour');
  expect(result.html).toContain('Authorized administration/scoring: $24.00/actual hour');
  expect(result.html).toContain('evaluation/interpretation/report/feedback: $24.00/actual hour-equivalent');
  expect(result.html).toContain('Workplace Handbook Testing area');
 });
});
