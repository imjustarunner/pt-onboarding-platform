// Compile the actual login SQL against the configured MySQL schema.
// EXPLAIN reads no credential rows and creates no sessions or other records.
import assert from 'node:assert/strict';
import pool from '../src/config/database.js';
import { unlockFamily } from '../src/services/familyAuth.service.js';

const execute = pool.execute.bind(pool);
let checked = 0;
pool.execute = async (sql, parameters) => {
  if (!sql.startsWith('SELECT DISTINCT c.*')) throw new Error('Unexpected query during read-only login schema check');
  await execute(`EXPLAIN ${sql}`, parameters);
  checked++;
  return [[]];
};
try {
  for (const options of [{}, { email: 'schema-check@members.invalid' }, { agencyId: 1, email: 'schema-check@members.invalid' }]) {
    await assert.rejects(unlockFamily({ passcode: '000000', ...options }), error => error.status === 401);
  }
  assert.equal(checked, 3);
  console.log('Family login SQL passed: PIN-only, email-filtered, and organization-filtered queries. No credentials read or sessions created.');
} finally {
  pool.execute = execute;
  await pool.end();
}
