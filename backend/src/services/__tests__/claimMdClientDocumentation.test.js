import { beforeEach, describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
import { documentationScope, documentationSourceHash, documentationReviewState, documentationSnapshot, saveClientDocumentationReview } from '../clientDocumentationReadiness.service.js';
import { decryptFamilyBilling } from '../familyBillingEncryption.service.js';
import { claimReviewHash } from '../claimMdWorkflow.service.js';
beforeEach(() => { vi.stubEnv('FAMILY_BILLING_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 7).toString('base64')); });
const review = { id: 1, review_scope: 'screening', status: 'verified', source_hash: 'source', effective_from: '2026-10-14', effective_through: '2026-12-31' };
const base = { scope: 'screening', sourceHash: 'source', review, serviceDate: '2026-10-19' };
describe('agency-scoped client documentation readiness', () => {
  it('uses screening requirements only for a claim consisting entirely of H0002', () => {
    expect(documentationScope(['H0002'])).toBe('screening');
    for (const codes of [[], ['90834'], ['H0002', '90834']]) expect(documentationScope(codes)).toBe('treatment');
  });
  it('requires a current review for the stage and service dates, independently of assignment or insurance', () => {
    expect(documentationReviewState(base)).toMatchObject({ ready: true, blockers: [] });
    for (const patch of [{ review: null }, { review: { ...review, status: 'incomplete' } }, { scope: 'treatment' }, { sourceHash: 'changed' }, { serviceDate: '2026-10-13' }, { serviceDate: '2027-01-01' }]) {
      expect(documentationReviewState({ ...base, ...patch, providerAssigned: true, insuranceVerified: true }).ready).toBe(false);
    }
  });
  it('binds approval to document changes and a subsequent review revocation', () => {
    const sourceHash = documentationSourceHash({ forms: [{ id: 1, signed_at: '2026-10-14' }], client: { id: 2, agency_id: 3 } });
    expect(sourceHash).toBe(documentationSourceHash({ client: { agency_id: 3, id: 2 }, forms: [{ signed_at: '2026-10-14', id: 1 }] }));
    expect(sourceHash).not.toBe(documentationSourceHash({ forms: [], client: { id: 2, agency_id: 3 } }));
    const approved = claimReviewHash({ clientDocumentation: { sourceHash, reviewId: 1, scope: 'screening' } });
    expect(approved).not.toBe(claimReviewHash({ clientDocumentation: { sourceHash, reviewId: 2, scope: 'screening' } }));
  });
  it('rejects a client in another agency before reading any document records', async () => {
    const db = { execute: vi.fn().mockResolvedValue([[]]) };
    await expect(documentationSnapshot({ agencyId: 2, clientId: 8 }, db)).rejects.toMatchObject({ status: 404 });
    expect(db.execute).toHaveBeenCalledTimes(1); expect(db.execute.mock.calls[0][1]).toEqual([8, 2]);
  });
  const input = () => ({ agencyId: 2, clientId: 8, actorUserId: 9, scope: 'screening', status: 'verified', sourceHash: 'source', previousReviewId: 1, effectiveFrom: '2026-10-14', reference: 'Reviewed signed screening consent in client Documents', authorityReviewed: true, requiredDocumentsReviewed: true });
  function deps({ latest = 1, sourceHash = 'source', client = true } = {}) {
    const db = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async sql => {
      if (sql.startsWith('SELECT id FROM clients')) return [client ? [{ id: 8 }] : []];
      if (sql.startsWith('SELECT id FROM client_documentation')) return [[{ id: latest }]];
      return [{ insertId: 11 }];
    }) };
    return { db, pool: { getConnection: async () => db }, snapshot: async () => ({ sourceHash }) };
  }
  it('never accepts verification without explicit review of authority and required documents', async () => {
    for (const patch of [{ authorityReviewed: false }, { requiredDocumentsReviewed: false }, { effectiveThrough: '2026-01-01' }, { reference: '' }]) {
      const d = deps(); await expect(saveClientDocumentationReview({ ...input(), ...patch }, d)).rejects.toThrow(); expect(d.db.commit).not.toHaveBeenCalled();
    }
  });
  it.each([{ latest: 2 }, { sourceHash: 'changed' }, { client: false }])('rejects stale or cross-agency saves: %j', async options => {
    const d = deps(options); await expect(saveClientDocumentationReview(input(), d)).rejects.toThrow(); expect(d.db.rollback).toHaveBeenCalled(); expect(d.db.execute.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  });
  it('stores an encrypted append-only attestation and audit attributed to the actual reviewer', async () => {
    const d = deps(); expect(await saveClientDocumentationReview(input(), d)).toEqual({ id: 11, status: 'verified' });
    const [, values] = d.db.execute.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO client_documentation'));
    expect(values.slice(0, 7)).toEqual([2, 8, 'screening', 'verified', '2026-10-14', null, 'source']);
    expect(values[7]).not.toContain('screening consent'); expect(decryptFamilyBilling(values[7], 'client-documentation:2:8').reference).toBe(input().reference);
    expect(() => decryptFamilyBilling(values[7], 'client-documentation:3:8')).toThrow(); expect(values[8]).toBe(9); expect(d.db.commit).toHaveBeenCalled();
  });
});
