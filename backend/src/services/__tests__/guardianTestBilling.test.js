import test, { after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import Stripe from '../stripePayments.service.js';
import { encryptFamilyBilling } from '../familyBillingEncryption.service.js';
import { isGuardianTestEmail, isGuardianTestAccount, requireLiveGuardianBilling, requireUnexpiredGuardianTestAccess } from '../guardianTestAccess.service.js';
import { createFamilyCardSetup, completeFamilyCardSetup } from '../familyCardSetup.service.js';
import { payFamilyCharge } from '../familyBillingPayment.service.js';
import { payAllocation } from '../familyLedger/payments.js';
import { draftNotice, sendNotice } from '../familyLedger/collections.js';
import { runDueCopays } from '../familyLedger/copays.js';
import { runDuePlans } from '../familyLedger/plans.js';

const fixture = { email: 'guardian-test-family@example.com', role: 'client_guardian', is_demo: 1 };
const blocked = error => error.code === 'GUARDIAN_TEST_BILLING_DISABLED' && error.status === 409;
let gatewayCalls;
beforeEach(() => {
  mock.restoreAll();
  gatewayCalls = 0;
  for (const method of ['ensureAppCustomer', 'createSetupIntent', 'retrieveSetupIntent', 'getPaymentMethod', 'chargePaymentMethod', 'retrievePaymentIntent']) {
    mock.method(Stripe, method, async () => { gatewayCalls++; throw new Error('Gateway must not be called'); });
  }
  mock.method(pool, 'getConnection', async () => { throw new Error('No transaction should begin'); });
  mock.method(pool, 'execute', async sql => {
    assert.equal(sql, 'SELECT email,role,is_demo FROM users WHERE id=?');
    return [[fixture]];
  });
});
after(async () => { mock.restoreAll(); await pool.end(); await clinicalPool.end(); });

test('only specifically named demo guardians receive financial fixture restrictions', async () => {
  for (const domain of ['com', 'invalid']) {
    const user = { ...fixture, email: `GUARDIAN-TEST-FAMILY@EXAMPLE.${domain}` };
    assert.equal(isGuardianTestEmail(user.email), true);
    assert.equal(isGuardianTestAccount(user), true);
  }
  for (const patch of [{ is_demo: 0 }, { role: 'provider' }, { email: 'parent@example.com' }, { email: 'guardian-test-family@example.com.attacker.test' }]) {
    const user = { ...fixture, ...patch };
    assert.equal(isGuardianTestAccount(user), false);
    mock.method(pool, 'execute', async () => [[user]]);
    await requireLiveGuardianBilling(10);
  }
});

test('example.com test guardians expire at the account boundary', async () => {
  mock.method(pool, 'execute', async () => [[{ ...fixture, is_active: 1, status_expires_at: new Date(0) }]]);
  let status, response;
  await requireUnexpiredGuardianTestAccess({ user: { id: 10, email: fixture.email } }, {
    status(value) { status = value; return this; },
    json(value) { response = value; }
  }, () => assert.fail('Expired account must not proceed'));
  assert.equal(status, 401);
  assert.equal(response.error.code, 'GUARDIAN_TEST_EXPIRED');
});

test('fixture card setup and completion cannot create customers or call Stripe', async () => {
  await assert.rejects(createFamilyCardSetup({ agencyId: 2, userId: 10, connectedAccountId: 'acct_real' }), blocked);
  await assert.rejects(completeFamilyCardSetup({ agencyId: 2, userId: 10, setupIntentId: 'seti_existing' }), blocked);
  assert.equal(gatewayCalls, 0);
});

test('manual and automatic fixture payments stop before transactions and gateway calls', async () => {
  for (const automatic of [false, true]) {
    await assert.rejects(payFamilyCharge({ agencyId: 2, userId: 10, chargeId: 1, expectedAmountCents: 2500, automatic }), blocked);
    await assert.rejects(payAllocation({ agencyId: 2, userId: 10, allocationId: 1, amountCents: 2500, idempotencyKey: 'fixture-payment', automatic }), blocked);
  }
  assert.equal(gatewayCalls, 0);
});

test('fixture billing notice drafts are rejected before writes', async () => {
  await assert.rejects(draftNotice({ agencyId: 2, payerUserId: 10, actorUserId: 3, kind: 'payment_setup' }), blocked);
});

test('previously drafted fixture notices cannot be queued or sent', async () => {
  process.env.FAMILY_BILLING_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 3).toString('base64');
  process.env.FAMILY_BILLING_ENCRYPTION_KEY_ID = 'v1';
  const notice = { id: 1, agency_id: 2, payer_user_id: 10, status: 'draft',
    snapshot_encrypted: encryptFamilyBilling({ email: fixture.email }, 'collections:2:10') };
  mock.method(pool, 'execute', async sql => {
    if (sql.startsWith('SELECT * FROM family_collections_notices')) return [[notice]];
    assert.equal(sql, 'SELECT email,role,is_demo FROM users WHERE id=?');
    return [[fixture]];
  });
  await assert.rejects(sendNotice({ agencyId: 2, noticeId: 1, actorUserId: 3 }), blocked);
});

test('automatic copay and installment scans quietly skip fixture payers', async () => {
  mock.method(pool, 'execute', async sql => {
    if (sql.includes('FROM family_receivable_allocations a JOIN')) return [[{ id: 1, payer_user_id: 10, due: 2500 }]];
    assert.equal(sql, 'SELECT email,role,is_demo FROM users WHERE id=?');
    return [[fixture]];
  });
  mock.method(pool, 'query', async () => [[{ id: 1, payer_user_id: 10 }]]);
  assert.deepEqual(await runDueCopays({ agencyId: 2 }), []);
  assert.deepEqual(await runDuePlans({ agencyId: 2 }), []);
  assert.equal(gatewayCalls, 0);
});
