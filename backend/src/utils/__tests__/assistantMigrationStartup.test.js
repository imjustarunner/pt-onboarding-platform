import { expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { splitSqlStatements, stripSqlLineComments, isIgnorableSchemaError, isAssistantTriggerMismatch } from '../migrationSql.js';
import { bootstrapResponse } from '../bootstrapHealth.js';

function startup(error) {
  const source = fs.readFileSync(new URL('../../bootstrap.js', import.meta.url), 'utf8');
  const begin = source.indexOf('async function runStartupMigrations() {');
  const end = source.indexOf('\nconst server =', begin);
  // Execute the actual bootstrap migration function with only its I/O replaced;
  // never bind a server, import workers, or create an application database pool.
  const functionSource = source.slice(begin, end).replace("await import('./config/database.js')", 'await loadDatabase()');
  const connection = { destroy: vi.fn(), query: vi.fn(async sql => {
    if (sql.trim() === 'SELECT trigger_mismatch_assistant_membership_insert') throw error;
    return [[]];
  }) };
  const io = { existsSync: () => true, readdirSync: () => ['1747_external_assistant_teams.sql'],
    readFileSync: () => 'SELECT trigger_mismatch_assistant_membership_insert;' };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = new AsyncFunction('fs', 'path', '__dirname', 'loadDatabase', 'splitSqlStatements', 'stripSqlLineComments',
    'isIgnorableSchemaError', 'isAssistantTriggerMismatch', 'console', `${functionSource}\nreturn runStartupMigrations();`);
  return { connection, run: () => run(io, path, '/synthetic/src', async () => ({ default: { getConnection: async () => connection } }),
    splitSqlStatements, stripSqlLineComments, isIgnorableSchemaError, isAssistantTriggerMismatch, { log: vi.fn(), warn: vi.fn(), error: vi.fn() }) };
}
it('blocks application/worker imports and readiness after a named trigger integrity failure', async () => {
  const error = Object.assign(new Error("Unknown column 'trigger_mismatch_assistant_membership_insert' in 'field list'"), { code: 'ER_BAD_FIELD_ERROR' });
  const fixture = startup(error), loadWorkers = vi.fn();
  let loadError;
  await fixture.run().then(loadWorkers).catch(value => { loadError = value.message; });
  expect(loadWorkers).not.toHaveBeenCalled(); expect(fixture.connection.destroy).toHaveBeenCalledOnce();
  const ready = bootstrapResponse('/readyz', { appLoaded: false, loadError });
  expect(ready.statusCode).toBe(503); expect(ready.body.phase).toBe('degraded');
  expect(JSON.stringify(ready.body)).not.toContain('trigger_mismatch');
  expect(fixture.connection.query.mock.calls.some(([sql]) => sql.includes('VALUES (?, ?, 0, ?)'))).toBe(true);
  expect(fixture.connection.query.mock.calls.some(([sql]) => sql.includes('VALUES (?, ?, 1, NULL)'))).toBe(false);
});
it('retains the established nonfatal policy for an unrelated legacy migration failure', async () => {
  const fixture = startup(Object.assign(new Error('Unrelated legacy migration unavailable'), { code: 'ER_NO_SUCH_TABLE' }));
  const loadWorkers = vi.fn();
  await fixture.run().then(loadWorkers);
  expect(loadWorkers).toHaveBeenCalledOnce(); expect(fixture.connection.destroy).toHaveBeenCalledOnce();
});
