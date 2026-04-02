import test from 'node:test';
import assert from 'node:assert/strict';

import pool from '../../config/database.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import { upsertGuardianWaiverSection } from '../guardianWaivers.service.js';
import { GUARDIAN_WAIVER_ESIGN_KEY } from '../../utils/guardianWaivers.utils.js';

test('two guardians linked to same client can sign independently', async (t) => {
  const originalListClientsForGuardian = ClientGuardian.listClientsForGuardian;
  const originalPoolExecute = pool.execute;

  t.after(() => {
    ClientGuardian.listClientsForGuardian = originalListClientsForGuardian;
    pool.execute = originalPoolExecute;
  });

  // Simulate guardian -> client links for two separate guardians.
  ClientGuardian.listClientsForGuardian = async ({ guardianUserId }) => {
    const gid = Number(guardianUserId);
    if (gid === 101 || gid === 202) {
      return [{ client_id: 55, access_enabled: 1 }];
    }
    return [];
  };

  // Simulate the two read-only DB checks performed before upsert:
  // - client DOB (adult lock check)
  // - agency feature flags (guardianWaiversEnabled)
  pool.execute = async (sql) => {
    const q = String(sql || '').toLowerCase();
    if (q.includes('select date_of_birth from clients')) {
      return [[{ date_of_birth: '2012-03-14' }]];
    }
    if (q.includes('select c.agency_id, a.feature_flags')) {
      return [[{ agency_id: 9, feature_flags: JSON.stringify({ guardianWaiversEnabled: true }) }]];
    }
    throw new Error(`Unexpected pool.execute query in test: ${sql}`);
  };

  let nextProfileId = 1;
  let nextAttestationId = 1;
  const profiles = new Map(); // key = `${guardianUserId}:${clientId}`

  const fakeConn = {
    async execute(sql, params = []) {
      const q = String(sql || '').toLowerCase();

      if (q.includes('select * from guardian_client_waiver_profiles where guardian_user_id = ? and client_id = ?')) {
        const key = `${Number(params[0])}:${Number(params[1])}`;
        const row = profiles.get(key);
        return [[row ? { ...row } : undefined].filter(Boolean)];
      }

      if (q.includes('insert into guardian_client_waiver_profiles')) {
        const guardianUserId = Number(params[0]);
        const clientId = Number(params[1]);
        const key = `${guardianUserId}:${clientId}`;
        const row = {
          id: nextProfileId++,
          guardian_user_id: guardianUserId,
          client_id: clientId,
          sections_json: '{}'
        };
        profiles.set(key, row);
        return [{ insertId: row.id }];
      }

      if (q.includes('select * from guardian_client_waiver_profiles where id = ?')) {
        const id = Number(params[0]);
        const row = [...profiles.values()].find((p) => Number(p.id) === id);
        return [[row ? { ...row } : undefined].filter(Boolean)];
      }

      if (q.includes('insert into guardian_client_waiver_attestations')) {
        return [{ insertId: nextAttestationId++ }];
      }

      if (q.includes('insert into guardian_client_waiver_history')) {
        return [{ insertId: 1 }];
      }

      if (q.includes('update guardian_client_waiver_profiles set sections_json = ? where id = ?')) {
        const nextSectionsJson = String(params[0] || '{}');
        const id = Number(params[1]);
        const row = [...profiles.values()].find((p) => Number(p.id) === id);
        if (!row) throw new Error(`Profile ${id} not found in test`);
        row.sections_json = nextSectionsJson;
        return [{ affectedRows: 1 }];
      }

      throw new Error(`Unexpected connection query in test: ${sql}`);
    }
  };

  const signature = 'x'.repeat(120);
  const payload = { consented: true, understoodElectronicRecords: true };

  const guardianOneProfile = await upsertGuardianWaiverSection({
    guardianUserId: 101,
    clientId: 55,
    sectionKey: GUARDIAN_WAIVER_ESIGN_KEY,
    payload,
    action: 'create',
    signatureData: signature,
    consentAcknowledged: true,
    intentToSign: true,
    conn: fakeConn
  });

  const guardianTwoProfile = await upsertGuardianWaiverSection({
    guardianUserId: 202,
    clientId: 55,
    sectionKey: GUARDIAN_WAIVER_ESIGN_KEY,
    payload,
    action: 'create',
    signatureData: signature,
    consentAcknowledged: true,
    intentToSign: true,
    conn: fakeConn
  });

  assert.ok(guardianOneProfile);
  assert.ok(guardianTwoProfile);
  assert.notEqual(guardianOneProfile.id, guardianTwoProfile.id);
  assert.equal(Number(guardianOneProfile.client_id), 55);
  assert.equal(Number(guardianTwoProfile.client_id), 55);
  assert.equal(Number(guardianOneProfile.guardian_user_id), 101);
  assert.equal(Number(guardianTwoProfile.guardian_user_id), 202);

  const g1Sections = JSON.parse(guardianOneProfile.sections_json || '{}');
  const g2Sections = JSON.parse(guardianTwoProfile.sections_json || '{}');
  assert.equal(g1Sections[GUARDIAN_WAIVER_ESIGN_KEY]?.status, 'active');
  assert.equal(g2Sections[GUARDIAN_WAIVER_ESIGN_KEY]?.status, 'active');
});

