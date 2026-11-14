import {it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(async()=>[{}]),agency:vi.fn(async()=>({slug:'itsco',pto_policy_json:{sharedLeaveAccrualEnabled:true,schoolSupportEnabled:true,schoolSupportAccrualAfter:'2026-10-09',schoolSupportHourlyRate:18,trainingPtoEnabled:true}}))}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:m.agency}}));
import {upsertAgencyPtoPolicy,getAgencyPtoPolicy} from '../payrollPto.service.js';
it('preserves the new bank and cutover settings when an older settings form saves known fields',async()=>{
 await upsertAgencyPtoPolicy({agencyId:2,policy:{trainingMaxBalance:20},defaultPayRate:44,ptoEnabled:true});
 const saved=JSON.parse(m.execute.mock.calls.find(([sql])=>sql.includes('UPDATE agencies'))[1][0]);
 expect(saved).toMatchObject({sharedLeaveAccrualEnabled:true,schoolSupportEnabled:true,schoolSupportAccrualAfter:'2026-10-09',schoolSupportHourlyRate:18,trainingMaxBalance:20});
});

it('school support is ITSCO-only even if another company has an enabled flag',async()=>{
 m.agency.mockResolvedValueOnce({slug:'nlu',pto_policy_json:{schoolSupportEnabled:true}});expect((await getAgencyPtoPolicy({agencyId:6})).policy.schoolSupportEnabled).toBe(false);
 m.agency.mockResolvedValueOnce({slug:'tisi',pto_policy_json:{schoolSupportEnabled:true}});expect((await getAgencyPtoPolicy({agencyId:377})).policy.schoolSupportEnabled).toBe(false);
 m.agency.mockResolvedValueOnce({slug:'itsco',pto_policy_json:{schoolSupportEnabled:true}});expect((await getAgencyPtoPolicy({agencyId:2})).policy.schoolSupportEnabled).toBe(true);
});
