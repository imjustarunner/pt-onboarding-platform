import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { splitSqlStatements, stripSqlLineComments } from '../../../../database/migrationSqlUtils.js';

const state = vi.hoisted(() => ({ db: null, pdf: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: {
  getConnection: () => state.db.getConnection()
} }));
vi.mock('../meetingJoinPolicy.service.js', () => ({ hasActiveMeetingMembership: async () => true }));
vi.mock('../recordingAgreementDocument.service.js', async original => ({
  ...await original(), saveRecordingAgreementPdf: state.pdf
}));
import { documentHash } from '../recordingAgreementDocument.service.js';
import { signSupervisionAgreement } from '../supervisionAgreement.service.js';
import { SUPERVISION_AGREEMENT_VERSION } from '../../content/supervisionAgreement.en.js';

const socket = process.env.SUPERVISION_AGREEMENT_TEST_SOCKET;
describe.skipIf(!socket)('supervision signing with required task foreign keys', () => {
  const document = { agencyName: 'Test agency', version: SUPERVISION_AGREEMENT_VERSION,
    text: 'Test agreement', parties: [{ name: 'Supervisor' }, { name: 'Supervisee' }] };
  const hash = documentHash(document);
  const sign = userId => signSupervisionAgreement({ agreementId: 1, userId,
    input: { accepted: true, typedName: 'Test signer', documentHash: hash } });

  beforeAll(async () => {
    if (!/^\/private\/tmp\/supervision-signing-test\.[^/]+\/mysql\.sock$/.test(socket)) {
      throw new Error('Use a disposable supervision signing test database socket.');
    }
    const admin = await mysql.createConnection({ socketPath: socket, user: 'root' });
    try { await admin.query('CREATE DATABASE supervision_signing_test'); } finally { await admin.end(); }
    state.db = mysql.createPool({ socketPath: socket, user: 'root', database: 'supervision_signing_test', timezone: 'Z' });
    for (const table of ['users', 'agencies', 'icons']) {
      await state.db.query(`CREATE TABLE ${table} (id INT PRIMARY KEY)`);
    }
    // Use the real migrations, retaining the stricter original task requirement
    // on user-specific documents as well as the current signed_documents schema.
    const migrations = [
      ['015_add_unified_task_system.sql', sql => /^CREATE TABLE IF NOT EXISTS (tasks|document_templates|signed_documents) \(/.test(sql)],
      ['016_add_document_action_type.sql', sql => /^ALTER TABLE tasks/.test(sql)],
      ['059_add_user_documents_and_variables.sql', sql => !/^INSERT INTO/.test(sql)],
      ['1370_signed_documents_usd_nullable.sql', () => true],
      ['1517_supervision_and_clinical_recording_consent.sql', sql => /^CREATE TABLE IF NOT EXISTS supervision_agreements /.test(sql)]
    ];
    for (const [name, include] of migrations) {
      const sql = await readFile(new URL(`../../../../database/migrations/${name}`, import.meta.url), 'utf8');
      for (const statement of splitSqlStatements(stripSqlLineComments(sql))) {
        if (include(statement.trim())) await state.db.query(statement);
      }
    }
    await state.db.query('CREATE TABLE supervisor_assignments (id INT PRIMARY KEY, supervisor_id INT, supervisee_id INT, agency_id INT)');
    await state.db.query('INSERT INTO users VALUES (7),(8)');
    await state.db.query('INSERT INTO agencies VALUES (2)');
    await state.db.query('INSERT INTO supervisor_assignments VALUES (4,7,8,2)');
    vi.stubEnv('GUARDIAN_INTAKE_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 1).toString('base64'));
  });

  beforeEach(async () => {
    await state.db.query('DROP TRIGGER IF EXISTS reject_second_signed_copy');
    for (const table of ['signed_documents', 'user_specific_documents', 'tasks', 'supervision_agreements']) {
      await state.db.query(`DELETE FROM ${table}`);
    }
    await state.db.execute(`INSERT INTO supervision_agreements
      (id,assignment_id,agency_id,supervisor_user_id,supervisee_user_id,version,document_json,document_hash)
      VALUES (1,4,2,7,8,?,?,?)`, [document.version, JSON.stringify(document), hash]);
    state.pdf.mockReset().mockResolvedValue({ path: 'private/test-signed.pdf', hash: 'a'.repeat(64) });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (state.db) {
      try { await state.db.query('DROP DATABASE supervision_signing_test'); } finally { await state.db.end(); }
    }
  });

  async function copies() {
    const [rows] = await state.db.query(`SELECT s.user_id, s.task_id, s.signed_pdf_path, s.pdf_hash, s.audit_trail,
      t.status, t.completed_at, t.assigned_to_user_id, t.assigned_to_agency_id,
      d.user_id AS document_user_id, d.task_id AS document_task_id
      FROM signed_documents s JOIN tasks t ON t.id=s.task_id
      JOIN user_specific_documents d ON d.id=s.user_specific_document_id AND t.reference_id=d.id
      ORDER BY s.user_id`);
    return rows;
  }

  it.each([[7, 8], [8, 7]])('files both signed copies when user %s signs before %s, without duplicating retries', async (first, second) => {
    expect((await sign(first)).complete).toBe(false);
    expect(await copies()).toEqual([]);
    expect((await sign(second)).complete).toBe(true);
    const rows = await copies();
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(row => row.task_id)).size).toBe(2);
    for (const [index, row] of rows.entries()) {
      expect(row).toMatchObject({ user_id: index + 7, assigned_to_user_id: index + 7,
        document_user_id: index + 7, document_task_id: row.task_id, assigned_to_agency_id: 2,
        status: 'completed', signed_pdf_path: 'private/test-signed.pdf', pdf_hash: 'a'.repeat(64) });
      expect(row.completed_at).toBeTruthy();
      expect(row.audit_trail).toMatchObject({ supervisionAgreementId: 1, documentHash: hash });
      expect(row.audit_trail.signers).toHaveLength(2);
    }
    await sign(first);
    await sign(second);
    expect(await copies()).toEqual(rows);
    expect(state.pdf).toHaveBeenCalledTimes(2);
  });

  it('rolls back both copies and the second signature on filing failure, then permits retry', async () => {
    await sign(7);
    await state.db.query(`CREATE TRIGGER reject_second_signed_copy BEFORE INSERT ON signed_documents FOR EACH ROW
      BEGIN IF NEW.user_id=8 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Test filing failure'; END IF; END`);
    await expect(sign(8)).rejects.toThrow('Test filing failure');
    const [[agreement]] = await state.db.query('SELECT * FROM supervision_agreements WHERE id=1');
    expect(agreement.supervisor_signed_at).toBeTruthy();
    expect(agreement.supervisee_signed_at).toBeNull();
    for (const table of ['signed_documents', 'user_specific_documents', 'tasks']) {
      const [[count]] = await state.db.query(`SELECT COUNT(*) AS total FROM ${table}`);
      expect(count.total).toBe(0);
    }
    await state.db.query('DROP TRIGGER reject_second_signed_copy');
    expect((await sign(8)).complete).toBe(true);
    expect(await copies()).toHaveLength(2);
  });
});
