import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { LEGACY_PROVIDER_ASSIGNMENT_FILTER } from '../../utils/legacyProviderAssignmentSql.js';

// Opt-in, read-only SQL tests. CTE fixtures shadow every application table used.
const port = process.env.SCHOOL_AVAILABILITY_TEST_PORT;
const fixtures = `WITH
  fixture_clients (id, organization_id, provider_id, service_day) AS (
    SELECT 1, 93, 505, 'Tuesday' UNION ALL SELECT 2, 93, 505, 'Tuesday'
    UNION ALL SELECT 3, 93, 505, 'Tuesday' UNION ALL SELECT 4, 93, 505, 'Tuesday'
    UNION ALL SELECT 5, 93, 505, 'Tuesday' UNION ALL SELECT 6, 93, 505, 'Tuesday'
    UNION ALL SELECT 7, 93, 505, 'Tuesday' UNION ALL SELECT 8, 93, 505, 'Tuesday'
    UNION ALL SELECT 9, 93, 505, 'Tuesday' UNION ALL SELECT 10, 93, 505, 'Tuesday'
  ),
  clients AS (
    SELECT f.*, 'ACTIVE' AS status, 1 AS client_status_id, CAST(id AS CHAR) AS initials,
      NULL AS identifier_code, NULL AS full_name, NULL AS document_status, NULL AS roi_expires_at
    FROM fixture_clients f
  ),
  client_statuses (id, status_key) AS (SELECT 1, 'being_seen'),
  client_organization_assignments AS (
    SELECT id AS client_id, organization_id, 1 AS is_active FROM fixture_clients
  ),
  client_provider_assignments (id, client_id, organization_id, provider_user_id, service_day, is_active) AS (
    SELECT 1, 1, 93, 505, 'Tuesday', 1 UNION ALL SELECT 2, 2, 93, 505, 'Tuesday', 1
    -- Two students moved to Monday but retain Tuesday in legacy fields.
    UNION ALL SELECT 3, 3, 93, 505, 'Tuesday', 0 UNION ALL SELECT 4, 3, 93, 505, 'Monday', 1
    UNION ALL SELECT 5, 4, 93, 505, 'Tuesday', 0 UNION ALL SELECT 6, 4, 93, 505, 'Monday', 1
    -- Removed assignment and provider transfer must not resurrect legacy Tuesday.
    UNION ALL SELECT 7, 5, 93, 505, 'Tuesday', 0 UNION ALL SELECT 8, 6, 93, 999, 'Tuesday', 1
    -- Client 7 is genuinely legacy; client 8 has scoped history only at another school.
    UNION ALL SELECT 9, 8, 94, 999, 'Monday', 1
    -- A legitimate two-day assignment must continue to count on both days.
    UNION ALL SELECT 10, 9, 93, 505, 'Tuesday', 1 UNION ALL SELECT 11, 9, 93, 505, 'Monday', 1
    -- A current assignment without a day must not fall back to the old weekday.
    UNION ALL SELECT 12, 10, 93, 505, NULL, 1
  )`;

test('school availability uses scoped assignment history before legacy fields', { skip: !port }, async (t) => {
  dotenv.config({ path: new URL('../../../.env', import.meta.url) });
  const connection = await mysql.createConnection({
    host: '127.0.0.1', port: Number(port), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME
  });
  const render = (sql) => sql
    .replaceAll('${LEGACY_PROVIDER_ASSIGNMENT_FILTER}', LEGACY_PROVIDER_ASSIGNMENT_FILTER)
    .replace(/\$\{(?:p|d|placeholders|dPlaceholders)\}/g, '?');
  const run = async (sql, params) => (await connection.execute(`${fixtures}\n${render(sql)}`, params))[0];
  try {
    await connection.query('START TRANSACTION READ ONLY');
    await t.test('moves, removals, provider changes and unscheduled assignments suppress obsolete fallback', async () => {
      const rows = await run(`SELECT c.id FROM clients c WHERE ${LEGACY_PROVIDER_ASSIGNMENT_FILTER} ORDER BY c.id`, []);
      assert.deepEqual(rows.map(r => r.id), [7, 8]);
    });

    const paths = [
      '../providerSlots.service.js',
      '../../controllers/schoolProviderSchedule.controller.js',
      '../../controllers/schoolProviderProfile.controller.js',
      '../../controllers/providerSelfAffiliations.controller.js'
    ];
    let testedQueries = 0;
    for (const path of paths) {
      const source = await readFile(new URL(path, import.meta.url), 'utf8');
      const queries = [...source.matchAll(/`([^`]*\$\{LEGACY_PROVIDER_ASSIGNMENT_FILTER\}[^`]*)`/g)].map(m => m[1]);
      assert.equal(queries.length, path.includes('schoolProviderProfile') ? 1 : 2);
      for (const [index, sql] of queries.entries()) {
        await t.test(`${path} query ${index + 1} ignores stale Tuesday fields`, async () => {
          const roster = sql.includes('SELECT DISTINCT');
          const params = roster ? [93, 505, 'Tuesday', 93, 505, 'Tuesday'] : [93, 505, 'Tuesday'];
          const rows = await run(sql, params);
          if (roster) {
            assert.deepEqual(rows.map(r => r.id).sort((a,b) => a-b), [1,2,7,8,9]);
          } else if (sql.includes('COUNT(*)')) {
            assert.equal(rows.reduce((sum,r) => sum + Number(r.cnt), 0), 2);
          } else {
            assert.deepEqual(rows.map(r => r.id).sort((a,b) => a-b), [7,8]);
          }
        });
        testedQueries++;
      }
      if (path.includes('schoolProviderSchedule')) {
        await t.test('directory preserves real assignments on both days and reports one opening for the original case', async () => {
          const sql = [...source.matchAll(/`([^`]+)`/g)].map(m=>m[1]).find(s=>s.includes('SELECT cpa.provider_user_id, cpa.service_day, COUNT(*) AS cnt') && s.includes('NOT EXISTS'));
          assert.ok(sql);
          const originalFixture = sql.replace('WHERE cpa.organization_id = ?', 'WHERE cpa.client_id IN (1,2,3,4) AND cpa.organization_id = ?');
          const tuesday = await run(originalFixture, [93,505,'Tuesday']);
          const monday = await run(originalFixture, [93,505,'Monday']);
          assert.equal(Number(tuesday[0].cnt), 2);
          assert.equal(3 - Number(tuesday[0].cnt), 1);
          assert.equal(Number(monday[0].cnt), 2);
          const allMonday = await run(sql, [93,505,'Monday']);
          assert.equal(Number(allMonday[0].cnt), 3);
        });
      }
    }
    assert.equal(testedQueries, 7);
  } finally {
    await connection.end();
  }
});
