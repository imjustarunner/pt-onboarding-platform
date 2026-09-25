import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
import {validateServiceFees,calculateCardFee,quoteAgencyCardFee,groupMedicalUsage,previousUsagePeriod,appendMedicalServiceLines,reserveMedicalServiceUsage} from '../medicalServiceFees.service.js';
const agreement={id:7,enabled:1,card_fee_bps:100,card_fixed_cents:0};
describe('agency service fees',()=>{
 it('calculates only the platform margin without increasing the patient amount',()=>{expect(calculateCardFee(2500,agreement)).toBe(25);expect(calculateCardFee(1,{...agreement,card_fixed_cents:30})).toBe(0);expect(calculateCardFee(10,{...agreement,card_fixed_cents:30})).toBe(9);expect(calculateCardFee(2500,{...agreement,enabled:0})).toBe(0);});
 it('requires agreement attestation and integer prices',()=>{const input={revision:0,enabled:true,claimUnitCents:30,eligibilityUnitCents:10,cardFeeBps:100,cardFixedCents:0,contractReference:'Synthetic accepted agreement',termsConfirmed:true};expect(()=>validateServiceFees(input)).not.toThrow();for(const patch of [{termsConfirmed:false},{claimUnitCents:-1},{cardFeeBps:1.5},{cardFeeBps:10001}])expect(()=>validateServiceFees({...input,...patch})).toThrow();});
 function fixture(old=null){const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>{
  if(sql.includes('FROM agency_billing_accounts'))return [[{stripe_connect_account_id:'acct_synthetic'}]];
  if(sql.includes('FROM medical_service_card_quotes'))return [old?[old]:[]];
  if(sql.includes('FROM medical_service_fee_agreements'))return [[agreement]];
  return [{insertId:99}];
 })};return {db,deps:{db:{getConnection:async()=>db},env:{MEDICAL_SERVICE_FEES_ENABLED:'true'}}};}
 const payment={agencyId:1,connectedAccountId:'acct_synthetic',amountCents:2500,currency:'usd',idempotencyKey:'synthetic-payment'};
 it('pins fees, including zero, across rate changes and deployment pauses',async()=>{
  const {db,deps}=fixture();expect(await quoteAgencyCardFee(payment,deps)).toEqual({feeCents:25,quoteId:99});expect(db.commit).toHaveBeenCalled();
  const old={id:88,connected_account_id:'acct_synthetic',amount_cents:2500,currency:'usd',fee_cents:0,created_at:new Date()};const frozen=fixture(old);expect(await quoteAgencyCardFee(payment,frozen.deps)).toEqual({feeCents:0,quoteId:88});
  old.fee_cents=15;frozen.deps.env={};expect(await quoteAgencyCardFee(payment,frozen.deps)).toEqual({feeCents:15,quoteId:88});
 });
 it('rejects cross-agency account substitution, changed payment terms and expired ambiguous references',async()=>{
  const {deps}=fixture();await expect(quoteAgencyCardFee({...payment,connectedAccountId:'acct_other'},deps)).rejects.toMatchObject({status:409});
  const old={id:88,connected_account_id:'acct_synthetic',amount_cents:2500,currency:'usd',fee_cents:25,created_at:new Date()};
  await expect(quoteAgencyCardFee({...payment,amountCents:3000},fixture(old).deps)).rejects.toMatchObject({status:409});
  old.created_at=new Date(Date.now()-24*3600000);await expect(quoteAgencyCardFee(payment,fixture(old).deps)).rejects.toThrow(/reconciliation/);
 });
 it('does not meter service charges before deployment activation',async()=>{const db={execute:vi.fn()};expect(await reserveMedicalServiceUsage({agencyId:1,kind:'claim',sourceId:9},{db,env:{}})).toBeNull();expect(db.execute).not.toHaveBeenCalled();});
 it('keeps original rates and completed usage months separate on the invoice',()=>{
  const rows=[{id:1,kind:'claim',agreement_id:7,unit_cents:30,completed_at:'2026-08-15'},{id:2,kind:'claim',agreement_id:7,unit_cents:30,completed_at:'2026-09-15'},{id:3,kind:'eligibility',agreement_id:8,unit_cents:10,completed_at:'2026-09-15'},{id:4,kind:'eligibility',agreement_id:8,unit_cents:10,completed_at:'2026-09-15'}];
  const lines=groupMedicalUsage(rows,'2026-09');expect(lines.map(l=>l.amountCents)).toEqual([30,30,20]);expect(lines[0].usageMonth).toBe('2026-08');expect(lines[2].usageIds).toEqual([3,4]);
  const estimate={lineItems:[],totals:{totalCents:10000}};expect(appendMedicalServiceLines(estimate,lines).totals.totalCents).toBe(10080);expect(estimate.totals.totalCents).toBe(10000);
  expect(appendMedicalServiceLines({...estimate,chargeLines:[]},lines).chargeLines).toHaveLength(3);
  expect(appendMedicalServiceLines({...estimate,businessAgreement:{ended:true}},lines).totals.totalCents).toBe(10000);
 });
 it('handles prior December and leap-year billing boundaries',()=>{expect(previousUsagePeriod('2026-01-01').start.toISOString()).toBe('2025-12-01T00:00:00.000Z');expect(previousUsagePeriod('2024-03-01').end.toISOString()).toBe('2024-03-01T00:00:00.000Z');});
});
