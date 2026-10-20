import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { seedGuardianExperienceFinancial } from '../guardianExperienceFinancialFixture.mjs';
import { encryptFamilyBilling, decryptFamilyBilling } from '../../services/familyBillingEncryption.service.js';

process.env.FAMILY_BILLING_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString('base64');
process.env.FAMILY_BILLING_ENCRYPTION_KEY_ID = 'fixture-test';
const inputs = {
  actorId: 1, guardianId: 2, run: 'financial_fixture_test', now: new Date('2026-10-20T15:00:00Z'),
  billingTerms: 'Fixture standard billing terms', billingTermsVersion: 'fixture-terms-v1',
  clients: [
    { id: 3, agencyId: 2, setting: 'office', name: 'A Demo' },
    { id: 4, agencyId: 6, setting: 'office', name: 'B Demo' },
    { id: 5, agencyId: 2, setting: 'school', name: 'C Demo' }
  ]
};

function mockDatabase({ guardianDemo = 1, clientDemo = 1, secondaryMedicaid = false } = {}) {
  const calls = [];
  let nextId = 100;
  return {
    calls,
    async execute(sql, args) {
      calls.push({ sql, args });
      if (sql.includes('FROM users')) return [[{
        id: 2, is_demo: guardianDemo, role: 'client_guardian',
        email: 'guardian-test-bennett-20261020@example.com', first_name: 'Jordan', last_name: 'Bennett'
      }]];
      if (sql.includes('FROM clients')) {
        const client = inputs.clients.find(row => row.id === args[0]);
        return [[{
          id: client.id, agency_id: client.agencyId, organization_id: client.setting === 'school' ? 376 : client.agencyId,
          is_demo: clientDemo,
          billing_insurance_payload: encryptFamilyBilling({
            primary: { insurerName: 'Demo commercial plan', memberId: 'FICTIONAL123', isMedicaid: false },
            secondary: secondaryMedicaid ? { insurerName: 'Medicaid', memberId: 'FICTIONAL456', isMedicaid: true } : null
          }, `client-insurance:${client.agencyId}:${client.id}`)
        }]];
      }
      if (sql.includes('FROM client_guardians')) return [[{ id: 1 }]];
      if (sql.startsWith('SELECT') && sql.includes('has_receivable')) return [[{ has_receivable: 0, has_payer: 0, has_readiness: 0 }]];
      if (sql.startsWith('SELECT') && sql.includes('FROM guardian_payment_cards')) return [[]];
      if (sql.startsWith('SELECT') && sql.includes('FROM family_billing_tasks')) return [[]];
      if (sql.startsWith('INSERT')) return [{ insertId: nextId++ }];
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
}

test('seeds $80 across office children with unchargeable expired display cards and no consent or school charges', async () => {
  const db = mockDatabase();
  const output = await seedGuardianExperienceFinancial({ ...inputs, db });
  assert.equal(output.totalDueCents, 8000);
  assert.deepEqual(output.clients.map(client => client.totalDueCents), [5000, 3000]);
  assert.equal(output.clients.flatMap(client => client.balances).length, 3);
  const writes = db.calls.filter(call => call.sql.startsWith('INSERT'));
  assert.ok(writes.every(call => !call.sql.includes('client_coverage_') && !call.sql.includes('guardian_billing_consents')));
  const cards = writes.filter(call => call.sql.includes('INTO guardian_payment_cards'));
  assert.equal(cards.length, 2);
  for (const { sql, args } of cards) {
    assert.match(sql, /auto_charge,is_default,is_active\)\s+VALUES \(\?,\?,'STRIPE',\?,0,1,1\)/);
    const card = decryptFamilyBilling(args[2], `card:${args[1]}:${args[0]}`);
    assert.equal(card.card_exp_year, '2025');
    assert.equal(card.card_exp_month, '09');
    assert.equal(card.card_last4, '4242');
    assert.equal(card.stripe_customer_id, undefined);
    assert.equal(card.stripe_payment_method_id, undefined);
    assert.equal(card.connected_account_id, undefined);
    assert.equal(card.fictionalDemo, true);
  }
  const balances = writes.filter(call => call.sql.includes('INTO family_receivables'));
  const tasks = writes.filter(call => call.sql.includes('INTO family_billing_tasks'));
  assert.equal(tasks.length, 2);
  assert.ok(output.clients.every(client => Number.isSafeInteger(client.billingTaskId)));
  assert.notEqual(tasks[0].args[3], tasks[1].args[3]);
  for (const { sql, args } of tasks) {
    assert.deepEqual(JSON.parse(args[2]), args[0] === 2 ? [3] : [4]);
    assert.match(sql, /'Update expired payment card — Demo','pending'/);
    assert.match(sql, /'pending',\?,\?,1,/);
    assert.match(args[3], /^[a-f0-9]{64}$/);
    const outputClient = output.clients.find(client => client.agencyId === args[0]);
    assert.match(outputClient.billingTaskToken, /^[a-f0-9]{64}$/);
    assert.equal(crypto.createHash('sha256').update(outputClient.billingTaskToken).digest('hex'), args[3]);
    assert.ok(!args.includes(outputClient.billingTaskToken));
    assert.equal(+args[4] - +inputs.now, 7 * 86400000);
    assert.equal(args[5], inputs.billingTermsVersion);
    const waiver = decryptFamilyBilling(args[6], `billing-task:${args[0]}:${args[1]}`);
    assert.equal(waiver.terms, inputs.billingTerms);
    assert.equal(waiver.version, inputs.billingTermsVersion);
    assert.equal(waiver.fictionalDemo, true);
    assert.match(waiver.additionalTerms, /No payment authorization or signature has been recorded/);
    assert.equal(waiver.signatureName, undefined);
    assert.ok(!sql.includes('signed_evidence_encrypted'));
  }
  const readiness = writes.filter(call => call.sql.includes('INTO client_billing_readiness'));
  for (const { args } of balances) {
    assert.notEqual(args[1], 5);
    assert.match(args[2], /^financial_fixture_test:/);
    const ready = readiness.find(row => row.args[1] === args[1]);
    assert.equal(args[8], ready.args[2]);
    const evidence = decryptFamilyBilling(args[6], `receivable:${args[0]}:${args[1]}`);
    assert.equal(evidence.responsibilityType, 'copay');
    assert.equal(evidence.fictionalDemo, true);
  }
});

test('refuses real guardians, real children, or any Medicaid copay fixture before writes', async () => {
  for (const options of [{ guardianDemo: 0 }, { clientDemo: 0 }, { secondaryMedicaid: true }]) {
    const db = mockDatabase(options);
    await assert.rejects(seedGuardianExperienceFinancial({ ...inputs, db }), /non-demo guardian|unrelated client|without Medicaid/);
    assert.ok(db.calls.every(call => call.sql.startsWith('SELECT')));
  }
});
