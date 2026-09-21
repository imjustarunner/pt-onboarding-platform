import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { splitSqlStatements, stripSqlLineComments, isIgnorableSchemaError } from '../migrationSql.js';
import * as cli from '../../../../database/migrationSqlUtils.js';
const migration = (name) => fs.readFileSync(new URL(`../../../../database/migrations/${name}`,import.meta.url),'utf8');
describe('Cloud Run migration SQL', () => {
  it('runs security migration 1452 as one statement, retaining its quoted semicolon', () => {
    const sql = stripSqlLineComments(migration('1452_auth_session_security.sql'));
    expect(sql.split(';').filter(s=>s.trim())).toHaveLength(2); // former bootstrap defect
    const statements=splitSqlStatements(sql);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain("JWTs; session_key");
    expect(statements[0]).toContain('idx_session_security_expiry');
  });
  it('uses exactly the same parser as the CLI and retains compound trigger bodies', () => {
    expect(cli.splitSqlStatements).toBe(splitSqlStatements);
    expect(splitSqlStatements("CREATE TRIGGER t BEFORE UPDATE ON x FOR EACH ROW BEGIN SET @a='one;two'; SET @b=2; END; SELECT 1;")).toHaveLength(2);
  });
  it('never treats missing security tables as successfully applied SQL', () => {
    expect(isIgnorableSchemaError({code:'ER_NO_SUCH_TABLE',message:"Table auth_session_security doesn't exist"})).toBe(false);
    expect(isIgnorableSchemaError({code:'ER_DUP_FIELDNAME'})).toBe(true);
  });
  it('repairs dependent columns even if the old bootstrap falsely logged 1458 as successful', () => {
    const statements=splitSqlStatements(stripSqlLineComments(migration('1474_repair_auth_session_startup.sql')));
    expect(statements).toHaveLength(8);
    for(const name of ['session_ref','started_at','client_ip','ip_source','user_agent','end_reason']) {
      expect(statements.some(s=>s.includes(`ADD COLUMN ${name}`))).toBe(true);
    }
    expect(statements.every(s=>!/^\s*(DROP|DELETE|TRUNCATE|UPDATE)\b/i.test(s))).toBe(true);
  });
});
