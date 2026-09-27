import {it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
vi.mock('../../config/clinicalDatabase.js',()=>({default:{}}));
vi.mock('../clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:async()=>{}}}));
vi.mock('../clientRecordAccess.service.js',()=>({resolveClientRecordAccess:async()=>({ok:true,client:{agency_id:377}})}));
vi.mock('../supervisedBillingPolicy.service.js',()=>({validDate:v=>/^\d{4}-\d{2}-\d{2}$/.test(v)}));
import {linkImportedPlannedServices} from '../noteAidPlannedClaim.service.js';

it.skipIf(process.env.PLANNED_CLAIM_MYSQL_TEST!=='1')('concurrent imports and queue rebuilds retain one planned encounter without manufacturing a note or claim',async()=>{
  expect(process.env.DB_HOST).toBe('127.0.0.1');expect(process.env.DB_PORT).toBe('33316');
  const admin=await mysql.createConnection({host:'127.0.0.1',port:33316,user:'root',database:'mysql'});
  const schema=`planned_claim_test_${randomUUID().replaceAll('-','')}`;
  await admin.query(`CREATE DATABASE ${schema}`);
  const db=mysql.createPool({host:'127.0.0.1',port:33316,user:'root',database:schema,connectionLimit:5,multipleStatements:true});
  try {
    // Each run owns its synthetic schema; never reset a shared fixture or application database.
    for(const file of ['001_create_clinical_data_plane.sql','002_medical_billing_foundations.sql','003_session_service_code_location.sql','004_billing_encounter_clinical_sessions.sql']) await db.query(await readFile(new URL(`../../../../database/clinical_migrations/${file}`,import.meta.url),'utf8'));
    const item={agencyId:377,clientId:401,noteKind:'progress',serviceCode:'90837',date:'2026-09-20',timeLabel:'1:00 PM'},user={id:91,role:'provider'};
    // Reproduce the production failure, then verify migration 023 repairs it idempotently.
    await expect(linkImportedPlannedServices([item],user,db)).rejects.toMatchObject({code:'ER_NO_SUCH_TABLE'});
    const plannedMigration=await readFile(new URL('../../../../database/clinical_migrations/023_note_aid_planned_claims.sql',import.meta.url),'utf8');
    await db.query(plannedMigration);await db.query(plannedMigration);
    const results=await Promise.all(Array.from({length:5},()=>linkImportedPlannedServices([item],user,db)));
    expect(new Set(results.map(rows=>rows[0].clinicalSessionId)).size).toBe(1);
    const [sessions]=await db.execute('SELECT * FROM clinical_sessions');expect(sessions).toHaveLength(1);expect(sessions[0].encounter_status).toBe('scheduled');expect(sessions[0].scheduled_start_at).toBeNull();
    const [claims]=await db.execute('SELECT * FROM clinical_claims');expect(claims).toHaveLength(0);
    const [notes]=await db.execute('SELECT * FROM clinical_notes');expect(notes).toHaveLength(0);
    const rebuilt=await linkImportedPlannedServices([{...item,id:'new-queue-id'}],user,db);expect(rebuilt[0].clinicalSessionId).toBe(sessions[0].id);
    await expect(linkImportedPlannedServices([{...item,timeLabel:'2:00 PM'}],user,db)).rejects.toMatchObject({status:409});
    const [after]=await db.execute('SELECT id FROM clinical_sessions');expect(after).toHaveLength(1);
    await db.query('CREATE TABLE agencies (id INT PRIMARY KEY,name VARCHAR(255)); INSERT INTO agencies VALUES (377,\'The Inner Strength Institute\'),(378,\'Synthetic other agency\')');
    const payerMigration=await readFile(new URL('../../../../database/migrations/1494_payer_setup_requests.sql',import.meta.url),'utf8');await db.query(payerMigration);await db.query(payerMigration);
    const [payers]=await db.execute('SELECT agency_id,payer_name FROM medical_payer_setup_requests ORDER BY payer_name');expect(payers).toEqual([{agency_id:377,payer_name:'CO BCBS'},{agency_id:377,payer_name:'UnitedHealthcare'}]);
  }finally{await db.end();try{await admin.query(`DROP DATABASE ${schema}`);}finally{await admin.end();}}
},20000);
