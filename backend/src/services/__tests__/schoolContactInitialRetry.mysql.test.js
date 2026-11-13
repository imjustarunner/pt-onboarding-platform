import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { isolatedWorkflowMysql, recoveryMysqlEnabled } from './fixtures/isolatedWorkflowMysql.js';
import { splitSqlStatements, stripSqlLineComments } from '../../../../database/migrationSqlUtils.js';

const m = vi.hoisted(() => ({ db: null, contextAllowed: true, signedIntake: false }));
vi.mock('../../config/database.js', () => ({ default: {
  execute: (...args) => m.db.execute(...args), getConnection: () => m.db.getConnection()
} }));
vi.mock('../schoolContactPlan.service.js', () => ({
  getContactPlanContext: async ({ agencyId, userId }) => {
    if (!m.contextAllowed || Number(agencyId) !== 450 || Number(userId) !== 1433)
      throw Object.assign(new Error('Current provider access required'), { status: 403 });
    return { agencyId: 450, userId: 1433, schools: [{ id: 451 }], provider: { id: 1433 }, agency: { id: 450 } };
  }
}));
vi.mock('../../models/clinical/ClinicalNote.model.js', () => ({ default: {
  hasSignedIntakeForClient: async () => m.signedIntake
} }));

import { retrySchoolContactInitial, readSchoolContactInitialRetry, assertSchoolContactInitialRetryDelivery, initialRetryWorkflowSql } from '../schoolContactInitialRetry.service.js';

const request = changes => ({ agencyId: 450, userId: 1433, workflowId: 42, ...changes });
describe.runIf(recoveryMysqlEnabled)('native SQL recovery of a conclusively unsent Family Welcome', () => {
  let fixture, db;
  const currentWorkflow = async () => (await db.execute(initialRetryWorkflowSql, [42, 450, 1433]))[0][0];
  const eligible = async () => readSchoolContactInitialRetry(db, await currentWorkflow());
  const guardian = { id: 8, email: 'testing+parent@itsco.health' };
  beforeAll(async () => {
    fixture = await isolatedWorkflowMysql('school_contact_retry'); db = fixture.db; m.db = db;
    for (const ddl of [
      'CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(120),slug VARCHAR(100),feature_flags JSON,organization_type VARCHAR(32),is_active BOOLEAN DEFAULT TRUE,is_archived BOOLEAN DEFAULT FALSE)',
      "CREATE TABLE users(id INT PRIMARY KEY,first_name VARCHAR(80),last_name VARCHAR(80),role VARCHAR(40),email VARCHAR(160),personal_email VARCHAR(160),is_active BOOLEAN DEFAULT TRUE,is_archived BOOLEAN DEFAULT FALSE,terminated_at DATETIME NULL)",
      'CREATE TABLE user_agencies(agency_id INT,user_id INT,is_active BOOLEAN DEFAULT TRUE)',
      'CREATE TABLE organization_affiliations(agency_id INT,organization_id INT,is_active BOOLEAN DEFAULT TRUE)',
      "CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,initials VARCHAR(20),status VARCHAR(30) DEFAULT 'ACTIVE',client_status_id INT,service_day VARCHAR(20),session_sms_opt_in BOOLEAN DEFAULT FALSE,first_service_at DATETIME)",
      'CREATE TABLE client_statuses(id INT PRIMARY KEY,status_key VARCHAR(40),label VARCHAR(80))',
      'CREATE TABLE client_provider_assignments(id INT PRIMARY KEY,client_id INT,organization_id INT,provider_user_id INT,service_day VARCHAR(20),is_active BOOLEAN DEFAULT TRUE,created_at DATETIME,updated_at DATETIME)',
      "CREATE TABLE client_guardians(client_id INT,guardian_user_id INT,relationship_type VARCHAR(20) DEFAULT 'guardian',access_enabled BOOLEAN DEFAULT TRUE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
      'CREATE TABLE client_intake_note_drafts(id INT PRIMARY KEY,agency_id INT,client_id INT,status VARCHAR(20),finalized_at DATETIME)',
      'CREATE TABLE appointments(id INT PRIMARY KEY,agency_id INT,provider_user_id INT,business_type VARCHAR(32),service_code VARCHAR(32),status VARCHAR(32),end_at DATETIME)',
      'CREATE TABLE appointment_participants(appointment_id INT,client_id INT)',
      'CREATE TABLE communication_conversations(id INT PRIMARY KEY,agency_id INT,owner_user_id INT)',
      'CREATE TABLE communication_links(conversation_id INT,entity_type VARCHAR(32),entity_id INT)',
      'CREATE TABLE communication_messages(id INT AUTO_INCREMENT PRIMARY KEY,conversation_id INT,author_user_id INT,channel VARCHAR(20),direction VARCHAR(20),send_status VARCHAR(30),internet_message_id VARCHAR(255),is_auto_reply BOOLEAN DEFAULT FALSE,is_internal_note BOOLEAN DEFAULT FALSE,from_json JSON,to_json JSON,sent_at DATETIME,created_at DATETIME)',
      'CREATE TABLE user_communications(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,client_id INT,user_id INT,generated_by_user_id INT,template_type VARCHAR(100),channel VARCHAR(20),delivery_status VARCHAR(30),external_message_id VARCHAR(255),sent_at DATETIME,delivered_at DATETIME,generated_at DATETIME,error_message VARCHAR(500),metadata JSON)',
      'CREATE TABLE user_activity_log(id INT AUTO_INCREMENT PRIMARY KEY,action_type VARCHAR(100),user_id INT,agency_id INT,metadata JSON,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)'
    ]) await db.query(ddl);
    for (const name of ['1719_school_provider_contact_plans.sql', '1720_school_contact_automation.sql', '1722_school_contact_three_attempts.sql', '1759_family_welcome_follow_up.sql']) {
      const sql = readFileSync(new URL('../../../../database/migrations/' + name, import.meta.url), 'utf8');
      for (const statement of splitSqlStatements(stripSqlLineComments(sql))) await db.query(statement);
    }
  });
  afterAll(async () => { await fixture?.close(); });
  beforeEach(async () => {
    m.contextAllowed = true; m.signedIntake = false;
    for (const table of ['school_contact_workflow_steps', 'school_contact_workflows', 'school_provider_contact_plans', 'user_activity_log', 'user_communications', 'communication_messages', 'communication_links', 'communication_conversations', 'client_guardians', 'client_provider_assignments', 'client_intake_note_drafts', 'appointment_participants', 'appointments', 'clients', 'client_statuses', 'user_agencies', 'users', 'organization_affiliations', 'agencies']) await db.query(`DELETE FROM ${table}`);
    await db.query("INSERT INTO agencies(id,name,slug,organization_type) VALUES(450,'QA','auricwell-qa-demo','agency'),(451,'Cedar','qa-school','school')");
    await db.query("INSERT INTO users(id,first_name,last_name,role,email) VALUES(1433,'Avery','QA','provider','testing+provider@itsco.health'),(8,'Una','QA','client_guardian','testing+parent@itsco.health')");
    await db.query('INSERT INTO user_agencies VALUES(450,1433,1),(450,8,1)');
    await db.query('INSERT INTO organization_affiliations VALUES(450,451,1)');
    await db.query("INSERT INTO clients(id,agency_id,initials) VALUES(102,450,'FABLE')");
    await db.query("INSERT INTO school_provider_contact_plans(agency_id,provider_user_id,status,template,decided_at,welcome_seen_at) VALUES(450,1433,'enabled','Test welcome','2026-11-12 12:00:00','2026-11-12 12:00:00')");
    await db.query("INSERT INTO client_provider_assignments VALUES(1,102,451,1433,'Friday',1,'2026-11-13 01:00:00','2026-11-13 01:00:00')");
    await db.query('INSERT INTO client_guardians(client_id,guardian_user_id) VALUES(102,8)');
    await db.query("INSERT INTO school_contact_workflows(id,agency_id,client_id,school_id,provider_user_id,assignment_id,plan_decided_at,status,last_error) VALUES(42,450,102,451,1433,1,'2026-11-12 12:00:00','needs_review','EMAIL_SENDER_UNVERIFIED')");
    await db.query("INSERT INTO school_contact_workflow_steps(id,workflow_id,step_key,status,detail) VALUES(22,42,'initial_email','needs_review','EMAIL_SENDER_UNVERIFIED')");
    await db.query('INSERT INTO communication_conversations VALUES(88,450,1433)');
    await db.query("INSERT INTO communication_links VALUES(88,'client',102),(88,'school',451)");
    await db.query("INSERT INTO communication_messages(id,conversation_id,author_user_id,channel,direction,send_status,internet_message_id,from_json,to_json,created_at) VALUES(100,88,1433,'email','outbound','failed','<school-contact-42-initial_email@itsco.health>',JSON_OBJECT('email','messages@itsco.health','schoolContactAutomation',JSON_OBJECT('workflowId',42,'stepKey','initial_email')),JSON_ARRAY(JSON_OBJECT('email','testing+parent@itsco.health')),UTC_TIMESTAMP())");
    await db.query("INSERT INTO user_communications(id,agency_id,client_id,generated_by_user_id,template_type,channel,delivery_status,error_message,metadata,generated_at) VALUES(501,450,102,1433,'school_contact_plan','email','failed','This sender address is not an accepted Gmail send-as identity. Email was not sent.',JSON_OBJECT('internetMessageIdOverride','<school-contact-42-initial_email@itsco.health>','senderIdentityId',1116),UTC_TIMESTAMP())");
  });

  it('atomically queues the bound failed initial and audit while preserving failed messages and receipts', async () => {
    const [messages] = await db.query('SELECT * FROM communication_messages');
    const [receipts] = await db.query('SELECT * FROM user_communications');
    expect(await eligible()).toMatchObject({ canRetryInitial: true, retryInitialQueued: false, conversationId: 88, messageId: 100, receiptIds: [501] });
    expect(await retrySchoolContactInitial(request())).toEqual({ queued: true, alreadyQueued: false, workflowId: 42, status: 'queued' });
    const [[step]] = await db.query('SELECT * FROM school_contact_workflow_steps WHERE id=22');
    expect(step).toMatchObject({ status: 'pending', detail: 'provider_retry:EMAIL_SENDER_UNVERIFIED', conversation_id: 88, message_id: null, completed_at: null });
    const workflow = await currentWorkflow();
    expect(workflow).toMatchObject({ status: 'queued', conversation_id: 88, initial_sent_at: null, last_error: null });
    expect(await readSchoolContactInitialRetry(db, workflow)).toMatchObject({ canRetryInitial: false, retryInitialQueued: true });
    const [audit] = await db.query('SELECT * FROM user_activity_log');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action_type: 'family_welcome_initial_retry_queued', user_id: 1433, agency_id: 450 });
    const metadata = typeof audit[0].metadata === 'string' ? JSON.parse(audit[0].metadata) : audit[0].metadata;
    expect(metadata).toMatchObject({ workflowId: 42, clientId: 102, schoolId: 451, conversationId: 88, failedMessageId: 100, failedReceiptIds: [501], previousError: 'EMAIL_SENDER_UNVERIFIED' });
    expect((await db.query('SELECT * FROM communication_messages'))[0]).toEqual(messages);
    expect((await db.query('SELECT * FROM user_communications'))[0]).toEqual(receipts);
  });

  it('serializes concurrent requests and returns an idempotent queued result on repeat', async () => {
    const results = await Promise.allSettled([retrySchoolContactInitial(request()), retrySchoolContactInitial(request())]);
    expect(results.some(result => result.status === 'fulfilled' && result.value.queued)).toBe(true);
    for (const result of results) if (result.status === 'rejected') expect(result.reason.status).toBe(409);
    expect(await retrySchoolContactInitial(request())).toMatchObject({ queued: true, alreadyQueued: true, workflowId: 42 });
    expect((await db.query('SELECT COUNT(*) AS n FROM user_activity_log'))[0][0].n).toBe(1);
    expect((await db.query('SELECT COUNT(*) AS n FROM school_contact_workflow_steps'))[0][0].n).toBe(1);
    expect((await db.query('SELECT COUNT(*) AS n FROM communication_messages'))[0][0].n).toBe(1);
  });

  it('rolls back both the queue and audit if the failed step no longer matches the compare-and-set', async () => {
    await db.query("CREATE TRIGGER retry_step_change BEFORE INSERT ON user_activity_log FOR EACH ROW UPDATE school_contact_workflow_steps SET detail='transport_unknown' WHERE id=22");
    try {
      await expect(retrySchoolContactInitial(request())).rejects.toMatchObject({ status: 409 });
      expect((await currentWorkflow()).status).toBe('needs_review');
      expect((await db.query('SELECT status,detail FROM school_contact_workflow_steps WHERE id=22'))[0][0]).toEqual({ status: 'needs_review', detail: 'EMAIL_SENDER_UNVERIFIED' });
      expect((await db.query('SELECT COUNT(*) AS n FROM user_activity_log'))[0][0].n).toBe(0);
    } finally { await db.query('DROP TRIGGER retry_step_change'); }
  });

  it('rejects an accepted receipt anywhere in the same initial-attempt history', async () => {
    await db.query("INSERT INTO user_communications(agency_id,client_id,generated_by_user_id,template_type,channel,delivery_status,external_message_id,metadata) VALUES(450,102,1433,'school_contact_plan','email','sent','gmail-accepted',JSON_OBJECT('internetMessageIdOverride','<school-contact-42-initial_email@itsco.health>'))");
    expect((await eligible()).canRetryInitial).toBe(false);
    await expect(retrySchoolContactInitial(request())).rejects.toMatchObject({ status: 409 });
    expect((await db.query('SELECT COUNT(*) AS n FROM user_activity_log'))[0][0].n).toBe(0);
  });

  it('requires one unambiguous owned conversation for the failed introduction', async () => {
    await db.query('INSERT INTO communication_conversations VALUES(89,450,1433)');
    await db.query("INSERT INTO communication_links VALUES(89,'client',102),(89,'school',451)");
    await db.query("INSERT INTO communication_messages(conversation_id,author_user_id,channel,direction,send_status,from_json,to_json,created_at) VALUES(89,1433,'email','outbound','failed',JSON_OBJECT('schoolContactAutomation',JSON_OBJECT('workflowId',42,'stepKey','initial_email')),JSON_ARRAY(JSON_OBJECT('email','testing+parent@itsco.health')),UTC_TIMESTAMP())");
    await expect(retrySchoolContactInitial(request())).rejects.toMatchObject({ status: 409 });
    expect((await currentWorkflow()).status).toBe('needs_review');
  });

  it.each([{ userId: 1439 }, { agencyId: 2 }])('rejects a foreign provider or agency before touching the workflow: %j', async change => {
    await expect(retrySchoolContactInitial(request(change))).rejects.toMatchObject({ status: 403 });
    expect((await currentWorkflow()).status).toBe('needs_review');
    expect((await db.query('SELECT COUNT(*) AS n FROM user_activity_log'))[0][0].n).toBe(0);
  });

  it.each([
    ['revoked assignment', 'UPDATE client_provider_assignments SET is_active=0 WHERE id=1'],
    ['disabled plan', "UPDATE school_provider_contact_plans SET status='declined'"],
    ['new plan opt-in', 'UPDATE school_provider_contact_plans SET decided_at=DATE_ADD(decided_at,INTERVAL 1 SECOND)'],
    ['archived client', "UPDATE clients SET status='ARCHIVED'"],
    ['different conversation owner', 'UPDATE communication_conversations SET owner_user_id=1439'],
    ['different conversation agency', 'UPDATE communication_conversations SET agency_id=2'],
    ['missing school link', "DELETE FROM communication_links WHERE entity_type='school'"],
    ['missing client link', "DELETE FROM communication_links WHERE entity_type='client'"],
    ['revoked guardian access', 'UPDATE client_guardians SET access_enabled=0'],
    ['changed preferred recipient', "UPDATE users SET personal_email='testing+new@itsco.health' WHERE id=8"],
    ['sent original message', "UPDATE communication_messages SET send_status='sent' WHERE id=100"],
    ['contradictory original timestamp', 'UPDATE communication_messages SET sent_at=UTC_TIMESTAMP() WHERE id=100'],
    ['uncertain original failure', "UPDATE school_contact_workflow_steps SET detail='transport_timeout' WHERE id=22"],
    ['already completed step', 'UPDATE school_contact_workflow_steps SET completed_at=UTC_TIMESTAMP() WHERE id=22']
  ])('keeps %s in review without a new queued attempt', async (_label, sql) => {
    await db.query(sql);
    expect((await eligible()).canRetryInitial).toBe(false);
    await expect(retrySchoolContactInitial(request())).rejects.toMatchObject({ status: 409 });
    expect((await db.query('SELECT status FROM school_contact_workflow_steps WHERE id=22'))[0][0].status).toBe('needs_review');
    expect((await db.query('SELECT COUNT(*) AS n FROM user_activity_log'))[0][0].n).toBe(0);
  });

  it('rechecks the normal provider permission rather than relying on an old assignment', async () => {
    m.contextAllowed = false;
    await expect(retrySchoolContactInitial(request())).rejects.toMatchObject({ status: 403 });
    expect((await currentWorkflow()).status).toBe('needs_review');
  });

  it.each(['sent', 'delivered', 'queued', 'pending', 'preparing', 'sending', 'unknown', null])('rejects an accepted or ambiguous %s transport receipt', async status => {
    await db.execute('UPDATE user_communications SET delivery_status=? WHERE id=501', [status]);
    expect((await eligible()).canRetryInitial).toBe(false);
    await expect(retrySchoolContactInitial(request())).rejects.toMatchObject({ status: 409 });
  });

  it.each([
    ['external transport ID', "UPDATE user_communications SET external_message_id='gmail-accepted-123' WHERE id=501"],
    ['sent timestamp', 'UPDATE user_communications SET sent_at=UTC_TIMESTAMP() WHERE id=501'],
    ['delivery timestamp', 'UPDATE user_communications SET delivered_at=UTC_TIMESTAMP() WHERE id=501']
  ])('does not trust a failed label over its %s', async (_label, sql) => {
    await db.query(sql); await expect(retrySchoolContactInitial(request())).rejects.toMatchObject({ status: 409 });
  });

  it.each([
    ['recorded parent reply', 'UPDATE school_contact_workflows SET parent_reply_at=UTC_TIMESTAMP() WHERE id=42'],
    ['recorded outside reply', 'UPDATE school_contact_workflows SET external_reply_recorded_at=UTC_TIMESTAMP() WHERE id=42'],
    ['arranged intake', 'UPDATE school_contact_workflows SET intake_arranged_at=UTC_TIMESTAMP() WHERE id=42'],
    ['received conversation reply', "INSERT INTO communication_messages(conversation_id,channel,direction,send_status,from_json,created_at) VALUES(88,'email','inbound','received',JSON_OBJECT('email','testing+parent@itsco.health'),UTC_TIMESTAMP())"],
    ['manual provider response', "INSERT INTO communication_messages(conversation_id,author_user_id,channel,direction,send_status,from_json,sent_at,created_at) VALUES(88,1433,'email','outbound','sent',JSON_OBJECT('email','messages@itsco.health'),UTC_TIMESTAMP(),UTC_TIMESTAMP())"],
    ['scheduled intake', "INSERT INTO appointments VALUES(1,450,1433,'clinical','90791','scheduled',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR));INSERT INTO appointment_participants VALUES(1,102)"],
    ['finalized intake', "INSERT INTO client_intake_note_drafts VALUES(1,450,102,'final',UTC_TIMESTAMP())"]
  ])('honors %s before accepting a retry', async (_label, sql) => {
    for (const statement of sql.split(';')) await db.query(statement);
    expect((await eligible()).canRetryInitial).toBe(false);
    await expect(retrySchoolContactInitial(request())).rejects.toMatchObject({ status: 409 });
  });

  it('recognizes a signed clinical intake outside the main intake-drafts table', async () => {
    m.signedIntake = true;
    await expect(retrySchoolContactInitial(request())).rejects.toMatchObject({ status: 409 });
  });

  it('permits the current prepared retry message but stops when it acquires an uncertain or accepted transport receipt', async () => {
    await retrySchoolContactInitial(request());
    const workflow = await currentWorkflow();
    await db.query("INSERT INTO communication_messages(conversation_id,author_user_id,channel,direction,send_status,from_json,to_json,created_at) VALUES(88,1433,'email','outbound','preparing',JSON_OBJECT('email','messages@itsco.health','schoolContactAutomation',JSON_OBJECT('workflowId',42,'stepKey','initial_email')),JSON_ARRAY(JSON_OBJECT('email','testing+parent@itsco.health')),UTC_TIMESTAMP())");
    await expect(assertSchoolContactInitialRetryDelivery({ workflow, guardian })).resolves.toBeUndefined();
    await db.query("INSERT INTO user_communications(id,agency_id,client_id,generated_by_user_id,template_type,channel,delivery_status,metadata,generated_at) VALUES(502,450,102,1433,'school_contact_plan','email','pending',JSON_OBJECT('internetMessageIdOverride','<school-contact-42-initial_email@itsco.health>'),UTC_TIMESTAMP())");
    await expect(assertSchoolContactInitialRetryDelivery({ workflow, guardian })).rejects.toMatchObject({ code: 'school_contact_retry_stopped' });
    await db.query("UPDATE user_communications SET delivery_status='sent',external_message_id='gmail-current-retry-accepted',sent_at=UTC_TIMESTAMP() WHERE id=502");
    await expect(assertSchoolContactInitialRetryDelivery({ workflow, guardian })).rejects.toMatchObject({ code: 'school_contact_retry_stopped' });
    expect((await db.query('SELECT delivery_status FROM user_communications WHERE id=501'))[0][0].delivery_status).toBe('failed');
  });

  it.each([
    ['access revoked', 'UPDATE client_guardians SET access_enabled=0'],
    ['recipient changed', "UPDATE users SET personal_email='testing+changed@itsco.health' WHERE id=8"],
    ['assignment revoked', 'UPDATE client_provider_assignments SET is_active=0'],
    ['plan disabled', "UPDATE school_provider_contact_plans SET status='declined'"],
    ['outside reply recorded', 'UPDATE school_contact_workflows SET external_reply_recorded_at=UTC_TIMESTAMP() WHERE id=42'],
    ['new incoming reply', "INSERT INTO communication_messages(conversation_id,channel,direction,send_status,from_json,created_at) VALUES(88,'email','inbound','received',JSON_OBJECT('email','testing+parent@itsco.health'),UTC_TIMESTAMP())"],
    ['newly scheduled intake', "INSERT INTO appointments VALUES(1,450,1433,'clinical','90791','confirmed',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR));INSERT INTO appointment_participants VALUES(1,102)"]
  ])('stops a queued retry when %s changes during preparation', async (_label, sql) => {
    await retrySchoolContactInitial(request());
    const workflow = await currentWorkflow();
    await expect(assertSchoolContactInitialRetryDelivery({ workflow, guardian })).resolves.toBeUndefined();
    for (const statement of sql.split(';')) await db.query(statement);
    await expect(assertSchoolContactInitialRetryDelivery({ workflow, guardian })).rejects.toMatchObject({ code: 'school_contact_retry_stopped' });
    expect((await db.query('SELECT COUNT(*) AS n FROM communication_messages WHERE send_status IN (\'sent\',\'delivered\')'))[0][0].n).toBe(0);
  });
});
