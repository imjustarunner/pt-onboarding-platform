// Opt-in integration check against a disposable localhost MySQL instance.
// Never imports database.js or loads backend/.env.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import mysql from 'mysql2/promise';
import { splitSqlStatements, stripSqlLineComments, isIgnorableSchemaError } from '../migrationSql.js';

const port = Number(process.env.REFERRAL_MIGRATION_TEST_MYSQL_PORT || 0);
test('1518 supports fresh installation, partial retries, uniqueness and client deletion', { skip: !port }, async () => {
  const db = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '', multipleStatements: false });
  const name = `codex_referral_migration_${randomBytes(8).toString('hex')}`;
  let created = false;
  try {
    await db.query(`CREATE DATABASE ${name}`);
    created = true;
    await db.query(`USE ${name}`);
    for (const table of ['users', 'agencies', 'clients']) await db.query(`CREATE TABLE ${table} (id INT PRIMARY KEY) ENGINE=InnoDB`);
    const load = async file => splitSqlStatements(stripSqlLineComments(await readFile(new URL(`../../../../database/migrations/${file}`, import.meta.url), 'utf8')));
    for (const sql of (await load('1060_client_exchange.sql')).slice(0, 2)) await db.query(sql);
    const statements = await load('1518_internal_service_referrals.sql');
    // Simulate the previous run stopping after its CREATE TABLE had succeeded.
    for (const sql of statements.slice(0, 5)) await db.query(sql);
    // Reproduce the rejected generated-column / ON DELETE SET NULL combination.
    await assert.rejects(db.query(`ALTER TABLE client_exchange_listings
      ADD COLUMN invalid_referral_key VARCHAR(160) GENERATED ALWAYS AS
      (CASE WHEN status IN ('open','requested') THEN CONCAT(client_id,':',referral_kind,':',service_type) ELSE NULL END) STORED`));
    for (let pass = 0; pass < 2; pass++) {
      for (const sql of statements) {
        try { await db.query(sql); }
        catch (error) { if (!isIgnorableSchemaError(error)) throw error; }
      }
    }
    for (const table of ['users', 'agencies', 'clients']) await db.query(`INSERT INTO ${table} (id) VALUES (1)`);
    const insert = (status, service = 'family') => db.execute(`INSERT INTO client_exchange_listings
      (agency_id,client_id,posted_by_user_id,status,referral_kind,service_type)
      VALUES (1,1,1,?,'additional_service',?)`, [status, service]);
    await insert('open');
    await assert.rejects(insert('requested'), { code: 'ER_DUP_ENTRY' });
    await insert('open', 'couples');
    await insert('closed');
    await insert('closed');
    await db.query("UPDATE client_exchange_listings SET status='closed' WHERE service_type='family'");
    const [referral] = await insert('open');
    await db.execute(`INSERT INTO client_service_assignments (client_id,agency_id,provider_user_id,service_type,referral_listing_id)
      VALUES (1,1,1,'family',?)`, [referral.insertId]);
    await db.query('DELETE FROM clients WHERE id=1');
    const [listings] = await db.query('SELECT client_id FROM client_exchange_listings');
    assert.ok(listings.length > 0);
    assert.ok(listings.every(row => row.client_id === null));
    const [assignments] = await db.query('SELECT id FROM client_service_assignments');
    assert.equal(assignments.length, 0);
  } finally {
    try { if (created) await db.query(`DROP DATABASE ${name}`); }
    finally { await db.end(); }
  }
});
