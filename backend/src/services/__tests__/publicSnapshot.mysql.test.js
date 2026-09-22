import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { splitSqlStatements, stripSqlLineComments } from '../../utils/migrationSql.js';
import { createSharedPublicSnapshotCache, createMysqlPublicSnapshotStore } from '../sharedPublicSnapshotCache.js';

// Deliberately never uses application DB credentials or TCP. This test creates
// and drops only a dedicated schema on an explicitly supplied local test socket.
test('MySQL snapshots: migration, shared leases, rollback, edits and cross-agency holds', { skip: !process.env.PUBLIC_SNAPSHOT_TEST_SOCKET }, async () => {
  assert.match(process.env.PUBLIC_SNAPSHOT_TEST_SOCKET, /^\/private\/tmp\/public-snapshot-[^/]+\/mysql\.sock$/);
  const schema = `public_snapshot_test_${process.pid}`;
  const admin = await mysql.createConnection({ socketPath: process.env.PUBLIC_SNAPSHOT_TEST_SOCKET, user: 'root' });
  await admin.query(`CREATE DATABASE ${schema}`);
  const pool = mysql.createPool({ socketPath: process.env.PUBLIC_SNAPSHOT_TEST_SOCKET, user: 'root', database: schema, connectionLimit: 8 });
  try {
    const sql = await fs.readFile(new URL('../../../../database/migrations/1476_shared_public_snapshots.sql', import.meta.url), 'utf8');
    const statements = splitSqlStatements(stripSqlLineComments(sql));
    const columns = new Map();
    for (const statement of statements) {
      const table = statement.match(/AFTER (?:INSERT|UPDATE|DELETE) ON (\w+)/)?.[1];
      if (!table) continue;
      if (!columns.has(table)) columns.set(table, new Set(['id', 'test_value']));
      for (const match of statement.matchAll(/(?:OLD|NEW)\.(\w+)/g)) columns.get(table).add(match[1]);
    }
    for (const [table, fields] of columns) await pool.query(`CREATE TABLE ${table} (${[...fields].map(field => field === 'id' ? 'id INT PRIMARY KEY' : `${field} VARCHAR(255) NULL`).join(',')}) ENGINE=InnoDB`);
    for (const statement of statements) await pool.query(statement);
    // Repeatability matters if startup retries a partially applied migration.
    for (const statement of statements) await pool.query(statement);
    const [triggers] = await pool.query('SHOW TRIGGERS');
    assert.equal(triggers.length, columns.size * 3);
    const makeReader = () => createSharedPublicSnapshotCache({ store: createMysqlPublicSnapshotStore(pool) });
    const readers = [makeReader(), makeReader(), makeReader()];
    const one = { key: ['agency', 1, 'provider', 9], kind: 'availability', providerId: 9 };
    const two = { ...one, key: ['agency', 2, 'provider', 9] };
    const website = { key: ['website'], kind: 'website' };
    let calculations = 0;
    const load = async () => { calculations++; await new Promise(resolve => setTimeout(resolve, 20)); return { slots: ['9am'] }; };
    await Promise.all(Array.from({ length: 24 }, (_, i) => readers[i % 3](one, load)));
    assert.equal(calculations, 1);
    await readers[0](two, load); assert.equal(calculations, 2);
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    await conn.query("INSERT INTO public_provider_slot_holds (id,provider_id) VALUES (1,9)");
    await conn.rollback(); conn.release();
    await readers[1](one, load); assert.equal(calculations, 2, 'rolled back holds do not invalidate committed snapshots');
    await pool.query("INSERT INTO public_provider_slot_holds (id,provider_id) VALUES (1,9)");
    await readers[1](one, load); await readers[2](two, load);
    assert.equal(calculations, 4, 'a hold invalidates the same provider in every agency');
    // Exercise every installed trigger with real SQL, including UPDATE/DELETE.
    for (const [table, fields] of columns) {
      const names = [...fields], initial = names.map(field => field === 'id' ? 99 : field.endsWith('_id') ? '9' : 'old');
      for (const event of ['INSERT', 'UPDATE', 'DELETE']) {
        await readers[0](one, load); await readers[0](website, load);
        if (event === 'INSERT') await pool.query(`INSERT INTO ${table} (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`, initial);
        if (event === 'UPDATE') await pool.query(`UPDATE ${table} SET ${names.filter(name => name !== 'id').map(name => `${name}=?`).join(',')} WHERE id=99`, names.filter(name => name !== 'id').map(name => name.endsWith('_id') ? '9' : 'new'));
        if (event === 'DELETE') await pool.query(`DELETE FROM ${table} WHERE id=99`);
        const [rows] = await pool.query('SELECT kind,provider_id FROM public_read_snapshots');
        if (table !== 'users') assert.ok(!rows.some(row => row.kind === 'availability' && row.provider_id === 9), `${table} ${event} invalidates schedules`);
        if (table !== 'office_events') assert.ok(!rows.some(row => row.kind === 'website'), `${table} ${event} invalidates directory metadata`);
      }
    }
    // A no-op office materialization must not defeat caching on every page visit.
    await pool.query('INSERT INTO office_events (id,assigned_provider_id,status) VALUES (7,9,\'AVAILABLE\')');
    await readers[0](one, load); const before = calculations;
    await pool.query('UPDATE office_events SET status=status WHERE id=7');
    await readers[1](one, load); assert.equal(calculations, before);
    await pool.query('UPDATE public_read_snapshots SET expires_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND)');
    await readers[2](one, load); assert.equal(calculations, before + 1, 'expired values refresh');
    await pool.query('DELETE FROM public_read_snapshots');
    let builds = 0;
    const result = await readers[0](one, async () => {
      if (++builds === 1) {
        await pool.query("UPDATE office_events SET status='BOOKED' WHERE id=7");
        return { slots: ['obsolete'] };
      }
      return { slots: [] };
    });
    assert.equal(builds, 2); assert.deepEqual(result, { slots: [] }, 'an edit during build cannot publish an old schedule');
    console.log(`Verified ${triggers.length} triggers, 24 concurrent readers, agency isolation and transaction rollback on MySQL`);
  } finally {
    await pool.end(); await admin.query(`DROP DATABASE ${schema}`); await admin.end();
  }
});
