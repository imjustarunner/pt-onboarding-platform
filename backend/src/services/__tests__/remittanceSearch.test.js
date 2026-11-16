import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../claimMdWorkflow.service.js',()=>({recordClaimEvent:vi.fn()}));
vi.mock('../familyBillingEncryption.service.js',()=>({decryptFamilyBilling:value=>JSON.parse(value),encryptFamilyBilling:JSON.stringify}));
import {listRemittances} from '../remittances/store.js';
it('searches encrypted attached claims across all batches and sorts before paging without leaking their details',async()=>{
  const records=Array.from({length:260},(_,i)=>({id:i+1,agency_id:2,status:'review',payload_encrypted:JSON.stringify({era:{eraId:String(i+1),payerId:'TEST',payerName:'Synthetic payer',paidDate:'2026-11-16',trace:`TRACE-${i}`,paidCents:(i+1)*100,items:[{pcn:i===9?'TARGET':'OTHER',patientName:'PRIVATE CLIENT',lines:[]}]},raw:{check_type:'eft'}})})).reverse();
  const db={execute:vi.fn(async(sql,args)=>{
    expect(args[0]).toBe(2);
    if(sql.includes('FROM claimmd_remittances'))return [records.filter(row=>!args[1]||row.id<args[1]).slice(0,200)];
    if(sql.includes('claimmd_payment_postings'))return [[{count:0,paidCents:0,adjustmentCents:0}]];
    if(sql.includes('claimmd_responsibility_jobs'))return [[{count:0}]];
    return [[{lastSyncAt:null}]];
  })};
  const found=await listRemittances(2,{search:'TARGET'},db);expect(found.total).toBe(1);expect(found.rows[0].id).toBe(10);expect(JSON.stringify(found)).not.toContain('PRIVATE CLIENT');expect(db.execute.mock.calls.filter(([sql])=>sql.includes('FROM claimmd_remittances'))).toHaveLength(2);
  const page=await listRemittances(2,{page:2,sortBy:'paidCents',direction:'desc'},db);expect(page.total).toBe(260);expect(page.rows[0].id).toBe(210);expect(page.rows).toHaveLength(50);
});
