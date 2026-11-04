import { beforeEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ liveAgency: vi.fn(), syntheticAgency: vi.fn(), selfPayCheck: vi.fn(), prepare: vi.fn(), upload: vi.fn(), event: vi.fn(), connection: vi.fn(), execute: vi.fn(), begin: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), versionGuard: vi.fn() }));
vi.mock('../clinicalNoteVersionBilling.service.js', async original => ({ ...await original(), assertClinicalVersionSubmission: mocks.versionGuard }));
vi.mock('../syntheticClearinghouseGuard.service.js',()=>({assertLiveClearinghouseAgency:mocks.liveAgency,isSyntheticClearinghouseAgency:mocks.syntheticAgency}));
vi.mock('../familyLedger/serviceCharges.js',()=>({assertNoSelfPayBalance:mocks.selfPayCheck}));
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
const prepared = () => ({ claim: { id: 11, client_id: 7, clinical_note_id: 4, clinical_session_id: 71, claim_lifecycle: 'ready', billing_revision: 0 }, documentation: { note: { clinical_version_id: 12, clinical_version_number: 2, clinical_version_content_hash: 'b'.repeat(64) } }, readiness: { ready: true }, insurance: {}, payload: { remote_claimid: '11' }, reviewHash: 'a'.repeat(64) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.liveAgency.mockResolvedValue(undefined); mocks.syntheticAgency.mockResolvedValue(false); mocks.selfPayCheck.mockResolvedValue(undefined); mocks.versionGuard.mockResolvedValue(undefined); mocks.prepare.mockResolvedValue(prepared());
  mocks.connection.mockResolvedValue({ accountKey: 'synthetic', mode: 'test', connectionId: 'account:100' });
  mocks.execute.mockImplementation(async sql=>sql.startsWith('SELECT')?[[]]:[{affectedRows:1}]);
  mocks.upload.mockResolvedValue({ claim: [{ remote_claimid: '11', claimmd_id: '800', status: 'A' }] });
});
describe('reviewed claim transmission', () => {
  it('records a practice submission for a demo agency and does not upload', async () => {
    mocks.syntheticAgency.mockResolvedValue(true);
    const res = response();
    await submitClaimToClaimMd(request(), res, e => { throw e; });
    expect(res.body).toMatchObject({ ok: true, practice: true, accepted: true });
    expect(res.body.message).toContain('Nothing was sent');
    expect(mocks.connection).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.liveAgency).not.toHaveBeenCalled();
    const update = mocks.execute.mock.calls.find(([sql]) => sql.includes('claimmd_last_status'));
    expect(update[0]).toContain("claimmd_last_status = 'PRACTICE'");
    expect(update[0]).toContain("claim_lifecycle = 'submitted'");
    expect(update[1]).toEqual(expect.arrayContaining(['practice:1', 'practice-11', 11, 1]));
    expect(mocks.event).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'approved_submission', payload: expect.objectContaining({ mode: 'practice', practice: true }) }), expect.anything());
    expect(mocks.event).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'acknowledgement', status: 'PRACTICE' }), expect.anything());
  });
  it('stops before preparing or uploading when the agency transmission guard rejects', async () => {
    mocks.liveAgency.mockRejectedValueOnce(Object.assign(new Error('Synthetic agency cannot transmit'), {status:403}));
    const next=vi.fn(); await submitClaimToClaimMd(request(),response(),next);
    expect(mocks.liveAgency).toHaveBeenCalledWith(1);
    expect(next.mock.calls[0][0].status).toBe(403);
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('holds insurance submission for an existing self-pay balance under the visit lock',async()=>{
    mocks.selfPayCheck.mockRejectedValueOnce(Object.assign(new Error('Reconcile self-pay'),{status:409}));
    const next=vi.fn();await submitClaimToClaimMd(request(),response(),next);
    expect(mocks.selfPayCheck).toHaveBeenCalledWith(1,71);expect(next.mock.calls[0][0].status).toBe(409);expect(mocks.upload).not.toHaveBeenCalled();expect(mocks.rollback).toHaveBeenCalled();
    expect(mocks.execute.mock.calls[0][0]).toContain('clinical_sessions');expect(mocks.execute.mock.calls[0][0]).toContain('FOR UPDATE');
  });
  it('blocks another original even when a previously transmitted claim is rejected or reset to ready',async()=>{
    for(const lifecycle of ['rejected','ready']) {
      mocks.prepare.mockResolvedValue({...prepared(),claim:{...prepared().claim,claim_lifecycle:lifecycle,claimmd_claim_id:'800'}});
      const next=vi.fn();await submitClaimToClaimMd(request(),response(),next);expect(next.mock.calls[0][0].status).toBe(409);
    }
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('blocks upload under the note lock for a pending service correction',async()=>{
    mocks.execute.mockImplementation(async sql=>sql.includes('clinical_claim_change_requests')?[[{id:12}]]:sql.startsWith('SELECT')?[[]]:[{affectedRows:1}]);
    const next=vi.fn();await submitClaimToClaimMd(request(),response(),next);expect(next.mock.calls[0][0].status).toBe(409);expect(mocks.upload).not.toHaveBeenCalled();expect(mocks.rollback).toHaveBeenCalled();
  });
  it('rechecks review freshness under the claim and documentation locks before upload', async () => {
    mocks.prepare.mockResolvedValueOnce(prepared()).mockResolvedValueOnce({...prepared(),reviewHash:'b'.repeat(64)});
    const next=vi.fn();await submitClaimToClaimMd(request(),response(),next);
    expect(next.mock.calls[0][0].status).toBe(409);expect(mocks.rollback).toHaveBeenCalled();expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.execute.mock.calls.filter(([sql])=>sql.includes('FOR UPDATE'))).toHaveLength(4);
    expect(mocks.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE clinical_claims'))).toBe(false);
  });
  it('holds transmission for a newly pending clinical revision under the note lock', async () => {
    mocks.versionGuard.mockRejectedValueOnce(Object.assign(Error('A clinical amendment is pending clinical approval'), { status: 409 }));
    const next = vi.fn(); await submitClaimToClaimMd(request(), response(), next);
    expect(mocks.versionGuard).toHaveBeenCalledWith({ noteId: 4, agencyId: 1, expectedRevisionId: 12, expectedContentHash: 'b'.repeat(64) }, expect.anything());
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 409 })); expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.rollback).toHaveBeenCalled();
    expect(mocks.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE clinical_claims'))).toBe(false);
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
    mocks.execute.mockImplementation(async sql=>sql.startsWith('SELECT')?[[]]:[{affectedRows:0}]); const next = vi.fn();
    await submitClaimToClaimMd(request(), response(), next);
    expect(next.mock.calls[0][0].status).toBe(409); expect(mocks.rollback).toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('commits approval before upload and leaves an ambiguous upload queued', async () => {
    mocks.upload.mockRejectedValue(new Error('timeout')); const next = vi.fn();
    await submitClaimToClaimMd(request(), response(), next);
    expect(mocks.commit).toHaveBeenCalledTimes(1); expect(mocks.event).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'approved_submission', actorUserId: 9, payload: expect.objectContaining({ clinicalVersion: { revisionId: 12, revisionNumber: 2, contentHash: 'b'.repeat(64) } }) }), expect.anything());
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
  it('links the submission to the reviewed electronic destination payer', async () => {
    mocks.prepare.mockResolvedValue({...prepared(),payload:{...prepared().payload,payerid:'SYNTH'}});
    await submitClaimToClaimMd(request(),response(),e=>{throw e;});
    const [sql,params]=mocks.execute.mock.calls.find(([sql])=>sql.includes('destination_payer_id = ?'));
    expect(sql).toContain('agency_id = ?');expect(params.slice(-4)).toEqual(['SYNTH',11,1,0]);
  });
  it('rejects an acknowledgement for a different claim and leaves this claim queued', async () => {
    mocks.upload.mockResolvedValue({ claim: [{ remote_claimid: '99', claimmd_id: '800', status: 'A' }] });
    const next = vi.fn(); await submitClaimToClaimMd(request(), response(), next);
    expect(next.mock.calls[0][0].status).toBe(502); expect(mocks.execute.mock.calls.filter(([sql]) => sql.startsWith('UPDATE clinical_claims'))).toHaveLength(1);
  });
});

it('cannot upload an incomplete payload even with explicit approval',async()=>{
 mocks.prepare.mockResolvedValue({...prepared(),payload:null,readiness:{ready:false,blockers:['Claim is incomplete: payerid']}});
 const res=response(),next=vi.fn();await submitClaimToClaimMd(request(),res,next);
 expect(mocks.upload).not.toHaveBeenCalled();expect(mocks.event).not.toHaveBeenCalled();expect(res.code===409 || next.mock.calls[0]?.[0]?.status===409).toBe(true);
});
