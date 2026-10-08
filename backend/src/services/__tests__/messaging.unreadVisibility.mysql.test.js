import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import mysql from 'mysql2/promise';
const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../config/database.js', () => ({ default: { execute: (...args) => state.db.execute(...args) }, onTableWrite: () => {} }));
import Conversation from '../../models/CommunicationConversation.model.js';
import { countHubChatUnreadThreads } from '../messagesHub.service.js';
const socketPath = process.env.HUB_SCOPE_MYSQL_SOCKET;
const database = `messaging_read_test_${process.pid}`;
describe.skipIf(!socketPath)('readable unread email (isolated MySQL)', () => {
  beforeAll(async () => {
    state.db = await mysql.createConnection({ socketPath, user: 'root' });
    await state.db.query(`CREATE DATABASE ${database}`);
    await state.db.query(`USE ${database}`);
    for (const sql of [
      "CREATE TABLE users(id INT PRIMARY KEY,first_name VARCHAR(30),last_name VARCHAR(30),is_active BOOL DEFAULT 1,terminated_at DATETIME,is_archived BOOL DEFAULT 0,status VARCHAR(30) DEFAULT 'ACTIVE_EMPLOYEE')",
      'CREATE TABLE chat_threads(id INT PRIMARY KEY,agency_id INT,thread_type VARCHAR(30),message_channel VARCHAR(30))',
      'CREATE TABLE chat_thread_participants(thread_id INT,user_id INT)',
      'CREATE TABLE chat_thread_reads(thread_id INT,user_id INT,last_read_message_id INT)',
      'CREATE TABLE chat_thread_deletes(thread_id INT,user_id INT,deleted_at DATETIME)',
      'CREATE TABLE chat_messages(id INT PRIMARY KEY,thread_id INT,sender_user_id INT)',
      'CREATE TABLE chat_message_deletes(message_id INT,user_id INT)',
      "INSERT INTO chat_threads VALUES(1,2,'direct','internal'),(2,2,'client_secure','secure'),(3,2,'channel','internal'),(4,2,'team','internal'),(5,3,'direct','internal')",
      'INSERT INTO chat_thread_participants VALUES(1,1),(2,1),(3,1),(4,1),(5,1)',
      'INSERT INTO chat_messages VALUES(1,1,2),(2,2,2),(3,3,2),(4,4,2),(5,5,2)',
      'CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active BOOL)',
      'CREATE TABLE clients(id INT,agency_id INT,provider_id INT)',
      'CREATE TABLE client_provider_assignments(client_id INT,provider_user_id INT,is_active BOOL)',
      'CREATE TABLE message_logs(agency_id INT,client_id INT,sms_thread_key VARCHAR(80))',
      "CREATE TABLE communication_inboxes(id INT PRIMARY KEY,kind VARCHAR(30),owner_user_id INT,display_name VARCHAR(80),from_email VARCHAR(80))",
      "CREATE TABLE communication_conversations(id INT PRIMARY KEY,agency_id INT,channel VARCHAR(20) DEFAULT 'email',owner_user_id INT,inbox_id INT,status VARCHAR(30) DEFAULT 'new',archived_at DATETIME,is_spam BOOL DEFAULT 0,is_unknown_sender BOOL DEFAULT 0,visible_after DATETIME,snoozed_until DATETIME,starred BOOL DEFAULT 0,last_message_at DATETIME,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,due_at DATETIME,external_thread_id VARCHAR(80))",
      'CREATE TABLE communication_messages(id INT PRIMARY KEY,conversation_id INT,direction VARCHAR(20),is_internal_note BOOL DEFAULT 0,send_status VARCHAR(20),from_json JSON,sent_at DATETIME,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,body_text TEXT,subject VARCHAR(100))',
      'CREATE TABLE communication_participants(id INT,conversation_id INT,is_primary BOOL,display_name VARCHAR(80),email VARCHAR(80))',
      'CREATE TABLE communication_conversation_reads(conversation_id INT,user_id INT,last_read_at DATETIME,forced_unread BOOL DEFAULT 0,PRIMARY KEY(conversation_id,user_id))',
      "INSERT INTO users(id,first_name,last_name) VALUES(1,'Own','Provider'),(2,'Other','Provider')",
      "INSERT INTO communication_inboxes VALUES(1,'personal',1,'Own inbox','own@example.test'),(2,'personal',2,'Other inbox','other@example.test')",
      // Three received emails, still bearing the old availability hold; one other person's mail,
      // one unknown sender, one snoozed email, and an outbound-only thread explicitly kept unread.
      "INSERT INTO communication_conversations(id,agency_id,owner_user_id,inbox_id,visible_after) VALUES(11,2,1,1,DATE_ADD(NOW(),INTERVAL 2 DAY)),(12,2,1,1,DATE_ADD(NOW(),INTERVAL 2 DAY)),(13,2,1,1,DATE_ADD(NOW(),INTERVAL 2 DAY)),(14,2,1,2,NULL),(15,2,1,1,NULL),(16,2,1,1,NULL),(17,2,1,1,NULL)",
      'UPDATE communication_conversations SET is_unknown_sender=1 WHERE id=15',
      'UPDATE communication_conversations SET snoozed_until=DATE_ADD(NOW(),INTERVAL 2 DAY) WHERE id=16',
      "INSERT INTO communication_messages(id,conversation_id,direction,send_status) VALUES(101,11,'inbound','sent'),(102,12,'inbound','sent'),(103,13,'inbound','sent'),(104,14,'inbound','sent'),(105,15,'inbound','sent'),(106,16,'inbound','sent'),(107,17,'outbound','sent')",
      "INSERT INTO communication_conversation_reads VALUES(17,1,'1970-01-01',1)"
    ]) await state.db.query(sql);
  });
  afterAll(async () => { if (state.db) { await state.db.query(`DROP DATABASE IF EXISTS ${database}`); await state.db.end(); } });
  it('lists already received mail despite legacy holds; excludes other personal mail, unknown senders and snoozes', async () => {
    const rows = await Conversation.list({ agencyId: 2, userId: 1, scopeToUserId: 1, filter: 'unread', channel: 'email' });
    expect(rows.map(row => row.id).sort()).toEqual([11, 12, 13, 17]);
    expect(rows.every(row => row.is_unread)).toBe(true);
    const summary = await Conversation.attentionSummary({ agencyId: 2, userId: 1, scopeToUserId: 1 });
    expect(summary).toMatchObject({ unread: 4, unreadByChannel: { email: 4 } });
  });
  it('counts unread by actual message channel without including another agency', async () => {
    expect(await countHubChatUnreadThreads({ agencyId: 2, userId: 1, byChannel: true })).toEqual({ internal: 1, secure: 1, channel: 1, group: 1 });
    expect(await countHubChatUnreadThreads({ agencyId: 2, userId: 1 })).toBe(4);
    expect(await countHubChatUnreadThreads({ agencyId: 2, userId: 2 })).toBe(0);
  });
  it('updates both the list and count on read and keep unread', async () => {
    await Conversation.markRead(11, 1);
    expect((await Conversation.list({ agencyId: 2, userId: 1, scopeToUserId: 1, filter: 'unread' })).map(row => row.id)).not.toContain(11);
    expect((await Conversation.attentionSummary({ agencyId: 2, userId: 1, scopeToUserId: 1 })).unread).toBe(3);
    await Conversation.markUnread(11, 1);
    expect((await Conversation.attentionSummary({ agencyId: 2, userId: 1, scopeToUserId: 1 })).unread).toBe(4);
  });
});
