import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { isolatedWorkflowMysql, recoveryMysqlEnabled } from '../../services/__tests__/fixtures/isolatedWorkflowMysql.js';
import { splitSqlStatements, stripSqlLineComments } from '../../utils/migrationSql.js';

const state = vi.hoisted(() => ({ db: null, recordAccess: true, shared: null, currentServices: [] }));
vi.mock('../../config/database.js', () => ({ default: {
  execute: (...args) => state.db.execute(...args), getConnection: (...args) => state.db.getConnection(...args)
} }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: async id => ({ id, role: 'provider', first_name: 'Fictional', last_name: 'Provider' }) } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: {} }));
vi.mock('../../models/Notification.model.js', () => ({ default: { create: vi.fn() } }));
vi.mock('../../services/clientSecureConversation.service.js', () => ({ refreshClientSecureAccess: vi.fn(), ensureClientSecureConversation: vi.fn(), resolveClientForSecureRecipients: vi.fn() }));
vi.mock('../../services/companyEventConversation.service.js', () => ({ assertCompanyEventConversationMember: async () => false, pruneUserCompanyEventConversations: vi.fn() }));
vi.mock('../../services/guardianSharedMessages.service.js', () => ({ assertSharedGuardianSend: vi.fn() }));
vi.mock('../../services/managedWorkspaceGroupAccess.service.js', () => ({ assertManagedChatPost: vi.fn() }));
vi.mock('../../services/familySharedConversations.service.js', async importOriginal => {
  const original = await importOriginal();
  return { ...original, familySharedConversations: { find: async () => null, requireAccess: async () => state.shared, currentAudience: vi.fn() },
    assertReviewedFamilyRecipients: vi.fn(original.assertReviewedFamilyRecipients) };
});
vi.mock('../../services/sharedFamilyNotice.service.js', () => ({ requireSharedFamilyAck: vi.fn() }));
vi.mock('../../services/parentContact.service.js', () => ({ syncSecureParentContact: vi.fn() }));
vi.mock('../../services/secureThreadNotifications.service.js', () => ({ notifySecureThreadParticipants: vi.fn() }));
vi.mock('../../services/clientServiceEnrollment.service.js', () => ({ clientAgencyMembership: async (clientId, agencyId) => Number(clientId) === 10 && Number(agencyId) === 450, listClientServices: async () => [] }));
vi.mock('../../services/clientRecordAccess.service.js', () => ({ resolveClientRecordAccess: async () => state.recordAccess ? { ok: true, client: { id: 10, agency_id: 450 } } : { ok: false, status: 403, message: 'Clinical record access required' } }));
vi.mock('../../services/messagesHub.service.js', async importOriginal => ({ ...(await importOriginal()),
  prepareHubSend: vi.fn(async () => ({ userId: 2, clientId: 10, agencyId: 450, personKey: 'user:2' })),
  listHubSendAgencies: vi.fn(async () => [{ id: 450 }]), markHubPersonRead: vi.fn(async () => ({})), sendHubPortalInvitation: vi.fn()
}));
vi.mock('../../services/inboxDigest.service.js', () => ({ getCommunicationPrefs: vi.fn(async () => ({ sendDelaySecureSeconds: 0 })) }));
import Notification from '../../models/Notification.model.js';
import { listMessages, sendMessage } from '../chat.controller.js';
import { getClientSecureMessage } from '../clientSecureMessages.controller.js';
import { encryptChatText, encryptChatContent, readChatMessageContent } from '../../services/chatEncryption.service.js';
import { loadChatTimeline, prepareHubSend, sendHubPortalInvitation } from '../../services/messagesHub.service.js';
import { createFamilySharedConversations, familySharedConversations } from '../../services/familySharedConversations.service.js';
import { resolveSecureSubjectReply } from '../../services/secureMessageSubjects.service.js';
import { ensureClientSecureConversation, resolveClientForSecureRecipients } from '../../services/clientSecureConversation.service.js';
import { postMessagesHubEnsureThread, postMessagesHubSend, processHubMessageQueue } from '../messagesHub.controller.js';
import { openQueuedMessage } from '../../services/secureQueuePayload.service.js';
import { enqueueHubMessage } from '../../services/hubMessageQueue.service.js';

const migration = name => new URL(`../../../../database/migrations/${name}`, import.meta.url);
const invoke = async (handler, { userId = 1, threadId = 100, body = {}, query = {}, messageId, summaryOnly = false } = {}) => {
  const req = { user: { id: userId, role: 'provider' }, params: { threadId: String(threadId), id: '10', messageId: String(messageId || '') }, body, query, secureSubjectSummaryOnly: summaryOnly };
  const json = vi.fn(), res = { status: vi.fn().mockReturnThis(), json, set: vi.fn() }, next = vi.fn();
  await handler(req, res, next);
  return { data: json.mock.calls[0]?.[0], status: res.status.mock.calls[0]?.[0] || (next.mock.calls[0]?.[0]?.status ?? 200), error: next.mock.calls[0]?.[0], res };
};

describe.skipIf(!recoveryMysqlEnabled)('encrypted subject conversations on actual isolated MySQL', () => {
  let fixture, db;
  beforeAll(async () => {
    vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 7).toString('base64'));
    fixture = await isolatedWorkflowMysql('secure_subjects'); db = fixture.db; state.db = db;
    for (const table of ['users', 'agencies', 'clients']) await db.query(`CREATE TABLE ${table}(id INT PRIMARY KEY)`);
    for (const name of ['137_create_platform_chat_and_presence.sql', '513_chat_messages_encryption.sql', '1000_chat_reply_threads_and_mentions.sql', '1391_chat_messages_subject.sql']) {
      const source = await readFile(migration(name), 'utf8');
      for (const sql of splitSqlStatements(stripSqlLineComments(source))) if (sql.trim()) await db.query(sql);
    }
    await db.query('ALTER TABLE users ADD role VARCHAR(50), ADD first_name VARCHAR(50), ADD last_name VARCHAR(50), ADD username VARCHAR(50), ADD profile_photo_path VARCHAR(255), ADD title VARCHAR(100)');
    await db.query("ALTER TABLE users ADD is_active TINYINT DEFAULT 1,ADD is_archived TINYINT DEFAULT 0,ADD status VARCHAR(30) DEFAULT 'active',ADD terminated_at DATETIME NULL,ADD status_expires_at DATETIME NULL");
    await db.query('ALTER TABLE agencies ADD is_active TINYINT DEFAULT 1,ADD is_archived TINYINT DEFAULT 0');
    await db.query("ALTER TABLE clients ADD status VARCHAR(30) DEFAULT 'active',ADD agency_id INT DEFAULT 450,ADD provider_id INT DEFAULT 1,ADD client_type VARCHAR(30) DEFAULT 'clinical',ADD guardian_portal_enabled TINYINT DEFAULT 1");
    await db.query('CREATE TABLE client_guardians(client_id INT,guardian_user_id INT,access_enabled TINYINT,relationship_type VARCHAR(30),permissions_json JSON)');
    await db.query('CREATE TABLE client_provider_assignments(client_id INT,provider_user_id INT,is_active TINYINT)');
    await db.query('CREATE TABLE client_service_enrollments(client_id INT,agency_id INT,provider_user_id INT,is_active TINYINT)');
    await db.query('ALTER TABLE chat_threads ADD organization_id INT NULL, ADD company_event_id INT NULL, ADD client_id INT NULL, ADD service_enrollment_id BIGINT NOT NULL DEFAULT 0, ADD message_channel VARCHAR(20) DEFAULT \'internal\'');
    const topicMigration = await readFile(migration('1417_messaging_delivery_threads.sql'), 'utf8');
    for (const sql of splitSqlStatements(stripSqlLineComments(topicMigration)).slice(0, 2)) await db.query(sql);
    const queueMigration = await readFile(migration('1380_hub_send_delay_and_queue.sql'), 'utf8');
    await db.query(splitSqlStatements(stripSqlLineComments(queueMigration)).find(sql => sql.startsWith('CREATE TABLE IF NOT EXISTS hub_message_queue')));
    const boundary = await readFile(migration('1556_secure_message_boundaries.sql'), 'utf8');
    for (const table of ['secure_message_events', 'client_secure_message_records']) await db.query(boundary.match(new RegExp(`CREATE TABLE ${table}[\\s\\S]*?;`))[0]);
    await db.query(await readFile(migration('1794_family_shared_conversations.sql'), 'utf8'));
    await db.query('CREATE TABLE chat_message_deletes(message_id INT, user_id INT)');
    await db.query('CREATE TABLE chat_message_attachments(id INT PRIMARY KEY,message_id INT,file_path VARCHAR(255),mime_type VARCHAR(100),file_kind VARCHAR(30),width INT,height INT,byte_size INT,original_filename VARCHAR(100),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
    await db.query('CREATE TABLE secure_message_notifications(chat_thread_id INT,recipient_user_id INT,message_id INT,first_read_at TIMESTAMP NULL,first_read_via VARCHAR(50))');
    await db.query('CREATE TABLE dependent_portal_threads(thread_id INT, client_id INT, service_id INT, agency_id INT)');
    await db.query('CREATE TABLE user_agencies(user_id INT, agency_id INT, is_active TINYINT DEFAULT 1)');
    await db.query("INSERT INTO users(id,role,first_name,last_name) VALUES(1,'provider','Fictional','Provider'),(2,'client_guardian','Original','Guardian'),(3,'client_guardian','Later','Guardian')");
    await db.query('INSERT INTO agencies(id) VALUES(450)'); await db.query('INSERT INTO clients(id) VALUES(10),(11)');
    await db.query('INSERT INTO user_agencies(user_id,agency_id) VALUES(1,450)');
  });
  afterAll(async () => { try { if (fixture) await fixture.close(); } finally { vi.unstubAllEnvs(); } });
  beforeEach(async () => {
    state.recordAccess = true; state.shared = null; state.currentServices = []; vi.clearAllMocks();
    prepareHubSend.mockResolvedValue({ userId: 2, clientId: 10, agencyId: 450, personKey: 'user:2' });
    familySharedConversations.currentAudience.mockImplementation(createFamilySharedConversations({ db,
      membership: async (clientId, agencyId) => Number(clientId) === 10 && Number(agencyId) === 450,
      services: async () => state.currentServices, clinical: async () => ({ scopes: ['clinical_messages'] }) }).currentAudience);
    ensureClientSecureConversation.mockResolvedValue({ threadId: 100, audienceUserIds: [1, 2] });
    resolveClientForSecureRecipients.mockResolvedValue(10);
    await db.query('SET FOREIGN_KEY_CHECKS=0');
    for (const table of ['chat_messages', 'chat_topics', 'chat_thread_participants', 'chat_threads', 'chat_thread_reads', 'chat_message_mentions', 'chat_message_deletes', 'client_secure_message_records', 'secure_message_events', 'secure_message_notifications', 'family_shared_conversations', 'hub_message_queue', 'client_guardians']) await db.query(`TRUNCATE ${table}`);
    await db.query('SET FOREIGN_KEY_CHECKS=1');
    await db.query("INSERT INTO chat_threads(id,agency_id,thread_type,client_id,message_channel) VALUES(100,450,'client_secure',10,'secure'),(200,450,'client_secure',11,'secure')");
    await db.query('INSERT INTO chat_thread_participants(thread_id,user_id) VALUES(100,1),(100,2),(200,1),(200,2)');
  });
  const create = async (subject = 'Fictional preparation', body = 'Fictional secure update') => {
    const result = await invoke(sendMessage, { body: { body, ...(subject === undefined ? {} : { subject }) } });
    expect(result.error).toBeUndefined(); expect(result.status).toBe(201); return result.data;
  };

  it('stores no plaintext subject/body and returns subject with exact root plus reply metadata', async () => {
    const root = await create();
    const [[stored]] = await db.execute('SELECT * FROM chat_messages WHERE id=?', [root.id]);
    expect(stored.subject).toBeNull(); expect(stored.body).toBeNull();
    expect(JSON.stringify(stored)).not.toContain('Fictional preparation'); expect(JSON.stringify(stored)).not.toContain('Fictional secure update');
    expect(readChatMessageContent(stored)).toEqual({ subject: 'Fictional preparation', body: 'Fictional secure update' });
    const reply = await invoke(sendMessage, { body: { body: 'Fictional reply', parentMessageId: root.id, subject: 'Ignored replacement title' } });
    expect(reply.error).toBeUndefined(); expect(reply.status).toBe(201);
    expect(reply.data).toMatchObject({ parent_message_id: root.id, subject: root.subject, body: 'Fictional reply' });
    const result = await invoke(listMessages);
    expect(result.error).toBeUndefined(); expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: root.id, subject: root.subject, reply_count: 1 });
    expect(result.data[0].last_reply_at).toBeInstanceOf(Date);
    const replies = await invoke(listMessages, { query: { parentMessageId: root.id } });
    expect(replies.data.map(message => message.id)).toEqual([reply.data.id]);
    expect(replies.data[0].subject).toBe(root.subject);
    for (const [, params] of Notification.create.mock.calls) expect(JSON.stringify(params || '')).not.toContain(root.subject);
    expect(JSON.stringify(Notification.create.mock.calls)).not.toContain(root.subject);
    const [events] = await db.query('SELECT * FROM secure_message_events');
    expect(JSON.stringify(events)).not.toContain(root.subject);
  });
  it('keeps distinct subjects as roots and flattens replies to the selected root only', async () => {
    const first = await create('First fictional topic'), second = await create('Second fictional topic');
    const reply = await invoke(sendMessage, { body: { body: 'First answer', parentMessageId: first.id } });
    const nested = await invoke(sendMessage, { body: { body: 'Follow-up answer', parentMessageId: reply.data.id } });
    expect(nested.error).toBeUndefined(); expect(nested.data.parent_message_id).toBe(first.id);
    const roots = await invoke(listMessages);
    expect(roots.data.map(message => [message.subject, message.reply_count])).toEqual([[first.subject, 2], [second.subject, 0]]);
    expect((await invoke(listMessages, { query: { parentMessageId: second.id } })).data).toEqual([]);
  });
  it('lists subject metadata without exposing bodies or marking unopened notifications read', async () => {
    const first = await create('First private subject', 'FIRST PRIVATE BODY'), second = await create('Second private subject', 'SECOND PRIVATE BODY');
    const reply = await invoke(sendMessage, { body: { body: 'PRIVATE REPLY BODY', parentMessageId: first.id } });
    for (const messageId of [first.id, second.id, reply.data.id]) await db.execute('INSERT INTO secure_message_notifications(chat_thread_id,recipient_user_id,message_id) VALUES(100,2,?)', [messageId]);
    const summary = await invoke(listMessages, { userId: 2, summaryOnly: true });
    expect(summary.error).toBeUndefined(); expect(summary.data).toHaveLength(2);
    expect(summary.data[0]).toMatchObject({ id: first.id, subject: first.subject, body: '', reply_count: 1, attachments: [] });
    const serialized = JSON.stringify(summary.data);
    for (const forbidden of ['FIRST PRIVATE BODY', 'SECOND PRIVATE BODY', 'PRIVATE REPLY BODY', 'body_ciphertext', 'body_iv', 'body_auth_tag', 'encryption_key_id']) expect(serialized).not.toContain(forbidden);
    const [before] = await db.query('SELECT * FROM secure_message_notifications'); expect(before.every(row => row.first_read_at === null)).toBe(true);
    const [events] = await db.query('SELECT event_type,message_id FROM secure_message_events WHERE actor_user_id=2');
    expect(events).toEqual([{ event_type: 'subject_list_viewed', message_id: null }]);
    const opened = await invoke(listMessages, { userId: 2, query: { messageId: second.id } });
    expect(opened.error).toBeUndefined(); expect(opened.data).toHaveLength(1); expect(opened.data[0]).toMatchObject({ id: second.id, body: 'SECOND PRIVATE BODY' });
    const [after] = await db.query('SELECT message_id,first_read_at FROM secure_message_notifications');
    expect(after.filter(row => row.first_read_at !== null).map(row => row.message_id)).toEqual([second.id]);
  });
  it('keeps per-viewer reply counts and latest dates aligned with replies deleted for that viewer',async()=>{
    const root=await create('Fictional reply-summary control');
    const visible=await invoke(sendMessage,{body:{body:'Visible earlier reply',parentMessageId:root.id}});
    const hidden=await invoke(sendMessage,{body:{body:'Later reply hidden for one guardian',parentMessageId:root.id}});
    expect(visible.error).toBeUndefined();expect(hidden.error).toBeUndefined();
    await db.execute("UPDATE chat_messages SET created_at='2026-11-14 10:00:00' WHERE id=?",[visible.data.id]);
    await db.execute("UPDATE chat_messages SET created_at='2026-11-14 11:00:00' WHERE id=?",[hidden.data.id]);
    await db.execute('INSERT INTO chat_message_deletes(message_id,user_id) VALUES(?,2)',[hidden.data.id]);
    const guardian=await invoke(listMessages,{userId:2,summaryOnly:true});
    expect(guardian.error).toBeUndefined();expect(guardian.data[0].reply_count).toBe(1);
    expect(guardian.data[0].last_reply_at.toISOString()).toBe('2026-11-14T10:00:00.000Z');
    const replies=await invoke(listMessages,{userId:2,query:{parentMessageId:root.id}});
    expect(replies.error).toBeUndefined();expect(replies.data.map(m=>m.id)).toEqual([visible.data.id]);
    const provider=await invoke(listMessages,{userId:1,summaryOnly:true});
    expect(provider.error).toBeUndefined();expect(provider.data[0].reply_count).toBe(2);
    expect(provider.data[0].last_reply_at.toISOString()).toBe('2026-11-14T11:00:00.000Z');
    await db.execute('INSERT INTO chat_message_deletes(message_id,user_id) VALUES(?,2)',[visible.data.id]);
    const allHidden=await invoke(listMessages,{userId:2,summaryOnly:true});
    expect(allHidden.error).toBeUndefined();expect(allHidden.data[0]).toMatchObject({reply_count:0,last_reply_at:null});
    expect((await invoke(listMessages,{userId:2,query:{parentMessageId:root.id}})).data).toEqual([]);
  });
  it('rejects hidden, wrong-thread and reply-as-root exact subject selection without read acknowledgement', async () => {
    const root = await create(), reply = await invoke(sendMessage, { body: { body: 'A reply', parentMessageId: root.id } });
    expect((await invoke(listMessages, { threadId: 200, query: { messageId: root.id } })).error).toMatchObject({ status: 404 });
    expect((await invoke(listMessages, { query: { messageId: reply.data.id } })).status).toBe(404);
    await db.query('INSERT INTO chat_thread_participants(thread_id,user_id) VALUES(100,3)');
    expect((await invoke(listMessages, { userId: 3, query: { messageId: root.id } })).error).toMatchObject({ status: 404 });
    const [[events]] = await db.query("SELECT COUNT(*) AS n FROM secure_message_events WHERE event_type='message_opened'"); expect(events.n).toBe(0);
  });
  it('opens an exact notified reply older than the latest60 without reading other subjects or replies', async () => {
    const root = await create('Long fictional conversation'), otherRoot = await create('Separate unread subject');
    const replyIds = [];
    for (let index = 0; index < 61; index++) {
      const encrypted = encryptChatContent({ body: `Fictional reply ${index}`, subject: root.subject });
      const [inserted] = await db.execute('INSERT INTO chat_messages(thread_id,sender_user_id,body,parent_message_id,body_ciphertext,body_iv,body_auth_tag,encryption_key_id) VALUES(100,1,NULL,?,?,?,?,?)', [root.id, encrypted.ciphertextB64, encrypted.ivB64, encrypted.authTagB64, encrypted.keyId]);
      replyIds.push(inserted.insertId);
      await db.execute('INSERT INTO client_secure_message_records(agency_id,client_id,thread_id,message_id,sender_user_id,audience_json) VALUES(450,10,100,?,1,?)', [inserted.insertId, JSON.stringify([{ id: 1 }, { id: 2 }])]);
    }
    for (const id of [root.id, otherRoot.id, ...replyIds]) await db.execute('INSERT INTO secure_message_notifications(chat_thread_id,recipient_user_id,message_id) VALUES(100,2,?)', [id]);
    const latest = await invoke(listMessages, { query: { parentMessageId: root.id } });
    expect(latest.error).toBeUndefined(); expect(latest.data).toHaveLength(60); expect(latest.data.some(reply => reply.id === replyIds[0])).toBe(false);
    const wrongParent = await invoke(listMessages, { userId: 2, query: { parentMessageId: otherRoot.id, replyMessageId: replyIds[0] } });
    expect(wrongParent.status).toBe(404);
    const opened = await invoke(listMessages, { userId: 2, query: { parentMessageId: root.id, replyMessageId: replyIds[0] } });
    expect(opened.error).toBeUndefined(); expect(opened.data).toHaveLength(1);
    expect(opened.data[0]).toMatchObject({ id: replyIds[0], parent_message_id: root.id, body: 'Fictional reply 0' });
    const [read] = await db.query('SELECT message_id FROM secure_message_notifications WHERE first_read_at IS NOT NULL');
    expect(read.map(message => message.message_id)).toEqual([replyIds[0]]);
    await db.query('INSERT INTO chat_thread_participants(thread_id,user_id) VALUES(100,3)');
    expect((await invoke(listMessages, { userId: 3, query: { parentMessageId: root.id, replyMessageId: replyIds[0] } })).error).toMatchObject({ status: 404 });
    expect((await invoke(listMessages, { threadId: 200, query: { parentMessageId: root.id, replyMessageId: replyIds[0] } })).error).toMatchObject({ status: 404 });
  });
  it.each([{ replyMessageId: 1 }, { parentMessageId: 'invalid', replyMessageId: 1 }, { parentMessageId: 1, replyMessageId: -1 },
    { parentMessageId: 1, replyMessageId: 1.5 }, { parentMessageId: 1, replyMessageId: 1, messageId: 2 }])('rejects invalid exact reply selections: %j', async query => {
    expect((await invoke(listMessages, { query })).status).toBe(400);
    const [[events]] = await db.query("SELECT COUNT(*) AS n FROM secure_message_events WHERE event_type='message_opened'"); expect(events.n).toBe(0);
  });
  it.each([{ messageId: 'bad' }, { messageId: -1 }, { messageId: 1.5 }, { messageId: 1, parentMessageId: 1 }])('rejects invalid or combined exact subject queries before reads: %j', async query => {
    expect((await invoke(listMessages, { query })).status).toBe(400);
    const [[events]] = await db.query("SELECT COUNT(*) AS n FROM secure_message_events WHERE event_type='message_opened'"); expect(events.n).toBe(0);
  });
  it('shows the decrypted subject in the provider Hub read path and retains its exact root', async () => {
    const root = await create('Provider Hub fictional subject');
    const reply = await invoke(sendMessage, { body: { body: 'Fictional Hub reply', parentMessageId: root.id } });
    const timeline = await loadChatTimeline({ agencyId: 450, actorUserId: 1, otherUserId: 2, channel: 'secure', clientId: 10 });
    expect(timeline).toHaveLength(2);
    expect(timeline.find(message => message.meta.messageId === root.id)).toMatchObject({ bodyPreview: root.body, meta: { subject: root.subject, legacyRootMessageId: root.id } });
    expect(timeline.find(message => message.meta.messageId === reply.data.id).meta).toMatchObject({ subject: root.subject, legacyRootMessageId: root.id });
  });
  it('keeps an existing provider subject on its original thread with client, recipient and snapshot guards', async () => {
    const root = await create('Existing subject');
    await db.execute('INSERT INTO chat_topics(id,thread_id,subject,created_by_user_id) VALUES(?,100,?,1)', ['old-topic-reference', 'Legacy stored subject']);
    await db.execute('UPDATE chat_messages SET topic_id=? WHERE id=?', ['old-topic-reference', root.id]);
    const input = { userId: 1, recipientUserId: 2, agencyId: 450, clientId: 10 };
    expect(await resolveSecureSubjectReply({ ...input, topicId: 'old-topic-reference' }, db)).toEqual({ threadId: 100, rootMessageId: root.id, topicId: 'old-topic-reference' });
    expect(await resolveSecureSubjectReply({ ...input, parentMessageId: root.id }, db)).toMatchObject({ threadId: 100, rootMessageId: root.id });
    for (const override of [{ clientId: 11 }, { agencyId: 451 }, { recipientUserId: 3 }]) {
      await expect(resolveSecureSubjectReply({ ...input, ...override, topicId: 'old-topic-reference' }, db)).rejects.toMatchObject({ status: 404 });
    }
    await db.query('INSERT INTO chat_thread_participants(thread_id,user_id) VALUES(100,3)');
    await expect(resolveSecureSubjectReply({ ...input, userId: 3, parentMessageId: root.id }, db)).rejects.toMatchObject({ status: 404 });
    const [[count]] = await db.query('SELECT COUNT(*) AS n FROM chat_threads'); expect(count.n).toBe(2);
  });
  it('provider Hub creates encrypted roots without plaintext chat_topics and replies on their existing source', async () => {
    const input = { method: 'secure', personKey: 'user:2', agencyId: 450, clientId: 10, body: 'Provider fictional body', subject: 'Provider confidential subject', newTopic: true, skipUndo: true };
    const created = await invoke(postMessagesHubSend, { body: input });
    expect(created.error).toBeUndefined(); expect(created.data).toMatchObject({ ok: true, chat: { subject: input.subject, parent_message_id: null } });
    const rootId = created.data.chat.id;
    const [[topicCount]] = await db.query('SELECT COUNT(*) AS n FROM chat_topics'); expect(topicCount.n).toBe(0);
    // A current/default thread may differ from an earlier subject. Reply must
    // preserve the selected source rather than opening a new empty feed.
    ensureClientSecureConversation.mockClear(); ensureClientSecureConversation.mockResolvedValue({ threadId: 200, audienceUserIds: [1, 2] });
    const reply = await invoke(postMessagesHubSend, { body: { ...input, newTopic: false, legacyRootMessageId: rootId, subject: 'Must inherit root', body: 'Provider follow-up' } });
    expect(reply.error).toBeUndefined(); expect(reply.data.chat).toMatchObject({ thread_id: 100, parent_message_id: rootId, subject: input.subject });
    expect(ensureClientSecureConversation).not.toHaveBeenCalled();
    await db.execute('INSERT INTO chat_topics(id,thread_id,subject,created_by_user_id) VALUES(?,100,?,1)', ['old-topic-reference', 'Legacy stored subject']);
    await db.execute('UPDATE chat_messages SET topic_id=? WHERE id=?', ['old-topic-reference', rootId]);
    const legacyReply = await invoke(postMessagesHubSend, { body: { ...input, newTopic: false, topicId: 'old-topic-reference', body: 'Legacy topic follow-up' } });
    expect(legacyReply.error).toBeUndefined(); expect(legacyReply.data.chat).toMatchObject({ thread_id: 100, parent_message_id: rootId, subject: input.subject });
    const [stored] = await db.query('SELECT * FROM chat_messages');
    expect(stored).toHaveLength(3); expect(stored.every(message => message.subject === null && message.body === null)).toBe(true);
  });
  it('client-tile send resolves an existing eligible guardian without creating a child account or invitation', async () => {
    await db.query("INSERT INTO client_guardians VALUES(10,2,1,'mother',JSON_OBJECT()),(10,3,1,'father',JSON_OBJECT())");
    await db.query('INSERT INTO chat_thread_participants(thread_id,user_id) VALUES(100,3)');
    const tile = { userId: null, email: null, clientId: 10, agencyId: 450, kinds: ['client'], sharedSecureAvailable: true, personKey: 'client:10@450' };
    prepareHubSend.mockImplementation(async ({ personKey }) => personKey === tile.personKey ? tile : { userId: 2, clientId: null, agencyId: 450, personKey });
    state.shared = { threadId: 100, clientId: 10, agencyId: 450, audienceUserIds: [1, 2, 3] };
    const body = { method: 'secure', personKey: tile.personKey, agencyId: 450, clientId: 10, subject: 'Client tile fictional subject', body: 'Fictional client tile update', newTopic: true, skipUndo: true, expectedRecipientUserIds: [2, 3] };
    const result = await invoke(postMessagesHubSend, { body });
    expect(result.error).toBeUndefined(); expect(result.data).toMatchObject({ ok: true, person: { userId: 2, clientId: 10 }, chat: { thread_id: 100, subject: body.subject } });
    expect(prepareHubSend).toHaveBeenLastCalledWith(expect.objectContaining({ personKey: 'user:2@450', method: 'secure' }));
    expect(sendHubPortalInvitation).not.toHaveBeenCalled();
    const [[users]] = await db.query('SELECT COUNT(*) AS n FROM users'); expect(users.n).toBe(3);
    const [[record]] = await db.query('SELECT client_id,audience_json FROM client_secure_message_records');
    expect(record.client_id).toBe(10); expect(record.audience_json.map(person => person.id).sort()).toEqual([1, 2, 3]);
    const mismatch = await invoke(postMessagesHubSend, { body: { ...body, expectedRecipientUserIds: [2] } });
    expect(mismatch.error).toMatchObject({ status: 409, code: 'FAMILY_SHARED_AUDIENCE_REVIEW_REQUIRED' });
    const [[count]] = await db.query('SELECT COUNT(*) AS n FROM chat_messages'); expect(count.n).toBe(1);
    const wrongChild = await invoke(postMessagesHubSend, { body: { ...body, clientId: 11 } });
    expect(wrongChild.data?.error || wrongChild.error).toBeTruthy(); expect(wrongChild.status).toBe(403);
    const unrelated = await invoke(postMessagesHubSend, { userId: 99, body: { ...body } });
    expect(unrelated.data?.error || unrelated.error).toBeTruthy(); expect(unrelated.status).toBe(403);
    const queued = await invoke(postMessagesHubSend, { body: { ...body, skipUndo: false, undoDelaySeconds: 1 } });
    expect(queued.error).toBeUndefined(); expect(queued.data.queued).toBe(true);
    const [[saved]] = await db.query('SELECT * FROM hub_message_queue');
    expect(saved.person_key).toBe(tile.personKey); // Keep tile undo/history identity.
    expect(openQueuedMessage(saved).payload_json).toMatchObject({ recipientPersonKey: 'user:2@450', clientId: 10, expectedRecipientUserIds: [2, 3] });
    await db.query('UPDATE hub_message_queue SET scheduled_send_at=DATE_SUB(NOW(),INTERVAL 1 SECOND)');
    expect(await processHubMessageQueue()).toMatchObject({ sent: 1, failed: 0 });
    // Rows queued before recipient pinning must use the same safe resolution.
    const legacyQueued = await enqueueHubMessage({ agencyId: 450, userId: 1, personKey: tile.personKey, channel: 'secure',
      body: 'Earlier queued client-tile message', subject: 'Earlier queued subject',
      payload: { clientId: 10, threadId: 100, expectedRecipientUserIds: [2, 3] }, scheduledSendAt: new Date(Date.now() - 2000) });
    await db.execute("UPDATE hub_message_queue SET status='queued',scheduled_send_at=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE id=?", [legacyQueued.id]);
    expect(await processHubMessageQueue()).toMatchObject({ sent: 1, failed: 0 });
    const [[afterUsers]] = await db.query('SELECT COUNT(*) AS n FROM users'); expect(afterUsers.n).toBe(3);
    await db.query('DELETE FROM client_guardians');
    const noLongerEligible = await invoke(postMessagesHubSend, { body: { ...body } });
    expect(noLongerEligible.status).toBe(403);
    expect(sendHubPortalInvitation).not.toHaveBeenCalled();
  });
  it('client-tile recipient and attachment preflight uses the existing family account and keeps the selected service', async () => {
    await db.query("INSERT INTO client_guardians VALUES(10,2,1,'mother',JSON_OBJECT()),(10,3,1,'father',JSON_OBJECT())");
    state.currentServices = [{ id: 20, is_active: 1, service_kind: 'counseling', provider_user_id: 1, agency_id: 450 }];
    const tile = { userId: null, email: null, clientId: 10, agencyId: 450, kinds: ['client'], sharedSecureAvailable: true, personKey: 'client:10@450' };
    prepareHubSend.mockImplementation(async ({ personKey }) => personKey === tile.personKey ? tile : { userId: 2, clientId: null, agencyId: 450, personKey });
    const participants = [{ id: 1, role: 'provider', required: true }, { id: 2, role: 'guardian', required: true }, { id: 3, role: 'guardian', required: true }];
    ensureClientSecureConversation.mockImplementation(async context => ({ threadId: 100, clientId: context.clientId, agencyId: context.agencyId, serviceId: context.serviceId,
      audienceUserIds: [1, 2, 3], participants }));
    const body = { method: 'secure', personKey: tile.personKey, agencyId: 450, clientId: 10, serviceId: 20 };
    const result = await invoke(postMessagesHubEnsureThread, { body });
    expect(result.error).toBeUndefined(); expect(result.data).toMatchObject({ ok: true, threadId: 100, shared: true, clientId: 10, serviceId: 20, agencyId: 450,
      person: { userId: 2, clientId: 10 }, participants, sharingPolicy: 'all_eligible_family' });
    expect(ensureClientSecureConversation).toHaveBeenLastCalledWith({ clientId: 10, actorUserId: 1, agencyId: 450, serviceId: 20 });
    expect(prepareHubSend).toHaveBeenLastCalledWith(expect.objectContaining({ personKey: 'user:2@450', method: 'secure' }));
    expect(sendHubPortalInvitation).not.toHaveBeenCalled();
    const [[users]] = await db.query('SELECT COUNT(*) AS n FROM users'), [[messages]] = await db.query('SELECT COUNT(*) AS n FROM chat_messages');
    expect(users.n).toBe(3); expect(messages.n).toBe(0);
    expect((await invoke(postMessagesHubEnsureThread, { body: { ...body, clientId: 11 } })).status).toBe(403);
    expect((await invoke(postMessagesHubEnsureThread, { userId: 99, body: { ...body } })).status).toBe(403);
    await db.query('UPDATE client_guardians SET access_enabled=0');
    expect((await invoke(postMessagesHubEnsureThread, { body: { ...body } })).status).toBe(403);
    expect(sendHubPortalInvitation).not.toHaveBeenCalled();
  });
  it('retains the legacy invitation fallback for a genuinely new non-client contact', async () => {
    prepareHubSend.mockImplementation(async ({ personKey }) => personKey === 'contact:77@450'
      ? { userId: null, clientId: null, agencyId: 450, personKey, kinds: ['contact'] }
      : { userId: 2, clientId: 10, agencyId: 450, personKey });
    sendHubPortalInvitation.mockResolvedValue({ personKey: 'user:2@450' });
    const result = await invoke(postMessagesHubSend, { body: { method: 'secure', personKey: 'contact:77@450', agencyId: 450, subject: 'New contact fictional subject', body: 'Fictional update', skipUndo: true } });
    expect(result.error).toBeUndefined(); expect(result.data.ok).toBe(true);
    expect(sendHubPortalInvitation).toHaveBeenCalledOnce();
    expect(sendHubPortalInvitation).toHaveBeenCalledWith(expect.objectContaining({ personKey: 'contact:77@450', skipEmail: true }));
    expect(familySharedConversations.currentAudience).not.toHaveBeenCalled();
  });
  it('dispatches a previously accepted subjectless queue without grandfathering a new HTTP send',async()=>{
    await enqueueHubMessage({agencyId:450,userId:1,personKey:'user:2',channel:'secure',body:'Previously accepted update',subject:null,
      payload:{clientId:10,threadId:100,expectedRecipientUserIds:[2]},scheduledSendAt:new Date(Date.now()-1000)});
    state.shared={threadId:100,clientId:10,agencyId:450,audienceUserIds:[1,2]};
    // Make only this isolated fixture due in the database's own timezone.
    await db.query('UPDATE hub_message_queue SET scheduled_send_at=DATE_SUB(NOW(),INTERVAL 1 SECOND)');
    expect(await processHubMessageQueue()).toMatchObject({sent:1,failed:0});
    const roots=await invoke(listMessages);expect(roots.error).toBeUndefined();expect(roots.data).toHaveLength(1);
    expect(roots.data[0]).toMatchObject({subject:null,body:'Previously accepted update'});
  });
  it('keeps a queued reply root encrypted through queue storage and actual worker dispatch', async () => {
    const root = await create('Queued fictional subject');
    const queued = await invoke(postMessagesHubSend, { body: { method: 'secure', personKey: 'user:2', agencyId: 450,
      clientId: 10, body: 'Queued fictional reply', subject: root.subject, legacyRootMessageId: root.id, undoDelaySeconds: 1,
      expectedRecipientUserIds: [2] } });
    expect(queued.error).toBeUndefined(); expect(queued.data).toMatchObject({ ok: true, queued: true });
    const [[saved]] = await db.query('SELECT * FROM hub_message_queue');
    expect(saved.subject).toBeNull(); expect(saved.body).toBeNull();
    expect(JSON.stringify(saved)).not.toContain(root.subject); expect(JSON.stringify(saved)).not.toContain('Queued fictional reply');
    expect(openQueuedMessage(saved).payload_json).toMatchObject({ threadId: 100, parentMessageId: root.id, expectedRecipientUserIds: [2], secureSubjectRequired:true });
    state.shared = { threadId: 100, clientId: 10, agencyId: 450, audienceUserIds: [1, 2] };
    // Only the disposable queue fixture is made due; no clock is changed.
    await db.query('UPDATE hub_message_queue SET scheduled_send_at=DATE_SUB(NOW(),INTERVAL 1 SECOND)');
    expect(await processHubMessageQueue()).toMatchObject({ sent: 1, failed: 0 });
    const replies = await invoke(listMessages, { query: { parentMessageId: root.id } });
    expect(replies.error).toBeUndefined(); expect(replies.data).toHaveLength(1);
    expect(replies.data[0]).toMatchObject({ parent_message_id: root.id, subject: root.subject, body: 'Queued fictional reply' });
  });
  it('shows per-subject unread counts without marking bodies read, including unread replies and hidden messages',async()=>{
    const root=await create();
    let summary=await invoke(listMessages,{userId:2,summaryOnly:true});
    expect(summary.error).toBeUndefined();expect(summary.data[0].unread_count).toBe(1);
    expect(summary.data[0].body).toBe('');
    await invoke(listMessages,{userId:2,query:{messageId:root.id}});
    summary=await invoke(listMessages,{userId:2,summaryOnly:true});expect(summary.data[0].unread_count).toBe(0);
    const reply=await invoke(sendMessage,{body:{body:'A new reply',parentMessageId:root.id}});expect(reply.error).toBeUndefined();
    summary=await invoke(listMessages,{userId:2,summaryOnly:true});expect(summary.data[0].unread_count).toBe(1);
    await db.execute('INSERT INTO chat_message_deletes(message_id,user_id) VALUES(?,2)',[reply.data.id]);
    summary=await invoke(listMessages,{userId:2,summaryOnly:true});expect(summary.data[0].unread_count).toBe(0);
  });
  it('reads encrypted subjects through the chart archive without weakening record access', async () => {
    const root = await create();
    // The archive includes attachment metadata, independently of the timeline.
    const result = await invoke(getClientSecureMessage, { messageId: root.id, query: { agencyId: 450 } });
    expect(result.error).toBeUndefined(); expect(result.data.message).toMatchObject({ id: root.id, subject: root.subject, body: root.body });
    state.recordAccess = false;
    const denied = await invoke(getClientSecureMessage, { messageId: root.id, query: { agencyId: 450 } });
    expect(denied.error).toMatchObject({ status: 403 }); expect(denied.data).toBeUndefined();
  });
  it.each([undefined, null, '', '   ', 'x'.repeat(201), 'First\nsecond', 'Title\u0000', 42])('rejects invalid supplied root subject before creating any message: %j', async subject => {
    const result = await invoke(sendMessage, { body: { subject, body: 'Fictional body' } });
    expect(result.error).toMatchObject({ status: 400, code: 'SECURE_MESSAGE_SUBJECT_INVALID' });
    const [[count]] = await db.query('SELECT COUNT(*) AS n FROM chat_messages'); expect(count.n).toBe(0);
  });
  it('accepts exactly 200 Unicode codepoints and rejects a new subject-omitting caller', async () => {
    const root = await create('🔒'.repeat(200)); expect(Array.from(root.subject)).toHaveLength(200);
    const oldCaller = await invoke(sendMessage, { body: { body: 'Legacy caller body' } });
    expect(oldCaller.error).toMatchObject({status:400,code:'SECURE_MESSAGE_SUBJECT_INVALID'});
    const [[count]]=await db.query('SELECT COUNT(*) AS n FROM chat_messages');expect(count.n).toBe(1);
  });
  it('does not allow an HTTP body flag to bypass the new subject requirement',async()=>{
    const result=await invoke(sendMessage,{body:{body:'No new subject',trustedLegacyQueuedSubject:true}});
    expect(result.error).toMatchObject({status:400,code:'SECURE_MESSAGE_SUBJECT_INVALID'});
  });
  it('reads legacy subjects and never treats a legacy JSON body as structured message content', async () => {
    const literal = JSON.stringify({ version: 1, type: 'secure_message', body: 'literal body', subject: 'literal subject' });
    const encrypted = encryptChatText(literal);
    await db.execute('INSERT INTO chat_messages(thread_id,sender_user_id,body,subject,body_ciphertext,body_iv,body_auth_tag,encryption_key_id) VALUES(100,1,NULL,?,?,?,?,?)', ['Legacy title', encrypted.ciphertextB64, encrypted.ivB64, encrypted.authTagB64, encrypted.keyId]);
    const result = await invoke(listMessages);
    expect(result.error).toBeUndefined(); expect(result.data[0]).toMatchObject({ subject: 'Legacy title', body: literal });
  });
  it('rejects cross-thread roots and snapshot-ineligible replies without creating messages', async () => {
    const root = await create();
    const crossThread = await invoke(sendMessage, { threadId: 200, body: { body: 'Wrong child reply', parentMessageId: root.id } });
    expect(crossThread.error).toMatchObject({ status: 400 });
    await db.query('INSERT INTO chat_thread_participants(thread_id,user_id) VALUES(100,3)');
    const forbidden = await invoke(sendMessage, { userId: 3, body: { body: 'Not in original audience', parentMessageId: root.id } });
    expect(forbidden.error).toMatchObject({ status: 404, code: 'SECURE_MESSAGE_NOT_AVAILABLE' });
    expect((await invoke(listMessages, { userId: 3 })).data).toEqual([]);
    const [[count]] = await db.query('SELECT COUNT(*) AS n FROM chat_messages'); expect(count.n).toBe(1);
  });
});
