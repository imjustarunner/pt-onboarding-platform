import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { splitSqlStatements, stripSqlLineComments, isIgnorableSchemaError } from '../migrationSql.js';
import * as cli from '../../../../database/migrationSqlUtils.js';
const migration = (name) => fs.readFileSync(new URL(`../../../../database/migrations/${name}`,import.meta.url),'utf8');
describe('Cloud Run migration SQL', () => {
  it('ignores semicolons, quotes and BEGIN/END words inside ordinary comments', () => {
    const statements = splitSqlStatements(`/* Consent is an executed, versioned document; choosing recording never implies consent. */
      CREATE/* token boundary */TABLE example (note TEXT COMMENT 'keep /* literal; */');
      /* BEGIN; don't treat this as SQL; END; */
      ALTER TABLE example ADD COLUMN enabled INT; /* trailing comment; */`);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatch(/^CREATE\s+TABLE example/);
    expect(statements[0]).toContain("COMMENT 'keep /* literal; */'");
    expect(statements[1]).toBe('ALTER TABLE example ADD COLUMN enabled INT');
  });
  it('preserves executable MySQL comments and optimizer hints', () => {
    expect(splitSqlStatements('/*!40101 SET @saved = 1 */; SELECT /*+ MAX_EXECUTION_TIME(1000) */ 1;'))
      .toEqual(['/*!40101 SET @saved = 1 */', 'SELECT /*+ MAX_EXECUTION_TIME(1000) */ 1']);
  });
  it('ignores inline line comments and rejects unterminated block comments before execution', () => {
    expect(splitSqlStatements('SELECT 1; -- BEGIN; ignored\nSELECT 2 # END; ignored\n;')).toEqual(['SELECT 1', 'SELECT 2']);
    expect(() => splitSqlStatements('SELECT 1; /* incomplete;')).toThrow('Unterminated SQL block comment');
    expect(splitSqlStatements('/* only commentary; */ -- nothing to execute\n')).toEqual([]);
  });
  it('parses migration 1517 as ten complete schema statements', () => {
    const statements = splitSqlStatements(stripSqlLineComments(migration('1517_supervision_and_clinical_recording_consent.sql')));
    expect(statements).toHaveLength(10);
    expect(statements[0]).toMatch(/^CREATE TABLE IF NOT EXISTS supervision_agreements/);
    expect(statements.at(-1)).toContain('CREATE TABLE IF NOT EXISTS meeting_transcription_publishers');
    expect(statements.every(statement => /^(CREATE|ALTER) TABLE\b/.test(statement))).toBe(true);
  });
  it('keeps referral uniqueness compatible with the existing SET NULL foreign key', () => {
    const original = migration('1060_client_exchange.sql');
    expect(original).toMatch(/FOREIGN KEY \(client_id\) REFERENCES clients\(id\) ON DELETE SET NULL/);
    const statements = splitSqlStatements(stripSqlLineComments(migration('1518_internal_service_referrals.sql')));
    expect(statements).toHaveLength(7);
    const generated = statements.find(statement => statement.includes('GENERATED ALWAYS'));
    expect(generated).toContain("CASE WHEN status IN ('open','requested') THEN 1 ELSE NULL END");
    expect(generated).not.toMatch(/client_id|CONCAT/);
    expect(statements.at(-1)).toContain('(client_id,referral_kind,service_type,active_referral_slot)');
  });
  it('allows each referral schema addition to be retried independently', () => {
    const statements = splitSqlStatements(stripSqlLineComments(migration('1518_internal_service_referrals.sql')));
    const table = statements.find(statement => statement.startsWith('CREATE TABLE'));
    expect(table).toContain('CREATE TABLE IF NOT EXISTS client_service_assignments');
    expect(table).toContain('referral_listing_id BIGINT UNSIGNED NOT NULL');
    expect(table).toContain('ENGINE=InnoDB');
    for (const statement of statements.filter(statement => statement.startsWith('ALTER TABLE'))) {
      expect(statement.match(/\bADD\b/g)).toHaveLength(1);
    }
  });
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
