import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Opt-in SQL regression test. CTE fixtures shadow the application table names;
// persistent application tables are neither read nor modified.
const testPort = process.env.CLIENT_SETTING_TEST_PORT;
test('a clinical transfer retires historical school affiliation without losing active dual settings',
  { skip: !testPort }, async () => {
    dotenv.config({ path: new URL('../../../.env', import.meta.url) });
    const connection = await mysql.createConnection({
      host: '127.0.0.1', port: Number(testPort), user: process.env.DB_USER,
      password: process.env.DB_PASSWORD, database: process.env.DB_NAME
    });
    try {
      await connection.query('START TRANSACTION READ ONLY');
      const fixtures = `WITH
        agencies (id,organization_type) AS (
          SELECT 10,'school' UNION ALL SELECT 20,'clinical' UNION ALL SELECT 30,'program'
        ),
        clients (id,agency_id,organization_id,provider_id,client_type) AS (
          SELECT 1,2,10,493,'school'
          UNION ALL SELECT 2,2,20,493,'clinical'
          UNION ALL SELECT 3,2,20,493,'clinical'
          UNION ALL SELECT 4,2,20,493,'clinical'
          UNION ALL SELECT 5,2,10,NULL,'school'
          UNION ALL SELECT 6,2,10,999,'school'
          UNION ALL SELECT 7,2,30,493,'clinical'
          UNION ALL SELECT 8,2,20,493,'clinical'
          UNION ALL SELECT 9,2,20,493,'clinical'
        ),
        client_organization_assignments (client_id,organization_id,is_active) AS (
          SELECT 2,10,0 UNION ALL SELECT 3,10,1 UNION ALL SELECT 9,10,0
        ),
        client_provider_assignments (client_id,organization_id,provider_user_id,is_active) AS (
          SELECT 2,10,493,0 UNION ALL SELECT 4,10,493,1
          UNION ALL SELECT 5,10,493,0 UNION ALL SELECT 9,10,999,0
        )`;
      // Inject this one exported query function into the fixture-only
      // connection, avoiding unrelated ingestion services and their real pool.
      const source = await readFile(new URL('../billingReportIngest.service.js', import.meta.url), 'utf8');
      const start = source.indexOf('export async function getProviderSchoolAffiliatedClientIds(');
      const end = source.indexOf('\nexport async function getRevenueAggregates(', start);
      assert.ok(start >= 0 && end > start, 'locate the production query function');
      const code = source.slice(start, end).replace(/^export /, '');
      const query = new Function('pool', `${code}\nreturn getProviderSchoolAffiliatedClientIds;`)({
        execute: (sql, params) => connection.execute(`${fixtures}\n${sql}`, params)
      });
      const actual = await query({ agencyId: 2, providerUserId: 493 });
      assert.deepEqual(actual.sort((a,b)=>a-b), [1,3,4,5,7]);
      assert.deepEqual(await query({ agencyId: 2, providerUserId: 999 }), [6]);
      assert.deepEqual(await query({ agencyId: 3, providerUserId: 493 }), []);
    } finally {
      await connection.end();
    }
  });
