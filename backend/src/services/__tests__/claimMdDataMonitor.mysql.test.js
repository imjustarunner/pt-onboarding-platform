import {it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
vi.mock('../../config/database.js',()=>({default:{}}));
import {recordDataGaps,runClaimMdDataMonitor} from '../claimMdDataMonitor.service.js';
import {decryptFamilyBilling} from '../familyBillingEncryption.service.js';

it.skipIf(process.env.BILLING_FOLLOWUP_MYSQL_TEST!=='1')('deduplicates findings in MySQL and sends one durable digest across worker runs',async()=>{
 const db=await mysql.createConnection({host:'127.0.0.1',port:33316,user:'root',password:'synthetic-root-only',timezone:'+00:00',multipleStatements:true});
 const schema=`payer_monitor_${randomUUID().replaceAll('-','')}`;
 vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64'));
 try {
  await db.query(`CREATE DATABASE ${schema}`);await db.query(`USE ${schema}`);
  await db.query(readFileSync(new URL('../../../../database/migrations/1789_claimmd_data_gap_monitor.sql',import.meta.url),'utf8'));
  const issue={endpoint:'eligdata',path:'elig.unknown_patient_key',kind:'unrecognized_returned_field',payerId:'SKCO0'};
  await recordDataGaps(2,[issue],db);await recordDataGaps(2,[issue],db);await recordDataGaps(6,[issue],db);
  const [rows]=await db.query('SELECT * FROM claimmd_data_gaps ORDER BY id');
  expect(rows).toHaveLength(2);expect(Number(rows[0].occurrences)).toBe(2);
  expect(rows[0].public_path).not.toContain('patient_key');expect(decryptFamilyBilling(rows[0].path_encrypted,`claimmd-data-gap:${rows[0].issue_key}`)).toEqual({path:issue.path});
  await db.query('UPDATE claimmd_data_monitor_state SET catalog_checked_at=UTC_TIMESTAMP()');
  const connection={execute:db.execute.bind(db),beginTransaction:db.beginTransaction.bind(db),commit:db.commit.bind(db),rollback:db.rollback.bind(db),release(){}};
  const send=vi.fn(async()=>({id:'synthetic-message',communicationId:30}));
  const deps={pool:{getConnection:async()=>connection},canRun:async()=>true,resolveSender:async()=>({identity:{id:2},replyTo:'technology@example.test'}),notify:async()=>({id:1}),send};
  expect(await runClaimMdDataMonitor(deps)).toEqual({findings:2,status:'sent'});
  expect(await runClaimMdDataMonitor(deps)).toEqual({skipped:'daily_digest_cooldown'});
  await recordDataGaps(2,[issue],db);expect(send).toHaveBeenCalledOnce();
  const [sent]=await db.query('SELECT notification_status,communication_id FROM claimmd_data_gaps');
  expect(sent.every(r=>r.notification_status==='sent'&&Number(r.communication_id)===30)).toBe(true);
 } finally {await db.query(`DROP DATABASE IF EXISTS ${schema}`);await db.end();}
});
