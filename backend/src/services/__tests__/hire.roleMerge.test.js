import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),agency:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:mocks.agency}}));
vi.mock('../contractCompensation.service.js',()=>({contractCompensationLevels:vi.fn(async()=>[{category:2,level:3,direct_rate:26,indirect_rate:20,paySystem:{}}]),selectedContractCompensation:vi.fn(async()=>({row:{category:2,level:3,direct_rate:26,indirect_rate:20},rates:[]}))}));
vi.mock('../../content/employmentCategoryLevelTerms.js',()=>({employmentCategoryLevelTerms:()=>({compensation:'<p>Approved pay schedule</p>',schedule:{},version:'test'}),applyEmploymentPayTerms:(clauses,terms)=>clauses.map(clause=>clause.clause_key==='COMP_HOURLY'?{...clause,body_html:terms.compensation}:clause)}));
vi.mock('../packetBrandChrome.service.js',()=>({resolvePacketBrandChrome:async()=>({bodyFontFamily:'sans-serif'}),packetBodyFontCss:()=>''}));
import {renderContractHtml} from '../contractMerge.service.js';
import {contractCompensationLevels,selectedContractCompensation} from '../contractCompensation.service.js';
beforeEach(()=>{
 vi.clearAllMocks();
 mocks.agency.mockResolvedValue({id:6,slug:'nlu',name:'Next Level Up'});
 mocks.execute.mockImplementation(async sql=>{
  if(sql.includes('FROM contract_configs'))return [[{id:1,is_active:1,pay_mode:'hourly',slug:'employment',clause_keys_json:['INTRO','COMP_HOURLY','JOB_DESC_LPC','SIG_BLOCK']}]];
  if(sql.includes('FROM contract_clauses'))return [[{clause_key:'INTRO',body_html:'<p>Employment agreement.</p>'},{clause_key:'COMP_HOURLY',body_html:'<p>Old shared matrix compensation.</p>'},{clause_key:'JOB_DESC_LPC',title:'Generic psychotherapy duties',body_html:'<p>Diagnose and provide independent psychotherapy.</p>'},{clause_key:'SIG_BLOCK',body_html:'<p>Employee signature.</p>'}]];
  return [[]];
 });
});
const render=tokens=>renderContractHtml({agencyId:6,configId:1,tokens:{COMPENSATION_CATEGORY:'2',COMPENSATION_LEVEL:'3',ROLE_LABEL:'Employee',JOB_TITLE:'Childcare Provider',CREDENTIAL:'GED',...tokens}});
describe('selected service clauses in the full contract preview',()=>{
 it.each(['itsco','nlu','tisi'])('includes childcare for %s, omits unrelated psychotherapy duties and blocks missing pay terms',async slug=>{
  mocks.agency.mockResolvedValue({id:6,slug,name:'Example Practice'});
  const result=await render({CONTRACT_SERVICE_ROLES:['childcare']});
  expect(result.html).toContain('Childcare and daycare responsibilities');
  expect(result.html).not.toContain('Diagnose and provide independent psychotherapy.');
  expect(result.unresolvedTokens).toContain('CHILDCARE_COMPENSATION_TERMS');
  expect(result.clauseManifest).toEqual(expect.arrayContaining([expect.objectContaining({key:'ROLE_CHILDCARE',included:true}),expect.objectContaining({key:'ROLE_PSYCHOTHERAPY',included:false}),expect.objectContaining({key:'JOB_DESC_LPC',included:false})]));
  expect(result.html.indexOf('Childcare and daycare responsibilities')).toBeLessThan(result.html.indexOf('class="contract-signatures"'));
 });
 it('uses completed individual testing terms and requires its own direct-supervision reference',async()=>{
  const result=await render({JOB_TITLE:'Testing Technician',CONTRACT_SERVICE_ROLES:['psychological_testing'],CONTRACT_SERVICE_ROLE_DETAILS:{psychological_testing:{compensationTerms:'Administration $26/hour; evaluation $28/hour; indirect $20/hour.'}}});
  expect(result.html).toContain('Administration $26/hour');
  expect(result.unresolvedTokens).not.toContain('PSYCHOLOGICAL_TESTING_COMPENSATION_TERMS');
  expect(result.unresolvedTokens).toContain('PSYCHOLOGICAL_TESTING_AUTHORIZATION_TERMS');
  expect(result.html).toContain('C.R.S. § 12-245-232(3)');
 });
 it('can add psychotherapy and tutoring independently to a combined role',async()=>{
  const result=await render({JOB_TITLE:'Psychotherapist and Tutor',CREDENTIAL:'MA',CONTRACT_SERVICE_ROLES:['psychotherapy','tutoring']});
  expect(result.html).toContain('Master’s-level psychotherapy responsibilities');
  expect(result.html).toContain('Tutoring and educational support responsibilities');
  expect(result.clauseManifest.find(c=>c.key==='ROLE_CHILDCARE').included).toBe(false);
  expect(result.unresolvedTokens).toEqual([]);
 });
 it.each(['tisi','innerstrength','the-inner-strength-institute'])('uses approved individual compensation for %s without querying a rate matrix',async slug=>{
  mocks.agency.mockResolvedValue({id:377,slug,name:'The Inner Strength Institute'});
  const result=await render({JOB_TITLE:'Tutor',CONTRACT_SERVICE_ROLES:['tutoring'],INDIVIDUAL_COMPENSATION_BASIS:'approved_individual_agreement',PRIOR_COMPENSATION_AGREEMENT_REFERENCE:'Approved individual written offer 2026-11-12',CONTRACT_SERVICE_ROLE_DETAILS:{tutoring:{compensationTerms:'Individually approved tutoring $31.25 per actual hour; indirect treatment per this written offer.'}}});
  expect(result.html).toContain('$31.25 per actual hour');
  expect(result.html).toContain('Approved individual written offer 2026-11-12');
  expect(result.html).not.toContain('Old shared matrix compensation');
  expect(result.tokens).toMatchObject({COMPENSATION_CATEGORY:'',COMPENSATION_LEVEL:'',COMPENSATION_SCHEDULE:{compensationBasis:'approved_individual_agreement',requiresSeparatePayrollSetup:true}});
  expect(contractCompensationLevels).not.toHaveBeenCalled();
  expect(selectedContractCompensation).not.toHaveBeenCalled();
  expect(result.unresolvedTokens).toEqual([]);
 });
 it('blocks missing individual agreement references or role compensation before attempting a matrix lookup',async()=>{
  mocks.agency.mockResolvedValue({id:377,slug:'tisi',name:'The Inner Strength Institute'});
  const tokens={CONTRACT_SERVICE_ROLES:['tutoring'],INDIVIDUAL_COMPENSATION_BASIS:'approved_individual_agreement',CONTRACT_SERVICE_ROLE_DETAILS:{tutoring:{compensationTerms:'$31.25 per hour.'}}};
  await expect(render(tokens)).rejects.toThrow('Identify the approved individual compensation agreement or written offer');
  await expect(render({...tokens,PRIOR_COMPENSATION_AGREEMENT_REFERENCE:'Approved offer A',CONTRACT_SERVICE_ROLE_DETAILS:{}})).rejects.toThrow('Complete the approved individual compensation terms for tutoring');
  expect(contractCompensationLevels).not.toHaveBeenCalled();
  expect(selectedContractCompensation).not.toHaveBeenCalled();
 });
 it('keeps each combined individual role’s terms distinct and testing authorization mandatory',async()=>{
  mocks.agency.mockResolvedValue({id:377,slug:'tisi',name:'The Inner Strength Institute'});
  const result=await render({CONTRACT_SERVICE_ROLES:['tutoring','childcare','psychological_testing'],INDIVIDUAL_COMPENSATION_BASIS:'approved_individual_agreement',PRIOR_COMPENSATION_AGREEMENT_REFERENCE:'Individual offer A',CONTRACT_SERVICE_ROLE_DETAILS:{tutoring:{compensationTerms:'Tutoring $31.25/hour.'},childcare:{payLevel:3,compensationTerms:'Childcare $29.50/hour under this offer’s staffing bands.'},psychological_testing:{compensationTerms:'Testing administration $47.75/hour; authorized evaluation $83.25/hour.'}}});
  expect(result.html).toContain('$31.25/hour');expect(result.html).toContain('$29.50/hour');expect(result.html).toContain('$83.25/hour');
  expect(result.unresolvedTokens).toEqual(['PSYCHOLOGICAL_TESTING_AUTHORIZATION_TERMS']);
  expect(result.tokens.COMPENSATION_SCHEDULE.serviceTerms.childcare.payLevel).toBe(3);
  expect(selectedContractCompensation).not.toHaveBeenCalled();
 });
 it('keeps ITSCO on its existing compensation path even if an individual-basis flag is supplied',async()=>{
  mocks.agency.mockResolvedValue({id:2,slug:'itsco',name:'ITSCO'});
  const result=await render({ROLE_LABEL:'Provider',CONTRACT_SERVICE_ROLES:['tutoring'],INDIVIDUAL_COMPENSATION_BASIS:'approved_individual_agreement',PRIOR_COMPENSATION_AGREEMENT_REFERENCE:'Ignored exception',CONTRACT_SERVICE_ROLE_DETAILS:{tutoring:{compensationTerms:'$31.25/hour.'}}});
  expect(result.html).toContain('Approved pay schedule');
  expect(result.html).not.toContain('Individual compensation agreement');
  expect(result.tokens.COMPENSATION_CATEGORY).toBe('2');
  expect(result.tokens.COMPENSATION_LEVEL).toBe('3');
  expect(result.tokens.INDIVIDUAL_COMPENSATION_BASIS).toBeUndefined();
  expect(result.tokens.INDIVIDUALCOMPENSATIONBASIS).toBeUndefined();
  expect(contractCompensationLevels).toHaveBeenCalled();
 });
});
