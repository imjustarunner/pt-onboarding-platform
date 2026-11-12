import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {executedEmploymentAgreements} from '../employmentAgreementPolicy.service.js';

describe('employee compensation source history',()=>{
 it('loads executed legacy and future schedules for exact-agency review without applying the current payroll policy/date filter',async()=>{
  const rows=[
   {id:8,token_values_json:{effectiveDate:'2026-10-01',schedule:{category:1,level:4,creditRate:44}},metadata:{employmentContract:true},signed_pdf_path:'legacy.pdf',audit_trail:{adminCountersign:{signedAt:'2026-10-02T18:00:00Z'}}},
   {id:9,token_values_json:{effectiveDate:'2026-11-21',schedule:{category:2,level:3}},metadata:{contractGeneration:true},signed_pdf_path:'future.pdf',audit_trail:{adminCountersign:{signedAt:'2026-11-12T18:00:00Z'}}},
   {id:10,token_values_json:{effectiveDate:'2026-11-01',schedule:{}},metadata:{contractGeneration:true},signed_pdf_path:'employee-only.pdf',audit_trail:{}}
  ];
  const db={execute:vi.fn().mockResolvedValue([rows])};
  const history=await executedEmploymentAgreements({agencyId:453,userId:1496},db);
  expect(history.map(agreement=>agreement.id)).toEqual([8,9]);expect(history[0].data.schedule.creditRate).toBe(44);expect(history[1].effectiveOn).toBe('2026-11-21');
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('AND g.agency_id=?'),[1496,453]);
 });
});
