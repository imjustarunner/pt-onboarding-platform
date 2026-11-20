import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { isolatedWorkflowMysql, recoveryMysqlEnabled } from './fixtures/isolatedWorkflowMysql.js';
import CommunicationConversation from '../../models/CommunicationConversation.model.js';
import { personalConversationUnreadSql } from '../groupEmailConversationPolicy.js';

const database = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: database }));

describe.skipIf(!recoveryMysqlEnabled)('SMS read receipts', () => {
  let fixture;
  beforeAll(async () => {
    fixture = await isolatedWorkflowMysql('sms_conversation_read');
    database.execute.mockImplementation((...args) => fixture.db.execute(...args));
    for (const sql of [
      'CREATE TABLE communication_conversations (id INT PRIMARY KEY, agency_id INT, channel VARCHAR(16), external_thread_id VARCHAR(100))',
      'CREATE TABLE communication_conversation_reads (conversation_id INT, user_id INT, last_read_at DATETIME, forced_unread TINYINT, PRIMARY KEY (conversation_id, user_id))',
      'CREATE TABLE communication_messages (conversation_id INT, direction VARCHAR(16), is_internal_note TINYINT, send_status VARCHAR(16), sent_at DATETIME, created_at DATETIME)',
      'CREATE TABLE message_logs (id INT PRIMARY KEY, agency_id INT, sms_thread_key VARCHAR(100), direction VARCHAR(16), created_at DATETIME)',
      "INSERT INTO communication_conversations VALUES (10, 2, 'sms', 'line-a'), (20, 2, 'sms', 'line-b')",
      `INSERT INTO message_logs VALUES
        (101, 2, 'line-a', 'INBOUND', '2026-11-20 10:00:00'),
        (102, 2, 'line-a', 'INBOUND', '2026-11-20 10:01:00'),
        (103, 2, 'line-b', 'INBOUND', '2026-11-20 10:02:00'),
        (104, 3, 'line-a', 'INBOUND', '2026-11-20 10:03:00')`
    ]) await fixture.db.execute(sql);
  });
  afterAll(async () => { await fixture?.close(); });

  async function unread(userId) {
    const [rows] = await fixture.db.execute(`SELECT id FROM communication_conversations c
      WHERE ${personalConversationUnreadSql(userId)} ORDER BY id`);
    return rows.map(row => row.id);
  }

  it('marks the authorized thread through the displayed message and preserves other readers and threads', async () => {
    await CommunicationConversation.markSmsReadThrough(10, 4, 101);
    expect(await unread(4)).toEqual([10, 20]);
    await CommunicationConversation.markSmsReadThrough(10, 4, 103);
    await CommunicationConversation.markSmsReadThrough(10, 4, 104);
    expect(await unread(4)).toEqual([10, 20]);
    await CommunicationConversation.markSmsReadThrough(10, 4, 102);
    await CommunicationConversation.markSmsReadThrough(10, 4, 101);
    expect(await unread(4)).toEqual([20]);
    expect(await unread(5)).toEqual([10, 20]);
  });
});
