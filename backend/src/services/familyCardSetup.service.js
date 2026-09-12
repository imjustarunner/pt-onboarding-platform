import pool from '../config/database.js';
import StripePaymentsService from './stripePayments.service.js';
import GuardianPaymentCard, { paymentCardSummary } from '../models/GuardianPaymentCard.model.js';
import { assertFamilyBillingEncryption, encryptFamilyBilling, decryptFamilyBilling } from './familyBillingEncryption.service.js';
import { billingError, recordBillingConsent, auditBilling } from './familyBillingPolicy.service.js';

export async function createFamilyCardSetup({ agencyId, userId, submissionId = null, email, name, connectedAccountId }) {
  assertFamilyBillingEncryption();
  if (!connectedAccountId) throw billingError(503, 'Secure card collection is not configured for this organization');
  // Public intake never obtains the existing account's customer or saved cards.
  const customer = await StripePaymentsService.ensureAppCustomer({ customerKey: submissionId ? `intake_${agencyId}_${submissionId}` : `guardian_${userId}_agency_${agencyId}`, email, name, connectedAccountId, metadata: { agency_id: String(agencyId) } });
  const intent = await StripePaymentsService.createSetupIntent({ customerId: customer.id, connectedAccountId });
  await pool.execute(`INSERT INTO guardian_card_setups (setup_intent_id, agency_id, guardian_user_id, intake_submission_id, stripe_account_id, private_payload) VALUES (?, ?, ?, ?, ?, ?)`, [intent.id, agencyId, userId, submissionId, connectedAccountId, encryptFamilyBilling({customerId:customer.id}, `card-setup:${agencyId}:${userId}:${submissionId || 0}`)]);
  return { clientSecret: intent.client_secret, connectedAccountId };
}
export function validateSetupOwnership({ setup, userId, agencyId, submissionId, intent, method }) {
  if (!setup || Number(setup.guardian_user_id) !== Number(userId) || Number(setup.agency_id) !== Number(agencyId) || Number(setup.intake_submission_id || 0) !== Number(submissionId || 0)) throw billingError(403, 'Card setup is not authorized for this account');
  const id = v => typeof v === 'string' ? v : v?.id;
  if (intent.status !== 'succeeded' || id(intent.customer) !== setup.customer_id || id(intent.payment_method) !== method.id || id(method.customer) !== setup.customer_id || method.type !== 'card') throw billingError(409, 'Stripe has not confirmed this card setup');
}
export async function completeFamilyCardSetup({ agencyId, userId, submissionId = null, setupIntentId, consent, ip, userAgent }) {
  if (!/^seti_[A-Za-z0-9]+$/.test(String(setupIntentId || ''))) throw billingError(400, 'A confirmed Stripe SetupIntent is required');
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [rows] = await db.execute('SELECT * FROM guardian_card_setups WHERE setup_intent_id = ? FOR UPDATE', [setupIntentId]);
    const setup = rows[0];
    if (!setup || Number(setup.guardian_user_id) !== Number(userId) || Number(setup.agency_id) !== Number(agencyId) || Number(setup.intake_submission_id || 0) !== Number(submissionId || 0)) throw billingError(403, 'Card setup is not authorized for this account');
    setup.customer_id = decryptFamilyBilling(setup.private_payload, `card-setup:${agencyId}:${userId}:${submissionId || 0}`).customerId;
    const intent = await StripePaymentsService.retrieveSetupIntent(setupIntentId, setup.stripe_account_id);
    const method = await StripePaymentsService.getPaymentMethod(typeof intent.payment_method === 'string' ? intent.payment_method : intent.payment_method?.id, setup.stripe_account_id);
    validateSetupOwnership({ setup, userId, agencyId, submissionId, intent, method });
    let cardId = setup.payment_card_id;
    if (!cardId) {
      const c = method.card;
      cardId = await GuardianPaymentCard.create({ guardianUserId: userId, agencyId, stripeCustomerId: setup.customer_id, stripePaymentMethodId: method.id, connectedAccountId: setup.stripe_account_id, setupIntentId, cardBrand: c.brand, cardLast4: c.last4, cardExpMonth: String(c.exp_month), cardExpYear: String(c.exp_year), cardholderName: method.billing_details?.name || null, intakeSubmissionId: submissionId }, db);
      await recordBillingConsent({ userId, agencyId, cardId, submissionId, purpose: 'store_card', consent, ip, userAgent }, db);
      await db.execute('UPDATE guardian_card_setups SET payment_card_id = ? WHERE setup_intent_id = ?', [cardId, setupIntentId]);
      await auditBilling({ agencyId, userId, action: 'card_saved', objectId: cardId }, db);
    }
    const card = (await GuardianPaymentCard.findActiveByGuardian(userId, agencyId, db)).find(c => Number(c.id) === Number(cardId));
    if (!card) throw billingError(409, 'This payment method was removed');
    await db.commit();
    return paymentCardSummary(card);
  } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
}
