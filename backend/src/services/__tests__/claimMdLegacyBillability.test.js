import { expect, it, vi } from 'vitest';
vi.mock('../../config/clinicalDatabase.js', () => ({ default: {} }));
vi.mock('../../config/database.js', () => ({ default: {}, onTableWrite: vi.fn() }));
vi.mock('../clinicalNoteCrypto.service.js', () => ({ maybeDecryptNotePayload: value => value, maybeEncryptNotePayload: value => value }));
import { editRevision, proposeRevision } from '../clinicalNoteVersion.service.js';
import { isNonBillableDocument } from '../supervisedBillingPolicy.service.js';

function fixture() {
  const original = { id: 4, agency_id: 2, client_id: 3, created_by_user_id: 7, provider_signed_by_user_id: 7, provider_signed_at: '2026-10-31', is_billable: 0 };
  const originalSnapshot = { title: 'Legacy progress note', notePayload: 'Preserved signed narrative', noteType: 'PROGRESS_NOTE', isBillable: false, metadataJson: {}, encounterContext: {}, addenda: [] };
  const rows = new Map([[10, { id: 10, clinical_note_id: 4, agency_id: 2, revision_number: 1, origin: 'original', original_author_user_id: 7, snapshot_json: JSON.stringify(originalSnapshot), content_hash: 'a'.repeat(64) }]]);
  const head = { clinical_note_id: 4, agency_id: 2, original_revision_id: 10, effective_revision_id: 10, pending_revision_id: null, next_revision_number: 2 };
  const execute = vi.fn(async (sql, values) => {
    if (sql.startsWith('SELECT * FROM clinical_notes')) return [[original]];
    if (sql.startsWith('SELECT * FROM clinical_note_revision_heads')) return [[head]];
    if (sql.startsWith('SELECT * FROM clinical_note_revisions WHERE id=')) return [[rows.get(Number(values[0]))]];
    if (sql.startsWith('SELECT * FROM clinical_note_revisions WHERE clinical_note_id=')) return [[...rows.values()]];
    if (sql.startsWith('INSERT INTO clinical_note_revisions')) {
      const id = Math.max(...rows.keys()) + 1;
      rows.set(id, { id, clinical_note_id: values[0], agency_id: values[1], revision_number: values[2], parent_revision_id: values[3], supersedes_revision_id: values[4], origin: values[5], reason: values[6], proposed_by_user_id: values[7], original_author_user_id: values[8], responsible_supervisor_user_id: values[9], requires_supervisor_cosign: values[10], snapshot_json: values[11], provenance_json: values[12], content_hash: values[13] });
      return [{ insertId: id }];
    }
    if (sql.startsWith('UPDATE clinical_note_revision_heads')) { head.pending_revision_id = values[0]; head.next_revision_number += 1; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('UPDATE clinical_notes')) throw Error('The signed original must never be rewritten.');
    if (sql.startsWith('SELECT')) return [[]];
    throw Error(`Unexpected mutation: ${sql}`);
  });
  const db = { execute, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
  return { source: { getConnection: async () => db }, db, original, originalSnapshot, rows };
}

it('creates a billable amendment from an old false approval flag without changing V1 or its physical note', async () => {
  const f = fixture();
  const amendment = await proposeRevision({ noteId: 4, agencyId: 2, actorUserId: 7, origin: 'provider', reason: 'Reviewed clinical service classification', baseRevisionId: 10, expectedContentHash: 'a'.repeat(64), expectedVersionNumber: 1, isBillable: true }, f.source);
  expect(amendment.snapshot.isBillable).toBe(true);
  expect(JSON.parse(f.rows.get(10).snapshot_json)).toEqual(f.originalSnapshot);
  expect(f.original.is_billable).toBe(0);
  expect(f.db.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE clinical_notes'))).toBe(false);
});

it('classifies clinical services independently of the legacy approval flag and retains explicit nonbillable documents', () => {
  expect(isNonBillableDocument({ note_type: 'PROGRESS_NOTE', is_billable: 0, metadata_json: {} })).toBe(false);
  for (const note_type of ['CONTACT_NOTE', 'TREATMENT_SUMMARY', 'TERMINATION']) expect(isNonBillableDocument({ note_type, is_billable: 1, metadata_json: {} })).toBe(true);
  expect(isNonBillableDocument({ note_type: 'PROGRESS_NOTE', metadata_json: { nonBillable: true } })).toBe(true);
});

it('records nonbillability only in an edited successor while retaining every earlier snapshot', async () => {
  const f = fixture();
  const first = await proposeRevision({ noteId: 4, agencyId: 2, actorUserId: 7, origin: 'provider', reason: 'Reviewed clinical service classification', baseRevisionId: 10, expectedContentHash: 'a'.repeat(64), isBillable: true }, f.source);
  const second = await editRevision({ noteId: 4, agencyId: 2, actorUserId: 7, revisionId: first.id, expectedContentHash: first.contentHash, reason: 'Document explicitly reviewed as nonbillable', isBillable: false }, f.source);
  expect(second.snapshot.isBillable).toBe(false);
  expect(JSON.parse(f.rows.get(first.id).snapshot_json).isBillable).toBe(true);
  expect(JSON.parse(f.rows.get(10).snapshot_json).isBillable).toBe(false);
  expect(f.original.is_billable).toBe(0);
});
