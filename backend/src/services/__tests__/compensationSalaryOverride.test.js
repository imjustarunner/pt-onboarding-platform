import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {approvedPeriodSalaryOverride} from '../payrollSalaryOverridePolicy.js';
const db={execute:vi.fn()},args={agencyId:2,payrollPeriodId:147,userId:485,manualSalaryAmount:1538.46};
beforeEach(()=>db.execute.mockReset().mockResolvedValue([[{id:1,salary_amount:'1538.46',approved_by_user_id:501,approved_at:'2026-10-28',reason:'Michael approved full-period salary override'}]]));
it('requires a separate approval scoped to the employee, period and exact amount',async()=>{
 expect(await approvedPeriodSalaryOverride(args,db)).toMatchObject({id:1});
 expect(db.execute.mock.calls[0][1]).toEqual([2,147,485]);
 expect(db.execute.mock.calls[0][0]).toContain('revoked_at IS NULL');
 expect(await approvedPeriodSalaryOverride({...args,manualSalaryAmount:2000},db)).toBeNull();
});
it('never treats an ordinary manual adjustment as approval',async()=>{
 db.execute.mockResolvedValue([[]]);expect(await approvedPeriodSalaryOverride(args,db)).toBeNull();
});
it('does not apply an approval without a period adjustment',async()=>{
 expect(await approvedPeriodSalaryOverride({...args,manualSalaryAmount:0},db)).toBeNull();expect(db.execute).not.toHaveBeenCalled();
});
