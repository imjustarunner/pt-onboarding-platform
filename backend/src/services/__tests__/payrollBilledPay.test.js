import { beforeEach, describe, it, expect, vi } from 'vitest';
const db = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: db }));
import { billedAmountFromReport, calculateBilledPay, rateAtDate, billedPayForStagingRow } from '../payrollBilledPay.service.js';
import { resolvePercentOfChargePay } from '../payrollPercentagePayPolicy.service.js';
import { canMatchPayrollUser, payrollAliasUsers, archivedPayrollName } from '../payrollProviderMatching.service.js';
const rate = { id: 1, pay_method: 'percent_billed', pay_percent: 44, effective_start: '2026-08-31' };
const entry = { service_date: '2026-10-12', unit_count: 1, billed_amount: 100, client_paid_amount: 0 };
beforeEach(() => vi.clearAllMocks());
describe('billed charges', () => {
  it('pays 44% of billed charges even with no patient payments', () => {
    expect(calculateBilledPay({entries:[entry],finalizedUnits:1,rates:[rate],serviceCode:'TUTORING'})).toMatchObject({amount:44,billedAmount:100});
    expect(resolvePercentOfChargePay({perCodeRate:rate})).toEqual({usesPercentPay:true,percent:44,basis:'billed'});
  });
  it('requires actual billed amounts rather than silently paying zero or collections', () => {
    expect(() => calculateBilledPay({entries:[{...entry,billed_amount:null,client_paid_amount:100}],finalizedUnits:1,rates:[rate],serviceCode:'TUTORING'})).toThrow('Billed amount missing');
    expect(calculateBilledPay({entries:[{...entry,billed_amount:0}],finalizedUnits:1,rates:[rate],serviceCode:'TUTORING'}).amount).toBe(0);
  });
  it('rejects a unit adjustment without corresponding billed records', () => {
    expect(() => calculateBilledPay({entries:[entry],finalizedUnits:2,rates:[rate],serviceCode:'TUTORING'})).toThrow('payable units');
  });
  it('applies dated percentages to each service rather than a future/current override', () => {
    const rates=[rate,{...rate,id:2,pay_percent:50,effective_start:'2026-10-15'}];
    expect(rateAtDate(rates,'2026-10-12').pay_percent).toBe(44);
    expect(calculateBilledPay({entries:[entry,{...entry,service_date:'2026-10-20'}],finalizedUnits:2,rates,serviceCode:'TUTORING'}).amount).toBe(94);
    expect(() => calculateBilledPay({entries:[{...entry,service_date:'2026-08-01'}],finalizedUnits:1,rates,serviceCode:'TUTORING'})).toThrow('dated');
  });
  it.each([['Amount Billed','$123.45',123.45],['Total Charge','0',0],['patient_amount_billed','1,000.00',1000],['Rate','100',null],['Patient Amount Paid','100',null],['Balance','100',null],['Amount Billed','bad',null]])('reads %s without confusing payments, balances or per-unit rates', (header,value,expected) => expect(billedAmountFromReport({[header]:value})).toBe(expected));
  it('includes a carryover once and scopes historical lookups to agency, employee and service', async () => {
    db.execute.mockResolvedValueOnce([[{...entry,id:10,row_fingerprint:'current',note_status:'FINALIZED'}]])
      .mockResolvedValueOnce([[{...entry,id:9,row_fingerprint:'older',billed_amount:200},{...entry,id:8,row_fingerprint:'older',billed_amount:200}]]);
    const result=await billedPayForStagingRow({row:{userId:993,serviceCode:'Tutoring',finalizedUnits:2,carryoverMeta:{rawAuditRows:[{rowMatchKey:'older'}]}},payrollPeriodId:910,agencyId:6,rates:[rate]});
    expect(result).toMatchObject({amount:132,presentAmount:44,carryoverAmount:88});
    expect(db.execute.mock.calls[1][1]).toEqual([6,993,'TUTORING','older']);
  });
});
describe('provider identities', () => {
  it('never revives an archived exact-name match', () => {expect(canMatchPayrollUser({id:1388,is_archived:1,status:'ARCHIVED'})).toBe(false);expect(canMatchPayrollUser({id:993,is_archived:0,status:'ACTIVE_EMPLOYEE'})).toBe(true);});
  it('loads aliases only for active members of the same agency', async () => {db.execute.mockResolvedValue([[{id:993,first_name:'Josie',last_name:'Cleveland'}]]);expect(await payrollAliasUsers(6)).toHaveLength(1);expect(db.execute.mock.calls[0][1]).toEqual([6]);expect(db.execute.mock.calls[0][0]).toContain('ua.agency_id=a.agency_id');expect(db.execute.mock.calls[0][0]).toContain('COALESCE(u.is_archived,0)=0');});
});

it('holds an archived name for review instead of recreating it',async()=>{db.execute.mockResolvedValue([[{id:1388}]]);expect(await archivedPayrollName('Josie','Cleveland')).toBe(true);expect(db.execute.mock.calls[0][1]).toEqual(['Josie','Cleveland']);});

const tutoringReport = {Type:'Appointment', 'Clinician Name':'Sample Tutor', 'Service Code':'Tutoring', Units:1, 'Note Status':'Draft', Rate:'65.00'};
it('uses the two single-unit tutoring charges, not collected payments', async () => {
  const entries = [
    {...tutoringReport,Date:'9/30/2026','Patient Amount Paid':'(65.00)'},
    {...tutoringReport,Date:'10/7/2026','Patient Amount Paid':'0.00'}
  ].map((r,i)=>({...entry,id:i+1,service_date:i?'2026-10-07':'2026-09-30',billed_amount:billedAmountFromReport(r),note_status:'DRAFT',draft_payable:1}));
  expect(entries.map(r=>r.billed_amount)).toEqual([65,65]);
  db.execute.mockResolvedValue([entries]);
  expect(await billedPayForStagingRow({row:{userId:993,serviceCode:'Tutoring',finalizedUnits:2},payrollPeriodId:910,agencyId:6,rates:[rate]})).toMatchObject({amount:57.2,billedAmount:130,presentAmount:57.2});
});
it('requires total charges for multi-unit rows and gives explicit totals priority',()=>{
  expect(billedAmountFromReport({...tutoringReport,Units:2})).toBe(null);
  expect(billedAmountFromReport({...tutoringReport,Units:2,'Amount Billed':'100.00'})).toBe(100);
  expect(billedAmountFromReport({...tutoringReport,'Amount Billed':'0.00'})).toBe(0);
  expect(billedAmountFromReport({...tutoringReport,'Amount Billed':'invalid'})).toBe(null);
  expect(billedAmountFromReport({...tutoringReport,Type:'Payment'})).toBe(null);
});
it('does not make an unpaid draft payable just because it has a billed charge',async()=>{
  db.execute.mockResolvedValue([[{...entry,billed_amount:65,note_status:'DRAFT',draft_payable:0}]]);
  expect(await billedPayForStagingRow({row:{userId:993,serviceCode:'Tutoring',finalizedUnits:0},payrollPeriodId:910,agencyId:6,rates:[rate]})).toMatchObject({amount:0});
});
