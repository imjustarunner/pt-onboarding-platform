import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {assertPlanable} from '../familyLedger/plans.js';
import {assertCollectible} from '../familyLedger/policy.js';
import {encryptFamilyBilling} from '../familyBillingEncryption.service.js';
import pool from '../../config/database.js';
import clinicalPool from '../../config/clinicalDatabase.js';
after(async()=>{await pool.end();await clinicalPool.end();});
const row=()=>({id:1,agency_id:450,client_id:2271,source_type:'qa_appointment',status:'review',hold_reason:'synthetic_demo',amount_cents:12000,source_payload:encryptFamilyBilling({syntheticOnly:true,noCollection:true},'receivable:450:2271')});
const database=(agency={id:450,slug:'auricwell-qa-demo',feature_flags:{qaSandbox:{syntheticOnly:true}}})=>({execute:async sql=>sql.includes('FROM agencies')?[[agency]]:[[{id:1,amount_cents:12000,paid_cents:0,settled_cents:0}]]});
test('a held synthetic balance can arrange a manual plan but never become collectible',async()=>{
 const r=row();await assert.doesNotReject(assertPlanable(r,database()));
 await assert.rejects(assertCollectible(r,database()),e=>e.status===409&&/cannot be collected/.test(e.message));
 await assert.rejects(assertPlanable(r,database(),{autoPay:true}),e=>e.status===409);
});
test('synthetic plan setup fails closed outside the exact tenant and its current hold',async()=>{
 for(const change of [{agency_id:2},{status:'void'},{status:'open',hold_reason:null},{hold_reason:'insurance_review'},{disputed_at:new Date()}])await assert.rejects(assertPlanable({...row(),...change},database()),e=>e.status===409);
 for(const agency of [{id:450,slug:'other',feature_flags:{qaSandbox:{syntheticOnly:true}}},{id:450,slug:'auricwell-qa-demo',feature_flags:{}}])await assert.rejects(assertPlanable(row(),database(agency)),e=>e.status===409);
});
test('a synthetic source label alone cannot bypass normal review',async()=>{
 const r=row();r.source_payload=encryptFamilyBilling({},'receivable:450:2271');await assert.rejects(assertPlanable(r,database()),e=>e.status===409);
 await assert.rejects(assertPlanable({...row(),source_type:'staff_charge',hold_reason:'insurance_review'},database()),e=>e.status===409);
});
