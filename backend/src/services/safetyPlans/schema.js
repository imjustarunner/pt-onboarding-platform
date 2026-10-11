import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import pool from '../../config/clinicalDatabase.js';
import {splitSqlStatements,stripSqlLineComments} from '../../utils/migrationSql.js';
export async function ensureSafetyPlanSchema() {
  const deployed=new URL('../../../database/clinical_migrations/025_client_safety_plans.sql',import.meta.url);
  const local=new URL('../../../../database/clinical_migrations/025_client_safety_plans.sql',import.meta.url);
  const sql=await readFile(existsSync(deployed)?deployed:local,'utf8');
  for(const statement of splitSqlStatements(stripSqlLineComments(sql)))await pool.query(statement);
}
