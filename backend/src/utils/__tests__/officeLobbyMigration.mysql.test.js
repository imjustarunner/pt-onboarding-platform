import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { splitSqlStatements, stripSqlLineComments, isIgnorableSchemaError } from '../migrationSql.js';

// Explicit local-only fixture: never read application DB credentials.
test('office lobby migration resumes across all index states and preserves check-ins', { skip: process.env.LOCAL_MIGRATION_MYSQL_TEST !== '1' }, async () => {
  const db = await mysql.createConnection({ host: '127.0.0.1', port: 33479, user: 'root', password: '' });
  const name = `office_lobby_migration_test_${process.pid}`;
  const sql = await fs.readFile(new URL('../../../../database/migrations/1516_office_lobby_experience.sql', import.meta.url), 'utf8');
  const statements = splitSqlStatements(stripSqlLineComments(sql));
  async function migrate() {
    for (const statement of statements) {
      try { await db.query(statement); } catch (e) { if (!isIgnorableSchemaError(e)) throw e; }
    }
  }
  try {
    await db.query(`CREATE DATABASE ${name}`); await db.query(`USE ${name}`);
    await db.query('CREATE TABLE office_events(id INT PRIMARY KEY,start_at DATETIME NOT NULL)');
    await db.query("INSERT INTO office_events VALUES(1,'2026-10-01 12:00:00')");
    for (const state of ['legacy', 'both', 'replacement', 'neither']) {
      await db.query('DROP TABLE IF EXISTS office_event_checkins');
      await db.query('CREATE TABLE office_event_checkins(id INT PRIMARY KEY,event_id INT NOT NULL, FOREIGN KEY(event_id) REFERENCES office_events(id))');
      if (state !== 'legacy') await db.query('ALTER TABLE office_event_checkins ADD slot_start_at DATETIME NULL');
      if (state === 'legacy' || state === 'both') await db.query('ALTER TABLE office_event_checkins ADD UNIQUE KEY uniq_office_event_checkins_event(event_id)');
      if (state === 'both' || state === 'replacement') await db.query('ALTER TABLE office_event_checkins ADD UNIQUE KEY uniq_office_checkin_slot(event_id,slot_start_at)');
      await db.query('INSERT INTO office_event_checkins(id,event_id) VALUES(1,1)');
      await migrate(); await migrate();
      const [indexes] = await db.query('SHOW INDEX FROM office_event_checkins');
      assert.equal(indexes.some(r => r.Key_name === 'uniq_office_event_checkins_event'), false, state);
      assert.deepEqual(indexes.filter(r => r.Key_name === 'uniq_office_checkin_slot').map(r => r.Column_name), ['event_id', 'slot_start_at'], state);
      const [[row]] = await db.query("SELECT COUNT(*) AS n,DATE_FORMAT(MAX(slot_start_at),'%Y-%m-%d %H:%i:%s') AS slot FROM office_event_checkins");
      assert.deepEqual(row, { n: 1, slot: '2026-10-01 12:00:00' });
      await assert.rejects(db.query("INSERT INTO office_event_checkins VALUES(2,1,'2026-10-01 12:00:00')"), { code: 'ER_DUP_ENTRY' });
      await db.query("INSERT INTO office_event_checkins VALUES(3,1,'2026-10-02 12:00:00')");
    }
  } finally { await db.query(`DROP DATABASE IF EXISTS ${name}`); await db.end(); }
});
