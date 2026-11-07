import { describe, it, after } from 'node:test';
import pool from '../../config/database.js';
after(()=>pool.end());
import assert from 'node:assert/strict';
import { openGuardianSchoolRelease } from '../guardianSchoolRoi.service.js';

const link = { access_enabled: 1, permissions_json: {} };
const schoolClient = [{ id: 928, organization_id: 326, organization_name: 'Twain Elementary School', organization_type: 'school' }];

function db(clientRows, schoolRows = []) {
  return {
    async execute(sql) {
      if (sql.includes('FROM clients')) return [clientRows];
      if (sql.includes('client_organization_assignments')) return [schoolRows];
      throw new Error(`unexpected sql: ${sql}`);
    }
  };
}

describe('guardian school release', () => {
  it('honors document-specific restrictions before looking up or issuing a release',async()=>{
    for(const permissions_json of [{canViewDocs:false},{noViewOtherGuardian:true},'{"canViewDocs":false}']) {
      let touched=false;
      await assert.rejects(openGuardianSchoolRelease({userId:15,clientId:928,loadLink:async()=>({access_enabled:1,permissions_json}),db:{execute:async()=>{touched=true;return [[]];}},issueLink:async()=>{touched=true;}}),{status:403});
      assert.equal(touched,false);
    }
  });
  it('reuses the open release for the school on the child record', async () => {
    const calls = [];
    const result = await openGuardianSchoolRelease({
      userId: 15,
      clientId: 928,
      db: db(schoolClient),
      loadLink: async () => link,
      findExisting: async () => ({ status: 'in_progress', public_key: 'existing-key' }),
      issueLink: async (args) => {
        calls.push(args);
        return { ok: true, issuedLink: { public_key: 'existing-key', status: 'in_progress' } };
      }
    });
    assert.equal(result.ready, true);
    assert.equal(result.publicKey, 'existing-key');
    assert.equal(result.schoolOrganizationId, 326);
    assert.equal(result.schoolName, 'Twain Elementary School');
    assert.equal(calls[0].regenerate, false);
    assert.equal(calls[0].schoolOrganizationId, 326);
  });

  it('does not replace a release that is already signed', async () => {
    let issued = false;
    const result = await openGuardianSchoolRelease({
      userId: 15,
      clientId: 928,
      db: db(schoolClient),
      loadLink: async () => link,
      findExisting: async () => ({ status: 'completed', public_key: 'signed-key' }),
      issueLink: async () => { issued = true; return { ok: true, issuedLink: { public_key: 'new' } }; }
    });
    assert.equal(result.ready, false);
    assert.equal(result.status, 'completed');
    assert.equal(issued, false);
    assert.equal(result.publicKey, undefined);
  });

  it('uses the active school assignment when the chart organization is not a school', async () => {
    const result = await openGuardianSchoolRelease({
      userId: 15,
      clientId: 44,
      db: db(
        [{ id: 44, organization_id: 2, organization_name: 'ITSCO', organization_type: 'agency' }],
        [{ id: 376, name: 'Hogwarts' }]
      ),
      loadLink: async () => link,
      findExisting: async () => null,
      issueLink: async () => ({ ok: true, issuedLink: { public_key: 'school-key', status: 'issued' } })
    });
    assert.equal(result.schoolOrganizationId, 376);
    assert.equal(result.schoolName, 'Hogwarts');
    assert.equal(result.publicKey, 'school-key');
  });

  it('stays quiet when the child has no school', async () => {
    let issued = false;
    const result = await openGuardianSchoolRelease({
      userId: 15,
      clientId: 44,
      db: db([{ id: 44, organization_id: 2, organization_name: 'ITSCO', organization_type: 'agency' }]),
      loadLink: async () => link,
      findExisting: async () => null,
      issueLink: async () => { issued = true; return { ok: false }; }
    });
    assert.deepEqual(result, { ready: false, reason: 'no_school', clientId: 44 });
    assert.equal(issued, false);
  });

  it('refuses a guardian who cannot view the child', async () => {
    await assert.rejects(
      () => openGuardianSchoolRelease({
        userId: 15,
        clientId: 928,
        db: db(schoolClient),
        loadLink: async () => ({ access_enabled: 1, permissions_json: { noView: true } }),
        findExisting: async () => null,
        issueLink: async () => ({ ok: true, issuedLink: { public_key: 'nope' } })
      }),
      (error) => error.status === 403
    );
  });

  it('refuses preview mode', async () => {
    await assert.rejects(
      () => openGuardianSchoolRelease({ userId: 1, clientId: 928, preview: true, db: db([]) }),
      (error) => error.status === 403
    );
  });
});
