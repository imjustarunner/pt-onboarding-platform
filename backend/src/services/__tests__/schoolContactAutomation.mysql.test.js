import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';

const m = vi.hoisted(() => ({ execute: null, getConnection: null, send: vi.fn(), email: vi.fn(), sms: vi.fn(), notify: vi.fn(), note: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: (...args) => m.execute(...args), getConnection: () => m.getConnection() } }));
vi.mock('../schoolContactPlan.service.js', () => ({
  SCHOOL_CONTACT_DEMO_AGENCY_ID: 450, SCHOOL_CONTACT_TEST_INBOX: 'testing@itsco.health', sendSchoolContactEmail: (...args) => m.send(...args),
  getContactPlanContext: async ({ agencyId, userId }) => {
    if (Number(agencyId) !== 450 || Number(userId) !== 1433) throw Object.assign(new Error('Wrong demo provider'), { status: 403 });
    return { agencyId: 450, userId: 1433, agency: { id: 450, feature_flags: {} }, provider: { id: 1433, first_name: 'Avery', last_name: 'Demo' } };
  }
}));
vi.mock('../communicationRouting.service.js', () => ({ resolveOutboundNumber: async () => { throw new Error('Unconfigured demo fixture must never resolve a text sender'); } }));
vi.mock('../smsCompliance.service.js', () => ({ resolveRegisteredSmsSender: async () => { throw new Error('Unconfigured demo fixture must never resolve a staff sender'); } }));
vi.mock('../vonage.service.js', () => ({ default: { sendSms: (...args) => m.sms(...args) } }));
vi.mock('../tenantMessageMailboxes.service.js', () => ({ resolveMessagesSendMailbox: async () => ({ identity: { id: 1116 }, fromEmail: 'messages@itsco.health' }) }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: (...args) => m.email(...args) }));
vi.mock('../../models/Notification.model.js', () => ({ default: { coalesceOrCreate: (...args) => m.notify(...args) } }));
vi.mock('../../models/ClientNotes.model.js', () => ({ default: { create: (...args) => m.note(...args) } }));
vi.mock('../chatEncryption.service.js', () => ({ encryptChatText: text => ({ ciphertextB64: Buffer.from(text).toString('base64'), ivB64: 'test-only', authTagB64: 'test-only', keyId: 'test-only' }) }));
vi.mock('../../models/MessageLog.model.js', () => ({ default: { normalizePhone: value => value ? `+${String(value).replace(/\D/g,'').replace(/^(?=\d{10}$)/,'1')}` : null } }));
import { processSchoolContactAutomation, queueSchoolContactAssignments, listSchoolContactWorkflows, markSchoolContactWorkflowReplied } from '../schoolContactAutomation.service.js';
import { syncEmailParentContact } from '../parentContact.service.js';

describe.skipIf(!process.env.HUB_SCOPE_MYSQL_SOCKET)('school contact automation MySQL integration with no external transport', () => {
  let admin, db, workflowId;
  const databaseName = `school_contact_automation_test_${process.pid}`;
  beforeAll(async () => {
    admin = await mysql.createConnection({ socketPath: process.env.HUB_SCOPE_MYSQL_SOCKET, user: 'root', timezone: '+00:00' });
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    db = mysql.createPool({ socketPath: process.env.HUB_SCOPE_MYSQL_SOCKET, user: 'root', database: databaseName, timezone: '+00:00', connectionLimit: 4 });
    m.execute = (...args) => db.execute(...args); m.getConnection = () => db.getConnection();
    for (const sql of [
      'CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(120),organization_type VARCHAR(32),is_active BOOLEAN DEFAULT TRUE,is_archived BOOLEAN DEFAULT FALSE)',
      'CREATE TABLE users(id INT PRIMARY KEY,first_name VARCHAR(80),last_name VARCHAR(80),role VARCHAR(40),email VARCHAR(160),personal_email VARCHAR(160),personal_phone VARCHAR(40),phone_number VARCHAR(40),work_phone VARCHAR(40),is_active BOOLEAN DEFAULT TRUE,is_archived BOOLEAN DEFAULT FALSE,terminated_at DATETIME NULL)',
      'CREATE TABLE user_agencies(agency_id INT,user_id INT,is_active BOOLEAN DEFAULT TRUE)',
      'CREATE TABLE organization_affiliations(agency_id INT,organization_id INT,is_active BOOLEAN DEFAULT TRUE)',
      "CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,initials VARCHAR(20),status VARCHAR(30) DEFAULT 'ACTIVE',client_status_id INT,service_day VARCHAR(20),session_sms_opt_in BOOLEAN DEFAULT FALSE,first_service_at DATETIME,parents_contacted_at DATETIME,parents_contacted_successful BOOLEAN,checklist_updated_at DATETIME,checklist_updated_by_user_id INT)",
      'CREATE TABLE client_statuses(id INT PRIMARY KEY,status_key VARCHAR(40),label VARCHAR(80))',
      'CREATE TABLE client_provider_assignments(id INT PRIMARY KEY,client_id INT,organization_id INT,provider_user_id INT,service_day VARCHAR(20),is_active BOOLEAN DEFAULT TRUE,created_at DATETIME,updated_at DATETIME)',
      "CREATE TABLE client_guardians(client_id INT,guardian_user_id INT,relationship_type VARCHAR(20) DEFAULT 'guardian',access_enabled BOOLEAN DEFAULT TRUE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
      'CREATE TABLE communication_conversations(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT)',
      'CREATE TABLE communication_links(conversation_id INT,entity_type VARCHAR(32),entity_id INT)',
      'CREATE TABLE communication_messages(id INT AUTO_INCREMENT PRIMARY KEY,conversation_id INT,channel VARCHAR(20),direction VARCHAR(20),author_user_id INT,from_json JSON,to_json JSON,cc_json JSON,bcc_json JSON,send_status VARCHAR(30),is_internal_note BOOLEAN DEFAULT FALSE,is_auto_reply BOOLEAN DEFAULT FALSE,auto_reply_kind VARCHAR(40),sent_at DATETIME,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
      'CREATE TABLE message_logs(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,client_id INT,user_id INT,direction VARCHAR(20),delivery_status VARCHAR(30),sms_thread_key VARCHAR(255),metadata JSON,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
      'CREATE TABLE chat_messages(id INT PRIMARY KEY,thread_id INT,topic_id INT)',
      'CREATE TABLE client_notes(id INT AUTO_INCREMENT PRIMARY KEY,client_id INT,author_id INT,category VARCHAR(32),urgency VARCHAR(32),message TEXT,message_ciphertext TEXT,message_iv VARCHAR(80),message_auth_tag VARCHAR(80),encryption_key_id VARCHAR(80),is_internal_only BOOLEAN)'
    ]) await db.query(sql);
    for (const file of ['1719_school_provider_contact_plans.sql','1720_school_contact_automation.sql','1689_parent_contact_events.sql','1691_parent_contact_attempts.sql']) {
      const source = await readFile(new URL(`../../../../database/migrations/${file}`, import.meta.url), 'utf8');
      for (const statement of source.replace(/^\s*--.*$/gm,'').split(';').map(s => s.trim()).filter(Boolean)) await db.query(statement);
    }
    await db.execute("INSERT INTO agencies(id,name,organization_type) VALUES(450,'Demo','agency'),(451,'Cedar Grove K-8','school'),(2,'Production','agency')");
    await db.execute("INSERT INTO users(id,first_name,last_name,role,email) VALUES(1433,'Avery','Demo','provider','provider@example.com'),(8,'Parent','Demo','guardian','testing@itsco.health'),(9,'Support','Demo','support','support@example.com')");
    await db.execute('INSERT INTO user_agencies(agency_id,user_id) VALUES(450,1433),(450,9)');
    await db.execute('INSERT INTO organization_affiliations(agency_id,organization_id) VALUES(450,451)');
    await db.execute("INSERT INTO school_provider_contact_plans(agency_id,provider_user_id,status,template,decided_at) VALUES(450,1433,'enabled','Test template',DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 MINUTE))");
    await db.execute("INSERT INTO clients(id,agency_id,initials) VALUES(101,450,'OLD'),(102,450,'NEW'),(103,2,'OTHER')");
    await db.execute("INSERT INTO client_provider_assignments(id,client_id,organization_id,provider_user_id,service_day,created_at,updated_at) VALUES(1,101,451,1433,'Monday',DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 DAY),UTC_TIMESTAMP()),(2,102,451,1433,'Monday',UTC_TIMESTAMP(),UTC_TIMESTAMP()),(3,102,451,1433,'Friday',UTC_TIMESTAMP(),UTC_TIMESTAMP()),(4,103,451,1433,'Monday',UTC_TIMESTAMP(),UTC_TIMESTAMP())");
    await db.execute('INSERT INTO client_guardians(client_id,guardian_user_id) VALUES(102,8)');
    m.send.mockImplementation(async input => {
      let conversationId = input.conversationId;
      if (!conversationId) {
        const [created] = await db.execute('INSERT INTO communication_conversations(agency_id) VALUES(?)', [input.agencyId]);
        conversationId = created.insertId;
        await db.execute("INSERT INTO communication_links(conversation_id,entity_type,entity_id) VALUES(?,'client',?)", [conversationId,input.clientId]);
      }
      const [created] = await db.execute(`INSERT INTO communication_messages(conversation_id,channel,direction,author_user_id,from_json,to_json,cc_json,bcc_json,send_status,sent_at)
        VALUES(?,'email','outbound',?,JSON_OBJECT('email','messages@itsco.health','schoolContactAutomation',JSON_OBJECT('workflowId',?,'stepKey',?)),JSON_ARRAY(JSON_OBJECT('email',?)),JSON_ARRAY(),JSON_ARRAY(),'sent',UTC_TIMESTAMP())`, [conversationId,input.providerUserId,input.workflowId,input.stepKey,input.to]);
      await syncEmailParentContact(created.insertId);
      return { sent: true, conversationId, messageId: created.insertId };
    });
    m.email.mockImplementation(async input => { expect(input.to).toBe('testing@itsco.health'); expect(input.bcc).toBe('testing@itsco.health'); return { id: 'synthetic-receipt' }; });
  });
  afterAll(async () => {
    if (db) await db.end();
    if (admin) { await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``); await admin.end(); }
  });
  it('migrates and queues only new opted-in demo school assignments once, never old no-op edits or production', async () => {
    expect(await queueSchoolContactAssignments()).toBe(1);
    expect(await queueSchoolContactAssignments(db, { clientId: 101 })).toBe(0);
    expect(await queueSchoolContactAssignments()).toBe(0);
    const [rows] = await db.execute('SELECT * FROM school_contact_workflows');
    expect(rows).toHaveLength(1); expect(rows[0].client_id).toBe(102); workflowId = rows[0].id;
  });
  it('sends initial outreach once, records automated contact evidence/checklist and avoids scheduler replay', async () => {
    await processSchoolContactAutomation(); await processSchoolContactAutomation();
    expect(m.send).toHaveBeenCalledTimes(1);
    const [[counts]] = await db.execute('SELECT COUNT(*) AS n FROM client_parent_contact_attempts WHERE client_id=102');
    expect(counts.n).toBe(1);
    const [[client]] = await db.execute('SELECT parents_contacted_at,parents_contacted_successful FROM clients WHERE id=102');
    expect(client.parents_contacted_at).toBeTruthy(); expect(client.parents_contacted_successful).not.toBe(1);
    const [[note]] = await db.execute('SELECT message_ciphertext FROM client_notes WHERE client_id=102');
    expect(Buffer.from(note.message_ciphertext,'base64').toString()).toContain('automated school contact plan');
  });
  it('skips nonconsented/unconfigured SMS then sends one threaded email followup and increments attempts once', async () => {
    await db.execute('UPDATE school_contact_workflows SET initial_sent_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 10 DAY) WHERE id=?', [workflowId]);
    await processSchoolContactAutomation(); await processSchoolContactAutomation(); await processSchoolContactAutomation();
    expect(m.sms).not.toHaveBeenCalled(); expect(m.send).toHaveBeenCalledTimes(2);
    expect(m.send.mock.calls[1][0].conversationId).toBe(m.send.mock.results[0].value ? (await m.send.mock.results[0].value).conversationId : null);
    const [[counts]] = await db.execute('SELECT COUNT(*) AS n FROM client_parent_contact_attempts WHERE client_id=102');
    expect(counts.n).toBe(2);
    const [[step]] = await db.execute("SELECT status,detail FROM school_contact_workflow_steps WHERE workflow_id=? AND step_key='followup_sms'", [workflowId]);
    expect(step.status).toBe('skipped'); expect(step.detail).toContain('not opted in');
  });
  it('records human parent replies, keeps earliest unanswered timer, sends one72h support/provider reminder, then stops on human response', async () => {
    const [[workflow]] = await db.execute('SELECT conversation_id FROM school_contact_workflows WHERE id=?', [workflowId]);
    for (const hours of [73,1]) {
      const [inserted] = await db.execute(`INSERT INTO communication_messages(conversation_id,channel,direction,from_json,to_json,send_status,sent_at)
        VALUES(?,'email','inbound',JSON_OBJECT('email','testing@itsco.health'),JSON_ARRAY(JSON_OBJECT('email','messages@itsco.health')),'sent',DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? HOUR))`, [workflow.conversation_id,hours]);
      await syncEmailParentContact(inserted.insertId);
    }
    await processSchoolContactAutomation(); await processSchoolContactAutomation();
    expect(m.notify).toHaveBeenCalledTimes(1); expect(m.email).toHaveBeenCalledTimes(1); expect(m.sms).not.toHaveBeenCalled(); expect(m.send).toHaveBeenCalledTimes(2);
    const [[client]] = await db.execute('SELECT parents_contacted_successful FROM clients WHERE id=102'); expect(client.parents_contacted_successful).toBe(1);
    await db.execute(`INSERT INTO communication_messages(conversation_id,channel,direction,author_user_id,from_json,to_json,send_status,sent_at)
      VALUES(?,'email','outbound',1433,JSON_OBJECT('email','messages@itsco.health'),JSON_ARRAY(JSON_OBJECT('email','testing@itsco.health')),'sent',UTC_TIMESTAMP())`, [workflow.conversation_id]);
    await processSchoolContactAutomation();
    const [[done]] = await db.execute('SELECT status,provider_replied_at FROM school_contact_workflows WHERE id=?', [workflowId]);
    expect(done.status).toBe('complete'); expect(done.provider_replied_at).toBeTruthy();
  });
  it('scopes workflow visibility and records external replies idempotently without fabricating successful-contact evidence', async () => {
    expect(await listSchoolContactWorkflows({ agencyId: 450, providerUserId: 1433, clientId: 999 })).toEqual([]);
    expect(await listSchoolContactWorkflows({ agencyId: 450, providerUserId: 1433, clientId: 102 })).toHaveLength(1);
    await markSchoolContactWorkflowReplied({ agencyId: 450, providerUserId: 1433, workflowId });
    await markSchoolContactWorkflowReplied({ agencyId: 450, providerUserId: 1433, workflowId });
    expect(m.note).toHaveBeenCalledTimes(1);
    await expect(markSchoolContactWorkflowReplied({ agencyId: 450, providerUserId: 1433, workflowId: 999 })).rejects.toMatchObject({ status: 404 });
  });
  it('cancels pending work after opt-out/re-enrollment and never resends an uncertain transport', async () => {
    await db.execute("UPDATE school_contact_workflows SET status='pending',initial_sent_at=NULL,external_reply_recorded_at=NULL,provider_replied_at=NULL,parent_reply_at=NULL WHERE id=?", [workflowId]);
    await db.execute("UPDATE school_provider_contact_plans SET decided_at=DATE_ADD(decided_at,INTERVAL 1 SECOND) WHERE agency_id=450");
    await processSchoolContactAutomation();
    const [[cancelled]] = await db.execute('SELECT status FROM school_contact_workflows WHERE id=?', [workflowId]); expect(cancelled.status).toBe('cancelled');
    await db.execute("UPDATE school_contact_workflows w JOIN school_provider_contact_plans p ON p.agency_id=w.agency_id AND p.provider_user_id=w.provider_user_id SET w.status='pending',w.plan_decided_at=p.decided_at WHERE w.id=?", [workflowId]);
    await db.execute('DELETE FROM school_contact_workflow_steps WHERE workflow_id=?', [workflowId]);
    m.send.mockRejectedValueOnce(new Error('Uncertain transport timeout'));
    await processSchoolContactAutomation(); await processSchoolContactAutomation();
    const [[review]] = await db.execute('SELECT status FROM school_contact_workflows WHERE id=?', [workflowId]); expect(review.status).toBe('needs_review'); expect(m.send).toHaveBeenCalledTimes(3);
  });
  it('cancels initial-contact followups once the client has begun services', async () => {
    await db.execute('UPDATE clients SET first_service_at=UTC_TIMESTAMP() WHERE id=102');
    await db.execute("UPDATE school_contact_workflows SET status='pending' WHERE id=?", [workflowId]);
    await processSchoolContactAutomation();
    const [[workflow]] = await db.execute('SELECT status FROM school_contact_workflows WHERE id=?', [workflowId]);
    expect(workflow.status).toBe('cancelled');
    expect(m.send).toHaveBeenCalledTimes(3);
    expect(m.sms).not.toHaveBeenCalled();
  });
});
