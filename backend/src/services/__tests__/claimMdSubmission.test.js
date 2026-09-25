import { beforeEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ prepare: vi.fn(), upload: vi.fn(), event: vi.fn(), connection: vi.fn(), execute: vi.fn(), begin: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: mocks.execute, getConnection: async () => ({ execute: mocks.execute, beginTransaction: mocks.begin, commit: mocks.commit, rollback: mocks.rollback, release: mocks.release }) } }));
vi.mock('../../controllers/claimMdWorkflow.controller.js', () => ({ prepareClaimReview: mocks.prepare }));
vi.mock('../claimMdConnection.service.js', () => ({ resolveClaimMdConnection: mocks.connection, claimMdConnectionMeta: vi.fn(), requireClaimMdTransmission: c => { if (!['test','live'].includes(c.mode)) throw Object.assign(new Error('disabled'), { status: 409 }); } }));
vi.mock('../claimMdWorkflow.service.js', () => ({ recordClaimEvent: mocks.event, syncClaimMdResponses: vi.fn(), asList: x => Array.isArray(x) ? x : x ? [x] : [] }));
vi.mock('../claimMd.service.js', () => ({ uploadClaims: mocks.upload, fetchResponses: vi.fn(), fetchEraList: vi.fn(), requestEligibilityJson: vi.fn(), buildClaimMdJsonClaim: vi.fn() }));
vi.mock('../clinicalEligibility.service.js', () => ({ default: { ensureAgencyAccess: vi.fn() } }));
vi.mock('../familyBillingEncryption.service.js', () => ({ encryptFamilyBilling: () => 'encrypted', decryptFamilyBilling: vi.fn() }));
import { submitClaimToClaimMd } from '../../controllers/medicalBilling.controller.js';
const response = () => ({ code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const request = () => ({ user: { id: 9, role: 'admin' }, params: { claimId: '11' }, body: { agencyId: 1, approved: true, reviewHash: 'a'.repeat(64), accountMode: 'test' } });
const prepared = () => ({ claim: { id: 11, client_id: 7, claim_lifecycle: 'ready', billing_revision: 0 }, readiness: { ready: true }, insurance: {}, payload: { remote_claimid: '11' }, reviewHash: 'a'.repeat(64) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.prepare.mockResolvedValue(prepared());
  mocks.connection.mockResolvedValue({ accountKey: 'synthetic', mode: 'test', connectionId: 'account:100' });
  mocks.execute.mockResolvedValue([{ affectedRows: 1 }]);
  mocks.upload.mockResolvedValue({ claim: [{ remote_claimid: '11', claimmd_id: '800', status: 'A' }] });
});
describe('reviewed claim transmission', () => {
  it('rechecks review freshness under the claim and documentation locks before upload', async () => {
    mocks.prepare.mockResolvedValueOnce(prepared()).mockResolvedValueOnce({...prepared(),reviewHash:'b'.repeat(64)});
    const next=vi.fn();await submitClaimToClaimMd(request(),response(),next);
    expect(next.mock.calls[0][0].status).toBe(409);expect(mocks.rollback).toHaveBeenCalled();expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.execute.mock.calls.filter(([sql])=>sql.includes('FOR UPDATE'))).toHaveLength(3);
    expect(mocks.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE clinical_claims'))).toBe(false);
  });
  it('requires explicit approval before resolving credentials or transmitting', async () => {
    const req = request(); req.body.approved = false; const res = response(); await submitClaimToClaimMd(req, res, e => { throw e; });
    expect(res.code).toBe(400); expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.connection).not.toHaveBeenCalled();
  });
  it('rejects a stale review, changed account mode, and unsigned documentation', async () => {
    for (const variant of ['hash','mode','note']) {
      const req = request(), res = response(); const data = prepared();
      if (variant === 'hash') data.reviewHash = 'b'.repeat(64);
      if (variant === 'mode') req.body.accountMode = 'live';
      if (variant === 'note') data.readiness.ready = false;
      mocks.prepare.mockResolvedValue(data); await submitClaimToClaimMd(req, res, e => { throw e; }); expect(res.code).toBe(409);
    }
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('blocks concurrent submission when the atomic state transition fails', async () => {
    mocks.execute.mockResolvedValue([{ affectedRows: 0 }]); const next = vi.fn();
    await submitClaimToClaimMd(request(), response(), next);
    expect(next.mock.calls[0][0].status).toBe(409); expect(mocks.rollback).toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('commits approval before upload and leaves an ambiguous upload queued', async () => {
    mocks.upload.mockRejectedValue(new Error('timeout')); const next = vi.fn();
    await submitClaimToClaimMd(request(), response(), next);
    expect(mocks.commit).toHaveBeenCalledTimes(1); expect(mocks.event).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'approved_submission', actorUserId: 9 }), expect.anything());
    expect(mocks.upload).toHaveBeenCalledTimes(1); expect(mocks.execute.mock.calls.filter(([sql]) => sql.startsWith('UPDATE clinical_claims'))).toHaveLength(1);
    expect(mocks.commit.mock.invocationCallOrder[0]).toBeLessThan(mocks.upload.mock.invocationCallOrder[0]);
    expect(next.mock.calls[0][0].message).toBe('timeout');
  });
  it('will not retransmit a queued or paid claim', async () => {
    for (const life of ['queued', 'paid']) {
      mocks.prepare.mockResolvedValue({ ...prepared(), claim: { ...prepared().claim, claim_lifecycle: life } });
      const res = response(); await submitClaimToClaimMd(request(), res, e => { throw e; }); expect(res.code).toBe(409);
    }
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('stores a matching acknowledgement without treating it as a payment', async () => {
    const res = response(); await submitClaimToClaimMd(request(), res, e => { throw e; });
    expect(res.body.accepted).toBe(true); expect(res.body.message).toContain('portal');
    expect(mocks.execute.mock.calls.find(([sql]) => sql.includes('SET claim_lifecycle = ?'))[1][0]).toBe('submitted'); expect(mocks.commit).toHaveBeenCalledTimes(2);
  });
  it('rejects an acknowledgement for a different claim and leaves this claim queued', async () => {
    mocks.upload.mockResolvedValue({ claim: [{ remote_claimid: '99', claimmd_id: '800', status: 'A' }] });
    const next = vi.fn(); await submitClaimToClaimMd(request(), response(), next);
    expect(next.mock.calls[0][0].status).toBe(502); expect(mocks.execute.mock.calls.filter(([sql]) => sql.startsWith('UPDATE clinical_claims'))).toHaveLength(1);
  });
});
