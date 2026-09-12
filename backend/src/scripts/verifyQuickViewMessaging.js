/** Disposable MySQL integration test. Never invokes a delivery worker or sends email/SMS. */
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { splitSqlStatements, stripSqlLineComments } from '../../../database/migrationSqlUtils.js';
dotenv.config();
if (!process.argv.includes('--isolated-schema')) throw new Error('Use --isolated-schema');
const source = process.env.DB_NAME;
if (!/^[a-zA-Z0-9_]+$/.test(source || '')) throw new Error('Invalid source schema');
const schema = `qv_verify_${Date.now()}`;
const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3307), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: source });
let pool;
try {
  await db.query(`CREATE DATABASE \`${schema}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  for (const table of ['users','user_agencies','agencies','icons','email_sender_identities','communication_inboxes','communication_conversations','communication_messages','communication_conversation_reads','communication_attachments','communication_email_receipts','user_communication_prefs','message_logs','twilio_number_assignments','communication_blocked_addresses']) {
    await db.query(`CREATE TABLE \`${schema}\`.\`${table}\` LIKE \`${source}\`.\`${table}\``);
  }
  await db.changeUser({ database: schema });
  const migration = await fs.readFile(new URL('../../../database/migrations/1422_communication_thread_reminders.sql', import.meta.url), 'utf8');
  for (const sql of splitSqlStatements(stripSqlLineComments(migration))) if (sql.trim()) await db.query(sql);
  await db.query("INSERT INTO agencies (id,name,slug) VALUES (1,'QV fixture','qv-fixture'),(2,'Other tenant','other-fixture')");
  await db.query("INSERT INTO users (id,role,status,personal_email) VALUES (1,'provider','ACTIVE_EMPLOYEE','private@example.invalid'),(2,'provider','ACTIVE_EMPLOYEE','other@example.invalid')");
  await db.query('INSERT INTO user_agencies (user_id,agency_id,is_active) VALUES (1,1,1),(2,2,1)');
  await db.query("INSERT INTO email_sender_identities (id,agency_id,identity_key,from_email) VALUES (1,1,'personal_1','staff@example.invalid')");
  await db.query("INSERT INTO communication_inboxes (id,agency_id,kind,owner_user_id,sender_identity_id,display_name,from_email) VALUES (1,1,'personal',1,1,'Fixture','staff@example.invalid'),(2,2,'personal',2,NULL,'Other','otherwork@example.invalid')");
  await db.query("INSERT INTO communication_conversations (id,agency_id,inbox_id,channel,subject,owner_user_id,last_message_at) VALUES (1,1,1,'email','Fixture subject',1,NOW()),(2,2,2,'email','Other tenant',2,NOW())");
  await db.query(`INSERT INTO communication_messages (id,conversation_id,channel,direction,from_json,subject,body_text,internet_message_id,send_status,sent_at) VALUES (1,1,'email','inbound',?,'Fixture subject','Synthetic inbound','<external@example.invalid>','sent',DATE_SUB(NOW(),INTERVAL 48 HOUR))`, [JSON.stringify({ email: 'client@example.invalid' })]);
  await db.query("INSERT INTO communication_thread_reminders (conversation_id,message_id,user_id,inbox_id,internet_message_id,delivery_status) VALUES (1,1,1,1,'<reminder@example.invalid>','sent')");
  // Explicit opt-out guarantees the scheduler cannot send even if the fixture changes.
  await db.query('INSERT INTO user_communication_prefs (user_id,personal_email_notify) VALUES (1,0),(2,0)');
  process.env.DB_NAME = schema;
  pool = (await import('../config/database.js')).default;
  const { queuePersonalReminderReply, runPersonalThreadReminders } = await import('../services/personalThreadReminder.service.js');
  assert.deepEqual(await runPersonalThreadReminders(), { sent: 0, checked: 0 });
  const [[inbox]] = await db.query('SELECT * FROM communication_inboxes WHERE id=1');
  const input = { inbox, fromEmail: 'private@example.invalid', deliveryId: '<private-reply@example.invalid>', inReplyTo: '<reminder@example.invalid>', bodyText: 'Confirmed.\n\nOn Monday Staff wrote:\n> Private notification' };
  const replies = await Promise.all(Array.from({ length: 6 }, () => queuePersonalReminderReply(input)));
  assert.equal(replies.filter((r) => !r.duplicate).length, 1);
  const [[queued]] = await db.query("SELECT * FROM communication_messages WHERE direction='outbound'");
  assert.equal(queued.conversation_id, 1); assert.equal(queued.send_status, 'scheduled');
  assert.equal(queued.in_reply_to, '<external@example.invalid>'); assert.equal(queued.body_text, 'Confirmed.');
  assert.equal(queued.from_json.email, 'staff@example.invalid'); assert.equal(queued.to_json[0].email, 'client@example.invalid');
  await assert.rejects(queuePersonalReminderReply({ ...input, fromEmail: 'other@example.invalid', deliveryId: '<unauthorized@example.invalid>' }));
  const { undoOutboundMessage } = await import('../services/unifiedInbox.service.js');
  await undoOutboundMessage(1, queued.id, { userId: 1 });
  const [[cancelled]] = await db.query('SELECT send_status FROM communication_messages WHERE id=?', [queued.id]);
  assert.equal(cancelled.send_status, 'cancelled');
  const { getQuickHome } = await import('../controllers/quickView.controller.js');
  let home;
  await getQuickHome({ quickView: { userId: 1, agencyId: 1 }, query: {} }, { json: (data) => { home = data; } }, (e) => { throw e; });
  assert.deepEqual(home.conversations.map((c) => c.id), [1]);
  console.log('PASS: migration, scoped reminders, concurrent reply deduplication, work identity, original RFC thread, undo, QV tenant isolation');
} finally {
  if (pool) await pool.end();
  await db.query(`DROP DATABASE IF EXISTS \`${schema}\``);
  await db.end();
}
