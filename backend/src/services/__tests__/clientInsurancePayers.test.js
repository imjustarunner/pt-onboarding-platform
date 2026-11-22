import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('../sharedPayerDirectory.service.js',()=>({listSharedPayerDirectory:vi.fn(async()=>[])}));
import {listSharedPayerDirectory} from '../sharedPayerDirectory.service.js';
beforeEach(()=>listSharedPayerDirectory.mockResolvedValue([]));
vi.mock('../payerSetupCatalog.service.js',()=>({listPayerSetupRequests:vi.fn()}));
import {listPayerSetupRequests} from '../payerSetupCatalog.service.js';
import {clientInsurancePayers,resolveConfiguredPolicy} from '../clientInsurancePayers.service.js';
it('connects the printed CHAMPVA carrier only to its verified agency 84146 route',async()=>{
 listPayerSetupRequests.mockResolvedValue([{id:13,payer_name:'CHAMPVA HAC',claimmd_payer_id:'84146',directory_status:'id_match'},{id:14,payer_name:'CHAMPVA review',claimmd_payer_id:'OTHER',directory_status:'alias_review'}]);const rows=await clientInsurancePayers(2,{});expect(rows).toHaveLength(1);expect(rows[0].names).toContain('CHAMPVA');expect(rows[0].payerId).toBe('84146');
});
it('offers only verified agency routes and connects Colorado Medicaid eligibility separately',async()=>{
 const db={};listPayerSetupRequests.mockResolvedValue([{id:13,payer_name:'CHAMPVA - HAC',claimmd_payer_id:'84146',directory_status:'id_match',source_names_json:'["CHAMPVA"]'},{id:19,payer_name:'Colorado Community Health Alliance',claimmd_payer_id:'COCHA',directory_status:'id_match'},{id:22,payer_name:'Unverified alias',claimmd_payer_id:'WRONG',directory_status:'alias_review'}]);
 const rows=await clientInsurancePayers(2,db);expect(listPayerSetupRequests).toHaveBeenCalledWith(2,db);expect(rows).toHaveLength(2);
 expect(rows[0]).toMatchObject({id:13,payerId:'84146',eligibilityPayerId:'84146',isMedicaid:false});expect(rows[0].names).toContain('CHAMPVA');
 expect(rows[1]).toMatchObject({payerId:'COCHA',eligibilityPayerId:'SKCO0',isMedicaid:true});
 expect(resolveConfiguredPolicy({payerCatalogId:'13',insurerName:'Forged',payerId:'COCHA',eligibilityPayerId:'SKCO0',isMedicaid:true},rows)).toMatchObject({insurerName:'CHAMPVA - HAC',payerId:'84146',eligibilityPayerId:'84146',isMedicaid:false});
 expect(()=>resolveConfiguredPolicy({payerCatalogId:999},rows)).toThrow('no longer available');
});

it('keeps a confirmed Medicaid policy on the same carrier and clears its program when the carrier changes', () => {
 const payers=[{id:1,name:'Colorado Access',payerId:'84129',eligibilityPayerId:'84129',isMedicaid:false},
   {id:2,name:'CHAMPVA - HAC',payerId:'84146',eligibilityPayerId:'84146',isMedicaid:false}];
 const saved={payerCatalogId:'1',insurerName:'Colorado Access',payerId:'84129',isMedicaid:true,programType:'medicaid',planType:'Medicaid'};
 expect(resolveConfiguredPolicy(saved,payers)).toMatchObject({insurerName:'Colorado Access',isMedicaid:true,programType:'medicaid'});
 const changed=resolveConfiguredPolicy({...saved,payerCatalogId:'2'},payers);
 expect(changed).toMatchObject({insurerName:'CHAMPVA - HAC',isMedicaid:false});
 expect(changed).not.toHaveProperty('programType');
 expect(changed).not.toHaveProperty('planType');
});

it('offers shared carrier routes to another agency without copying enrollment or billing identities',async()=>{
 listPayerSetupRequests.mockResolvedValue([]);listSharedPayerDirectory.mockResolvedValue([{payer_name:'Colorado Medicaid',claimmd_payer_id:'SKCO0',directory_status:'id_match',directory_snapshot_json:{eligibility:'yes'}}]);
 const rows=await clientInsurancePayers(99,{});expect(rows).toEqual([expect.objectContaining({id:'claimmd:SKCO0',payerId:'SKCO0',sharedDirectory:true,isMedicaid:true})]);
 expect(rows[0]).not.toHaveProperty('agency_id');expect(rows[0]).not.toHaveProperty('provider_npi');expect(rows[0]).not.toHaveProperty('enrollment');
 expect(resolveConfiguredPolicy({payerCatalogId:'claimmd:SKCO0',payerId:'FORGED'},rows)).toMatchObject({payerId:'SKCO0',eligibilityPayerId:'SKCO0'});
});

it('keeps a saved shared payer valid when it is later added to the agency’s own list',()=>{
 expect(resolveConfiguredPolicy({payerCatalogId:'claimmd:SKCO0',payerId:'FORGED'},[{id:77,name:'Colorado Medicaid',payerId:'SKCO0',eligibilityPayerId:'SKCO0',isMedicaid:true}])).toMatchObject({payerId:'SKCO0',eligibilityPayerId:'SKCO0'});
});
