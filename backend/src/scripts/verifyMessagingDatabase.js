/** Real MySQL checks in a disposable schema; never sends email or SMS. */
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { splitSqlStatements, stripSqlLineComments } from '../../../database/migrationSqlUtils.js';

dotenv.config();
if (!process.argv.includes('--isolated-schema')) throw new Error('Use --isolated-schema to create and remove a disposable test database.');
const source = process.env.DB_NAME;
if (!/^[a-zA-Z0-9_]+$/.test(source || '')) throw new Error('Invalid source database');
const schema = `messaging_verify_${Date.now()}`;
const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3307), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: source });
let pool;
try {
  await admin.query(`CREATE DATABASE \`${schema}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  for (const table of ['users', 'agencies', 'chat_threads', 'chat_thread_participants', 'chat_messages', 'communication_inboxes', 'communication_conversations', 'communication_messages', 'communication_participants', 'communication_attachments', 'message_logs']) {
    await admin.query(`CREATE TABLE \`${schema}\`.\`${table}\` LIKE \`${source}\`.\`${table}\``);
  }
  await admin.changeUser({ database: schema });
  const [topicColumns] = await admin.query("SHOW COLUMNS FROM chat_messages LIKE 'topic_id'");
  if (topicColumns.length) await admin.query('ALTER TABLE chat_messages DROP INDEX idx_chat_messages_topic, DROP COLUMN topic_id');
  const [smsColumns] = await admin.query("SHOW COLUMNS FROM message_logs LIKE 'sms_thread_key'");
  if (smsColumns.length) await admin.query('ALTER TABLE message_logs DROP INDEX idx_message_logs_sms_thread, DROP COLUMN sms_thread_key');
  await admin.query("INSERT INTO message_logs (agency_id,user_id,client_id,direction,body,from_number,to_number) VALUES (1,1,9,'INBOUND','Synthetic legacy SMS','+13035550102','+13035550101')");
  const sql = await fs.readFile(new URL('../../../database/migrations/1417_messaging_delivery_threads.sql', import.meta.url), 'utf8');
  for (const statement of splitSqlStatements(stripSqlLineComments(sql))) if (statement.trim()) await admin.query(statement);
  const [[backfilled]] = await admin.query('SELECT sms_thread_key FROM message_logs LIMIT 1');
  assert.equal(backfilled.sms_thread_key, 'sms:v2:client:9:+13035550101:+13035550102', 'Legacy phone pairs must migrate correctly');
  await admin.query("INSERT INTO agencies (id,name,slug) VALUES (1,'Messaging fixture','messaging-fixture')");
  await admin.query('INSERT INTO users (id) VALUES (1),(2)');
  await admin.query("INSERT INTO communication_inboxes (id,agency_id,display_name,from_email) VALUES (1,1,'Fixture','fixture@example.invalid'),(2,1,'Fixture two','fixture2@example.invalid')");
  process.env.DB_NAME = schema;
  pool = (await import('../config/database.js')).default;
  const { persistInboundEmail } = await import('../services/inboundEmailPersistence.service.js');
  const base = { inboxId: 1, agencyId: 1, deliveryId: '<delivery@example.invalid>', threadId: 'thread-one', fromEmail: 'sender@example.invalid', subject: 'Same subject', bodyText: 'Synthetic body' };
  const deliveries = await Promise.all(Array.from({ length: 8 }, () => persistInboundEmail(base)));
  assert.equal(deliveries.filter((r) => !r.duplicate).length, 1, 'Concurrent duplicate delivery must insert once');
  assert.equal(new Set(deliveries.map((r) => r.messageId)).size, 1);
  const otherInbox = await persistInboundEmail({ ...base, inboxId: 2 });
  assert.notEqual(otherInbox.messageId, deliveries[0].messageId, 'Delivery is inbox scoped');
  const independent = await persistInboundEmail({ ...base, deliveryId: '<independent@example.invalid>', threadId: 'thread-two' });
  assert.notEqual(independent.conversationId, deliveries[0].conversationId, 'Same subject must not join threads');
  const routedByHeader = await persistInboundEmail({ ...base, deliveryId: '<header-reply@example.invalid>', threadId: 'changed-provider-thread', inReplyTo: base.deliveryId });
  assert.equal(routedByHeader.conversationId, deliveries[0].conversationId, 'RFC ancestry must win when the provider thread changes');
  const pair = await Promise.all(['a', 'b'].map((n) => persistInboundEmail({ ...base, deliveryId: `<${n}@example.invalid>`, threadId: 'new-concurrent-thread' })));
  assert.equal(pair[0].conversationId, pair[1].conversationId, 'Concurrent first deliveries must share one provider thread');
  await assert.rejects(persistInboundEmail({ ...base, deliveryId: '<rollback@example.invalid>', threadId: 'rollback-thread', attachments: [{ filename: null, contentType: null, sizeBytes: 1, storageKey: 'fixture' }] }));
  const [rolledBack] = await admin.query("SELECT id FROM communication_conversations WHERE external_thread_id='rollback-thread'");
  assert.equal(rolledBack.length, 0, 'Attachment failure must roll back message and conversation');
  await admin.query("UPDATE communication_conversations SET draft_body='Unsent draft' WHERE id=?", [deliveries[0].conversationId]);
  await persistInboundEmail({ ...base, deliveryId: '<followup@example.invalid>', conversationId: deliveries[0].conversationId });
  const [[draft]] = await admin.query('SELECT draft_body FROM communication_conversations WHERE id=?', [deliveries[0].conversationId]);
  assert.equal(draft.draft_body, 'Unsent draft');
  await admin.query('INSERT INTO chat_threads (id,agency_id) VALUES (1,1)');
  await admin.query('INSERT INTO chat_thread_participants (thread_id,user_id) VALUES (1,1),(1,2)');
  const { resolveChatTopic } = await import('../services/chatTopics.service.js');
  const topicA = await resolveChatTopic({ threadId: 1, userId: 1, subject: 'Same title' });
  const topicB = await resolveChatTopic({ threadId: 1, userId: 1, subject: 'Same title' });
  assert.notEqual(topicA, topicB);
  await admin.query("INSERT INTO chat_messages (id,thread_id,sender_user_id,body) VALUES (1,1,1,'Legacy fixture')");
  const topics = await Promise.all([1, 2].map((userId) => resolveChatTopic({ threadId: 1, userId, legacyRootMessageId: 1 })));
  assert.equal(topics[0], topics[1], 'Concurrent legacy replies must establish one topic');
  const MessageLog = (await import('../models/MessageLog.model.js')).default;
  const sent = await MessageLog.createOutbound({ agencyId: 1, userId: 1, clientId: 10, body: 'Synthetic SMS', fromNumber: '+13035550101', toNumber: '+13035550102' });
  const received = await MessageLog.createInbound({ agencyId: 1, userId: 1, clientId: 10, body: 'Synthetic SMS reply', fromNumber: '+13035550102', toNumber: '+13035550101' });
  assert.equal(sent.sms_thread_key, received.sms_thread_key);
  console.log('PASS: migration, concurrent inbox receipts, thread creation, rollback, drafts, secure topics, SMS identity');
} finally {
  if (pool) await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS \`${schema}\``);
  await admin.end();
}
