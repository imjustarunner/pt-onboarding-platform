import test from 'node:test';
import assert from 'node:assert/strict';
import { assertNoRetiredRoleMigrationReplay } from './roleMigrationSafety.mjs';

const repair = number => ({ migration_name: number === 1080
  ? '1080_permanently_retire_clinician_role'
  : '1180_restore_roles_after_enum_collapse' });
const pool = repairs => ({ execute: async () => [repairs.map(repair)] });

test('blocks the original blanket role rewrite after the repair', async () => {
  await assert.rejects(
    assertNoRetiredRoleMigrationReplay(pool([1180]), '007_update_users_roles.sql'),
    /Refusing historical role migration.*--force does not bypass/
  );
});
test('blocks replay even when the original migration ledger entry is missing', async () => {
  await assert.rejects(
    assertNoRetiredRoleMigrationReplay(pool([1080, 1180]), '048_add_support_role.sql'),
    /repair 1180 is already recorded/
  );
});
test('does not replay completed role repairs and their heuristic bulk rewrites', async () => {
  for (const file of ['1072_clinician_leftover_reclassify.sql', '1080_permanently_retire_clinician_role.sql', '1180_restore_roles_after_enum_collapse.sql']) {
    await assert.rejects(assertNoRetiredRoleMigrationReplay(pool([1180]), file), /Refusing historical role migration/);
  }
});
test('allows initial historical migrations before a retirement repair', async () => {
  await assertNoRetiredRoleMigrationReplay(pool([]), '007_update_users_roles.sql');
});
test('allows a later repair to run for the first time', async () => {
  await assertNoRetiredRoleMigrationReplay(pool([1080]), '1180_restore_roles_after_enum_collapse.sql');
});
test('allows reinstating role triggers and new migrations', async () => {
  const noQuery = { execute: () => { throw new Error('Unnecessary database query'); } };
  for (const file of ['1081_harden_clinician_role_guards.sql', '1800_add_future_role.sql', '1720_unrelated.sql']) {
    await assertNoRetiredRoleMigrationReplay(noQuery, file);
  }
});
test('fails closed when it cannot establish whether a repair was completed', async () => {
  await assert.rejects(assertNoRetiredRoleMigrationReplay({ execute: async () => { throw new Error('Database unavailable'); } }, '007_update_users_roles.sql'), /Database unavailable/);
});
