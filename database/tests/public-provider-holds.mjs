// Disposable local database only. No application credentials or real client records.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createPublicProviderHoldService, withProviderSelectionLock, assertNoSelectionConflict, validateHoldWindow } from '../../backend/src/services/publicProviderHold.service.js';
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const mysql = require('mysql2/promise');
const pool = mysql.createPool({host:'127.0.0.1',port:33321,user:'root',password:'synthetic-provider-test',multipleStatements:true,timezone:'Z',connectionLimit:8});
try {
 await pool.query('CREATE DATABASE IF NOT EXISTS provider_holds_test');
 await pool.query('USE provider_holds_test');
 // Set a default schema for all pooled connections, then recreate the pool below.
} finally { await pool.end(); }
const db=mysql.createPool({host:'127.0.0.1',port:33321,user:'root',password:'synthetic-provider-test',database:'provider_holds_test',multipleStatements:true,timezone:'Z',connectionLimit:8});
try {
 await db.query('DROP TABLE IF EXISTS public_provider_slot_holds; DROP TABLE IF EXISTS public_appointment_requests; DROP TABLE IF EXISTS provider_public_profiles; CREATE TABLE provider_public_profiles(user_id INT PRIMARY KEY); CREATE TABLE public_appointment_requests(id INT AUTO_INCREMENT PRIMARY KEY, provider_id INT, requested_start_at DATETIME(3), requested_end_at DATETIME(3), status VARCHAR(24));');
 await db.query(await readFile(new URL('../migrations/1430_public_provider_slot_holds.sql', import.meta.url),'utf8'));
 const service=createPublicProviderHoldService(db);
 const start=new Date(Date.now()+86400000),end=new Date(+start+3600000);
 const input={agencyId:1,providerId:9,serviceType:'counseling',modality:'VIRTUAL',startAt:start.toISOString(),endAt:end.toISOString(),validateAvailability:async()=>{}};
 assert.throws(()=>validateHoldWindow(new Date(Date.now()-1000),end),/valid future/);
 assert.throws(()=>validateHoldWindow(start,new Date(+start+5*3600000)),/valid future/);
 const results=await Promise.allSettled([service.create(input),service.create({...input,agencyId:2,modality:'IN_PERSON'})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1,'Only one concurrent, cross-tenant selection succeeds');
 const winner=results.find(r=>r.status==='fulfilled').value;
 assert.ok(+new Date(winner.expiresAt)>Date.now()+14*60000);
 const [[stored]]=await db.query('SELECT token_hash FROM public_provider_slot_holds');
 assert.notEqual(stored.token_hash,winner.token,'Bearer token is never stored in plaintext');
 await assert.rejects(()=>service.create({...input,startAt:new Date(+start+30*60000).toISOString(),endAt:new Date(+end+30*60000).toISOString()}),/temporarily holding/);
 await service.release({agencyId:999,token:winner.token});
 await assert.rejects(()=>service.create(input),/temporarily holding/,'Another agency cannot release the hold');
 await service.release({agencyId:1,token:'wrong-token'});
 await assert.rejects(()=>service.create(input),/temporarily holding/);
 await assert.rejects(()=>withProviderSelectionLock(db,9,conn=>assertNoSelectionConflict(conn,{...input})),/temporarily holding/,'Requests also respect active holds');
 await db.query('UPDATE public_provider_slot_holds SET expires_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND)');
 const renewed=await service.create(input);
 await service.release({agencyId:1,token:renewed.token});
 await assert.rejects(()=>service.create({...input,validateAvailability:async()=>{throw new Error('Not published');}}),/Not published/);
 const afterFailure=await service.create(input); // failed validation released the advisory lock
 await service.release({agencyId:1,token:afterFailure.token});
 await db.execute("INSERT INTO public_appointment_requests(provider_id,requested_start_at,requested_end_at,status) VALUES(?,?,?,'PENDING')",[9,start,end]);
 await assert.rejects(()=>service.create(input),/already has a request/);
 await db.query("UPDATE public_appointment_requests SET status='CANCELLED'");
 await service.create(input);
 const [[requests]]=await db.query('SELECT COUNT(*) AS count FROM public_appointment_requests');
 assert.equal(requests.count,1,'Selecting times never creates appointment requests');
 console.log('PASS: migration, concurrent overlap, cross-agency conflict, bearer ownership, expiry, request conflict, validation failure cleanup, and no booking side effects.');
} finally { await db.end(); }
