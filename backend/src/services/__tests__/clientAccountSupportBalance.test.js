import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../clientInsurance.service.js',()=>({readClientInsurance:vi.fn(async()=>({primary:{insurerName:'Example'}}))}));
vi.mock('../familyLedger/policy.js',()=>({assertCollectible:vi.fn(async row=>{if(row.status!=='open')throw Object.assign(new Error('Review'),{status:409});})}));
import pool from '../../config/database.js';
import { clientCareBillingSummary } from '../clientCareBillingSummary.service.js';
beforeEach(()=>{vi.clearAllMocks();pool.execute.mockResolvedValue([[
  {id:1,status:'open',amount_cents:10000,paid_cents:2500,due_date:'2026-10-01'},
  {id:2,status:'review',amount_cents:5000,paid_cents:0,due_date:'2026-10-01'},
  {id:3,status:'open',amount_cents:2000,paid_cents:0,pending:1,due_date:'2026-10-01'},
  {id:4,status:'open',amount_cents:1000,paid_cents:1000,due_date:'2026-10-01'},
]]);});
it('only totals the remaining collectible amount and excludes pending and review items',async()=>{
  const result=await clientCareBillingSummary(2,20,pool,{includeAmounts:true});
  expect(result.balance.payableCents).toBe(7500);expect(result.balance.hasItemsUnderReview).toBe(true);
  expect(JSON.stringify(result)).not.toMatch(/paid_cents|amount_cents|due_date|claim/);
});
it('retains the status-only response for clinicians and other existing consumers',async()=>{
  const result=await clientCareBillingSummary(2,20,pool);expect(result.balance).not.toHaveProperty('payableCents');
});
