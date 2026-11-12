import {nonDemoOrSyntheticQaMembershipSql} from '../../utils/auricwellQaPolicy.js';
import {afterAll,beforeAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import mysql from 'mysql2/promise';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
vi.mock('../narrivaAccess.service.js',()=>({requireNarrivaAgency:vi.fn(),requireNarrivaClient:vi.fn(),positiveId:value=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):null,narrivaError:(status,message,code)=>Object.assign(new Error(message),{status,code}),parseNarrivaObject:value=>{if(value&&typeof value==='object')return value;try{return JSON.parse(value||'{}');}catch{return {};}}}));
vi.mock('../staffCareEligibility.service.js',()=>({readStaffCareEligibility:vi.fn()}));
vi.mock('../agencySchedulingCatalog.service.js',()=>({resolveAgencySchedulingCatalog:vi.fn()}));
import {changeClinicalSessionService,getClinicalSessionService} from '../clinicalSessionServiceChange.service.js';
import {assertNoPendingClinicalServiceChange} from '../../utils/clinicalServiceChangePolicy.js';
import {maybeEncryptNotePayload,maybeDecryptNotePayload} from '../clinicalNoteCrypto.service.js';
import {deriveApproved99051Decision,reviewClaim99051Policy} from '../clinicalAfterHours.service.js';

const socket=process.env.NARRIVA_MYSQL_SOCKET;
const suite=socket||process.env.NARRIVA_MYSQL_TEST==='1'?describe:describe.skip;
const actor={id:7},input={agencyId:1,sessionId:10,expectedOldServiceCode:'H0004',serviceCode:'H2011',confirmed:true,justification:'Unscheduled crisis intervention was provided.',durationMinutes:60,modality:'in_person'};
let admin,db,d,priorKey;
const settings={...(socket?{socketPath:socket}:{host:'127.0.0.1',port:Number(process.env.NARRIVA_MYSQL_PORT||3306),password:process.env.NARRIVA_MYSQL_PASSWORD||''}),user:'root',multipleStatements:true};
const state=async()=>{const [[session]]=await db.execute('SELECT * FROM clinical_sessions WHERE id=10');const [[appointment]]=await db.execute('SELECT * FROM appointments WHERE id=30');const [[office]]=await db.execute('SELECT * FROM office_events WHERE id=40');return {session,appointment,office};};
function failConnection(pool,predicate,{afterCommit=false}={}) {
 return {...pool,execute:(...args)=>pool.execute(...args),getConnection:async()=>{const connection=await pool.getConnection();return {execute:(sql,args)=>predicate(sql,args)?Promise.reject(new Error('Synthetic storage failure')):connection.execute(sql,args),beginTransaction:()=>connection.beginTransaction(),commit:async()=>{await connection.commit();if(afterCommit)throw new Error('Synthetic acknowledgement lost');},rollback:()=>connection.rollback(),release:()=>connection.release()};}};
}
suite('explicit clinical service correction across MySQL data planes',()=>{
 beforeAll(async()=>{
  priorKey=process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64=Buffer.alloc(32,11).toString('base64');
  admin=await mysql.createConnection(settings);await admin.query('CREATE DATABASE IF NOT EXISTS narriva_service_change_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  db=mysql.createPool({...settings,database:'narriva_service_change_test',connectionLimit:6});
  await db.query(`DROP TABLE IF EXISTS clinical_sessions,clinical_notes,clinical_claims,appointments,appointment_participants,office_events,office_locations,office_location_agencies,clinical_note_drafts,note_aid_work_queue_items,agency_medical_service_codes,scheduling_service_codes,credential_service_code_eligibility;
   CREATE TABLE clinical_sessions(id INT PRIMARY KEY,agency_id INT,client_id INT,provider_user_id INT,appointment_id INT,office_event_id INT,billing_encounter_id INT,service_code VARCHAR(32),duration_minutes INT,is_telehealth TINYINT,place_of_service VARCHAR(8),encounter_status VARCHAR(32),metadata_json JSON,scheduled_start_at DATETIME,scheduled_end_at DATETIME,source_timezone VARCHAR(80),effective_service_code VARCHAR(32),billed_units INT,claim_blocked_reason VARCHAR(500),updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);
   CREATE TABLE clinical_notes(id INT PRIMARY KEY,clinical_session_id INT,created_by_user_id INT,provider_signed_at DATETIME,supervisor_cosigned_at DATETIME,content_review_source VARCHAR(80),is_legal_hold TINYINT DEFAULT 0,note_payload LONGTEXT,metadata_json JSON,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);
   CREATE TABLE clinical_claims(id INT PRIMARY KEY,clinical_session_id INT,is_deleted TINYINT DEFAULT 0);
   CREATE TABLE appointments(id INT PRIMARY KEY,agency_id INT,provider_user_id INT,clinical_session_id INT,office_event_id INT,service_code VARCHAR(32),addon_service_codes_json JSON,status VARCHAR(32),package_entitlement_id INT,product_origin VARCHAR(80),updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);
   CREATE TABLE appointment_participants(appointment_id INT,client_id INT);
   CREATE TABLE office_events(id INT PRIMARY KEY,office_location_id INT,client_id INT,booked_provider_id INT,assigned_provider_id INT,service_code VARCHAR(32),session_context_json JSON);
   CREATE TABLE office_locations(id INT PRIMARY KEY,agency_id INT,timezone VARCHAR(80));
   CREATE TABLE office_location_agencies(office_location_id INT,agency_id INT);
   CREATE TABLE clinical_note_drafts(id INT PRIMARY KEY,agency_id INT,user_id INT,clinical_session_id INT,service_code VARCHAR(32),output_json LONGTEXT,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);
   CREATE TABLE note_aid_work_queue_items(id INT PRIMARY KEY,agency_id INT,user_id INT,clinical_session_id INT,service_code VARCHAR(32),updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);
   CREATE TABLE agency_medical_service_codes(agency_id INT,service_code VARCHAR(32),is_active TINYINT,is_addon TINYINT,unit_calc_mode VARCHAR(40),unit_minutes INT,min_minutes INT,max_minutes INT,max_units_per_session INT,ladder_bands_json JSON,overflow_service_code VARCHAR(32),overflow_at_minutes INT,allowed_place_of_service_json JSON,allowed_credential_tiers_json JSON,PRIMARY KEY(agency_id,service_code));
   CREATE TABLE scheduling_service_codes(code VARCHAR(32) PRIMARY KEY,is_active TINYINT);
   CREATE TABLE credential_service_code_eligibility(service_code VARCHAR(32),credential_tier VARCHAR(32),allowed TINYINT);`);
 });
 afterAll(async()=>{if(priorKey===undefined)delete process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;else process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64=priorKey;if(db)await db.end();if(admin)await admin.end();});
 beforeEach(async()=>{
  await db.query(`DELETE FROM clinical_sessions;DELETE FROM clinical_notes;DELETE FROM clinical_claims;DELETE FROM appointments;DELETE FROM appointment_participants;DELETE FROM office_events;DELETE FROM office_locations;DELETE FROM office_location_agencies;DELETE FROM clinical_note_drafts;DELETE FROM note_aid_work_queue_items;DELETE FROM agency_medical_service_codes;DELETE FROM scheduling_service_codes;DELETE FROM credential_service_code_eligibility;
   INSERT INTO clinical_sessions VALUES(10,1,20,7,30,40,NULL,'H0004',60,0,'11','completed','{"sessionContext":{"serviceCode":"H0004"}}','2026-11-06 15:00:00','2026-11-06 16:00:00','America/Denver','H0004',4,NULL,CURRENT_TIMESTAMP);
   INSERT INTO appointments(id,agency_id,provider_user_id,clinical_session_id,office_event_id,service_code,addon_service_codes_json,status,product_origin) VALUES(30,1,7,10,40,'H0004','["90785","99051"]','completed','full_suite');
   INSERT INTO appointment_participants VALUES(30,20);INSERT INTO office_locations VALUES(50,1,'America/Denver');INSERT INTO office_events VALUES(40,50,20,7,NULL,'H0004','{"serviceCode":"H0004","unchanged":true}');
   INSERT INTO agency_medical_service_codes(agency_id,service_code,is_active,is_addon,unit_calc_mode,unit_minutes,min_minutes,max_minutes,max_units_per_session) VALUES(1,'H2011',1,0,'MEDICAID_8_MINUTE_LADDER',15,8,247,16);
   INSERT INTO note_aid_work_queue_items(id,agency_id,user_id,clinical_session_id,service_code) VALUES(70,1,7,10,'H0004');`);
  const payload=maybeEncryptNotePayload(JSON.stringify({sections:{Narrative:'Preserve authored session content.'},meta:{serviceCode:'H0004',sessionContext:{serviceCode:'H0004'}}}));
  await db.execute('INSERT INTO clinical_note_drafts(id,agency_id,user_id,clinical_session_id,service_code,output_json) VALUES(60,1,7,10,?,?)',['H0004',payload]);
  await db.execute('INSERT INTO clinical_notes(id,clinical_session_id,created_by_user_id,note_payload,metadata_json) VALUES(80,10,7,?,?)',[payload,JSON.stringify({serviceCode:'H0004'})]);
  d={mainDb:db,clinicalDb:db,requireAgency:vi.fn().mockResolvedValue(actor),requireClient:vi.fn().mockResolvedValue({id:20}),readEligibility:vi.fn().mockResolvedValue({canProvideCare:true,credentialTier:'bachelors'}),resolveCatalog:vi.fn().mockResolvedValue({eligibleServiceCodes:[{code:'H2011',minDurationMinutes:8,maxDurationMinutes:247}]}),setServiceCodes:vi.fn(async(id,values,connection)=>connection.execute('UPDATE appointments SET service_code=?,addon_service_codes_json=? WHERE id=?',[values.serviceCode,JSON.stringify(values.addonServiceCodes),id]))};
 });
 it('reads only the author’s actual code, duration and delivery without narrative or identifiers',async()=>{
  expect(await getClinicalSessionService(actor,{agencyId:1,sessionId:10},d)).toMatchObject({serviceCode:'H0004',durationMinutes:60,modality:'in_person',pendingServiceChange:false,session:{id:10}});
  await expect(getClinicalSessionService({id:8},{agencyId:1,sessionId:10},d)).rejects.toMatchObject({status:404});
 });
 it('changes a completed unsigned encounter and every owned source while preserving content, add-ons and encrypted reason',async()=>{
  expect(await changeClinicalSessionService(actor,input,d)).toMatchObject({serviceCode:'H2011',changed:true,pendingServiceChange:false});
  const {session,appointment,office}=await state();expect([session.service_code,appointment.service_code,office.service_code]).toEqual(['H2011','H2011','H2011']);expect(appointment.addon_service_codes_json).toEqual(['90785']);expect(office.session_context_json).toEqual({serviceCode:'H2011',unchanged:true});
  expect(session.metadata_json.serviceCodeChanges).toHaveLength(1);expect(JSON.stringify(session.metadata_json)).not.toContain(input.justification);expect(maybeDecryptNotePayload(session.metadata_json.serviceCodeChanges[0].reasonCiphertext)).toBe(input.justification);
  const [[draft]]=await db.execute('SELECT * FROM clinical_note_drafts WHERE id=60');const [[note]]=await db.execute('SELECT * FROM clinical_notes WHERE id=80');const [[work]]=await db.execute('SELECT service_code FROM note_aid_work_queue_items WHERE id=70');
  expect([draft.service_code,work.service_code,note.metadata_json.serviceCode]).toEqual(['H2011','H2011','H2011']);for(const encrypted of [draft.output_json,note.note_payload])expect(JSON.parse(maybeDecryptNotePayload(encrypted))).toMatchObject({sections:{Narrative:'Preserve authored session content.'},meta:{serviceCode:'H2011',sessionContext:{serviceCode:'H2011'}}});
  expect(await changeClinicalSessionService(actor,input,d)).toMatchObject({changed:false,serviceCode:'H2011'});expect((await state()).session.metadata_json.serviceCodeChanges).toHaveLength(1);
 });
 it('requires explicit confirmation and a reason; never applies an AI suggestion automatically',async()=>{
  for(const replacement of [{confirmed:false},{justification:''},{previousServiceCode:'90837'},{expectedOldServiceCode:'90837'}])await expect(changeClinicalSessionService(actor,{...input,...replacement},d)).rejects.toMatchObject({status:expect.any(Number)});
  expect((await state()).appointment.service_code).toBe('H0004');expect(d.setServiceCodes).not.toHaveBeenCalled();
 });
 it('denies unknown qualifications, disabled services and current loss of care permission',async()=>{
  d.readEligibility.mockResolvedValueOnce({canProvideCare:true,credentialTier:'unknown'});await expect(changeClinicalSessionService(actor,input,d)).rejects.toMatchObject({code:'SERVICE_CODE_NOT_ALLOWED'});
  d.readEligibility.mockResolvedValueOnce({canProvideCare:false,credentialTier:'bachelors'});await expect(changeClinicalSessionService(actor,input,d)).rejects.toMatchObject({status:403});
  await db.execute("UPDATE agency_medical_service_codes SET is_active=0");await expect(changeClinicalSessionService(actor,input,d)).rejects.toMatchObject({code:'SERVICE_CODE_NOT_ALLOWED'});expect(d.setServiceCodes).not.toHaveBeenCalled();
 });
 it('requires actual duration and modality to match and leaves 248+ minute crisis encounters for review',async()=>{
  await expect(changeClinicalSessionService(actor,{...input,durationMinutes:45},d)).rejects.toMatchObject({status:409});await expect(changeClinicalSessionService(actor,{...input,modality:'video'},d)).rejects.toMatchObject({status:409});
  await db.execute('UPDATE clinical_sessions SET duration_minutes=248');await expect(changeClinicalSessionService(actor,{...input,durationMinutes:248},d)).rejects.toMatchObject({code:'SERVICE_DURATION_REVIEW_REQUIRED'});expect(d.setServiceCodes).not.toHaveBeenCalled();
 });
 it('preserves signed, held and billing-linked content and rejects multi-client source changes',async()=>{
  await db.execute('UPDATE clinical_notes SET provider_signed_at=CURRENT_TIMESTAMP');await expect(changeClinicalSessionService(actor,input,d)).rejects.toMatchObject({status:409});await db.execute('UPDATE clinical_notes SET provider_signed_at=NULL,is_legal_hold=1');await expect(changeClinicalSessionService(actor,input,d)).rejects.toMatchObject({status:409});await db.execute('UPDATE clinical_notes SET is_legal_hold=0');
  await db.execute('INSERT INTO clinical_claims VALUES(90,10,0)');await expect(changeClinicalSessionService(actor,input,d)).rejects.toMatchObject({status:409});await db.execute('DELETE FROM clinical_claims');await db.execute('INSERT INTO appointment_participants VALUES(30,21)');await expect(changeClinicalSessionService(actor,input,d)).rejects.toMatchObject({status:409});expect(d.setServiceCodes).not.toHaveBeenCalled();
 });
 it('rejects an in-flight concurrent service correction using the real database advisory lock',async()=>{
  const connection=await db.getConnection();try{await connection.execute("SELECT GET_LOCK('narriva-service:1:10',0)");await expect(changeClinicalSessionService(actor,input,d)).rejects.toMatchObject({status:409});expect(d.setServiceCodes).not.toHaveBeenCalled();}finally{await connection.execute("SELECT RELEASE_LOCK('narriva-service:1:10')");connection.release();}
 });
 it('rolls back main source failures and clears only its new pending journal when no main commit was attempted',async()=>{
  d.setServiceCodes.mockImplementationOnce(async()=>{throw new Error('Synthetic write failure');});await expect(changeClinicalSessionService(actor,input,d)).rejects.toThrow('Synthetic write failure');const {session,appointment}=await state();expect(session.metadata_json.serviceCodeChangePending).toBeUndefined();expect(appointment.service_code).toBe('H0004');
 });
 it('keeps a durable fail-closed journal after a main commit acknowledgement is lost and resumes the same confirmation',async()=>{
  const broken=failConnection(db,()=>false,{afterCommit:true});await expect(changeClinicalSessionService(actor,input,{...d,mainDb:broken})).rejects.toMatchObject({code:'CLINICAL_SERVICE_CHANGE_PENDING',status:503});
  const partial=await state();expect(partial.appointment.service_code).toBe('H2011');expect(partial.session.service_code).toBe('H0004');expect(()=>assertNoPendingClinicalServiceChange(partial.session)).toThrow();
  await expect(changeClinicalSessionService(actor,{...input,justification:'Different reason'},d)).rejects.toMatchObject({code:'CLINICAL_SERVICE_CHANGE_PENDING'});
  expect(await changeClinicalSessionService(actor,input,d)).toMatchObject({serviceCode:'H2011',pendingServiceChange:false});expect(()=>assertNoPendingClinicalServiceChange(({}))).not.toThrow();
 });
 it('retains the journal when rollback cannot be confirmed and resumes without claiming a partial success',async()=>{
  const wrapped={execute:(...args)=>db.execute(...args),getConnection:async()=>{const connection=await db.getConnection();return {execute:(...args)=>connection.execute(...args),beginTransaction:()=>connection.beginTransaction(),commit:()=>connection.commit(),release:()=>connection.release(),rollback:async()=>{await connection.rollback();throw new Error('Synthetic rollback acknowledgement lost');}};}};
  d.setServiceCodes.mockRejectedValueOnce(new Error('Synthetic source failure'));
  await expect(changeClinicalSessionService(actor,input,{...d,mainDb:wrapped})).rejects.toMatchObject({code:'CLINICAL_SERVICE_CHANGE_PENDING'});const partial=await state();expect(partial.appointment.service_code).toBe('H0004');expect(()=>assertNoPendingClinicalServiceChange(partial.session)).toThrow();
  expect(await changeClinicalSessionService(actor,input,d)).toMatchObject({serviceCode:'H2011',pendingServiceChange:false});
 });
 it('restores only the author’s encrypted pending confirmation for an explicit retry after reload',async()=>{
  await expect(changeClinicalSessionService(actor,input,{...d,mainDb:failConnection(db,()=>false,{afterCommit:true})})).rejects.toMatchObject({code:'CLINICAL_SERVICE_CHANGE_PENDING'});
  const response=await getClinicalSessionService(actor,{agencyId:1,sessionId:10},d);expect(response.pendingConfirmation).toEqual({expectedOldServiceCode:'H0004',serviceCode:'H2011',justification:input.justification});expect(response.pendingServiceChange).toBe(true);expect(response).not.toHaveProperty('reasonCiphertext');
  await expect(getClinicalSessionService({id:8},{agencyId:1,sessionId:10},d)).rejects.toMatchObject({status:404});
  const key=process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;delete process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;try{await expect(getClinicalSessionService(actor,{agencyId:1,sessionId:10},d)).rejects.toMatchObject({status:503,code:'CLINICAL_SERVICE_CHANGE_PENDING'});}finally{process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64=key;}
  expect((await state()).session.metadata_json.serviceCodeChangePending).toBeTruthy();
 });
 it('retains the pending block when a note becomes signed during synchronization',async()=>{
  let commits=0;const wrapped={execute:(...args)=>db.execute(...args),getConnection:async()=>{const connection=await db.getConnection();return {execute:(...args)=>connection.execute(...args),beginTransaction:()=>connection.beginTransaction(),rollback:()=>connection.rollback(),release:()=>connection.release(),commit:async()=>{await connection.commit();if(++commits===1)await db.execute('UPDATE clinical_notes SET provider_signed_at=CURRENT_TIMESTAMP WHERE id=80');}};}};
  await expect(changeClinicalSessionService(actor,input,{...d,mainDb:wrapped})).rejects.toMatchObject({code:'CLINICAL_SERVICE_CHANGE_PENDING'});const {session}=await state();expect(()=>assertNoPendingClinicalServiceChange(session)).toThrow();expect(session.service_code).toBe('H0004');
 });
 it('fails before any journal or source mutation when encryption is unavailable',async()=>{
  const key=process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;delete process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;try{await expect(changeClinicalSessionService(actor,input,d)).rejects.toThrow('encryption key');expect((await state()).session.metadata_json.serviceCodeChangePending).toBeUndefined();expect(d.setServiceCodes).not.toHaveBeenCalled();}finally{process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64=key;}
 });
 it.each([[30,2],[38,3],[53,4],[60,4],[67,4],[68,5]])('confirms H0004 at%s minutes and preserves content, with review above the four-unit band',async(minutes,units)=>{
  await db.query(`UPDATE clinical_sessions SET service_code='90837',duration_minutes=${minutes};UPDATE appointments SET service_code='90837';UPDATE office_events SET service_code='90837';
    INSERT INTO agency_medical_service_codes(agency_id,service_code,is_active,is_addon,unit_calc_mode,unit_minutes,min_minutes,max_minutes,max_units_per_session,ladder_bands_json) VALUES(1,'H0004',1,0,'MEDICAID_8_MINUTE_LADDER',15,8,NULL,4,'[{"units":1,"minMinutes":8,"maxMinutes":22},{"units":2,"minMinutes":23,"maxMinutes":37},{"units":3,"minMinutes":38,"maxMinutes":52},{"units":4,"minMinutes":53,"maxMinutes":67}]')`);
  d.resolveCatalog.mockResolvedValue({eligibleServiceCodes:[{code:'H0004',minDurationMinutes:8,maxDurationMinutes:15}]});
  const result=await changeClinicalSessionService(actor,{...input,expectedOldServiceCode:'90837',serviceCode:'H0004',durationMinutes:minutes,justification:'Confirm actual synthetic H0004 service.'},d);
  expect(result.serviceCode).toBe('H0004');const saved=await state();expect(saved.session.service_code).toBe('H0004');expect(saved.appointment.service_code).toBe('H0004');expect(saved.office.service_code).toBe('H0004');
  const [[draft]]=await db.execute('SELECT * FROM clinical_note_drafts WHERE id=60');expect(draft.service_code).toBe('H0004');expect(maybeDecryptNotePayload(draft.output_json)).toContain('Preserve authored session content.');
  expect(saved.session.effective_service_code).toBe('H0004');expect(saved.session.billed_units).toBe(minutes>=68?null:units);if(minutes>=68){expect(saved.session.claim_blocked_reason).toMatch(/^H0004_DURATION_REVIEW:/);expect(result.durationReview).toMatchObject({requiresReview:true,units,actualMinutes:minutes,code:'H0004_DURATION_OVER_LIMIT'});expect(saved.session.metadata_json.serviceDurationReview.units).toBe(units);}else expect(result.durationReview).toBeNull();
 });
 it('preserves an unrelated no-claim funding hold during an explicit valid service correction',async()=>{
  await db.execute("UPDATE clinical_sessions SET claim_blocked_reason='SELF_PAY_ONLY: Claims disabled'");await changeClinicalSessionService(actor,input,d);expect((await state()).session.claim_blocked_reason).toBe('SELF_PAY_ONLY: Claims disabled');
 });
 it.each([
  ['verified QA',1,450,'auricwell-qa-demo',{qaSandbox:{syntheticOnly:true}},0,1],
  ['missing flag',1,450,'auricwell-qa-demo',{},0,0],
  ['string flag',1,450,'auricwell-qa-demo',{qaSandbox:{syntheticOnly:'true'}},0,0],
  ['wrong slug',1,450,'other',{qaSandbox:{syntheticOnly:true}},0,0],
  ['wrong membership',1,2,'auricwell-qa-demo',{qaSandbox:{syntheticOnly:true}},0,0],
  ['archived QA',1,450,'auricwell-qa-demo',{qaSandbox:{syntheticOnly:true}},1,0],
  ['ordinary active staff',0,2,'other',{},0,1]
 ])('checks synthetic supervision membership against actual SQL: %s',async(_label,demo,agencyId,slug,flags,archived,allowed)=>{
  const [[row]]=await db.execute(`WITH agencies AS(SELECT 450 AS id,? AS slug,CAST(? AS JSON) AS feature_flags,1 AS is_active,? AS is_archived)
    SELECT ${nonDemoOrSyntheticQaMembershipSql()} AS allowed FROM(SELECT ? AS is_demo)u CROSS JOIN(SELECT ? AS agency_id)ua`,[slug,JSON.stringify(flags),archived,demo,agencyId]);expect(Number(row.allowed)).toBe(allowed);
 });
 it('applies release migration 1774 twice with the required review and preference columns and indexes',async()=>{
  const migration=readFileSync(new URL('../../../../database/migrations/1774_narriva_reviews_and_preferences.sql',import.meta.url),'utf8');await db.query(migration);await db.query(migration);
  const [columns]=await db.query('SHOW COLUMNS FROM narriva_reviews');expect(columns.map(row=>row.Field)).toEqual(expect.arrayContaining(['clinical_session_id','risk_assessment_required','result_encrypted','source_hash','rules_version']));
  const [indexes]=await db.query('SHOW INDEX FROM narriva_reviews');expect(indexes.map(row=>row.Key_name)).toEqual(expect.arrayContaining(['narriva_draft','narriva_note','narriva_session_risk']));const [preferences]=await db.query('SHOW COLUMNS FROM narriva_writer_preferences');expect(preferences.map(row=>row.Field)).toEqual(expect.arrayContaining(['user_id','agency_id','default_mode']));
 });
 it('derives and revalidates an approved99051 claim binding against actual medical catalog SQL, including primary POS and disabled rules',async()=>{
  await db.query(`INSERT INTO scheduling_service_codes VALUES('99051',1);INSERT INTO credential_service_code_eligibility VALUES('99051','intern_plus',1);
    INSERT INTO agency_medical_service_codes(agency_id,service_code,is_active,is_addon,allowed_place_of_service_json,allowed_credential_tiers_json) VALUES(1,'99051',1,1,'["11"]','["intern_plus"]');
    UPDATE agency_medical_service_codes SET allowed_place_of_service_json='["11"]' WHERE service_code='H2011'`);
  const approved={id:80,clinical_version_id:200,clinical_version_content_hash:'a'.repeat(64),metadata_json:{serviceCode:'H2011',dateOfService:'2026-11-09',billingAddons:[]}},encounter={id:10,agency_id:1,client_id:20,provider_user_id:7,service_code:'H2011',scheduled_start_at:'2026-11-10 00:00:00',source_timezone:'America/Denver',place_of_service:'11',is_telehealth:0};
  const policyDeps={database:db,readCare:async()=>({canProvideCare:true,credentialTier:'intern_plus'}),credentialOverrides:async()=>new Map(),providerGrants:async()=>[],policy:async()=>({enabledForAgency:true,allowedForCredentialTier:true}),enabled:async()=>true};
  const decision=await deriveApproved99051Decision({note:approved,session:encounter},policyDeps);expect(decision.included).toBe(true);
  const claim={metadata_json:{scheduleDerived99051:decision.binding}},lines=[{procedure_code:'H2011',units:4},{procedure_code:'99051',units:1}];expect((await reviewClaim99051Policy({claim,note:approved,session:encounter,lines},policyDeps)).blockers).toEqual([]);
  await db.execute("UPDATE agency_medical_service_codes SET allowed_place_of_service_json='[\"03\"]' WHERE service_code='H2011'");expect((await reviewClaim99051Policy({claim,note:approved,session:encounter,lines},policyDeps)).blockers).not.toEqual([]);
  await db.execute("UPDATE agency_medical_service_codes SET is_active=0 WHERE service_code='99051'");expect((await deriveApproved99051Decision({note:approved,session:encounter},policyDeps)).included).toBe(false);
 });
});
