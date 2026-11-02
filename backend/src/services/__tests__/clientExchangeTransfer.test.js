import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../clientExchangeAudit.service.js',()=>({withExchangeLock:async(_id,run)=>run()}));
vi.mock('../providerSlots.service.js',()=>({adjustProviderSlots:vi.fn()}));
import {keepClientInExchange,assertExchangeResolvedBeforeArchive} from '../clientExchangeTransfer.service.js';
function fixture({status='ARCHIVED',providerId=null}={}) {
 const client={id:25,agency_id:2,status,client_status_id:8,provider_id:providerId,service_day:null,terminated_at:'2026-10-23',terminated_by_user_id:555,termination_reason:'Was posted to the exchange',intake_preferences_json:{preferredModality:'in_person',preferredProviderGender:'female'}};
 const listing={id:10,client_id:25,agency_id:2,status:'requested',referral_kind:'transfer',current_provider_user_id:482};
 const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async(sql,args)=>{
   if(sql.startsWith('SELECT client_id'))return [[{client_id:25}]];
   if(sql.startsWith('SELECT * FROM clients'))return [[client]];
   if(sql.startsWith('SELECT * FROM client_exchange_listings'))return [[listing]];
   if(sql.startsWith('SELECT id,provider_user_id'))return [[]];
   if(sql.includes('FROM client_statuses'))return [[{id:527}]];
   return [{affectedRows:1}];
 })};
 return {db,pool:{getConnection:async()=>db},client,listing};
}
it('restores a mistaken transfer termination without reassigning the former provider or altering history',async()=>{
 const {db,pool}=fixture();
 const result=await keepClientInExchange({listingId:10,agencyId:2,actor:{id:501,role:'super_admin'},restoreArchived:true,serviceLocation:'Colorado Springs'},pool);
 expect(result).toMatchObject({status:'PENDING_REVIEW',assignmentsEnded:0,changed:true});
 expect(db.commit).toHaveBeenCalledOnce();
 expect(db.execute.mock.calls.some(([sql])=>/DELETE|UPDATE appointments|UPDATE clinical_|UPDATE client_exchange_listings/.test(sql))).toBe(false);
 expect(db.execute.mock.calls.find(([sql])=>sql==='UPDATE clients SET provider_id=? WHERE id=?')).toBeUndefined();
 expect(db.execute.mock.calls).toContainEqual(['UPDATE clients SET client_status_id=? WHERE id=?',[527,25]]);
 expect(db.execute.mock.calls.some(([sql,args])=>sql.includes("'$.serviceLocation'")&&args[0]==='Colorado Springs')).toBe(true);
 expect(db.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO client_status_history')).length).toBeGreaterThan(3);
});
it('requires a deliberate staff restoration for archived records',async()=>{
 const {db,pool}=fixture();
 await expect(keepClientInExchange({listingId:10,agencyId:2,actor:{id:501,role:'support'}},pool)).rejects.toThrow('explicitly restore');
 expect(db.rollback).toHaveBeenCalledOnce();expect(db.commit).not.toHaveBeenCalled();
});
it('does not let an unrelated provider change the assignment',async()=>{
 const {db,pool}=fixture({status:'ACTIVE',providerId:482});
 await expect(keepClientInExchange({listingId:10,agencyId:2,actor:{id:999,role:'provider'}},pool)).rejects.toMatchObject({status:403});
 expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
});
it('requires an open referral to be withdrawn before ending agency care',async()=>{
 await expect(assertExchangeResolvedBeforeArchive({execute:async()=>[[{id:10}]]},25)).rejects.toThrow('withdraw the referral');
 await expect(assertExchangeResolvedBeforeArchive({execute:async()=>[[]]},25)).resolves.toBeUndefined();
});
