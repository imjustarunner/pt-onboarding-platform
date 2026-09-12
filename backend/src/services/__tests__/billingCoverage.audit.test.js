import test, { after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import { hasMedicaidCoverage, shouldSuppressInsurancePayment } from '../../utils/insurancePaymentPolicy.js';
import * as browserPolicy from '../../../../frontend/src/utils/insurancePaymentPolicy.js';
import { validateIntakeBilling } from '../intakeBillingValidation.service.js';
import { payFamilyCharge } from '../familyBillingPayment.service.js';
import { encryptFamilyBilling } from '../familyBillingEncryption.service.js';
import { assertPackagePaymentBinding, assertPackageStripeResult } from '../packagePaymentPolicy.service.js';
import { checkoutPackage, confirmPackageCheckout, listClientEntitlements } from '../../controllers/bookingPackages.controller.js';
import User from '../../models/User.model.js';
import { insuranceForIntakeClient } from '../clientInsurance.service.js';
import BookingPackage from '../../models/BookingPackage.model.js';
import BookingPackagePayment from '../../models/BookingPackagePayment.model.js';
import Stripe from '../stripePayments.service.js';
import { confirmPackageCheckout as confirmSavedPackage } from '../unifiedPackageCatalog.service.js';

beforeEach(() => { mock.restoreAll(); process.env.FAMILY_BILLING_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 3).toString('base64'); process.env.FAMILY_BILLING_ENCRYPTION_KEY_ID = 'v1'; });
after(async () => { mock.restoreAll(); await pool.end(); });
const coverageCases = [
  [null, false], [{ primary: { insurerName: 'Commercial' } }, false],
  [{ primary: { isMedicaid: true } }, true],
  [{ primary: { insurerName: 'Commercial' }, secondary: { insurerName: 'Health First Colorado' } }, true],
  [{ isSelfPay: true, secondary: { isMedicaid: 1 } }, true],
  [{ primaryIsMedicaid: true }, true],
  [{ primary: { insurerName: 'CHP+' } }, false],
  [{ clientCoverages: [{ confirmed: true, primary: { insurerName: 'Medicaid' } }] }, true]
];
test('server and browser agree on primary, secondary, and child-specific Medicaid protection', () => {
  for (const [info, expected] of coverageCases) {
    assert.equal(hasMedicaidCoverage(info), expected);
    assert.equal(browserPolicy.hasMedicaidCoverage(info), expected);
    for (const channel of ['mental_health', '', 'tutoring', 'coaching', 'consulting', 'mentorship']) {
      assert.equal(shouldSuppressInsurancePayment(info, channel), browserPolicy.shouldSuppressInsurancePayment(info, channel));
      assert.equal(shouldSuppressInsurancePayment(info, channel), expected && ['', 'mental_health'].includes(channel));
    }
  }
});
test('mental-health enrollment with secondary Medicaid never queries or requires a card', async () => {
  mock.method(pool, 'execute', async () => { throw new Error('Must not query card collection'); });
  await validateIntakeBilling({ agencyId: 1, submission: { id: 2 }, link: { master_channel: 'mental_health', intake_steps: [{ type: 'payment_collection' }] }, intakeData: { insuranceInfo: { primary: { insurerName: 'Commercial' }, secondary: { isMedicaid: true } } } });
});
test('self-pay preferences do not discard declared Medicaid from canonical client coverage', () => {
  const policy = insuranceForIntakeClient({ isSelfPay: true, primary: { insurerName: 'Commercial' }, secondary: { insurerName: 'Health First Colorado', memberId: 'SYNTHETIC' } }, 0, 1);
  assert.equal(policy.secondary.memberId, 'SYNTHETIC');
});
test('nonclinical enrollment still requires a verified card when collection is enabled', async () => {
  mock.method(pool, 'execute', async sql => sql.includes('agency_billing_accounts') ? [[{ stripe_connect_account_id: 'acct_test' }]] : [[]]);
  await assert.rejects(validateIntakeBilling({ agencyId: 1, submission: { id: 2 }, link: { master_channel: 'tutoring', intake_steps: [{ type: 'insurance_info', paymentOnly: true }] }, intakeData: { insuranceInfo: { secondary: { isMedicaid: true } } } }), e => e.status === 409);
});
for (const automatic of [false, true]) test(`Medicaid blocks ${automatic ? 'automatic' : 'payer-initiated'} ledger collection before a card or Stripe is accessed`, async () => {
  const db = { beginTransaction: async () => {}, rollback: async () => {}, release() {}, execute: async sql => {
    if (sql.includes('learning_session_charges')) return [[{ id: 5, agency_id: 1, client_id: 10, total_cents: 2500, charge_status: 'PENDING' }]];
    if (sql.includes('client_guardians')) return [[{ access_enabled: 1, relationship_type: 'guardian' }]];
    if (sql.includes('client_billing_payers')) return [[{ guardian_user_id: 2 }]];
    if (sql.includes('billing_insurance_payload')) return [[{ billing_insurance_payload: encryptFamilyBilling({ secondary: { isMedicaid: true } }, 'client-insurance:1:10') }]];
    throw new Error('Card or payment write must not be reached');
  } };
  mock.method(pool, 'getConnection', async () => db);
  await assert.rejects(payFamilyCharge({ agencyId: 1, userId: 2, chargeId: 5, expectedAmountCents: 2500, automatic }), e => e.status === 409 && e.message.includes('Medicaid'));
});
const binding = () => ({ agencyId: 1, clientId: 10, packageId: 3, paymentIntentId: 'pi_test', purchaserUserId: 2,
  entitlement: { id: 4, agencyId: 1, clientId: 10, packageId: 3, purchaserUserId: 2, stripePaymentIntentId: 'pi_test', paymentStatus: 'PAID' },
  payment: { id: 8, agencyId: 1, clientId: 10, packageId: 3, entitlementId: 4, processorIntentId: 'pi_test', processor: 'STRIPE', amountCents: 9000, currency: 'usd', paymentStatus: 'SUCCEEDED', metadata: { connectedAccountId: 'acct_test' } }
});
test('paid package replay cannot substitute another client, agency, package, owner, or intent', () => {
  const value = binding(); assert.doesNotThrow(() => assertPackagePaymentBinding(value));
  for (const patch of [{ agencyId: 9 }, { clientId: 99 }, { packageId: 9 }, { purchaserUserId: 99 }, { paymentIntentId: 'pi_other' }, { entitlement: null }, { payment: null }]) assert.throws(() => assertPackagePaymentBinding({ ...value, ...patch }));
  for (const patch of [{ entitlementId: 99 }, { processor: 'MANUAL' }, { amountCents: -1 }, { paymentStatus: 'REFUNDED' }]) assert.throws(() => assertPackagePaymentBinding({ ...value, payment: { ...value.payment, ...patch } }));
});
test('package fulfillment verifies captured amount, currency, account and all metadata', () => {
  const value = binding(); const expected = { ...value, connectedAccountId: 'acct_test' };
  const intent = { id: 'pi_test', status: 'succeeded', amount: 9000, amount_received: 9000, currency: 'usd', metadata: { source: 'unified_booking_package', agency_id: '1', client_id: '10', package_id: '3', entitlement_id: '4' } };
  assert.doesNotThrow(() => assertPackageStripeResult(intent, expected));
  for (const patch of [{ amount_received: 1 }, { amount: 1 }, { currency: 'eur' }, { status: 'processing' }, { id: 'pi_other' }]) assert.throws(() => assertPackageStripeResult({ ...intent, ...patch }, expected));
  for (const key of Object.keys(intent.metadata)) assert.throws(() => assertPackageStripeResult({ ...intent, metadata: { ...intent.metadata, [key]: 'other' } }, expected));
  assert.throws(() => assertPackageStripeResult(intent, { ...expected, connectedAccountId: 'acct_other' }));
});
test('tenant membership alone cannot read or buy packages for an unrelated client', async () => {
  mock.method(User, 'getAgencyMembership', async () => ({ agency_id: 1 }));
  mock.method(pool, 'execute', async sql => { assert.ok(sql.includes('client_guardians')); return [[]]; });
  for (const handler of [checkoutPackage, confirmPackageCheckout, listClientEntitlements]) {
    let denied = false;
    const res = { status(code) { assert.equal(code, 403); denied = true; return this; }, json() {} };
    await handler({ user: { id: 2, role: 'guardian' }, params: { agencyId: '1', clientId: '10', packageId: '3' }, body: { clientId: 10, purchaserUserId: 99 }, query: {} }, res, e => { assert.equal(e.status, 403); denied = true; });
    assert.equal(denied, true);
  }
});
test('package confirmation checks ownership before replay and never restores exhausted credits', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_synthetic_only';
  const value = binding(); value.entitlement.status = 'EXHAUSTED';
  mock.method(BookingPackage, 'findById', async () => ({ id: 3 }));
  mock.method(BookingPackage, 'findEntitlementByPaymentIntent', async () => value.entitlement);
  mock.method(BookingPackagePayment, 'findByIntentId', async () => value.payment);
  mock.method(BookingPackage, 'activateEntitlement', async () => { throw new Error('Must not grant credits again'); });
  mock.method(pool, 'execute', async sql => { assert.ok(sql.includes('agency_billing_accounts')); return [[{ stripe_connect_account_id: 'acct_test', stripe_connect_status: 'active' }]]; });
  const retrieve = mock.method(Stripe, 'retrievePaymentIntent', async (id, account) => {
    assert.equal(account, 'acct_test');
    return { id, status: 'succeeded', amount: 9000, amount_received: 9000, currency: 'usd', metadata: { source: 'unified_booking_package', agency_id: '1', client_id: '10', package_id: '3', entitlement_id: '4' } };
  });
  await assert.rejects(confirmSavedPackage({ ...value, clientId: 99 }), e => e.status === 409);
  assert.equal(retrieve.mock.callCount(), 0);
  const result = await confirmSavedPackage(value);
  assert.equal(result.alreadyActivated, true); assert.equal(result.entitlement.status, 'EXHAUSTED');
});

test('secondary Medicaid cannot silently reuse a shared member ID for siblings', async () => {
  const info = { primary: { insurerName: 'Commercial', memberId: 'PARENT' }, secondary: { insurerName: 'Health First Colorado', memberId: 'SHARED' }, coverageScope: 'account_holder', clientCoverages: [{ clientIndex: 0, confirmed: true }, { clientIndex: 1, confirmed: true }] };
  assert.equal(insuranceForIntakeClient(info, 0, 2), null);
  const data = { clients: [{}, {}], insuranceInfo: { ...info, medicaidPlanPosition: 'secondary', medicaidByClient: [{ clientIndex: 0, memberId: 'DUPLICATE' }, { clientIndex: 1, memberId: 'DUPLICATE' }] } };
  await assert.rejects(validateIntakeBilling({ agencyId: 1, submission: { id: 2 }, link: { master_channel: 'mental_health', intake_steps: [{ type: 'payment_collection' }] }, intakeData: data }), e => e.status === 400 && e.message.includes('own Medicaid member ID'));
});
