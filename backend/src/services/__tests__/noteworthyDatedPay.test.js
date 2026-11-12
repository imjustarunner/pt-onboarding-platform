import { expect,it,vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import { noteworthyDatedFixedPay } from '../noteworthyDatedPay.service.js';
const rates=[{id:3,effective_start:'2026-12-01',rate_amount:100,rate_unit:'per_unit'},{id:2,effective_start:'2026-11-01',rate_amount:60,rate_unit:'per_unit'},{id:1,effective_start:'2026-10-01',rate_amount:50,rate_unit:'per_unit'}];
it('values current services and late notes on their service dates without using a future rate',()=>{
  const value=noteworthyDatedFixedPay({rates,row:{serviceCode:'90837',finalizedUnits:4,oldDoneNotesUnits:1,carryoverDatedUnits:[{serviceDate:'2026-10-05',units:1}]},currentEntries:[{serviceDate:'2026-10-30',units:1},{serviceDate:'2026-11-03',units:2}]});
  expect(value.amount).toBe(220);expect(value.rateAmount).toBeNull();expect(value.lines.map(r=>r.rateAmount)).toEqual([50,60,50]);
});
it('supports dated per-hour minute quantities and explicit unpaid rates',()=>{
  const value=noteworthyDatedFixedPay({rates:[{effective_start:'2026-10-01',rate_amount:30,rate_unit:'per_hour'},{effective_start:'2026-11-01',rate_amount:0,rate_unit:'per_hour'}],divisor:60,row:{serviceCode:'H0031',finalizedUnits:90},currentEntries:[{serviceDate:'2026-10-30',units:30},{serviceDate:'2026-11-03',units:60}]});
  expect(value.amount).toBe(15);
});
it('blocks incomplete date evidence and missing dated rates instead of repricing an ambiguous aggregate',()=>{
  expect(()=>noteworthyDatedFixedPay({rates,row:{serviceCode:'90837',finalizedUnits:2},currentEntries:[{serviceDate:'2026-11-03',units:1}]})).toThrow(/dated payable quantities/);
  expect(()=>noteworthyDatedFixedPay({rates,row:{serviceCode:'90837',finalizedUnits:1},currentEntries:[{serviceDate:'2026-09-03',units:1}]})).toThrow(/dated 90837 fixed rate/);
});
