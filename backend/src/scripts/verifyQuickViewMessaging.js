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
  for (const table of ['managed_workspace_groups','communication_participants','email_inbound_routes','users','user_agencies','agencies','icons','email_sender_identities','communication_inboxes','communication_conversations','communication_messages','communication_conversation_reads','communication_attachments','communication_email_receipts','user_communication_prefs','message_logs','twilio_number_assignments','communication_blocked_addresses']) {
    await db.query(`CREATE TABLE \`${schema}\`.\`${table}\` LIKE \`${source}\`.\`${table}\``);
  }
  await db.changeUser({ database: schema });
  const migration = await fs.readFile(new URL('../../../database/migrations/1422_communication_thread_reminders.sql', import.meta.url), 'utf8');
  for (const sql of splitSqlStatements(stripSqlLineComments(migration))) if (sql.trim()) await db.query(sql);
  const personalMigration=await fs.readFile(new URL('../../../database/migrations/1493_personal_message_delivery_preferences.sql',import.meta.url),'utf8');
  for(const sql of splitSqlStatements(stripSqlLineComments(personalMigration)))if(sql.trim()){try{await db.query(sql);}catch(e){if(!['ER_DUP_FIELDNAME','ER_DUP_KEYNAME'].includes(e.code))throw e;}}
  await db.query("INSERT INTO agencies (id,name,slug) VALUES (1,'QV fixture','qv-fixture'),(2,'Other tenant','other-fixture')");
  await db.query("INSERT INTO users (id,email,role,status,is_active,sso_password_override,login_is_group_email,personal_email) VALUES (1,'staff@example.invalid','provider','ACTIVE_EMPLOYEE',1,1,1,'private@example.invalid'),(2,'otherwork@example.invalid','provider','ACTIVE_EMPLOYEE',1,1,1,'other@example.invalid')");
  await db.query('INSERT INTO user_agencies (user_id,agency_id,is_active) VALUES (1,1,1),(2,2,1)');
  await db.query("INSERT INTO email_sender_identities (id,agency_id,identity_key,from_email) VALUES (1,1,'personal_1','staff@example.invalid')");
  await db.query("INSERT INTO communication_inboxes (id,agency_id,kind,owner_user_id,sender_identity_id,display_name,from_email) VALUES (1,1,'personal',1,1,'Fixture','staff@example.invalid'),(2,2,'personal',2,NULL,'Other','otherwork@example.invalid')");
  await db.query("INSERT INTO communication_conversations (id,agency_id,inbox_id,channel,subject,owner_user_id,last_message_at) VALUES (1,1,1,'email','Fixture subject',1,NOW()),(2,2,2,'email','Other tenant',2,NOW())");
  await db.query(`INSERT INTO communication_messages (id,conversation_id,channel,direction,from_json,subject,body_text,internet_message_id,send_status,sent_at) VALUES (1,1,'email','inbound',?,'Fixture subject','Synthetic inbound','<external@example.invalid>','sent',DATE_SUB(NOW(),INTERVAL 48 HOUR))`, [JSON.stringify({ email: 'client@outside.invalid' })]);
  await db.query("UPDATE communication_messages SET to_json=JSON_ARRAY(JSON_OBJECT('email','staff@example.invalid')) WHERE id=1");
  await db.query("INSERT INTO communication_thread_reminders (conversation_id,message_id,user_id,inbox_id,internet_message_id,delivery_status,reply_allowed) VALUES (1,1,1,1,'<reminder@example.invalid>','sent',1)");
  // Explicit opt-out guarantees the scheduler cannot send even if the fixture changes.
  await db.query('INSERT INTO user_communication_prefs (user_id,personal_email_notify) VALUES (1,0),(2,0)');
  process.env.DB_NAME = schema;
  pool = (await import('../config/database.js')).default;
  const { queuePersonalReminderReply, runPersonalThreadReminders } = await import('../services/personalThreadReminder.service.js');
  assert.deepEqual(await runPersonalThreadReminders(), { sent: 0, checked: 0 });
  // Synthetic Directory fixtures only. No Gmail or Google Directory calls.
  const Directory=(await import('../services/googleWorkspaceDirectory.service.js')).default;
  Directory.isConfigured=()=>true;Directory.getUser=async()=>null;Directory.getGroup=async()=>({id:'synthetic-group'});
  const {getCommunicationPrefs,updateCommunicationPrefs}=await import('../services/inboxDigest.service.js');
  assert.equal((await getCommunicationPrefs(1)).personalEmailNotify,false);
  const prefs=await updateCommunicationPrefs(1,{personalEmailNotify:true,personalEmailDeliveryMode:'forward_one_to_one',personalEmailDelayMode:'hours',personalEmailDelayHours:2});
  assert.equal(prefs.personalEmailDelayHours,2);assert.equal(prefs.personalEmailDeliveryMode,'forward_one_to_one');
  // Never run a reminder scheduler again after enabling the synthetic preference.
  const [[inbox]] = await db.query('SELECT * FROM communication_inboxes WHERE id=1');
  const input = { gmailPayload:{headers:[{name:'Authentication-Results',value:'mx.google.com; dmarc=pass header.from=example.invalid'}]}, inbox, fromEmail: 'private@example.invalid', deliveryId: '<private-reply@example.invalid>', inReplyTo: '<reminder@example.invalid>', bodyText: 'Confirmed.\n\nOn Monday Staff wrote:\n> Private notification' };
  await (await import('../services/tenantMessageMailboxes.service.js')).resolveMessagesSendMailbox(1);
  const replies = await Promise.all(Array.from({ length: 6 }, () => queuePersonalReminderReply(input)));
  assert.equal(replies.filter((r) => !r.duplicate).length, 1);
  const [[queued]] = await db.query("SELECT * FROM communication_messages WHERE direction='outbound'");
  assert.equal(queued.conversation_id, 1); assert.equal(queued.send_status, 'scheduled');
  assert.equal(queued.in_reply_to, '<external@example.invalid>'); assert.equal(queued.body_text, 'Confirmed.');
  assert.equal(queued.from_json.email, 'messages@example.invalid'); assert.equal(queued.to_json[0].email, 'client@outside.invalid');
  await assert.rejects(queuePersonalReminderReply({ ...input, fromEmail: 'other@example.invalid', deliveryId: '<unauthorized@example.invalid>' }));
  const {resolvePersonalReminderMailbox}=await import('../services/personalThreadReminder.service.js');
  const [[messagesIdentity]]=await db.query("SELECT id FROM email_sender_identities WHERE agency_id=1 AND identity_key='messages'");
  assert.equal((await resolvePersonalReminderMailbox({identityId:messagesIdentity.id,fromEmail:'private@example.invalid',inReplyTo:'<reminder@example.invalid>'})).owner_user_id,1);
  assert.equal(await resolvePersonalReminderMailbox({identityId:messagesIdentity.id,fromEmail:'other@example.invalid',inReplyTo:'<reminder@example.invalid>'}),null);
  const {persistInboundEmail}=await import('../services/inboundEmailPersistence.service.js');
  await db.query("UPDATE communication_messages SET send_status='sent',internet_message_id='<bridge@example.invalid>' WHERE id=?",[queued.id]);
  const {resolvePersonalReplyMailbox}=await import('../services/personalMailboxReplyRouting.service.js');
  const recovered=await resolvePersonalReplyMailbox({identityId:messagesIdentity.id,fromEmail:'client@outside.invalid',inReplyTo:'<bridge@example.invalid>'});
  assert.equal(recovered.reply_conversation_id,1);
  const response=await persistInboundEmail({inboxId:1,agencyId:1,conversationId:recovered.reply_conversation_id,deliveryId:'<returned@example.invalid>',fromEmail:'client@outside.invalid',bodyText:'External answer',inReplyTo:'<bridge@example.invalid>',to:[{email:'messages@example.invalid'}]});
  assert.equal(response.conversationId,1);
  await db.query("UPDATE communication_messages SET send_status='scheduled' WHERE id=?",[queued.id]);
  const { undoOutboundMessage } = await import('../services/unifiedInbox.service.js');
  await undoOutboundMessage(1, queued.id, { userId: 1 });
  const [[cancelled]] = await db.query('SELECT send_status FROM communication_messages WHERE id=?', [queued.id]);
  assert.equal(cancelled.send_status, 'cancelled');
  const { getQuickHome } = await import('../controllers/quickView.controller.js');
  let home;
  await getQuickHome({ quickView: { userId: 1, agencyId: 1 }, query: {} }, { json: (data) => { home = data; } }, (e) => { throw e; });
  assert.deepEqual(home.conversations.map((c) => c.id), [1]);
  console.log('PASS: migration, scoped reminders, concurrent reply deduplication, work identity, original RFC thread, preferences, shared messages@ round trip, undo, QV tenant isolation');
} finally {
  if (pool) await pool.end();
  await db.query(`DROP DATABASE IF EXISTS \`${schema}\``);
  await db.end();
}

// Imported app modules may own housekeeping timers; all database cleanup is complete.
process.exit(0);
