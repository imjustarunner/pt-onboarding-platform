import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, insuranceForDemoChild, provisionGuardianExperience } from '../provisionGuardianExperience.mjs';
import { decryptIntakePayload } from '../../services/intakeResponsesEncryption.service.js';

for (const name of ['FAMILY_BILLING_ENCRYPTION_KEY_BASE64', 'INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64',
  'GUARDIAN_INTAKE_ENCRYPTION_KEY_BASE64', 'CLIENT_PHI_ENCRYPTION_KEY_BASE64']) {
  process.env[name] = Buffer.alloc(32, 9).toString('base64');
}
process.env.FAMILY_BILLING_ENCRYPTION_KEY_ID = 'v1';

function mockDatabase(existing = false) {
  const calls = [];
  let nextId = 100;
  return {
    calls, commits: 0, rollbacks: 0,
    async beginTransaction() {},
    async commit() { this.commits++; },
    async rollback() { this.rollbacks++; },
    async execute(sql, args = []) {
      assert.equal((sql.match(/\?/g) || []).length, args.length, `Placeholder count in ${sql}`);
      assert.ok(args.every(arg => arg !== undefined), 'No undefined SQL argument');
      calls.push({ sql, args });
      if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.startsWith('SELECT RELEASE_LOCK')) return [[{ released: 1 }]];
      if (sql.includes('FROM users') && sql.includes('LIMIT 1')) return [existing ? [{ id: 77 }] : []];
      if (sql.includes('FROM users')) return [[{ id: 10 }]];
      if (sql.includes('FROM agencies')) return [[{ id: 2, name: 'ITSCO' }, { id: 6, name: 'NLU' }, { id: 376, name: 'Hogwarts' }]];
      if (sql.startsWith('INSERT')) {
        const columns = sql.match(/INSERT INTO \w+\s*\(([^)]+)\)/s)[1].split(',');
        const values = sql.match(/VALUES\s*\(((?:'[^']*'|[^)])*)\)/s)[1].match(/'(?:[^']|'')*'|[^,]+/g);
        assert.equal(columns.length, values.length, `INSERT column/value count in ${sql}`);
        return [{ insertId: nextId++, affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected SQL ${sql}`);
    }
  };
}

function dependencies() {
  return {
    GuardianInsuranceProfile: { upsert: async () => 500 },
    writeClientInsurance: async () => {},
    guardianPlanRevision: () => 'revision',
    intakeCommunicationDisclosure: agency => ({ version: 'fixture-test', brandName: agency.name,
      text: 'Optional test emails; no texts.', schoolText: 'No school appointment confirmation required.' }),
    StorageService: {
      saveIntakeBundle: async ({ submissionId }) => ({ relativePath: `fixture/${submissionId}.pdf` }),
      deleteObject: async () => {}
    },
    seedClinical: async ({ clients }) => clients.map((client, index) => ({
      clientId: client.id, agencyId: client.agencyId, setting: client.setting, providerId: 1000 + index,
      officeLocationId: client.setting === 'school' ? null : 6, serviceLocationId: 22 + index,
      planId: 600 + index, acknowledgmentId: 700 + index,
      appointments: [{ id: 800 + index, status: 'confirmed' }]
    })),
    seedFinancial: async () => ({ clients: [], totalDueCents: 8000 })
  };
}

test('prepares an initial-setup account, three completed encrypted enrollments and email-only preferences without sending', async () => {
  const db = mockDatabase(), clinicalDb = mockDatabase();
  const output = await provisionGuardianExperience({
    db, clinicalDb, password: 'FixtureOnlyPass1!', now: new Date('2026-10-20T15:00:00Z'), deps: dependencies()
  });
  assert.equal(output.status, 'complete');
  assert.equal(output.guardian.email, fixture.guardianEmail);
  assert.match(output.guardian.setupUrl, /^https:\/\/app\.itsco\.health\/passwordless-login\/[a-f0-9]{64}$/);
  assert.equal(output.expiresAt, '2026-10-27T15:00:00.000Z');
  assert.equal(output.clients.length, 3);
  const user = db.calls.find(call => call.sql.startsWith('INSERT INTO users'));
  assert.match(user.sql, /NULL,\?,\?,\?,\?,\?,'setup'/);
  assert.ok(user.args.some(value => typeof value === 'string' && value.startsWith('$2')));
  assert.ok(!user.args.includes('FixtureOnlyPass1!'));
  const submissions = db.calls.filter(call => call.sql.startsWith('INSERT INTO intake_submissions'));
  assert.equal(submissions.length, 3);
  for (const { sql, args } of submissions) {
    assert.match(sql, /'submitted'/);
    const envelope = decryptIntakePayload({ ciphertext: args[2], ivB64: args[3], authTagB64: args[4], keyId: args[5] });
    assert.equal(envelope.signerEmail, fixture.guardianEmail);
    assert.equal(envelope.intakeData.responses.submission.communicationPreferences.emailPreference, 'all');
    assert.equal(envelope.intakeData.responses.submission.communicationPreferences.smsPreference, 'no');
  }
  const preferences = db.calls.filter(call => call.sql.startsWith('INSERT INTO client_session_notification_preferences'));
  assert.equal(preferences.length, 6);
  assert.ok(preferences.every(call => JSON.parse(call.args[3]).email && !JSON.parse(call.args[3]).sms && !JSON.parse(call.args[3]).phone));
  assert.equal(db.commits, 1);
  assert.equal(clinicalDb.commits, 1);
});

test('refuses to overwrite an existing demo family before inserts or uploads', async () => {
  const db = mockDatabase(true), clinicalDb = mockDatabase();
  await assert.rejects(provisionGuardianExperience({ db, clinicalDb, password: 'FixtureOnlyPass1!', deps: dependencies() }), /already exists/);
  assert.ok(db.calls.every(call => call.sql.startsWith('SELECT')));
  assert.equal(db.commits, 0);
  assert.equal(clinicalDb.commits, 0);
});

test('only the school child has Medicaid secondary while all commercial cards remain absent', () => {
  const coverage = fixture.clients.map(insuranceForDemoChild);
  assert.ok(coverage.every(row => row.primary.isMedicaid === false));
  assert.deepEqual(coverage.map(row => !!row.secondary?.isMedicaid), [false, false, true]);
  assert.ok(coverage.every(row => !row.primary.cardFrontUrl && !row.primary.cardBackUrl));
});
