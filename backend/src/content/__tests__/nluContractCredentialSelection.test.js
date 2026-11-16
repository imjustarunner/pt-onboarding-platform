import {expect,it} from 'vitest';
import {nluEmploymentCategoryTerms} from '../nluEmploymentCategoryTerms.js';
import {NLU_COMPENSATION_POLICY_VERSION} from '../nluCompensationPolicy.js';
const row={category:3,level:1,paySystem:{nluCompensationPolicyVersion:NLU_COMPENSATION_POLICY_VERSION,creditRate:40,hcodeRate:30,indirectRate:22,supportActivityRate:18}};
it.each(['MA','MS','MSW','MA, LPCC'])('accepts recorded master’s credentials %s for standard Category 3 without inventing an exception',credential=>{
 expect(()=>nluEmploymentCategoryTerms({row,tokens:{CREDENTIAL:credential,CONTRACT_SERVICE_ROLES:[]},legal:''})).not.toThrow();
});
it('keeps explicit hiring pay placement separate from credential inference and clinical authority',()=>{
 for(const [category,credential] of [[3,'BA'],[4,'MA']]) {
  const terms=nluEmploymentCategoryTerms({row:{...row,category},tokens:{CREDENTIAL:credential,CONTRACT_SERVICE_ROLES:['psychological_testing']}});
  expect(terms.schedule.category).toBe(category);
  expect(terms.schedule.testingAuthorized).toBe(false);
  expect(terms.schedule.clinicalEligible).toBe(false);
 }
});
it('defaults childcare to the employee level while retaining explicit individual placement and band overrides',()=>{
 const tokens={CONTRACT_SERVICE_ROLES:['childcare']};
 expect(nluEmploymentCategoryTerms({row:{...row,level:4},tokens}).schedule.childcareLevel).toBe(4);
 const terms=nluEmploymentCategoryTerms({row:{...row,level:4},tokens:{...tokens,CONTRACT_SERVICE_ROLE_DETAILS:{childcare:{payLevel:2,ratesByBand:{1:31,2:35,3:37,4:39}}}}});
 expect(terms.schedule.childcareLevel).toBe(2);
 expect(terms.schedule.childcareRatesByBand).toEqual({1:31,2:35,3:37,4:39});
});
it.each([[3,[24,24,24,26,26]],[4,[28,28,28,30,30]]])('uses the owner-confirmed Category %i tutoring schedule in each new agreement', (category,rates)=>{
 for(const [index,rate] of rates.entries()) {
  const terms=nluEmploymentCategoryTerms({row:{...row,category,level:index+1},tokens:{CONTRACT_SERVICE_ROLES:['tutoring']}});
  expect(terms.schedule).toMatchObject({tutoringLevel:index+1,tutoringVirtualRate:rate,tutoringInPersonRate:rate,tutoringPlacementVersion:'nlu-category-tutoring-2026-11-16'});
 }
});
it('retains a separately recorded individual tutoring placement and rate',()=>{
 const terms=nluEmploymentCategoryTerms({row:{...row,category:4,level:5},tokens:{CONTRACT_SERVICE_ROLES:['tutoring'],CONTRACT_SERVICE_ROLE_DETAILS:{tutoring:{payLevel:2,hourlyRate:36.5}}}});
 expect(terms.schedule).toMatchObject({tutoringLevel:2,tutoringVirtualRate:36.5,tutoringInPersonRate:36.5});
});
