// These historical migrations rewrite role values or replace the role ENUM.
// Once a retirement repair has succeeded, replaying them can undo that repair.
const historicalRoleMigrations = new Set([
  0, 7, 9, 48, 51, 52, 60, 81, 187, 188, 255, 288, 438, 499, 657,
  1071, 1072, 1073, 1077, 1080, 1180
]);

export async function assertNoRetiredRoleMigrationReplay(pool, migrationFile) {
  const migration = Number(String(migrationFile).match(/^(\d+)_/)?.[1]);
  if (!historicalRoleMigrations.has(migration)) return;

  const [repairs] = await pool.execute(
    `SELECT migration_name FROM migrations_log
     WHERE success = 1 AND migration_name IN (
       '1080_permanently_retire_clinician_role',
       '1180_restore_roles_after_enum_collapse'
     )`
  );
  const completedRepair = Math.max(0, ...repairs.map(row =>
    Number(String(row.migration_name).match(/^(\d+)_/)?.[1])
  ));
  if (completedRepair && migration <= completedRepair) {
    throw new Error(
      `Refusing historical role migration ${migrationFile}: clinician retirement ` +
      `repair ${completedRepair} is already recorded. Replaying this SQL could ` +
      'overwrite user roles or restore the obsolete role ENUM. --force does not ' +
      'bypass this protection. Use a new, reviewed migration for any further repair.'
    );
  }
}
