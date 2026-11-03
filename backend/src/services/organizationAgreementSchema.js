import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import pool from '../config/database.js';
import { splitSqlStatements,stripSqlLineComments } from '../utils/migrationSql.js';
// The migration runner is intentionally nonfatal for unrelated old migrations.
// This required archive schema is also checked before application readiness.
export async function ensureOrganizationAgreementSchema(db = pool) {
  const deployed=new URL('../../database/migrations/1735_organization_agreement_archive.sql',import.meta.url);
  const local=new URL('../../../database/migrations/1735_organization_agreement_archive.sql',import.meta.url);
  const sql=await readFile(existsSync(deployed)?deployed:local,'utf8');
  for(const statement of splitSqlStatements(stripSqlLineComments(sql))) await db.query(statement);
}
