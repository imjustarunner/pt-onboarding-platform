import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { splitSqlStatements, stripSqlLineComments } from '../../utils/migrationSql.js';
import { attachClaimReferences } from '../clinicalClaimReferences.service.js';

const socketPath=process.env.FEE_TEST_MYSQL_SOCKET;
const enabled=!!socketPath||process.env.FEE_SCHEDULE_MYSQL_TEST==='1';
const connection=socketPath?{socketPath,user:'root',timezone:'+00:00'}:{host:'127.0.0.1',port:33317,user:'root',password:'synthetic-root-only',timezone:'+00:00'};
for(const mixedCollation of [false,true])test(`claim references retain payer IDs, allocate concurrently and remain immutable${mixedCollation?' after a mixed-collation partial migration':''}`, {skip:!enabled},async()=>{
  const admin=await mysql.createConnection(connection),schema=mixedCollation?'billing_claim_refs_mixed_test':'billing_claim_refs_test';
  const connections=[];
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${schema}`);await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);await admin.query(`USE ${schema}`);
    await admin.query(`CREATE TABLE clinical_claims(id BIGINT AUTO_INCREMENT PRIMARY KEY,agency_id INT NOT NULL,claim_number VARCHAR(120),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await admin.query(`INSERT INTO clinical_claims(id,agency_id,claim_number,created_at) VALUES(1,2,'KEEP-EXTERNAL-123','2026-11-01 05:30:00'),(2,6,'OTHER-REF','2026-11-01 07:30:00'),(3,2,NULL,'2026-11-01 06:30:00')`);
    const sql=await fs.readFile(new URL('../../../../database/clinical_migrations/029_claim_display_references.sql',import.meta.url),'utf8');
    const statements=splitSqlStatements(stripSqlLineComments(sql));
    if(mixedCollation) {
      // Reproduce the deployed partial state: MySQL 8 table defaults were 0900,
      // routine variables inherited the database's unicode collation, and the
      // insert trigger was installed before the backfill comparison failed.
      for(const statement of statements) {
        const legacy=statement.replaceAll('DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci','DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci')
          .replace('issue_month COLLATE utf8mb4_unicode_ci=v_month COLLATE utf8mb4_unicode_ci','issue_month=v_month');
        if(legacy.startsWith('CALL backfill_clinical_claim_references')) {
          await assert.rejects(admin.query(legacy),error=>error.code==='ER_CANT_AGGREGATE_2COLLATIONS');
          break;
        }
        await admin.query(legacy);
      }
      // The failed migration's trigger also blocks new claims until replaced.
      await assert.rejects(admin.query("INSERT INTO clinical_claims(agency_id,created_at) VALUES(2,'2026-11-10 12:00:00')"),error=>error.code==='ER_CANT_AGGREGATE_2COLLATIONS');
    }
    for(const statement of statements)await admin.query(statement);
    const [[table]]=await admin.query("SELECT TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME='clinical_claim_reference_counters'",[schema]);
    assert.equal(table.TABLE_COLLATION,mixedCollation?'utf8mb4_0900_ai_ci':'utf8mb4_unicode_ci');
    const [initial]=await admin.query('SELECT clinical_claim_id,public_reference FROM clinical_claim_references ORDER BY clinical_claim_id');
    // A failed autocommit backfill may consume a sequence before its later
    // comparison fails. Preserve that gap; never reset a live counter.
    const originalReference=mixedCollation?'002-2026-10-002':'002-2026-10-001';
    assert.deepEqual(initial.map(r=>r.public_reference),[originalReference,'006-2026-11-001','002-2026-11-001']);
    for(let i=0;i<8;i++)connections.push(await mysql.createConnection({...connection,database:schema}));
    await Promise.all(connections.map((db,index)=>db.execute("INSERT INTO clinical_claims(agency_id,created_at) VALUES(2,'2026-11-10 12:00:00')")));
    const [[counts]]=await admin.query("SELECT COUNT(*) AS total,COUNT(DISTINCT public_reference) AS unique_count,MAX(sequence_number) AS maximum FROM clinical_claim_references WHERE agency_id=2 AND issue_month='2026-11'");
    assert.equal(counts.total,9);assert.equal(counts.unique_count,9);assert.equal(Number(counts.maximum),9);
    const [[original]]=await admin.query('SELECT claim_number FROM clinical_claims WHERE id=1');assert.equal(original.claim_number,'KEEP-EXTERNAL-123');
    await assert.rejects(admin.query("UPDATE clinical_claim_references SET public_reference='CHANGED' WHERE clinical_claim_id=1"),/immutable/);
    await assert.rejects(admin.query('DELETE FROM clinical_claim_references WHERE clinical_claim_id=1'),/cannot be deleted/);
    await admin.query("UPDATE clinical_claims SET created_at='2026-12-01' WHERE id=1");
    const [[fixed]]=await admin.query('SELECT public_reference FROM clinical_claim_references WHERE clinical_claim_id=1');assert.equal(fixed.public_reference,originalReference);
    // A rerun preserves the allocated references, including sequence growth.
    for(const statement of statements)await admin.query(statement);
    const [[after]]=await admin.query('SELECT COUNT(*) AS n FROM clinical_claim_references');assert.equal(after.n,11);
    await admin.query("INSERT INTO clinical_claim_reference_counters VALUES(2001,'2026-11',999)");
    const [large]=await admin.query("INSERT INTO clinical_claims(agency_id,created_at) VALUES(2001,'2026-11-20 15:00:00')");
    const rows=[{claimId:large.insertId,agency_id:2001},{claimId:large.insertId,agency_id:2}];await attachClaimReferences(rows,admin);
    assert.equal(rows[0].claim_reference,'2001-2026-11-1000');assert.equal(rows[1].claim_reference,null);
    await connections[0].beginTransaction();await connections[0].query("INSERT INTO clinical_claims(agency_id,created_at) VALUES(2001,'2026-11-20 15:00:00')");await connections[0].rollback();
    const [[counter]]=await admin.query("SELECT last_sequence FROM clinical_claim_reference_counters WHERE agency_id=2001 AND issue_month='2026-11'");assert.equal(Number(counter.last_sequence),1000);
  } finally {await Promise.all(connections.map(db=>db.end()));await admin.query(`DROP DATABASE IF EXISTS ${schema}`);await admin.end();}
});
