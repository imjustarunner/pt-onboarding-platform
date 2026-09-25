import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../clientInsurance.service.js',()=>({readClientInsurance:vi.fn(async()=>({primary:{insurerName:'Primary Plan',memberId:'SECRET'},secondary:{insurerName:'Secondary Plan',memberId:'SECRET2'}}))}));
vi.mock('../familyLedger/policy.js',()=>({assertCollectible:vi.fn(async()=>{})}));
import {summarizeCareBalances,clientCareBillingSummary} from '../clientCareBillingSummary.service.js';
describe('care-team financial minimization',()=>{
 it('reports only overdue presence and age, excluding paid or unreconciled balances',()=>{
  const now=new Date('2026-09-25');
  expect(summarizeCareBalances([{amount_cents:10000,paid_cents:2000,due_date:'2026-08-01',collectible:true}],now)).toEqual({status:'overdue',ageBand:'31_60_days',hasItemsUnderReview:false});
  expect(summarizeCareBalances([{amount_cents:10000,paid_cents:10000,due_date:'2026-01-01',collectible:true}],now).status).toBe('no_balance_due');
  expect(summarizeCareBalances([{amount_cents:10000,paid_cents:0,due_date:'2026-01-01',collectible:false}],now)).toMatchObject({status:'billing_review',ageBand:null});
  expect(summarizeCareBalances([{amount_cents:10000,paid_cents:0,due_date:'2026-01-01',collectible:true,pending:1}],now).status).toBe('billing_review');
 });
 it('whitelists insurer names and balance status, never amounts or member/claim IDs',async()=>{
  const db={execute:vi.fn().mockResolvedValue([[{id:10,amount_cents:10000,paid_cents:0,due_date:'2026-01-01',agency_id:1,client_id:2,claim_id:99,status:'open'}]])};
  const result=await clientCareBillingSummary(1,2,db),serialized=JSON.stringify(result);
  expect(result.policies).toEqual([{position:'primary',insurerName:'Primary Plan'},{position:'secondary',insurerName:'Secondary Plan'}]);expect(serialized).not.toMatch(/SECRET|10000|paid_cents|amount|claim_id|memberId/);expect(db.execute.mock.calls[0][1]).toEqual([1,2,0]);
 });
});
