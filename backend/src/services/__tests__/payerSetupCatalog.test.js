import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { matchPayerDirectory } from '../payerSetupCatalog.service.js';
const directory = [{payerid:'00050',payer_name:'CO BCBS','1500_claims':'yes',era:'yes',eligibility:'yes'},
 {payerid:'99727',payer_name:'Tricare East',payer_alt_names:[{alt_payerid:'TREST'}],'1500_claims':'enrollment',era:'enrollment',eligibility:'yes'}];
it('preserves leading zeros and keeps directory support separate from enrollment',()=>{
 const result=matchPayerDirectory({name:'CO BCBS',sourcePayerId:'00050'},directory);
 expect(result.claimmdPayerId).toBe('00050');expect(result.directoryStatus).toBe('id_match');expect(result).not.toHaveProperty('enrolled');
});
it('requires review for a legacy ID and does not guess routing from a similar payer name',()=>{
 expect(matchPayerDirectory({name:'Tricare East',sourcePayerId:'TREST'},directory)).toMatchObject({claimmdPayerId:'99727',directoryStatus:'alias_review'});
 expect(matchPayerDirectory({name:'CO BCBS',sourcePayerId:'NOTFOUND'},directory)).toMatchObject({claimmdPayerId:null,directoryStatus:'not_found'});
 expect(matchPayerDirectory({name:'District 11'},directory).directoryStatus).toBe('manual_review');
});
it('refuses to select an ambiguous alternate ID',()=>{
 expect(matchPayerDirectory({sourcePayerId:'TREST'},[...directory,{payerid:'OTHER',payer_alt_names:[{alt_payerid:'TREST'}]}]).claimmdPayerId).toBeNull();
});
it('preserves all screenshot names while consolidating duplicate routes',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../../../../docs/billing/payer-import-2026-09-26.json',import.meta.url)));
 expect(catalog.payers).toHaveLength(36);expect(catalog.payers.reduce((n,p)=>n+1+p.aliases.length,0)).toBe(43);
 const ids=catalog.payers.map(p=>p.sourcePayerId).filter(Boolean);expect(new Set(ids).size).toBe(ids.length);
});
