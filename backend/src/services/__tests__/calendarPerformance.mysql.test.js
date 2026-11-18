import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import mysql from 'mysql2/promise';
const state = vi.hoisted(() => ({ db: null, queries: [] }));
vi.mock('../../config/database.js', () => ({ default: { execute: (...args) => { state.queries.push(args); return state.db.execute(...args); } }, onTableWrite: () => {} }));
import Conversation from '../../models/CommunicationConversation.model.js';
const enabled = process.env.CALENDAR_PERFORMANCE_MYSQL_SOCKET || process.env.CALENDAR_PERFORMANCE_MYSQL_HOST;
const database = `calendar_performance_test_${process.pid}`;
describe.skipIf(!enabled)('attention badges in isolated MySQL', () => {
  beforeAll(async () => {
    state.db = await mysql.createConnection({
      ...(process.env.CALENDAR_PERFORMANCE_MYSQL_SOCKET ? { socketPath: process.env.CALENDAR_PERFORMANCE_MYSQL_SOCKET }
        : { host: process.env.CALENDAR_PERFORMANCE_MYSQL_HOST, port: Number(process.env.CALENDAR_PERFORMANCE_MYSQL_PORT || 3306) }),
      user: 'root', password: process.env.CALENDAR_PERFORMANCE_MYSQL_PASSWORD || ''
    });
    await state.db.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await state.db.query(`USE ${database}`);
    for (const sql of [
      "CREATE TABLE users(id INT PRIMARY KEY,role VARCHAR(30) DEFAULT 'provider',email VARCHAR(100),work_email VARCHAR(100),personal_email VARCHAR(100),username VARCHAR(100),is_active BOOL DEFAULT 1,is_archived BOOL DEFAULT 0,terminated_at DATETIME,status VARCHAR(30) DEFAULT 'ACTIVE_EMPLOYEE')",
      'CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active BOOL DEFAULT 1,PRIMARY KEY(user_id,agency_id))',
      'CREATE TABLE agencies(id INT PRIMARY KEY,slug VARCHAR(50),organization_type VARCHAR(30))',
      'CREATE TABLE clients(id INT PRIMARY KEY,agency_id INT,provider_id INT,created_via_dev_fill BOOL DEFAULT 0)',
      'CREATE TABLE client_provider_assignments(client_id INT,provider_user_id INT,is_active BOOL)',
      'CREATE TABLE message_logs(agency_id INT,client_id INT,sms_thread_key VARCHAR(80))',
      'CREATE TABLE communication_inboxes(id INT PRIMARY KEY,agency_id INT,kind VARCHAR(30),owner_user_id INT,identity_key VARCHAR(80),from_email VARCHAR(100))',
      "CREATE TABLE support_tickets(id INT PRIMARY KEY,agency_id INT,claimed_by_user_id INT,status VARCHAR(30),school_organization_id INT,source_channel VARCHAR(30),subject VARCHAR(100),source_email_from VARCHAR(100),source_email_recipients TEXT)",
      'CREATE TABLE support_ticket_email_messages(id INT PRIMARY KEY,ticket_id INT,direction VARCHAR(30),send_status VARCHAR(30),sent_at DATETIME,created_at DATETIME,from_email VARCHAR(100),from_name VARCHAR(100),internet_message_id VARCHAR(100))',
      "CREATE TABLE communication_conversations(id INT PRIMARY KEY,agency_id INT,channel VARCHAR(20) DEFAULT 'email',owner_user_id INT,inbox_id INT,status VARCHAR(30) DEFAULT 'new',archived_at DATETIME,is_spam BOOL DEFAULT 0,is_unknown_sender BOOL DEFAULT 0,snoozed_until DATETIME,starred BOOL DEFAULT 0,last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,due_at DATETIME,external_thread_id VARCHAR(100),subject VARCHAR(100),support_ticket_id INT,KEY(agency_id))",
      'CREATE TABLE communication_messages(id INT PRIMARY KEY,conversation_id INT,direction VARCHAR(20),is_internal_note BOOL DEFAULT 0,send_status VARCHAR(20),from_json JSON,to_json JSON,cc_json JSON,sent_at DATETIME,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,subject VARCHAR(100),auto_reply_kind VARCHAR(60),internet_message_id VARCHAR(100),in_reply_to VARCHAR(100),KEY(conversation_id))',
      'CREATE TABLE communication_conversation_reads(conversation_id INT,user_id INT,last_read_at DATETIME,forced_unread BOOL DEFAULT 0,PRIMARY KEY(conversation_id,user_id))',
      'CREATE TABLE communication_links(conversation_id INT,entity_type VARCHAR(30),entity_id INT,KEY(conversation_id))',
      'CREATE TABLE email_sender_identities(id INT PRIMARY KEY,agency_id INT,from_email VARCHAR(100))',
      'CREATE TABLE user_communications(id INT PRIMARY KEY,agency_id INT,template_type VARCHAR(100),subject VARCHAR(100),metadata JSON,KEY(agency_id,template_type,subject))',
      "INSERT INTO agencies VALUES(2,'fixture','agency'),(3,'other','agency')",
      "INSERT INTO users(id,email) VALUES(1,'own@example.test'),(2,'other@example.test'),(3,'legacy@example.test'),(4,'ambiguous@example.test'),(5,'ambiguous@example.test')",
      'INSERT INTO user_agencies VALUES(1,2,1),(2,2,1),(3,2,1),(4,2,1),(5,2,1)',
      "INSERT INTO communication_inboxes VALUES(1,2,'personal',1,'own','own@example.test'),(2,2,'personal',2,'other','other@example.test'),(3,2,'shared',NULL,'legacy','legacy@example.test'),(4,2,'shared',NULL,'ambiguous','ambiguous@example.test'),(5,2,'shared',NULL,'payroll','payroll@example.test'),(6,2,'shared',NULL,'support','support@example.test')",
      "INSERT INTO email_sender_identities VALUES(1,2,'notices@example.test')",
      // Own unread, another private mailbox, inferred owner, ambiguous mailbox,
      // unknown sender, snooze, read, forced unread, cancelled delivery,
      // allowed group, denied group, other agency, two operational notices, demo.
      'INSERT INTO communication_conversations(id,agency_id,owner_user_id,inbox_id) VALUES(11,2,1,1),(12,2,1,2),(13,2,3,3),(14,2,1,4),(15,2,1,1),(16,2,1,1),(17,2,1,1),(18,2,1,1),(19,2,1,1),(20,2,NULL,5),(21,2,NULL,6),(22,3,1,NULL),(23,2,1,1),(24,2,1,1),(25,2,1,1)',
      'UPDATE communication_conversations SET is_unknown_sender=1 WHERE id=15',
      'UPDATE communication_conversations SET snoozed_until=DATE_ADD(NOW(),INTERVAL 2 DAY) WHERE id=16',
      "UPDATE communication_conversations SET subject='Provider assigned' WHERE id=23",
      "UPDATE communication_conversations SET subject='Digital enrollment packet' WHERE id=24",
      "UPDATE communication_conversations SET subject='Demo only: example' WHERE id=25",
      "INSERT INTO communication_messages(id,conversation_id,direction,send_status,from_json) SELECT id,id,'inbound','sent',JSON_OBJECT('email',IF(id>=23,'notices@example.test','sender@example.test')) FROM communication_conversations",
      "UPDATE communication_messages SET send_status='cancelled' WHERE id=19",
      "UPDATE communication_messages SET direction='outbound' WHERE id=18",
      "INSERT INTO communication_conversation_reads VALUES(17,1,'2099-01-01',0),(18,1,'2099-01-01',1)"
    ]) await state.db.query(sql);
  });
  afterAll(async () => { if (state.db) { await state.db.query(`DROP DATABASE IF EXISTS ${database}`); await state.db.end(); } });
  const scope = { agencyId: 2, userId: 1, scopeToUserId: 1, groupInboxIds: [5,6], allowedGroupInboxIds: [5] };
  it('preserves personal/group privacy and count semantics while evaluating badge flags once per row', async () => {
    state.queries=[];
    const summary=await Conversation.attentionSummary(scope);
    expect(summary).toMatchObject({ unread:3,unreadByInbox:{1:2,5:1},reviewByCategory:{provider_assignments:1,enrollment_packets:1} });
    expect(summary.unreadByInbox[2]).toBeUndefined();expect(summary.unreadByInbox[3]).toBeUndefined();expect(summary.unreadByInbox[4]).toBeUndefined();expect(summary.unreadByInbox[6]).toBeUndefined();
    const [sql,params]=state.queries[0];
    const [plan]=await state.db.query(`EXPLAIN FORMAT=JSON ${sql}`,params);
    // Actual optimizer plan must retain the derived table, not expand the
    // expensive unread expression into every outer SUM.
    const retained = node => node && typeof node === 'object' && (
      (node.table_name === 'visible' && (node.materialized_from_subquery || node.inputs?.some(input => input.access_type === 'materialize')))
      || Object.values(node).some(value => value && typeof value === 'object' && retained(value)));
    expect(!!retained(JSON.parse(plan[0].EXPLAIN))).toBe(true);
  });
  it('keeps other personal and ambiguous inboxes private for an unscoped operations summary',async()=>{
    const summary=await Conversation.attentionSummary({...scope,scopeToUserId:null});
    expect(summary.unreadByInbox[2]).toBeUndefined();expect(summary.unreadByInbox[3]).toBeUndefined();expect(summary.unreadByInbox[4]).toBeUndefined();
    expect(summary.unread).toBe(3);
  });
  it('resolves historical ownership and applies read/forced-unread changes immediately',async()=>{
    expect((await Conversation.attentionSummary({...scope,userId:3,scopeToUserId:3,allowedGroupInboxIds:[]})).unread).toBe(1);
    await Conversation.markRead(11,1);
    expect((await Conversation.attentionSummary(scope)).unread).toBe(2);
    await Conversation.markUnread(11,1);
    expect((await Conversation.attentionSummary(scope)).unread).toBe(3);
  });
});
