import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{}}));
import {assertTermVisit} from '../familyLedger/serviceCharges.js';
const term={serviceCode:'H0004',effectiveFrom:'2026-01-01',effectiveThrough:'2026-12-31',priceBasis:'visit',paymentBasis:'self_pay'};
const visit={encounter_status:'completed',scheduled_start_at:'2026-11-01 12:00:00',service_code:'H0004',billed_units:5};
it.each(['H0004_DURATION_REVIEW: Review the actual68-minute visit.','H0004 duration68 min exceeds the4-unit band. Retain actual time and review billing before submitting a claim.'])('does not post a patient balance while an H0004 duration hold is active',claim_blocked_reason=>{expect(()=>assertTermVisit(term,{...visit,claim_blocked_reason})).toThrow(/billing review before a patient charge/);});
it('preserves the ordinary self-pay-only charge path and a valid reviewed visit',()=>{expect(assertTermVisit(term,{...visit,claim_blocked_reason:'SELF_PAY_ONLY: Insurance claims disabled'})).toBe('2026-11-01');expect(assertTermVisit(term,{...visit,claim_blocked_reason:null})).toBe('2026-11-01');});
