import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),agency:vi.fn(),terms:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:mocks.agency}}));
vi.mock('../contractCompensation.service.js',()=>({contractCompensationLevels:vi.fn(async()=>[{category:2,level:3,direct_rate:26,indirect_rate:20,paySystem:{}}]),selectedContractCompensation:vi.fn(async()=>({row:{category:2,level:3,direct_rate:26,indirect_rate:20},rates:[]}))}));
vi.mock('../../content/employmentCategoryLevelTerms.js',()=>({employmentCategoryLevelTerms:mocks.terms,applyEmploymentPayTerms:(clauses,terms)=>clauses.map(clause=>clause.clause_key==='COMP_HOURLY'?{...clause,body_html:terms.compensation}:clause)}));
vi.mock('../packetBrandChrome.service.js',()=>({resolvePacketBrandChrome:async()=>({bodyFontFamily:'sans-serif'}),packetBodyFontCss:()=>''}));
import {renderContractHtml} from '../contractMerge.service.js';
import {contractCompensationLevels,selectedContractCompensation} from '../contractCompensation.service.js';
import {testingCompensationSchedule} from '../../content/testingServicePolicy.js';
import {CONTRACT_PRESENTATION_VERSION,handbookReferencedContractHtml} from '../../content/contractHandbookReference.js';
beforeEach(()=>{
 vi.clearAllMocks();
 mocks.terms.mockReturnValue({compensation:'<p>Approved pay schedule</p>',schedule:{},version:'test'});
 mocks.agency.mockResolvedValue({id:6,slug:'nlu',name:'Next Level Up'});
 mocks.execute.mockImplementation(async sql=>{
  if(sql.includes('FROM contract_configs'))return [[{id:1,is_active:1,pay_mode:'hourly',slug:'employment',clause_keys_json:['INTRO','COMP_HOURLY','JOB_DESC_LPC','SIG_BLOCK']}]];
  if(sql.includes('FROM contract_clauses'))return [[{clause_key:'INTRO',body_html:'<p>Employment agreement.</p>'},{clause_key:'COMP_HOURLY',body_html:'<p>Old shared matrix compensation.</p>'},{clause_key:'JOB_DESC_LPC',title:'Generic psychotherapy duties',body_html:'<p>Diagnose and provide independent psychotherapy.</p>'},{clause_key:'SIG_BLOCK',body_html:'<p>Employee signature.</p>'}]];
  return [[]];
 });
});
const render=tokens=>renderContractHtml({agencyId:6,configId:1,tokens:{COMPENSATION_CATEGORY:'2',COMPENSATION_LEVEL:'3',ROLE_LABEL:'Employee',JOB_TITLE:'Childcare Provider',CREDENTIAL:'GED',...tokens}});
describe('selected service clauses in the full contract preview',()=>{
 it('requires an actual published handbook for a new API preview and never falls back to draft links',async()=>{
  await expect(render({HANDBOOK_REFERENCES_ENABLED:'1',PROBATION_APPLIES:'no',CONTRACT_SERVICE_ROLES:[]})).rejects.toMatchObject({status:409});
 });
 it('retains an ISI provider designation separately from individual service rates without looking up a matrix',async()=>{
  mocks.agency.mockResolvedValue({id:377,slug:'tisi',name:'The Inner Strength Institute'});
  const result=await render({PROBATION_APPLIES:'no',PROVIDER_DESIGNATION_LEVEL:'4',CONTRACT_SERVICE_ROLES:['childcare'],INDIVIDUAL_COMPENSATION_BASIS:'approved_individual_agreement',PRIOR_COMPENSATION_AGREEMENT_REFERENCE:'Approved offer A',CONTRACT_SERVICE_ROLE_DETAILS:{childcare:{payLevel:3,compensationTerms:'Approved individual childcare $29.50/hour.'}}});
  expect(result.tokens.COMPENSATION_SCHEDULE).toMatchObject({providerDesignationLevel:4,providerDesignationLabel:'Advanced Provider',compensationBasis:'approved_individual_agreement'});
  expect(result.html).toContain('Level 4 — Advanced Provider');expect(result.html).toContain('$29.50/hour');expect(contractCompensationLevels).not.toHaveBeenCalled();
 });
 it('keeps the code guide in the handbook while printing individual Testing rates and descriptive program duties',async()=>{
  const profile={creditRate:44,hcodeRate:32,hcodeRateProbation:25,indirectRate:22,h2014Rate:18};
  mocks.terms.mockReturnValue({compensation:'<p>Eligible H2014: $18.00 per actual hour-equivalent.</p>',schedule:profile,version:'test',serviceCompensationTerms:{psychological_testing:testingCompensationSchedule(profile)}});
  const result=await render({JOB_TITLE:'Testing Provider',CREDENTIAL:'MA',CONTRACT_SERVICE_ROLES:['psychological_testing'],CONTRACT_SERVICE_ROLE_DETAILS:{psychological_testing:{authorizationTerms:'Verified instruments, assigned components and qualified supervisor; approval reference A.'}}});
  const text=result.html.replace(/<[^>]*>/g,' ');
  expect(text).toContain('$32.00/actual hour');expect(text).toContain('$44.00/actual hour-equivalent');expect(text).toContain('$18.00 per actual hour-equivalent');
  expect(text).toContain('Workplace Handbook Testing area');expect(text).toContain('therapeutic skills services (Therapy + Tutoring component)');
  expect(text).not.toMatch(/\b(?:96116|96121|96130|96131|96132|96133|96136|96137|96138|96139|96146|H2014)\b/);
  expect(text).not.toContain('Sourced activity example');expect(result.tokens.COMPENSATION_SCHEDULE.h2014Rate).toBe(18);
  expect(result.tokens.CONTRACT_PRESENTATION_VERSION).toBe(CONTRACT_PRESENTATION_VERSION);
 });
 it('preserves internal identifiers, links, amounts and unrelated numbers in contract presentation',()=>{
  const html='<p>H2014: $18.00; office 80919; license 96136.</p><a href="/handbook?code=H2014" data-code="H2014">H2014 reference</a>';
  const rendered=handbookReferencedContractHtml(html);
  expect(rendered).toContain('href="/handbook?code=H2014"');expect(rendered).toContain('data-code="H2014"');
  expect(rendered).toContain('$18.00; office 80919; license 96136');expect(rendered).not.toContain('>H2014 reference');expect(html).toContain('>H2014 reference');
 });
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
