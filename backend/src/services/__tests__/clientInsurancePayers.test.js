import {it,expect,vi} from 'vitest';
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
 expect(()=>resolveConfiguredPolicy({payerCatalogId:999},rows)).toThrow('no longer configured');
});
