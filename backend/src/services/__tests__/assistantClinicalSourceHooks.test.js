import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ queue: vi.fn(), main: vi.fn(), clinical: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.main }, onTableWrite: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: mocks.clinical } }));
vi.mock('../assistantTeams.service.js', () => ({ queueAssistantSourceChange: mocks.queue }));
vi.mock('../clinicalNoteCrypto.service.js', () => ({ maybeEncryptNotePayload: value => value, maybeDecryptNotePayload: value => value }));
import { queueCommittedClinicalSourceChange } from '../assistantClinicalSourceChange.service.js';
import { signRevision, appendRevisionAddendum } from '../clinicalNoteVersion.service.js';
import { appendClinicalNoteAmendment } from '../clinicalNoteAmendment.service.js';

beforeEach(() => {
  vi.clearAllMocks(); mocks.queue.mockResolvedValue(undefined);
  mocks.main.mockImplementation(() => { throw Error('Default application database forbidden in clinical hook tests'); });
  mocks.clinical.mockImplementation(() => { throw Error('Default clinical database forbidden in clinical hook tests'); });
});
afterEach(() => { expect(mocks.main).not.toHaveBeenCalled(); expect(mocks.clinical).not.toHaveBeenCalled(); vi.restoreAllMocks(); });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function fixture({ commitFails = false, signatureFails = false } = {}) {
  const events = [], note = { id: 21, agency_id: 2, client_id: 99, provider_signed_at: '2026-11-01', created_by_user_id: 5, metadata_json: {} };
  const head = { original_revision_id: 101, effective_revision_id: 101, pending_revision_id: 102 };
  const row = id => ({ id, clinical_note_id: 21, agency_id: 2, revision_number: id === 101 ? 1 : 2,
    origin: id === 101 ? 'original' : 'provider', original_author_user_id: 5, requires_supervisor_cosign: 0,
    content_hash: 'exact-content-hash', snapshot_json: { title: 'Synthetic note', notePayload: 'Synthetic clinical content', metadataJson: {}, addenda: [] } });
  const signatures = [], additions = [];
  const db = { beginTransaction: vi.fn(async () => events.push('begin')), commit: vi.fn(async () => { events.push('commit'); if (commitFails) throw Error('Commit failed'); }),
    rollback: vi.fn(async () => events.push('rollback')), release: vi.fn(() => events.push('release')), execute: vi.fn(async (sql, args = []) => {
      if (sql.startsWith('SELECT * FROM clinical_notes')) return [[note]];
      if (sql.startsWith('SELECT * FROM clinical_note_revision_heads')) return [[head]];
      if (sql.startsWith('SELECT * FROM clinical_note_revisions WHERE id=')) return [[row(Number(args[0]))]];
      if (sql.startsWith('SELECT * FROM clinical_note_revisions WHERE clinical_note_id=')) return [[row(101), row(102)]];
      if (sql.includes('FROM clinical_note_revision_signatures')) return [signatures];
      if (sql.includes('FROM clinical_note_revision_approvals')) return [[]];
      if (sql.startsWith('SELECT a.*,s.id')) return [additions];
      if (sql.startsWith('SELECT id,author_signed_at')) return [[{ id: 301, author_signed_at: '2026-11-04T18:00:00Z' }]];
      if (sql.startsWith('INSERT INTO clinical_note_addenda')) {
        additions.push({ id: 301, clinical_note_id: 21, agency_id: 2, client_id: 99, body: args[3], entry_kind: args[5], author_signed_at: '2026-11-04T18:00:00Z' });
        return [{ insertId: 301 }];
      }
      if (sql.startsWith('INSERT INTO clinical_note_revision_signatures')) {
        if (signatureFails) throw Error('Signature audit insert failed');
        signatures.push({ id: 401, revision_id: args[0], signature_action: args[3], actor_user_id: args[4], content_hash: args[6] });
        return [{ insertId: 401 }];
      }
      if (sql.startsWith('UPDATE clinical_note_revision_heads')) { head.effective_revision_id = args[0]; head.pending_revision_id = null; }
      if (/^(INSERT|UPDATE)/.test(sql)) return [{ affectedRows: 1, insertId: 501 }];
      throw Error(`Unexpected synthetic clinical query: ${sql}`);
    }) };
  mocks.queue.mockImplementation(async reference => { events.push('queue'); expect(events).toContain('commit'); expect(events).toContain('release'); return reference; });
  return { db, events, source: { getConnection: vi.fn(async () => db) } };
}
const signature = { noteId: 21, agencyId: 2, revisionId: 102, actorUserId: 5, action: 'author_sign', attested: true, expectedContentHash: 'exact-content-hash' };
const addition = { noteId: 21, agencyId: 2, actorUserId: 5, entryKind: 'addendum', body: 'Synthetic new information', reason: 'Synthetic reason', authorAttested: true };

it('queues only server references after a linked revision signature commits and releases', async () => {
  const f = fixture();
  expect(await signRevision(signature, f.source)).toMatchObject({ id: 102 });
  await vi.waitFor(() => expect(mocks.queue).toHaveBeenCalledWith({ agencyId: 2, clientId: 99, sourceKind: 'note_revision', sourceId: 102 }));
  expect(f.events).toEqual(['begin', 'commit', 'release', 'queue']); expect(f.db.rollback).not.toHaveBeenCalled();
});
it.each([{ commitFails: true }, { signatureFails: true }])('does not queue a failed signature transaction %j', async options => {
  const f = fixture(options);
  await expect(signRevision(signature, f.source)).rejects.toThrow(); await flush();
  expect(f.db.rollback).toHaveBeenCalledOnce(); expect(mocks.queue).not.toHaveBeenCalled();
});
it('keeps the linked addendum compatibility path and queues its committed entry ID once', async () => {
  const f = fixture();
  expect(await appendClinicalNoteAmendment(addition, f.source)).toMatchObject({ id: 301, revisionId: 101 });
  await vi.waitFor(() => expect(mocks.queue).toHaveBeenCalledWith({ agencyId: 2, clientId: 99, sourceKind: 'note_entry', sourceId: 301 }));
  expect(mocks.queue).toHaveBeenCalledOnce();
  expect(f.db.execute.mock.calls.some(([sql]) => /SET supervisor_cosigned_at=NULL/.test(sql))).toBe(false);
});
it('rejects the obsolete correction path without a transaction or assistant queue', async () => {
  const f = fixture();
  await expect(appendClinicalNoteAmendment({ ...addition, entryKind: 'correction' }, f.source)).rejects.toHaveProperty('status', 409);
  expect(f.source.getConnection).not.toHaveBeenCalled(); expect(mocks.queue).not.toHaveBeenCalled();
});
it('does not queue an addendum when commit fails', async () => {
  const f = fixture({ commitFails: true });
  await expect(appendRevisionAddendum(addition, f.source)).rejects.toThrow('Commit failed'); await flush();
  expect(mocks.queue).not.toHaveBeenCalled(); expect(f.db.rollback).toHaveBeenCalledOnce();
});
it('isolates a queue failure from a successful committed signature and never logs clinical text', async () => {
  const f = fixture(), warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  mocks.queue.mockRejectedValue(new Error('PRIVATE clinical narrative must not be logged'));
  await expect(signRevision(signature, f.source)).resolves.toMatchObject({ id: 102 });
  await vi.waitFor(() => expect(warn).toHaveBeenCalledOnce());
  expect(f.db.rollback).not.toHaveBeenCalled(); expect(JSON.stringify(warn.mock.calls)).not.toContain('PRIVATE');
});
it('drops malformed references and strips unrelated fields before lazy queue loading', async () => {
  queueCommittedClinicalSourceChange({ agencyId: 0, clientId: 99, sourceKind: 'note', sourceId: 21 });
  queueCommittedClinicalSourceChange({ agencyId: 2, clientId: 99, sourceKind: 'untrusted_kind', sourceId: 21 });
  await flush(); expect(mocks.queue).not.toHaveBeenCalled();
  queueCommittedClinicalSourceChange({ agencyId: 2, clientId: 99, sourceKind: 'note', sourceId: 21, body: 'PRIVATE' });
  await vi.waitFor(() => expect(mocks.queue).toHaveBeenCalledWith({ agencyId: 2, clientId: 99, sourceKind: 'note', sourceId: 21 }));
});
