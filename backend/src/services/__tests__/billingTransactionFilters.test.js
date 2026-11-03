import {describe,it,expect} from 'vitest';
import {parseTransactionFilters,transactionMatches,transactionFilterOptions,syntheticBillingRow} from '../billingTransactionFilters.js';
const row={provider_user_id:8,provider_name:'DEMO QA Clinician',date_of_service:'2026-10-22',posted_date:'2026-11-02',service_codes:['H0002','90785'],destination_payer_id:'SYNTH',payer_name:'Synthetic payer',claim_stage:'paid',kind:'adjudication'};
describe('combinable billing transaction filters',()=>{
 it('ANDs all seven filter types and includes the date-range boundaries',()=>{
  const f=parseTransactionFilters({clinicianId:'8',serviceFrom:'2026-10-22',serviceTo:'2026-10-22',postedFrom:'2026-11-02',postedTo:'2026-11-02',serviceCode:'90785',payer:'id:SYNTH',claimStatus:'paid',transactionType:'adjudication'});
  expect(transactionMatches(row,f)).toBe(true);
  for(const [key,value] of [['clinicianId',9],['serviceFrom','2026-10-23'],['postedTo','2026-11-01'],['serviceCode','90837'],['payer','id:OTHER'],['claimStatus','denied'],['transactionType','refund']])expect(transactionMatches(row,{...f,[key]:value})).toBe(false);
 });
 it('does not match missing source data to a filtered date or clinician',()=>{expect(transactionMatches({},parseTransactionFilters({serviceFrom:'2026-01-01'}))).toBe(false);expect(transactionMatches({posted_by_user_id:8},parseTransactionFilters({clinicianId:8}))).toBe(false);});
 it('rejects impossible dates, reverse ranges and malformed IDs',()=>{for(const q of [{serviceFrom:'2026-02-30'},{postedFrom:'2026-11-03',postedTo:'2026-11-01'},{clinicianId:'1 OR 1=1'}])expect(()=>parseTransactionFilters(q)).toThrow();});
 it('builds options from actual scoped identities and matches any service line',()=>{const options=transactionFilterOptions([row,{...row,kind:'refund'}]);expect(options.clinicians).toEqual([{value:'8',label:'DEMO QA Clinician'}]);expect(options.serviceCodes).toHaveLength(2);expect(options.transactionTypes).toHaveLength(2);});
 it('uses explicit demo provenance and never guesses from a name or payer label',()=>{expect(syntheticBillingRow({client_name:'Demo Smith',payer_name:'Test Plan'})).toBe(false);expect(syntheticBillingRow({is_demo_client:1})).toBe(true);expect(syntheticBillingRow({source_type:'guardian_demo_receipt'})).toBe(true);});
});
