import {expect,it} from 'vitest';
import {nluEmploymentCategoryTerms} from '../nluEmploymentCategoryTerms.js';
import {NLU_COMPENSATION_POLICY_VERSION} from '../nluCompensationPolicy.js';
const row={category:3,level:1,paySystem:{nluCompensationPolicyVersion:NLU_COMPENSATION_POLICY_VERSION,creditRate:40,hcodeRate:30,indirectRate:22,supportActivityRate:18}};
it.each(['MA','MS','MSW','MA, LPCC'])('accepts recorded master’s credentials %s for standard Category 3 without inventing an exception',credential=>{
 expect(()=>nluEmploymentCategoryTerms({row,tokens:{CREDENTIAL:credential,CONTRACT_SERVICE_ROLES:[]},legal:''})).not.toThrow();
});
it('still requires actual written approval for a bachelor’s exception or unlicensed Category 4',()=>{
 for(const [category,credential] of [[3,'BA'],[4,'MA']])expect(()=>nluEmploymentCategoryTerms({row:{...row,category},tokens:{CREDENTIAL:credential,CONTRACT_SERVICE_ROLES:[]}})).toThrow('placement-exception');
});
