import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { splitSqlStatements } from '../../utils/migrationSql.js';

// Local fixture only: application database credentials are never used.
test('November migration preserves October and history is isolated by tenant and publication state', { skip: process.env.LOCAL_MIGRATION_MYSQL_TEST !== '1' }, async () => {
  const db = await mysql.createConnection({ host: '127.0.0.1', port: 33479, user: 'root', password: '' });
  const name = `handbook_november_test_${process.pid}`;
  let pool;
  try {
    await db.query(`CREATE DATABASE ${name}`); await db.query(`USE ${name}`);
    await db.query('CREATE TABLE agencies(id INT PRIMARY KEY, slug VARCHAR(128))');
    await db.query("INSERT INTO agencies VALUES(2,'itsco'),(3,'other')");
    await db.query("CREATE TABLE workplace_handbook_digests(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,title VARCHAR(255),period_label VARCHAR(64),status VARCHAR(32),notes TEXT,admin_update_id INT,provider_update_push_id INT,published_at DATETIME,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
    await db.query('CREATE TABLE workplace_handbook_digest_entries(id INT AUTO_INCREMENT PRIMARY KEY,digest_id INT,agency_id INT,sort_order INT,subject VARCHAR(500),rationale TEXT,changed_content MEDIUMTEXT,handbook_section_slug VARCHAR(128),change_kind VARCHAR(32),previous_content MEDIUMTEXT)');
    await db.query('CREATE TABLE provider_update_pushes(id INT PRIMARY KEY,agency_id INT,attached_admin_update_id INT,sent_at DATETIME)');
    await db.query("INSERT INTO workplace_handbook_digests(id,agency_id,title,period_label,status,admin_update_id) VALUES(1,2,'October update','October 2026','draft',7),(2,3,'Other agency update','October 2026','published',NULL),(3,2,'Unsent draft','December 2026','draft',8),(4,2,'September update','September 2026','published',NULL)");
    await db.query("INSERT INTO workplace_handbook_digest_entries(digest_id,agency_id,subject,changed_content) VALUES(1,2,'October pathway','Original October tier wording')");
    await db.query("INSERT INTO provider_update_pushes VALUES(12,2,7,'2026-10-10 12:00:00'),(13,2,8,NULL)");
    const [[octoberBefore]] = await db.query('SELECT * FROM workplace_handbook_digests WHERE id=1');
    const [[octoberEntryBefore]] = await db.query('SELECT * FROM workplace_handbook_digest_entries WHERE digest_id=1');
    const sql = await fs.readFile(new URL('../../../../database/migrations/1613_itsco_november_handbook_updates.sql', import.meta.url), 'utf8');
    const migrate = async () => { for (const statement of splitSqlStatements(sql)) await db.query(statement); };
    await migrate(); await migrate();
    const [[november]] = await db.query("SELECT * FROM workplace_handbook_digests WHERE notes='itsco-november-2026-role-pathways-v1'");
    const [entries] = await db.query('SELECT * FROM workplace_handbook_digest_entries WHERE digest_id=? ORDER BY sort_order', [november.id]);
    assert.equal(november.status,'draft'); assert.equal(november.agency_id,2); assert.equal(entries.length,3);
    assert.equal(entries.every(e=>e.previous_content && e.handbook_section_slug && e.change_kind==='updated'),true);
    assert.match(entries[0].changed_content,/Compensation category and level/); assert.match(entries[1].changed_content,/without a separate numbered/);
    assert.deepEqual((await db.query('SELECT * FROM workplace_handbook_digests WHERE id=1'))[0][0],octoberBefore);
    assert.deepEqual((await db.query('SELECT * FROM workplace_handbook_digest_entries WHERE digest_id=1'))[0][0],octoberEntryBefore);
    const [[otherCount]] = await db.query('SELECT COUNT(*) n FROM workplace_handbook_digests WHERE agency_id=3'); assert.equal(otherCount.n,1);
    await db.query("UPDATE workplace_handbook_digest_entries SET changed_content='Administrator revision' WHERE id=?",[entries[0].id]);
    await migrate(); assert.equal((await db.query('SELECT changed_content FROM workplace_handbook_digest_entries WHERE id=?',[entries[0].id]))[0][0].changed_content,'Administrator revision');
    // Exercise the actual history SQL on the isolated database.
    process.env.SKIP_DB_CONNECT='1';
    ({default:pool}=await import('../../config/database.js'));
    pool.execute = (sql, params) => db.execute(sql, params);
    const {listHandbookHistory,readHandbookHistory}=await import('../workplaceHandbookHistory.service.js');
    const staff=await listHandbookHistory(2);
    assert.deepEqual(staff.map(d=>d.id).sort(),[1,4]); assert.equal(staff.find(d=>d.id===1).availability,'Communicated update');
    const admin=await listHandbookHistory(2,{includeDrafts:true});
    assert.ok(admin.some(d=>d.id===november.id)); assert.ok(!admin.some(d=>d.id===2));
    await assert.rejects(readHandbookHistory(2,november.id),{status:404});
    await assert.rejects(readHandbookHistory(2,2,{includeDrafts:true}),{status:404});
    assert.equal((await listHandbookHistory(3)).length,1);
    await db.query("INSERT INTO provider_update_pushes VALUES(14,3,8,'2026-10-10 12:00:00')");
    assert.deepEqual((await listHandbookHistory(2)).map(d=>d.id).sort(),[1,4]);
    if(process.env.HANDBOOK_BROWSER_FIXTURE) await fs.writeFile(process.env.HANDBOOK_BROWSER_FIXTURE,JSON.stringify({digest:{...november,availability:'Draft · Not published'},entries}));
  } finally { await db.query(`DROP DATABASE IF EXISTS ${name}`); await db.end(); if(pool)await pool.end(); }
});
