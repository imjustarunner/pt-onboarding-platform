import {it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(async()=>[{}]),agency:vi.fn(async()=>({pto_policy_json:{sharedLeaveAccrualEnabled:true,schoolSupportEnabled:true,schoolSupportAccrualAfter:'2026-10-09',schoolSupportHourlyRate:18,trainingPtoEnabled:true}}))}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:m.agency}}));
import {upsertAgencyPtoPolicy} from '../payrollPto.service.js';
it('preserves the new bank and cutover settings when an older settings form saves known fields',async()=>{
 await upsertAgencyPtoPolicy({agencyId:2,policy:{trainingMaxBalance:20},defaultPayRate:44,ptoEnabled:true});
 const saved=JSON.parse(m.execute.mock.calls.find(([sql])=>sql.includes('UPDATE agencies'))[1][0]);
 expect(saved).toMatchObject({sharedLeaveAccrualEnabled:true,schoolSupportEnabled:true,schoolSupportAccrualAfter:'2026-10-09',schoolSupportHourlyRate:18,trainingMaxBalance:20});
});
