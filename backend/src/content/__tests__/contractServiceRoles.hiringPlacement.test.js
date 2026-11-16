import {expect,it} from 'vitest';
import {contractServiceRolePlan} from '../contractServiceRoles.js';
it('retains existing assignment requirements outside the NLU standard employment flow',()=>{
 expect(contractServiceRolePlan({selected:['psychological_testing'],serviceCompensationTerms:{psychological_testing:'Resolved rates'}}).missingFields).toContain('PSYCHOLOGICAL_TESTING_AUTHORIZATION_TERMS');
});
it('uses server-resolved employee childcare placement without requiring it twice',()=>{
 const plan=contractServiceRolePlan({selected:['childcare'],servicePayLevels:{childcare:4},serviceCompensationTerms:{childcare:'Approved child-count bands'}});
 expect(plan.missingFields).toEqual([]);expect(plan.clauses[0].body_html).toContain('Approved childcare pay level:</strong> 4');
});
it('lets standard NLU agreements state conditional testing duties while preserving separately documented assignment text',()=>{
 const plan=contractServiceRolePlan({selected:['psychological_testing'],deferTestingAssignment:true,serviceCompensationTerms:{psychological_testing:'Resolved actual-time rates'},details:{psychological_testing:{authorizationTerms:'Existing approved assignment reference QA-17'}}});
 expect(plan.missingFields).toEqual([]);expect(plan.clauses[0].body_html).toContain('Existing approved assignment reference QA-17');
 expect(plan.clauses[0].body_html).toContain('separate');
});
