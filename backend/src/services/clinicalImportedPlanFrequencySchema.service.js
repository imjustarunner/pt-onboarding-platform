import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { splitSqlStatements, stripSqlLineComments } from '../utils/migrationSql.js';

export const importedPlanFrequencyMigration = '039_preserve_imported_treatment_frequency';
const deployedSql = new URL(`../../database/clinical_migrations/${importedPlanFrequencyMigration}.sql`, import.meta.url);
const sourceSql = new URL(`../../../database/clinical_migrations/${importedPlanFrequencyMigration}.sql`, import.meta.url);
const compatible = column => ['mediumtext', 'longtext'].includes(column?.data_type) && column.is_nullable === 'YES';
let verifiedSchema = null;
export const clinicalImportedPlanFrequencyReadiness = () => verifiedSchema;

// This release must widen the clinical column before readiness permits traffic.
// A per-database lock serializes candidate instances without touching chart data.
export async function ensureClinicalImportedPlanFrequencySchema(database) {
  verifiedSchema = null;
  const pool = database || (await import('../config/clinicalDatabase.js')).default;
  const connection = await pool.getConnection();
  let lockName, locked = false;
  try {
    const [[schema]] = await connection.execute('SELECT DATABASE() AS schema_name');
    if (!schema?.schema_name) throw new Error('No clinical database is selected.');
    lockName = 'clinical039:' + createHash('sha256').update(schema.schema_name).digest('hex').slice(0, 40);
    const [[lock]] = await connection.execute('SELECT GET_LOCK(?, 30) AS acquired', [lockName]);
    if (Number(lock?.acquired) !== 1) throw new Error('The clinical migration lock is unavailable.');
    locked = true;
    const column = async () => {
      const [rows] = await connection.execute(`SELECT DATA_TYPE AS data_type, IS_NULLABLE AS is_nullable
        FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'clinical_treatment_plans' AND COLUMN_NAME = 'prescribed_frequency'`);
      return rows[0];
    };
    const before = await column();
    if (!before) throw new Error('The clinical treatment-plan column is unavailable.');
    const applied = !compatible(before);
    if (applied) {
      if (before.data_type === 'longtext') {
        // Preserve a wider existing column while making frequency optional.
        await connection.query('ALTER TABLE clinical_treatment_plans MODIFY COLUMN prescribed_frequency LONGTEXT NULL');
      } else {
        const statements = splitSqlStatements(stripSqlLineComments(readFileSync(existsSync(deployedSql) ? deployedSql : sourceSql, 'utf8')));
        for (const statement of statements) await connection.query(statement);
      }
    }
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
      VALUES (?, 1) ON DUPLICATE KEY UPDATE success = 1`, [importedPlanFrequencyMigration]);
    verifiedSchema = Object.freeze({ migration: importedPlanFrequencyMigration, dataType: after.data_type, applied });
    return verifiedSchema;
  } catch (cause) {
    throw Object.assign(new Error('Clinical migration 039 must be applied and verified before this release can serve traffic.', { cause }), {
      code: 'CLINICAL_PLAN_FREQUENCY_SCHEMA_UNAVAILABLE', requiredMigration: importedPlanFrequencyMigration
    });
  } finally {
    if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
    connection.destroy();
  }
}
