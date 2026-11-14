import {expect,it} from 'vitest';
import {treatmentPlanGoalTimeframes} from '../treatmentPlanGoalTimeframes.js';
it('allows missing durations in a draft and rejects them when finalizing',()=>{
 expect(treatmentPlanGoalTimeframes([{goalText:'Partial goal'}])).toEqual([{goalText:'Partial goal',projectedCompletion:null}]);
 expect(()=>treatmentPlanGoalTimeframes([{goalText:'Partial goal'}],{finalize:true})).toThrow('goal 1');
});
it('retains explicit legacy completion text and stores selected months as an exact date',()=>{
 expect(treatmentPlanGoalTimeframes([{projectedCompletion:'6 months'}],{finalize:true})).toEqual([{projectedCompletion:'6 months'}]);
 expect(treatmentPlanGoalTimeframes([{durationMonths:6}],{finalize:true,effectiveDate:'2026-11-14'})[0].projectedCompletion).toBe('2027-05-14');
});
