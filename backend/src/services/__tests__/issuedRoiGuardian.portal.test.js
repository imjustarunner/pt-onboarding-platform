import { describe, it, after } from 'node:test';
import pool from '../../config/database.js';
after(()=>pool.end());
import assert from 'node:assert/strict';
import { portalGuardianForIssuedRoi, resolveIssuedRoiConsentSigner, assertIssuedRoiSessionBinding } from '../issuedRoiGuardian.service.js';

describe('portal school release copy', () => {
  it('files the signed release under the guardian who is signed in', async () => {
    const req = { cookies: { authToken: 'session' }, headers: {} };
    const id = await portalGuardianForIssuedRoi(req, 928, {
      verify: () => ({ id: 15 }),
      loadLink: async () => ({ access_enabled: 1, permissions_json: {} })
    });
    assert.equal(id, 15);
  });

  it('does not file the copy under an account that cannot read the child', async () => {
    const req = { headers: { authorization: 'Bearer session' } };
    const id = await portalGuardianForIssuedRoi(req, 928, {
      verify: () => ({ id: 15 }),
      loadLink: async () => ({ access_enabled: 1, permissions_json: { noView: true } })
    });
    assert.equal(id, null);
  });
});

it('cannot use one guardian’s link to record the other guardian’s response',async()=>{
 const args={req:{},issuedLink:{id:1,recipient_guardian_user_id:15},clientId:928};
 await assert.rejects(resolveIssuedRoiConsentSigner(args,{existing:async()=>15,portal:async()=>16}),{status:403});
 await assert.rejects(resolveIssuedRoiConsentSigner(args,{existing:async()=>15,portal:async()=>null}),{status:403});
 assert.equal(await resolveIssuedRoiConsentSigner(args,{existing:async()=>15,portal:async()=>15}),15);
});

describe('issued school release session binding', () => {
  const token = 'actual-intake-session-capability-123456';
  const request = () => ({
    issuedLink: { id: 1, intake_link_id: 20, client_id: 928, recipient_guardian_user_id: 15, latest_intake_submission_id: 10, status: 'in_progress' },
    submission: { id: 10, intake_link_id: 20, client_id: 928, guardian_user_id: 15, session_token: token, status: 'consented' },
    guardianUserId: 15,
    sessionToken: token
  });
  it('accepts the exact existing guardian, child, issued request and real session', () => {
    assert.doesNotThrow(() => assertIssuedRoiSessionBinding(request()));
  });
  for (const [label, change] of [
    ['other child', args => { args.submission.client_id = 929; }],
    ['other guardian', args => { args.guardianUserId = 16; }],
    ['missing guardian', args => { args.guardianUserId = null; }],
    ['other template', args => { args.submission.intake_link_id = 21; }],
    ['other issued request sharing the template', args => { args.issuedLink.latest_intake_submission_id = 11; }],
    ['missing authoritative request session', args => { args.issuedLink.latest_intake_submission_id = null; }],
    ['own-enrollment session', args => { args.submission.co_guardian_invite_id = 28; }],
    ['invented portal token', args => { args.sessionToken = 'portal-928-451-issued-key'; }],
    ['missing session', args => { args.sessionToken = null; }]
  ]) {
    it(`rejects ${label}`, () => {
      const args = request(); change(args);
      assert.throws(() => assertIssuedRoiSessionBinding(args), { status: 403 });
    });
  }
  it('does not reopen a completed issued request', () => {
    const args = request(); args.issuedLink.status = 'completed';
    assert.throws(() => assertIssuedRoiSessionBinding(args), { status: 409 });
    args.submission.status = 'submitted';
    assert.doesNotThrow(() => assertIssuedRoiSessionBinding(args));
  });
  it('does not advance an expired session', () => {
    const args = request(); args.submission.retention_expires_at = new Date(Date.now() - 1000);
    assert.throws(() => assertIssuedRoiSessionBinding(args), { status: 410 });
  });
  it('still bounds consented sessions when indefinite document retention clears the storage expiry', () => {
    const args = request(); args.submission.consent_given_at = new Date(Date.now() - 25 * 60 * 60 * 1000);
    assert.throws(() => assertIssuedRoiSessionBinding(args), { status: 410 });
  });
  it('does not revive a closed session', () => {
    const args = request(); args.submission.status = 'cancelled';
    assert.throws(() => assertIssuedRoiSessionBinding(args), { status: 409 });
  });
  it('does not impose issued-request bindings on ordinary public enrollment', () => {
    assert.doesNotThrow(() => assertIssuedRoiSessionBinding({ issuedLink: null }));
  });
});
