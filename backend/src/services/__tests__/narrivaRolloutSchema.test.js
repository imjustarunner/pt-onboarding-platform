import { describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { NARRIVA_ROLLOUT_MIGRATIONS, requireNarrivaRolloutSchema } from '../narrivaRolloutSchema.service.js';

function readyDatabase(overrides = {}) {
  return { execute: vi.fn(async query => {
    if (query.includes('FROM migrations_log')) return [overrides.migrations ?? NARRIVA_ROLLOUT_MIGRATIONS.map(migration_name => ({ migration_name }))];
    if (query.endsWith('LIMIT 0')) {
      if (overrides.missingColumn && query.includes(overrides.missingColumn)) throw new Error('ER_BAD_FIELD_ERROR with private transport details');
      return [[]];
    }
    if (query.includes('WHERE id=1')) return [overrides.settings ?? [{ id: 1, version: 3 }]];
    throw new Error('Unexpected schema query');
  }) };
}
describe('Narriva startup storage readiness', () => {
  it('requires both successful migrations, every real column and the versioned settings singleton', async () => {
    const db = readyDatabase();
    await expect(requireNarrivaRolloutSchema(db)).resolves.toEqual({ ready: true, tables: 6, migrations: 3, settingsVersion: 3 });
    expect(db.execute).toHaveBeenCalledTimes(8);
    expect(db.execute.mock.calls[0]).toEqual([expect.stringContaining('success=1'), NARRIVA_ROLLOUT_MIGRATIONS]);
    const probes = db.execute.mock.calls.filter(([query]) => query.endsWith('LIMIT 0')).map(([query]) => query);
    expect(probes).toHaveLength(6);
    for (const field of ['content_hash', 'configuration_json', 'change_reason', 'feedback_text', 'recovery_email', 'automation_principal']) expect(probes.some(query => query.includes(field))).toBe(true);
  });
  it.each([[], [{ migration_name: NARRIVA_ROLLOUT_MIGRATIONS[0] }], NARRIVA_ROLLOUT_MIGRATIONS.slice(0, 2).map(migration_name => ({ migration_name }))].map(migrations => ({ migrations })))('fails closed for a missing or unsuccessful migration (%j)', async ({ migrations }) => {
    const db = readyDatabase({ migrations });
    await expect(requireNarrivaRolloutSchema(db)).rejects.toMatchObject({ code: 'NARRIVA_SCHEMA_NOT_READY', status: 503 });
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
  it.each(['content_hash', 'configuration_json', 'change_reason', 'feedback_text', 'recovery_email', 'automation_principal'])('fails closed for a missing table or %s column', async missingColumn => {
    await expect(requireNarrivaRolloutSchema(readyDatabase({ missingColumn }))).rejects.toThrow('Required Narriva rollout storage is not ready.');
  });
  it.each([[], [{ id: 1, version: 0 }], [{ id: 1, version: 'invalid' }], [{ id: 2, version: 1 }]].map(settings => ({ settings })))('fails closed without the valid settings singleton (%j)', async ({ settings }) => {
    await expect(requireNarrivaRolloutSchema(readyDatabase({ settings }))).rejects.toMatchObject({ code: 'NARRIVA_SCHEMA_NOT_READY' });
  });
  it('does not expose database transport details in its failure', async () => {
    await expect(requireNarrivaRolloutSchema({ execute: async () => { throw new Error('PRIVATE_CONNECTION_VALUE'); } })).rejects.not.toThrow('PRIVATE_CONNECTION_VALUE');
  });
});
