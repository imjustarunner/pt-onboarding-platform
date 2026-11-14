import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { isolatedWorkflowMysql, recoveryMysqlEnabled } from './fixtures/isolatedWorkflowMysql.js';
import { splitSqlStatements, stripSqlLineComments } from '../../utils/migrationSql.js';

const state = vi.hoisted(() => ({ db: null, beforeCancelUpdate: null }));
vi.mock('../../config/database.js', () => ({ default: { execute: async (sql, ...args) => {
  if (sql.includes("SET status = 'cancelled'") && state.beforeCancelUpdate) {
    const hook = state.beforeCancelUpdate; state.beforeCancelUpdate = null; await hook();
  }
  return state.db.execute(sql, ...args);
} } }));
import { enqueueHubMessage, findHubQueueItem, listHubQueuedMessages, listHubQueuedForPerson,
  countHubQueuedMessages, listDueHubQueue, claimHubQueueRow, cancelHubQueuedMessage, markHubQueueSent, markHubQueueFailed } from '../hubMessageQueue.service.js';

describe.skipIf(!recoveryMysqlEnabled)('secure Hub queue rolling-worker protocol on isolated MySQL', () => {
  let fixture, db;
  beforeAll(async () => {
    vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 7).toString('base64'));
    fixture = await isolatedWorkflowMysql('hub_queue_protocol'); db = fixture.db; state.db = db;
    const migration = await readFile(new URL('../../../../database/migrations/1380_hub_send_delay_and_queue.sql', import.meta.url), 'utf8');
    await db.query(splitSqlStatements(stripSqlLineComments(migration)).find(sql => sql.startsWith('CREATE TABLE IF NOT EXISTS hub_message_queue')));
  });
  afterAll(async () => { try { if (fixture) await fixture.close(); } finally { vi.unstubAllEnvs(); } });
  beforeEach(async () => { state.beforeCancelUpdate = null; await db.query('TRUNCATE hub_message_queue'); });
  const enqueue = (overrides = {}) => enqueueHubMessage({ agencyId: 450, userId: 1, personKey: 'client:10@450', channel: 'secure',
    body: 'Fictional protected queue body', subject: 'Fictional protected queue subject',
    payload: { clientId: 10, threadId: 100, recipientPersonKey: 'user:2@450', expectedRecipientUserIds: [2] },
    scheduledSendAt: new Date(Date.now() + 60000), ...overrides });
  const due = async () => db.query('UPDATE hub_message_queue SET scheduled_send_at=DATE_SUB(NOW(),INTERVAL 1 SECOND)');

  it('writes the new secure protocol while preserving encrypted storage and the owner queued API contract', async () => {
    const item = await enqueue();
    expect(item).toMatchObject({ status: 'queued', body: 'Fictional protected queue body', subject: 'Fictional protected queue subject' });
    const [[row]] = await db.query('SELECT * FROM hub_message_queue WHERE id=?', [item.id]);
    expect(row.status).toBe('queued_secure'); expect(row.status.length).toBeLessThanOrEqual(16);
    expect(row.body).toBeNull(); expect(row.subject).toBeNull();
    for (const secret of ['Fictional protected queue body', 'Fictional protected queue subject', 'user:2@450']) expect(JSON.stringify(row)).not.toContain(secret);
    expect(await findHubQueueItem(item.id)).toMatchObject({ status: 'queued', payload_json: { recipientPersonKey: 'user:2@450' } });
  });

  it('is invisible to an old worker SELECT and unclaimable by its UPDATE, then current workers claim once', async () => {
    const secure = await enqueue(), internal = await enqueue({ channel: 'internal', personKey: 'user:8@450' }); await due();
    // These are the exact retired worker predicates, executed by MySQL rather
    // than simulated by a mock or by an in-memory status check.
    const [oldDue] = await db.query("SELECT id FROM hub_message_queue WHERE status = 'queued' AND scheduled_send_at <= NOW()");
    expect(oldDue.map(row => row.id)).toEqual([internal.id]);
    const [oldClaim] = await db.execute("UPDATE hub_message_queue SET status='sending' WHERE id=? AND status='queued'", [secure.id]);
    expect(oldClaim.affectedRows).toBe(0);
    expect((await listDueHubQueue()).map(row => row.id).sort()).toEqual([secure.id, internal.id].sort());
    const claims = await Promise.all([claimHubQueueRow(secure.id), claimHubQueueRow(secure.id)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect((await findHubQueueItem(secure.id)).status).toBe('sending');
    await markHubQueueSent(secure.id); expect(await claimHubQueueRow(secure.id)).toBe(false);
    expect((await findHubQueueItem(secure.id)).status).toBe('sent');
  });

  it('lists, counts and cancels both queue protocols only for the owner and selected person/agency', async () => {
    const secure = await enqueue(), legacy = await enqueue({ personKey: 'user:2@450' }), internal = await enqueue({ channel: 'internal' });
    await db.execute("UPDATE hub_message_queue SET status='queued' WHERE id=?", [legacy.id]);
    await enqueue({ userId: 2 }); await enqueue({ agencyId: 451 });
    expect(await countHubQueuedMessages({ userId: 1, agencyId: 450 })).toBe(3);
    const owner = await listHubQueuedMessages({ userId: 1, agencyId: 450 });
    expect(owner.map(row => row.id).sort()).toEqual([secure.id, legacy.id, internal.id].sort()); expect(owner.every(row => row.status === 'queued')).toBe(true);
    expect((await listHubQueuedForPerson({ userId: 1, agencyId: 450, personKey: 'client:10@450' })).map(row => row.id).sort()).toEqual([secure.id, internal.id].sort());
    await expect(cancelHubQueuedMessage({ id: secure.id, userId: 2 })).rejects.toMatchObject({ status: 403 });
    expect(await cancelHubQueuedMessage({ id: secure.id, userId: 1 })).toMatchObject({ cancelled: true, body: 'Fictional protected queue body', payload: { recipientPersonKey: 'user:2@450' } });
    expect((await findHubQueueItem(secure.id)).status).toBe('cancelled');
    expect(await cancelHubQueuedMessage({ id: legacy.id, userId: 1 })).toMatchObject({ cancelled: true });
    expect(await countHubQueuedMessages({ userId: 1, agencyId: 450 })).toBe(1);
  });

  it('keeps Undo from overwriting a worker claim made after the owner read', async () => {
    const item = await enqueue();
    state.beforeCancelUpdate = async () => expect(await claimHubQueueRow(item.id)).toBe(true);
    await expect(cancelHubQueuedMessage({ id: item.id, userId: 1 })).rejects.toMatchObject({ status: 409 });
    expect((await findHubQueueItem(item.id)).status).toBe('sending');
    expect(await claimHubQueueRow(item.id)).toBe(false);
  });

  it('continues processing nonsecure and legacy secure rows without requeueing failed or sent attempts', async () => {
    const legacy = await enqueue(), internal = await enqueue({ channel: 'internal' }), sms = await enqueue({ channel: 'sms' });
    const failed = await enqueue(), sent = await enqueue();
    await db.execute("UPDATE hub_message_queue SET status='queued' WHERE id=?", [legacy.id]);
    await markHubQueueFailed(failed.id, 'Prior attempt failed; manual review required'); await markHubQueueSent(sent.id); await due();
    const jobs = await listDueHubQueue(); expect(jobs.map(row => row.id).sort()).toEqual([legacy.id, internal.id, sms.id].sort());
    for (const row of jobs) expect(await claimHubQueueRow(row.id)).toBe(true);
    for (const item of [failed, sent]) expect(await claimHubQueueRow(item.id)).toBe(false);
    expect((await findHubQueueItem(failed.id))).toMatchObject({ status: 'failed', error_message: 'Prior attempt failed; manual review required' });
    expect((await findHubQueueItem(sent.id)).status).toBe('sent');
    const [raw] = await db.query('SELECT channel,status FROM hub_message_queue WHERE id IN (?,?)', [internal.id, sms.id]);
    expect(raw.every(row => row.status === 'sending')).toBe(true);
  });
});
