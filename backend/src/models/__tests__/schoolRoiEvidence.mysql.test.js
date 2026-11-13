import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { isolatedWorkflowMysql, recoveryMysqlEnabled } from '../../services/__tests__/fixtures/isolatedWorkflowMysql.js';
const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../config/database.js', () => ({ default: { execute: (...args) => state.db.execute(...args) } }));
import IntakeSubmissionDocument from '../IntakeSubmissionDocument.model.js';
import { isSchoolRoiDocument } from '../../utils/schoolRoiDocument.js';
import { describeSignedSchoolRoiDocuments } from '../../utils/schoolRoiEvidence.js';

describe.runIf(recoveryMysqlEnabled)('actual scoped signed ROI history query', () => {
  let fixture;
  beforeAll(async () => {
    fixture = await isolatedWorkflowMysql('roi_evidence'); state.db = fixture.db;
    for (const sql of [
      "CREATE TABLE intake_links(id INT PRIMARY KEY,organization_id INT,scope_type VARCHAR(30) DEFAULT 'school')",
      'CREATE TABLE intake_submissions(id INT PRIMARY KEY,client_id INT,guardian_user_id INT,intake_link_id INT)',
      'CREATE TABLE document_templates(id INT PRIMARY KEY,name VARCHAR(80))',
      'CREATE TABLE intake_submission_clients(intake_submission_id INT,client_id INT)',
      'CREATE TABLE intake_submission_documents(id INT PRIMARY KEY,intake_submission_id INT,client_id INT NULL,document_template_id INT,signed_pdf_path VARCHAR(255),pdf_hash VARCHAR(80),signed_at DATETIME,audit_trail JSON)'
    ]) await state.db.query(sql);
    await state.db.query("INSERT INTO intake_links VALUES(1,451,'school'),(2,452,'school'),(3,450,'agency')");
    await state.db.query("INSERT INTO document_templates VALUES(1,'School ROI'),(2,'General consent')");
    await state.db.query('INSERT INTO intake_submissions VALUES(11,4,21,1),(12,4,21,1),(13,4,22,1),(14,5,21,1),(15,4,21,2),(16,4,21,3)');
    await state.db.query('INSERT INTO intake_submission_clients VALUES(14,4)');
    for (const [id, submissionId, clientId, templateId, date] of [
      [101,11,4,1,'2026-11-01'],[102,12,4,1,'2026-11-12'],[103,13,4,1,'2026-11-01'],
      [104,14,5,1,'2026-11-13'],[105,14,null,1,'2026-11-13'],[106,15,null,1,'2026-11-01'],[107,14,null,2,'2026-11-01'],[108,16,4,1,'2026-11-13']
    ]) await state.db.execute('INSERT INTO intake_submission_documents VALUES(?,?,?,?,?,?,?,?)',
      [id,submissionId,clientId,templateId,`private/fictional-${id}.pdf`,`hash-${id}`,date,JSON.stringify(templateId===1?{smartSchoolRoi:true,signerName:'Same guardian display name'}:{})]);
  });
  afterAll(async () => { await fixture?.close(); });
  it('joins actual signer/school attribution and keeps each guardian’s latest signed evidence independent', async () => {
    const rows = (await IntakeSubmissionDocument.listSignedForClient(4)).filter(isSchoolRoiDocument);
    const records = describeSignedSchoolRoiDocuments(rows,451);
    expect(records.find(r=>r.id===101)).toMatchObject({guardian_user_id:21,evidence_state:'superseded',superseded_by_document_id:102});
    expect(records.find(r=>r.id===102)).toMatchObject({guardian_user_id:21,evidence_state:'latest_signed'});
    expect(records.find(r=>r.id===103)).toMatchObject({guardian_user_id:22,evidence_state:'latest_signed'});
    expect(records.find(r=>r.id===106)).toMatchObject({school_organization_id:452,evidence_state:'historical_other_school'});
    // A shared agency master is not evidence that this release belongs to
    // another school or replaces an attributed school-specific signature.
    expect(records.find(r=>r.id===108)).toMatchObject({school_organization_id:null,evidence_state:'historical'});
  });
  it('does not expose another child’s personalized ROI through a shared submission association', async () => {
    const records=(await IntakeSubmissionDocument.listSignedForClient(4)).filter(isSchoolRoiDocument);
    expect(records.map(r=>r.id).sort()).toEqual([101,102,103,106,108]);
    expect(records.some(r=>r.id===104||r.id===105)).toBe(false);
  });
  it('does not rewrite any signature, saved signed path, hash or audit trail while describing history', async () => {
    const [before]=await state.db.query('SELECT * FROM intake_submission_documents ORDER BY id');
    describeSignedSchoolRoiDocuments((await IntakeSubmissionDocument.listSignedForClient(4)).filter(isSchoolRoiDocument),451);
    const [after]=await state.db.query('SELECT * FROM intake_submission_documents ORDER BY id');
    expect(after).toEqual(before);
  });
});
