import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import PayrollTimeClaim from '../PayrollTimeClaim.model.js';
it('preserves exact approved carryover minutes and the authorized amount',()=>{
 const row={claim_type:'indirect_time',status:'approved',credits_hours:'0.03',applied_amount:'0.50',payload_json:JSON.stringify({source:'direct_care_auto_indirect_carryover',totalMinutes:5/3})};
 const normalized=PayrollTimeClaim._normalize(row);
 expect(normalized.credits_hours*60).toBeCloseTo(5/3,12);
 expect(normalized.applied_amount).toBe('0.50');expect(row.credits_hours).toBe('0.03');
 expect(PayrollTimeClaim._normalize({...row,status:'submitted'}).credits_hours).toBe('0.03');
 expect(PayrollTimeClaim._normalize({...row,payload_json:{source:'other',totalMinutes:5/3}}).credits_hours).toBe('0.03');
});
