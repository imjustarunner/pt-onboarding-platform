import {describe,it,expect} from 'vitest';
import {applyProviderRolesNovemberPolicy,nluCategoryDefinitionsHtml,nluChildcarePayHtml,nluTestingPayHtml} from '../providerRolesNovember2026.js';
import {getHandbookSource,validateHandbookSections} from '../../services/workplaceHandbookContent.js';
import {NLU_COMPENSATION_POLICY_VERSION} from '../nluCompensationPolicy.js';
import {amendmentIssues,renderAmendment} from '../itscoOctober2026Drafts.js';
import {employmentCategoryLevelTerms} from '../employmentCategoryLevelTerms.js';
import {programProbationApplies,PROGRAM_RATE_VERSION} from '../programServiceRates.js';

describe('November provider role policies',()=>{
 it('keeps NLU foundational services nonclinical and preserves the documented master’s exception',()=>{
  const html=nluCategoryDefinitionsHtml();
  expect(html).toContain('Category 1 — Foundational Provider');
  expect(html).toContain('Category 1 does not authorize psychotherapy, clinical H-code services, H2014 or psychological testing');
  expect(html).toContain('Category 3 is the standard placement');
  expect(html).toContain('provider without a master’s degree');
  expect(html).toContain('Written approval');
 });
 it('states actual-time childcare ratios, rates and testing pay without duplicating billing units',()=>{
  expect(nluChildcarePayHtml()).toContain('$32.00');
  expect(nluChildcarePayHtml()).toContain('five children and two active shared caregivers');
  expect(nluTestingPayHtml()).toContain('90 actual minutes');
  expect(nluTestingPayHtml()).toContain('1.5 × $44 = $66');
  expect(nluTestingPayHtml()).toContain('no additional automatic indirect allowance');
 });
 it('renumbers legacy NLU references once and does not mutate historical updates',()=>{
  const source={sections:[{slug:'sample',title:'Category 1',bodyHtml:'Categories 1, 2 and 3; Category 1, 2 or 3',status:'ready',parentSlug:null}]};
  const updates=[{subject:'Category 3',changed_content:'Category 2',handbook_section_slug:'sample'}];
  const result=applyProviderRolesNovemberPolicy(source,updates,'nlu');
  expect(source.sections[0].bodyHtml).toBe('Categories 2, 3 and 4; Category 2, 3 or 4');
  expect(updates[0].subject).toBe('Category 3');
  applyProviderRolesNovemberPolicy(source,[],'nlu');
  expect(source.sections[0].title).toBe('Category 2');
  expect(result.updates.some(u=>u.period_label==='November 2026')).toBe(true);
 });
 it.each(['itsco','tisi','nlu'])('includes shared childcare/testing and distinct counseling roles for %s',slug=>{
  const source=getHandbookSource({slug});
  expect(()=>validateHandbookSections(source.sections)).not.toThrow();
  const body=key=>source.sections.find(s=>s.slug===key)?.body_html||'';
  expect(body('counseling-and-psychotherapy-role-expectations')).toContain('Bachelor’s-level');
  expect(body('counseling-and-psychotherapy-role-expectations')).toContain('Master’s-level psychotherapy');
  expect(body('psychological-testing-and-telephone-protocol')).toContain('12-245-232');
  expect(body('psychological-testing-and-telephone-protocol')).toContain('direct supervision');
  expect(body('childcare-role-and-supervision')).toContain('active caregiver');
  if(slug==='nlu') {
   expect(body('compensation-rate-category-4')).toContain('$48.00');
   expect(body('compensation-rate-category-1')).not.toContain('Clinical Session Rate');
   expect(body('nlu-tutoring-compensation')).toContain('$33.00');
   expect(body('nlu-tutoring-and-h2014-compensation')).not.toContain('<h3>Tutoring</h3><table>');
  } else {
   expect(body('compensation-rate-category-4')).toBe('');
   expect(body('childcare-role-and-supervision')).toContain('Another agency’s category numbers, rate amounts and rate caps do not apply automatically');
  }
 });
 it('renders a marked foundational tutoring agreement without requiring clinical pay',()=>{
  const profile={nluCompensationPolicyVersion:NLU_COMPENSATION_POLICY_VERSION,indirectRate:18,supportActivityRate:18};
  const terms=employmentCategoryLevelTerms({agencySlug:'nlu',row:{category:1,level:2,paySystem:profile},tokens:{ROLE_LABEL:'Tutor',CONTRACT_SERVICE_ROLES:['tutoring']}});
  expect(terms.schedule.tutoringVirtualRate).toBe(18);
  expect(terms.compensation).not.toContain('<th>Clinical Session Rate</th>');
  expect(terms.compensation).toContain('$18.00');
  expect(terms.version).toBe(NLU_COMPENSATION_POLICY_VERSION);
 });
 it('rejects a clinical role under new NLU Category 1 before contract generation',()=>{
  expect(()=>employmentCategoryLevelTerms({agencySlug:'nlu',row:{category:1,level:1,paySystem:{nluCompensationPolicyVersion:NLU_COMPENSATION_POLICY_VERSION}},tokens:{CONTRACT_SERVICE_ROLES:['psychotherapy']}})).toThrow('limited to approved nonclinical');
 });
 it('keeps new NLU Category 2 exempt from the legacy program-probation label',()=>{
  const profile={nluCompensationPolicyVersion:NLU_COMPENSATION_POLICY_VERSION,programTenant:'nlu',programRatesVersion:PROGRAM_RATE_VERSION,category:2};
  expect(programProbationApplies(profile,{tenureDays:10})).toBe(false);
  expect(programProbationApplies({...profile,category:3},{tenureDays:10})).toBe(true);
 });
 it('requires documented exceptional non-master’s Category 3 placement without changing service authority',()=>{
  const row={category:3,level:1,paySystem:{nluCompensationPolicyVersion:NLU_COMPENSATION_POLICY_VERSION,indirectRate:22,supportActivityRate:18}};
  const tokens={CREDENTIAL:'BA',CONTRACT_SERVICE_ROLES:['childcare']};
  expect(()=>employmentCategoryLevelTerms({agencySlug:'nlu',row,tokens})).toThrow('placement-exception approval');
  const terms=employmentCategoryLevelTerms({agencySlug:'nlu',row,tokens:{...tokens,NLU_CATEGORY_PLACEMENT_EXCEPTION_REFERENCE:'Approved role/qualifications/oversight/effective-date review #123'}});
  expect(terms.schedule.placementExceptionReference).toContain('#123');
 });
 it('validates and renders a new Category 4 amendment while keeping legacy categories bounded',()=>{
  const data={effectiveDate:'2026-11-21',employee:{name:'Review Person',originalAgreementDate:'2025-01-01'},schedule:{nluCompensationPolicyVersion:NLU_COMPENSATION_POLICY_VERSION,category:4,level:1,creditRate:48,hcodeRate:32,indirectRate:24,supportRate:18,creditRateProbation:45,hcodeRateProbation:25}};
  expect(amendmentIssues(data)).toEqual([]);
  const html=renderAmendment(data);
  expect(html).toContain('Next Level Up, LLC');
  expect(html).toContain('2026-11-21');
  expect(html).not.toContain('October 10, 2026');
  delete data.schedule.nluCompensationPolicyVersion;
  expect(amendmentIssues(data)).toContain('Choose the employee’s approved compensation category.');
 });
});
