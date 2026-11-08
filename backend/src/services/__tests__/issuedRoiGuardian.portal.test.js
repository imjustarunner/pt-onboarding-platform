import { describe, it, after } from 'node:test';
import pool from '../../config/database.js';
after(()=>pool.end());
import assert from 'node:assert/strict';
import { portalGuardianForIssuedRoi, resolveIssuedRoiConsentSigner } from '../issuedRoiGuardian.service.js';

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
