import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { databasePoolLimits } from '../databasePoolLimits.js';

test('both pools fit the deployed 40-replica statement budget with headroom', () => {
  const main = databasePoolLimits({});
  const clinical = databasePoolLimits({}, { clinical: true });
  const total = 40 * (main.connectionLimit * main.maxPreparedStatements
    + clinical.connectionLimit * clinical.maxPreparedStatements);
  assert.ok(total < 16382 * 0.75);
});

test('mysql2 receives the bounded cache instead of its much larger default', async () => {
  for (const clinical of [false, true]) {
    const options = databasePoolLimits({}, { clinical });
    const pool = mysql.createPool(options);
    try {
      assert.equal(pool.pool.config.connectionConfig.maxPreparedStatements, 8);
      assert.equal(pool.pool.config.connectionLimit, clinical ? 10 : 20);
    } finally { await pool.end(); }
  }
});

test('rejects settings that would disable the cap or produce an invalid pool', () => {
  for (const prefix of ['DB_', 'CLINICAL_DB_']) {
    for (const value of ['0', '-1', 'NaN', '8garbage', '1.5', 'Infinity']) {
      assert.throws(() => databasePoolLimits({ [`${prefix}MAX_PREPARED_STATEMENTS`]: value },
        { clinical: prefix.startsWith('CLINICAL') }), /MAX_PREPARED_STATEMENTS/);
    }
  }
});

test('small connection limits also bound idle connections and allow no idle cache', () => {
  assert.equal(databasePoolLimits({ DB_CONNECTION_LIMIT: '3' }).maxIdle, 3);
  assert.equal(databasePoolLimits({ DB_MAX_IDLE: '0' }).maxIdle, 0);
  assert.equal(databasePoolLimits({ CLINICAL_DB_CONNECTION_LIMIT: '2' }, { clinical: true }).maxIdle, 2);
});

test('explicit settings stay separate for the two database pools', () => {
  const env = { DB_MAX_PREPARED_STATEMENTS: '4', CLINICAL_DB_MAX_PREPARED_STATEMENTS: '6' };
  assert.equal(databasePoolLimits(env).maxPreparedStatements, 4);
  assert.equal(databasePoolLimits(env, { clinical: true }).maxPreparedStatements, 6);
});
