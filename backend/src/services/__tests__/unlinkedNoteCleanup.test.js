import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: {} }));
vi.mock('../chatEncryption.service.js', () => ({ decryptChatText: vi.fn(() => { throw new Error('Unavailable key'); }) }));
import { createUnlinkedNoteCleanup } from '../unlinkedNoteCleanup.service.js';

const actor = { id: 501, role: 'super_admin' };
let drafts, queue, notes, ratings, role, audits, conn, db, clinical, cleanup, failAudit;
const draft = (id, extra = {}) => ({ id, user_id: 501, agency_id: 7, client_id: 90, initials: 'T. E.',
  date_of_service: '2026-09-12', service_code: '90837', updated_at: '2026-11-17T18:00:00Z', content_revision: 'abc', ...extra });
const work = (id, extra = {}) => ({ id, user_id: 501, client_id: 90, client_key: `test_${id}`,
  status: 'started', payload_enc: '{}', ...extra });
const selection = items => items.map(({ kind, id, version }) => ({ kind, id, version }));

beforeEach(() => {
  drafts = [draft(1), draft(2, { clinical_session_id: 10 }), draft(3, { office_event_id: 11 }), draft(4, { user_id: 999 })];
  queue = [work(21, { draft_id: 1 }), work(22), work(23, { clinical_session_id: 10, draft_id: 2 })];
  notes = []; ratings = []; role = 'super_admin'; audits = []; failAudit = false;
  let snapshot;
  const execute = vi.fn(async (sql, params) => {
    if (sql.startsWith('SELECT id, role')) return [[{ id: 501, role, is_active: 1, is_archived: 0 }]];
    if (sql.includes('FROM clinical_note_drafts WHERE')) {
      expect(sql).toContain('clinical_session_id IS NULL AND office_event_id IS NULL');
      return [drafts.filter(row => row.user_id === params[0] && !row.clinical_session_id && !row.office_event_id)];
    }
    if (sql.includes('SELECT q.*')) return [queue.filter(row => row.user_id === params[0]
      || drafts.some(item => item.id === row.draft_id && item.user_id === params[1]))];
    if (sql.startsWith('DELETE FROM note_aid_work_queue_items')) {
      const before = queue.length;
      queue = queue.filter(row => row.user_id !== params[0] || !params.slice(1).includes(row.id));
      return [{ affectedRows: before - queue.length }];
    }
    if (sql.startsWith('DELETE FROM clinical_note_drafts')) {
      const before = drafts.length;
      drafts = drafts.filter(row => row.user_id !== params[0] || !params.slice(1).includes(row.id));
      return [{ affectedRows: before - drafts.length }];
    }
    if (sql.startsWith('INSERT INTO user_activity_log')) {
      if (failAudit) throw new Error('Audit unavailable');
      audits.push(params); return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  conn = { execute, beginTransaction: vi.fn(async () => { snapshot = structuredClone({ drafts, queue, audits }); }),
    commit: vi.fn(), rollback: vi.fn(async () => { ({ drafts, queue, audits } = snapshot); }), release: vi.fn() };
  db = { execute, getConnection: vi.fn(async () => conn) };
  clinical = { execute: vi.fn(async sql => [sql.includes('FROM clinical_notes') ? notes : ratings]) };
  cleanup = createUnlinkedNoteCleanup({ db, clinical });
});

it('previews only own unlinked drafts and queue-only items without note text or queue payloads', async () => {
  const result = await cleanup.preview(actor);
  expect(result.items.map(row => [row.kind, row.id])).toEqual([['draft', 1], ['work_queue', 22]]);
  expect(result.items[0]).toMatchObject({ workQueueCount: 1, dateOfService: '2026-09-12' });
  expect(JSON.stringify(result)).not.toMatch(/payload_enc|content_revision|queueKeys|queueIds/);
  expect(conn.beginTransaction).not.toHaveBeenCalled();
});

it.each(['admin', 'provider', 'assistant'])('denies %s without accessing note records', async role => {
  await expect(cleanup.preview({ ...actor, role })).rejects.toMatchObject({ status: 403 });
  expect(db.execute).not.toHaveBeenCalled();
});
it('checks the current database role rather than trusting a stale superadmin session', async () => {
  role = 'admin';
  await expect(cleanup.preview(actor)).rejects.toMatchObject({ status: 403 });
});
it.each([
  { clinical_session_id: 12 }, { office_event_id: 13 }, { clinical_note_id: 14 }, { task_id: 15 },
  { signed_at: '2026-11-17' }, { status: 'signed' }, { user_id: 999 },
  { payload_enc: '{bad JSON' }, { payload_enc: '{"_enc":true}' },
  { payload_enc: '{"appointmentId":99}' }, { payload_enc: '{"clinicalSessionId":99}' }
])('protects a draft when any of its queue references has protected or unreadable evidence: %j', async extra => {
  queue[0] = { ...queue[0], ...extra };
  const { items } = await cleanup.preview(actor);
  expect(items.find(item => item.kind === 'draft' && item.id === 1)).toBeUndefined();
});
it('protects drafts used in chart records or objective ratings, even when the draft has no session ID', async () => {
  notes = [{ draft_id: '1' }];
  expect((await cleanup.preview(actor)).items.every(item => item.kind !== 'draft')).toBe(true);
  notes = []; ratings = [{ draft_id: 1 }];
  expect((await cleanup.preview(actor)).items.every(item => item.kind !== 'draft')).toBe(true);
  expect(clinical.execute.mock.calls.some(([sql]) => /DELETE|UPDATE/.test(sql))).toBe(false);
});
it('deletes reviewed drafts and related queue rows together, preserves session records and records the actual clicking actor', async () => {
  const { items } = await cleanup.preview(actor);
  const result = await cleanup.remove(actor, selection(items), { ipAddress: '127.0.0.1', sessionId: 'test-session' });
  expect(result).toMatchObject({ deletedDraftIds: [1], deletedWorkQueueIds: [21, 22], clientIds: [90] });
  expect(drafts.map(row => row.id)).toEqual([2, 3, 4]);
  expect(queue.map(row => row.id)).toEqual([23]);
  expect(audits[0].slice(0, 3)).toEqual(['note_aid_unlinked_test_cleanup_deleted', 501, '127.0.0.1']);
  expect(JSON.parse(audits[0][5])).toMatchObject({ deletedDraftIds: [1], scope: 'own_unlinked_drafts_and_work_queue' });
  expect(conn.commit).toHaveBeenCalledOnce();
  expect(conn.release).toHaveBeenCalledOnce();
  expect(db.execute.mock.calls.filter(([sql]) => sql.includes('FOR UPDATE'))).toHaveLength(2);
});
it.each(['content', 'queue', 'session', 'clinical_record'])('rejects a stale preview after a %s change without deleting any selected item', async change => {
  const reviewed = selection((await cleanup.preview(actor)).items);
  if (change === 'content') drafts[0].content_revision = 'changed within the same timestamp second';
  if (change === 'queue') queue.push(work(24, { draft_id: 1 }));
  if (change === 'session') drafts[0].clinical_session_id = 72;
  if (change === 'clinical_record') notes = [{ draft_id: 1 }];
  await expect(cleanup.remove(actor, reviewed)).rejects.toMatchObject({ status: 409 });
  expect(drafts.some(row => row.id === 1)).toBe(true);
  expect(queue.some(row => row.id === 22)).toBe(true);
  expect(audits).toEqual([]);
  expect(conn.commit).not.toHaveBeenCalled();
});
it('does not allow guessed IDs from another owner or an item absent from the preview', async () => {
  const [item] = (await cleanup.preview(actor)).items;
  await expect(cleanup.remove(actor, [{ ...selection([item])[0], id: 4 }])).rejects.toMatchObject({ status: 409 });
  expect(drafts.map(row => row.id)).toEqual([1, 2, 3, 4]);
});
it('rolls back the entire cleanup when audit persistence fails', async () => {
  const reviewed = selection((await cleanup.preview(actor)).items);
  failAudit = true;
  await expect(cleanup.remove(actor, reviewed)).rejects.toThrow('Audit unavailable');
  expect(drafts.map(row => row.id)).toEqual([1, 2, 3, 4]);
  expect(queue.map(row => row.id)).toEqual([21, 22, 23]);
  expect(conn.rollback).toHaveBeenCalledOnce();
  expect(conn.commit).not.toHaveBeenCalled();
});
it('rejects replays and checks role revocation again on delete', async () => {
  const reviewed = selection((await cleanup.preview(actor)).items);
  role = 'admin';
  await expect(cleanup.remove(actor, reviewed)).rejects.toMatchObject({ status: 403 });
  role = 'super_admin';
  await cleanup.remove(actor, reviewed);
  await expect(cleanup.remove(actor, reviewed)).rejects.toMatchObject({ status: 409 });
});
it('requires a bounded, unique, valid selection', async () => {
  const [item] = selection((await cleanup.preview(actor)).items);
  for (const invalid of [[], [item, item], [{ ...item, version: '' }], [{ ...item, kind: 'client' }], Array(201).fill(item)]) {
    await expect(cleanup.remove(actor, invalid)).rejects.toMatchObject({ status: 400 });
  }
  expect(db.getConnection).not.toHaveBeenCalled();
});
