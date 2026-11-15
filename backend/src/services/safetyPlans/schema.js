import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import pool from '../../config/clinicalDatabase.js';
import {splitSqlStatements,stripSqlLineComments} from '../../utils/migrationSql.js';
export async function ensureSafetyPlanSchema() {
  for(const file of ['025_client_safety_plans.sql','033_portal_document_assignment_batches.sql']) {
    const deployed=new URL('../../../database/clinical_migrations/'+file,import.meta.url);
    const local=new URL('../../../../database/clinical_migrations/'+file,import.meta.url);
    const sql=await readFile(existsSync(deployed)?deployed:local,'utf8');
    for(const statement of splitSqlStatements(stripSqlLineComments(sql)))await pool.query(statement);
  }
}
