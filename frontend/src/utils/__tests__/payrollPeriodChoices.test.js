import {expect,it} from 'vitest';
import {payrollPeriodChoices,scheduledPayrollPeriods} from '../payrollPeriodChoices';
const periods=[
 {id:1,period_start:'2026-09-12',period_end:'2026-09-25',schedule_aligned:1,status:'staged'},
 {id:2,period_start:'2026-09-26',period_end:'2026-10-09',schedule_aligned:1,status:'posted'},
 {id:3,period_start:'2026-10-10',period_end:'2026-10-23',schedule_aligned:1,status:'staged'},
 {id:4,period_start:'2026-10-17',period_end:'2026-10-30',schedule_aligned:0,status:'staged'},
 {id:5,period_start:'2026-10-24',period_end:'2026-11-06',schedule_aligned:1,status:'staged'},
 ...[6,7,8,9].map((id,index)=>({id,period_start:`2026-11-${String(7+index*7).padStart(2,'0')}`,period_end:`2026-12-${String(1+index).padStart(2,'0')}`,schedule_aligned:1,status:'draft'}))
];
it('shows the two recent scheduled periods and three current/upcoming periods',()=>{
 expect(payrollPeriodChoices(periods,{today:'2026-11-09'}).map(p=>p.id)).toEqual([8,7,6,5,3]);
});
it('offers old periods explicitly while excluding locked and off-schedule destinations',()=>{
 expect(payrollPeriodChoices(periods,{today:'2026-11-09',includeOlder:true}).map(p=>p.id)).toEqual([8,7,6,5,3,1]);
});
it('keeps a selected historical period for payroll history and never re-adds a known off-schedule period',()=>{
 expect(payrollPeriodChoices(periods,{today:'2026-11-09',includeLocked:true,selectedId:2}).map(p=>p.id)).toContain(2);
 expect(payrollPeriodChoices(periods,{today:'2026-11-09',includeLocked:true,selectedId:4}).map(p=>p.id)).not.toContain(4);
});
it('only falls back when the API omits alignment entirely',()=>{
 expect(scheduledPayrollPeriods([{id:1,schedule_aligned:0}])).toEqual([]);
 expect(scheduledPayrollPeriods([{id:1}])).toEqual([{id:1}]);
});
