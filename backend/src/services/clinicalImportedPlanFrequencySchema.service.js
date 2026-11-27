import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { splitSqlStatements, stripSqlLineComments } from '../utils/migrationSql.js';

export const importedPlanFrequencyMigration = '039_preserve_imported_treatment_frequency';
export const treatmentObjectiveDateMigration = '035_treatment_objective_target_dates';

let verifiedFrequencySchema = null;
let verifiedObjectiveDateSchema = null;
export const clinicalImportedPlanFrequencyReadiness = () => verifiedFrequencySchema;
export const clinicalTreatmentObjectiveDateReadiness = () => verifiedObjectiveDateSchema;

export async function ensureClinicalImportedPlanFrequencySchema(database) {
  verifiedFrequencySchema = null;
  verifiedFrequencySchema = await ensurePlanColumn(database, {
    migration: importedPlanFrequencyMigration,
    errorCode: 'CLINICAL_PLAN_FREQUENCY_SCHEMA_UNAVAILABLE',
    table: 'clinical_treatment_plans',
    columnName: 'prescribed_frequency',
    compatible: column => ['mediumtext', 'longtext'].includes(column?.data_type) && column.is_nullable === 'YES',
    async migrate(connection, before) {
      if (!before) throw new Error('The clinical treatment-plan frequency column is unavailable.');
      if (before.data_type === 'longtext') {
        await connection.query('ALTER TABLE clinical_treatment_plans MODIFY COLUMN prescribed_frequency LONGTEXT NULL');
      } else {
        await applyClinicalPlanMigration(connection, importedPlanFrequencyMigration);
      }
    }
  });
  return verifiedFrequencySchema;
}

export async function ensureClinicalTreatmentObjectiveDateSchema(database) {
  verifiedObjectiveDateSchema = null;
  verifiedObjectiveDateSchema = await ensurePlanColumn(database, {
    migration: treatmentObjectiveDateMigration,
    errorCode: 'CLINICAL_PLAN_OBJECTIVE_DATE_SCHEMA_UNAVAILABLE',
    table: 'clinical_treatment_plan_objectives',
    columnName: 'projected_completion',
    compatible: column => column?.data_type === 'date' && column.is_nullable === 'YES',
    async migrate(connection, before) {
      if (before) throw new Error('The clinical treatment objective date column has an incompatible definition.');
      await applyClinicalPlanMigration(connection, treatmentObjectiveDateMigration);
    }
  });
  return verifiedObjectiveDateSchema;
}

async function applyClinicalPlanMigration(connection, migration) {
  const deployedSql = new URL(`../../database/clinical_migrations/${migration}.sql`, import.meta.url);
  const sourceSql = new URL(`../../../database/clinical_migrations/${migration}.sql`, import.meta.url);
  const sql = readFileSync(existsSync(deployedSql) ? deployedSql : sourceSql, 'utf8');
  for (const statement of splitSqlStatements(stripSqlLineComments(sql))) await connection.query(statement);
}

// Serialize each migration by database and verify the actual column before serving requests.
async function ensurePlanColumn(database, { migration, errorCode, table, columnName, compatible, migrate }) {
  const migrationNumber = migration.split('_')[0];
  const pool = database || (await import('../config/clinicalDatabase.js')).default;
  const connection = await pool.getConnection();
  let lockName, locked = false;
  try {
    const [[schema]] = await connection.execute('SELECT DATABASE() AS schema_name');
    if (!schema?.schema_name) throw new Error('No clinical database is selected.');
    lockName = `clinical${migrationNumber}:` + createHash('sha256').update(schema.schema_name).digest('hex').slice(0, 40);
    const [[lock]] = await connection.execute('SELECT GET_LOCK(?, 30) AS acquired', [lockName]);
    if (Number(lock?.acquired) !== 1) throw new Error('The clinical migration lock is unavailable.');
    locked = true;
    const column = async () => {
      const [rows] = await connection.execute(`SELECT DATA_TYPE AS data_type, IS_NULLABLE AS is_nullable
        FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [table, columnName]);
      return rows[0];
    };
    const before = await column();
    const applied = !compatible(before);
    if (applied) await migrate(connection, before);
    const after = await column();
    if (!compatible(after)) throw new Error('The clinical treatment-plan column did not become ready.');
    await connection.query(`CREATE TABLE IF NOT EXISTS clinical_migrations_log (
      id INT AUTO_INCREMENT PRIMARY KEY, migration_name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, execution_time_ms INT,
      success BOOLEAN DEFAULT TRUE, error_message TEXT,
      INDEX idx_clinical_migration_name (migration_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    // Retain any earlier execution timestamp/error evidence when confirming a retry.
    await connection.execute(`INSERT INTO clinical_migrations_log (migration_name, success)
      VALUES (?, 1) ON DUPLICATE KEY UPDATE success = 1`, [migration]);
    return Object.freeze({ migration, dataType: after.data_type, applied });
  } catch (cause) {
    throw Object.assign(new Error(`Clinical migration ${migrationNumber} must be applied and verified before this release can serve traffic.`, { cause }), {
      code: errorCode, requiredMigration: migration
    });
  } finally {
    if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
    connection.destroy();
  }
}
