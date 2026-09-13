// Disposable local database only. No application credentials or real client records.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createPublicProviderHoldService, withProviderSelectionLock, assertNoSelectionConflict, validateHoldWindow, expandWeeklyHold, resolveClientProviderHolds } from '../../backend/src/services/publicProviderHold.service.js';
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
 await db.query('CREATE TABLE IF NOT EXISTS office_locations(id INT PRIMARY KEY, timezone VARCHAR(64), is_active BOOLEAN); CREATE TABLE IF NOT EXISTS office_location_agencies(agency_id INT,office_location_id INT);');
 await db.query("INSERT INTO office_locations VALUES(999,'America/Denver',TRUE) ON DUPLICATE KEY UPDATE timezone='America/Denver'; DELETE FROM office_location_agencies WHERE agency_id=999; INSERT INTO office_location_agencies VALUES(999,999)");
 await db.query("INSERT INTO public_provider_slot_holds(agency_id,provider_id,service_type,modality,start_at,end_at,token_hash,expires_at) VALUES(999,999,'counseling','VIRTUAL','2030-01-07 17:00:00','2030-01-07 18:00:00',REPEAT('a',64),DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 HOUR)),(999,998,'counseling','VIRTUAL','2030-01-07 17:00:00','2030-01-07 18:00:00',REPEAT('b',64),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR))");
 await db.query(await readFile(new URL('../migrations/1431_recurring_provider_intake_holds.sql',import.meta.url),'utf8'));
 const [legacy]=await db.query('SELECT provider_id,resolution,time_zone,expires_at FROM public_provider_slot_holds ORDER BY provider_id DESC');
 assert.equal(legacy[0].resolution,'LEGACY_EXPIRED','Migration does not revive expired holds');
 assert.equal(legacy[1].expires_at,null);assert.equal(legacy[1].time_zone,'America/Denver','Legacy active holds use the scheduler timezone');
 await db.query('DELETE FROM public_provider_slot_holds WHERE agency_id=999');
 const service=createPublicProviderHoldService(db);
 const start=new Date(Date.now()+86400000),end=new Date(+start+3600000);
 const input={agencyId:1,providerId:9,serviceType:'counseling',modality:'VIRTUAL',startAt:start.toISOString(),endAt:end.toISOString(),validateAvailability:async()=>{}};
 assert.throws(()=>validateHoldWindow(new Date(Date.now()-1000),end),/valid future/);
 assert.throws(()=>validateHoldWindow(start,new Date(+start+5*3600000)),/valid future/);
 const results=await Promise.allSettled([service.create(input),service.create({...input,agencyId:2,modality:'IN_PERSON'})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1,'Only one concurrent, cross-tenant selection succeeds');
 const winner=results.find(r=>r.status==='fulfilled').value;
 assert.equal(winner.expiresAt,null);
 assert.equal(winner.recurring,true);
 const [[stored]]=await db.query('SELECT token_hash FROM public_provider_slot_holds');
 assert.notEqual(stored.token_hash,winner.token,'Bearer token is never stored in plaintext');
 await assert.rejects(()=>service.create({...input,startAt:new Date(+start+30*60000).toISOString(),endAt:new Date(+end+30*60000).toISOString()}),/held for a pending intake/);
 await service.release({agencyId:999,token:winner.token});
 await assert.rejects(()=>service.create(input),/held for a pending intake/,'Another agency cannot release the hold');
 await service.release({agencyId:1,token:'wrong-token'});
 await assert.rejects(()=>service.create(input),/held for a pending intake/);
 await assert.rejects(()=>withProviderSelectionLock(db,9,conn=>assertNoSelectionConflict(conn,{...input})),/held for a pending intake/,'Requests also respect active holds');
 await assert.rejects(()=>service.create({...input,startAt:new Date(+start+7*86400000).toISOString(),endAt:new Date(+end+7*86400000).toISOString()}),/held for a pending intake/,'The following week is protected');
 const [[owner]]=await db.query('SELECT agency_id FROM public_provider_slot_holds WHERE released_at IS NULL');
 assert.equal(await service.attach({agencyId:owner.agency_id,providerId:9,token:winner.token,clientId:51}),true);
 assert.equal(await service.attach({agencyId:owner.agency_id,providerId:9,token:winner.token,clientId:52}),false,'A replay cannot steal another client hold');
 await resolveClientProviderHolds(db,{clientId:51,userId:7});
 assert.equal(await service.status({agencyId:owner.agency_id,token:winner.token}),false,'Placement resolves the hold');
 const renewed=await service.create(input);
 await service.release({agencyId:1,token:renewed.token});
 await assert.rejects(()=>service.create({...input,validateAvailability:async()=>{throw new Error('Not published');}}),/Not published/);
 const afterFailure=await service.create(input); // failed validation released the advisory lock
 await service.release({agencyId:1,token:afterFailure.token});
 await db.execute("INSERT INTO public_appointment_requests(provider_id,requested_start_at,requested_end_at,status) VALUES(?,?,?,'PENDING')",[9,start,end]);
 await assert.rejects(()=>service.create(input),/already has an appointment request/);
 await db.query("UPDATE public_appointment_requests SET status='CANCELLED'");
 await service.create(input);
 const [[requests]]=await db.query('SELECT COUNT(*) AS count FROM public_appointment_requests');
 assert.equal(requests.count,1,'Selecting times never creates appointment requests');
 const dst=expandWeeklyHold({startAt:'2030-03-05T23:00:00Z',endAt:'2030-03-06T00:00:00Z',timeZone:'America/Denver'},'2030-03-01','2030-03-20');
 assert.deepEqual(dst.map(i=>i.start.toISOString()),['2030-03-05T23:00:00.000Z','2030-03-12T22:00:00.000Z','2030-03-19T22:00:00.000Z'],'Tuesday 4 PM stays at 4 PM through DST');
 const fall=expandWeeklyHold({startAt:'2030-10-29T22:00:00Z',endAt:'2030-10-29T23:00:00Z',timeZone:'America/Denver'},'2030-10-29','2030-11-08');
 assert.deepEqual(fall.map(i=>i.start.toISOString()),['2030-10-29T22:00:00.000Z','2030-11-05T23:00:00.000Z']);
 console.log('PASS: migration, concurrent overlap, cross-agency conflict, bearer ownership, recurring weeks, DST, binding and placement resolution, request conflict, validation failure cleanup, and no booking side effects.');
} finally { await db.end(); }
