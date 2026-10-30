import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../PayrollActualHoursReview.model.js',()=>({default:{latest:vi.fn()}}));
import pool from '../../config/database.js';
import Review from '../PayrollActualHoursReview.model.js';
import PayrollSummary from '../PayrollSummary.model.js';
beforeEach(()=>{vi.clearAllMocks();Review.latest.mockResolvedValue(null);});
it.each(['2026-10-10','2026-10-24'])('preserves %s calculations when rerun before app cutover',async periodStart=>{
 pool.execute.mockImplementation(async sql=>sql.startsWith('SELECT pp.period_start')?[[{period_start:periodStart,pto_policy_json:{sickLeaveHoursEffectiveOn:'2026-11-07'}}]]:[[]]);
 await PayrollSummary.upsert({payrollPeriodId:148,agencyId:2,userId:7,totalHours:1,totalUnits:1,subtotalAmount:44,totalAmount:44,breakdown:{'90837':{hours:1,amount:44},__sickLeaveHours:{sickLeaveHours:1.2}}});
 const [sql,values]=pool.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO payroll_summaries'));
 expect(JSON.parse(values.at(-1)).__sickLeaveHours).toBeUndefined();
 expect(values[10]).toBe(1);expect(values[16]).toBe(44);
});
it('saves the future app basis and automatic indirect detail once',async()=>{
 pool.execute.mockImplementation(async sql=>sql.startsWith('SELECT pp.period_start')?[[{period_start:'2026-11-07',pto_policy_json:{sickLeaveHoursEffectiveOn:'2026-11-07'}}]]:[[]]);
 await PayrollSummary.upsert({payrollPeriodId:149,agencyId:2,userId:7,totalHours:1.75,directHours:1.5,indirectHours:.25,totalUnits:6,subtotalAmount:30,totalAmount:35,breakdown:{H2014:{hours:1.5,amount:30,payType:'hcode'},'AUTO INDIRECT':{hours:.25,amount:5,category:'indirect'}}});
 const [,values]=pool.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO payroll_summaries'));
 expect(JSON.parse(values.at(-1)).__sickLeaveHours).toMatchObject({sickLeaveHours:1.75,automaticIndirectHours:.25,automaticIndirectPay:5,additionalIndirectHours:0});
});
it('historical employee reads do not recalculate or expose policy configuration',async()=>{
 pool.execute.mockResolvedValue([[{period_start:'2026-10-24',total_hours:27.46,total_amount:1180.30,sick_leave_policy:{sickLeaveHoursEffectiveOn:'2026-11-07'},breakdown:{__sickLeaveHours:{sickLeaveHours:32.16}}}]]);
 const [row]=await PayrollSummary.listForUser({userId:7,agencyId:2});
 expect(row).toMatchObject({sick_leave_summary:null,sick_leave_calculation_active:false,total_hours:27.46,total_amount:1180.30});
 expect(row.sick_leave_policy).toBeUndefined();expect(row.breakdown.__sickLeaveHours).toBeUndefined();
});

it('refreshes a stale reporting snapshot when current-period earnings are explicitly saved',async()=>{
 pool.execute.mockImplementation(async sql=>sql.startsWith('SELECT pp.period_start')?[[{period_start:'2026-10-24',pto_policy_json:{sickLeaveHoursEffectiveOn:'2026-10-24'}}]]:[[]]);
 await PayrollSummary.upsert({payrollPeriodId:148,agencyId:2,userId:7,totalHours:1.75,directHours:1.5,indirectHours:.25,totalUnits:6,subtotalAmount:35,totalAmount:35,breakdown:{H2014:{hours:1.5,amount:30,payType:'hcode'},'AUTO INDIRECT':{hours:.25,amount:5,category:'indirect'},__sickLeaveHours:{sickLeaveHours:1,ordinaryEarnings:20}}});
 const [,values]=pool.execute.mock.calls.find(([sql])=>sql.includes('INSERT INTO payroll_summaries'));
 expect(JSON.parse(values.at(-1)).__sickLeaveHours).toMatchObject({sickLeaveHours:1.75,ordinaryEarnings:35,automaticIndirectHours:.25,automaticIndirectPay:5});
});
