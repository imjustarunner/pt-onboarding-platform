import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: () => { throw Error('Default application pool forbidden'); } }, onTableWrite: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: () => { throw Error('Default clinical pool forbidden'); } } }));
import { buildClinicalReviewPacket, readSourceRevision, inventoryEligibleCharts } from '../assistantReviewPackets.service.js';
const privacyPolicy = { enabled: true, baaVerified: true, approved: true, sampleReviewPassed: true, revision: 'synthetic-v1', externalService: 'Synthetic vendor', baaReference: 'Synthetic evidence', sampleReviewReference: 'Synthetic review' };
const input = { agencyId: 2, clientId: 99, subrole: 'clinical', privacyPolicy };
function fixture() {
  const note = { id: 21, agency_id: 2, client_id: 99, created_by_user_id: 5, provider_signed_by_user_id: 5,
    provider_signed_at: '2026-11-01', note_type: 'PROGRESS_NOTE', metadata_json: {}, note_payload: 'OBSOLETE original clinical text', encounter_at: '2026-11-01T16:00:00Z' };
  const entry = { id: 31, clinical_note_id: 21, agency_id: 2, client_id: 99, entry_kind: 'addendum', body: 'Approved independent addition', entry_reason: 'New information', author_signed_at: '2026-11-04' };
  const pending = { ...entry, id: 32, entry_kind: 'correction', body: 'PENDING correction must stay private' };
  const revision = { id: 102, clinical_note_id: 21, agency_id: 2, revision_number: 2, origin: 'provider', content_hash: 'current-hash',
    snapshot_json: { title: 'Private title', notePayload: 'CURRENT approved clinical content', noteType: 'PROGRESS_NOTE', metadataJson: {}, addenda: [],
      encounterContext: { scheduledStartAt: '2026-11-04T16:00:00Z', placeOfService: '11', serviceCode: '90834', durationMinutes: 45, isTelehealth: false } } };
  const signatures = [{ id: 401, revision_id: 102, signature_action: 'author_sign', actor_user_id: 5, signed_at: '2026-11-04T17:00:00Z', content_hash: 'current-hash' }];
  const approval = { id: 501, revision_id: 102, signature_id: 401, content_hash: 'current-hash', approved_at: '2026-11-04T17:00:00Z' };
  const clinical = { execute: vi.fn(async (sql, args) => {
    if (!sql.trim().startsWith('SELECT')) throw Error('Clinical packet reader attempted a write');
    if (sql.includes('FROM clinical_notes n LEFT JOIN')) return [[note]];
    if (sql.includes('FROM clinical_note_revision_heads')) return [[{ original_revision_id: 101, effective_revision_id: 102, pending_revision_id: 103 }]];
    if (sql.includes('FROM clinical_note_revisions WHERE id=')) return [[revision]];
    if (sql.startsWith('SELECT a.*,s.id')) return [[entry, pending]];
    if (sql.includes('FROM clinical_note_revision_signatures')) return [signatures];
    if (sql.includes('FROM clinical_note_revision_approvals')) return [[approval]];
    if (sql.includes('FROM clinical_note_addenda')) return [[entry, pending]];
    return [[]];
  }) };
  const main = { execute: vi.fn(async sql => {
    if (!sql.trim().startsWith('SELECT')) throw Error('Clinical packet reader attempted an application write');
    if (sql.includes('FROM clients c')) return [[{ id: 99, agency_id: 2, status: 'ACTIVE', full_name: 'Synthetic Client' }]];
    return [[]];
  }) };
  const deps = { mainDb: main, clinicalDb: clinical, loadDocumentationPolicy: async () => ({ version: 'synthetic', supervisorUserId: null }),
    createPrivacyContext: () => ({ redact: async text => text }) };
  return { revision, signatures, approval, main, clinical, deps };
}
it('reads the current effective linked revision and signed additions without exposing pending or original content', async () => {
  const f = fixture(), result = await buildClinicalReviewPacket(input, f.deps);
  expect(result.status).toBe('ready');
  const external = JSON.stringify(result.packet);
  expect(external).toContain('CURRENT approved clinical content'); expect(external).toContain('Approved independent addition');
  expect(external).not.toMatch(/OBSOLETE|PENDING|Private title|current-hash|401|102/);
  expect(result.packet.notes[0].signature).toMatchObject({ providerSigned: true, cosignRequired: false, signedEntriesPresent: true, status: 'not_required' });
  expect(f.clinical.execute.mock.calls.every(([sql]) => sql.trim().startsWith('SELECT'))).toBe(true);
  expect(f.main.execute.mock.calls.every(([sql]) => sql.trim().startsWith('SELECT'))).toBe(true);
  expect(f.clinical.execute.mock.calls.find(([sql]) => sql.includes('FROM clinical_notes n LEFT JOIN'))[0]).toContain('v.snapshot_json');
});
it('does not claim original-author signing or require new approval for an independent entry on a supervisor amendment', async () => {
  const f = fixture(); f.revision.origin = 'supervisor'; f.revision.requires_supervisor_cosign = 1;
  f.signatures[0].signature_action = 'supervisor_sign'; f.signatures[0].actor_user_id = 9;
  const result = await buildClinicalReviewPacket(input, f.deps);
  expect(result.status).toBe('ready');
  expect(result.packet.notes[0].signature).toMatchObject({ providerSigned: false, authorAcknowledged: false,
    supervisorCosigned: true, cosignRequired: true, signedEntriesPresent: true, status: 'current' });
});
it('invalidates a prepared result when the effective content or signature identity changes', async () => {
  const f = fixture(), initial = await readSourceRevision(input, f.deps);
  f.revision.content_hash = 'replacement-hash';
  f.signatures[0].content_hash = 'replacement-hash'; f.approval.content_hash = 'replacement-hash';
  const contentChanged = await readSourceRevision(input, f.deps); expect(contentChanged).not.toBe(initial);
  f.signatures[0].id = 402; f.approval.signature_id = 402;
  expect(await readSourceRevision(input, f.deps)).not.toBe(contentChanged);
});
it('does not trust a head pointer to an unapproved revision or mismatched approval signature', async () => {
  const f = fixture(); f.approval.signature_id = 999;
  expect(await buildClinicalReviewPacket(input, f.deps)).toMatchObject({ status: 'blocked', packet: null });
  f.approval.signature_id = 401; f.approval.approved_at = null;
  expect(await buildClinicalReviewPacket(input, f.deps)).toMatchObject({ status: 'blocked', packet: null });
});
it('fails closed if signed version history cannot be read instead of initializing or reviewing the original', async () => {
  const f = fixture(), original = f.clinical.execute.getMockImplementation();
  f.clinical.execute.mockImplementation((sql, args) => sql.includes('FROM clinical_note_revision_heads') ? Promise.resolve([[]]) : original(sql, args));
  expect(await buildClinicalReviewPacket(input, f.deps)).toMatchObject({ status: 'blocked', packet: null });
  expect(f.clinical.execute.mock.calls.every(([sql]) => sql.trim().startsWith('SELECT'))).toBe(true);
});
it('excludes a newly restricted effective revision through the existing privacy filter', async () => {
  const f = fixture(); f.revision.snapshot_json.metadataJson.restricted = true;
  const result = await buildClinicalReviewPacket(input, f.deps);
  expect(result.status).toBe('ready'); expect(result.packet.notes).toEqual([]);
});
it('includes signature and approval changes in incremental chart selection even without a note timestamp touch', async () => {
  const mainDb = { execute: vi.fn(async () => [[{ id: 99, updated_at: '2020-01-01T00:00:00Z' }]]) };
  const clinicalDb = { execute: vi.fn(async () => [[{ client_id: 99 }]]) };
  expect(await inventoryEligibleCharts({ agencyId: 2, changedSince: '2026-11-04T00:00:00Z' }, { mainDb, clinicalDb }))
    .toMatchObject({ charts: [{ clientId: 99 }] });
  const [sql, args] = clinicalDb.execute.mock.calls[0];
  expect(sql).toContain('clinical_note_revision_signatures'); expect(sql).toContain('clinical_note_revision_approvals'); expect(sql).toContain('clinical_note_revisions');
  expect(args).toHaveLength((sql.match(/\?/g) || []).length);
});
