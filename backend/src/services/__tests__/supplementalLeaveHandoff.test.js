import {it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),resolve:vi.fn(async()=> 'fee_for_service'),commit:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:async()=>({execute:m.execute,beginTransaction:async()=>{},commit:m.commit,rollback:async()=>{},release(){}})}}));
vi.mock('../payrollPto.service.js',()=>({getAgencyPtoPolicy:async()=>({policy:{sharedLeaveAccrualEnabled:true,trainingPtoEnabled:true,trainingMaxBalance:20}}),resolvePtoEmploymentType:m.resolve}));
import {catchUpTrainingAfterHandoff} from '../supplementalLeave.service.js';
it('ADP catch-up preserves FFS classification and its same sick-leave equivalents',async()=>{
 m.execute.mockImplementation(async(sql)=>{
 if(sql.startsWith('SELECT s.*'))return [[{period_id:10,period_start:'2026-10-10',period_end:'2026-10-23',payroll_period_status:'posted',leave_employment_type:'fee_for_service',direct_hours:25,breakdown:{__paySystem:{lines:[{compensationPolicyVersion:'itsco-2026-10-service-credit-v3',hourEquivalent:25}],leaveBasis:{direct:25,indirect:5,support:0}}}}]];
 if(sql.startsWith('SELECT * FROM payroll_pto_accounts'))return [[{training_adp_through_date:'2026-10-09',training_adp_confirmed_at:new Date(),training_balance_hours:0}]];
 if(sql.startsWith('SELECT 1 FROM payroll_leave_basis_postings'))return [[]];return [{affectedRows:1}];});
 await catchUpTrainingAfterHandoff({agencyId:2,userId:7,actorId:9});
 expect(m.resolve).toHaveBeenCalledWith(expect.objectContaining({existingType:'fee_for_service'}));
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO payroll_leave_basis_postings'),[2,7,10,'training',30,.25]);
});
