import pool from '../config/database.js';
import { readClientInsurance } from './clientInsurance.service.js';
import GuardianPaymentCard from '../models/GuardianPaymentCard.model.js';
import StripePaymentsService, { getStripePublishableKey } from './stripePayments.service.js';
import { encryptFamilyBilling, decryptFamilyBilling } from './familyBillingEncryption.service.js';
import { billingError, requireResponsiblePayer, auditBilling } from './familyBillingPolicy.service.js';
import { hasMedicaidCoverage } from '../utils/insurancePaymentPolicy.js';

export function verifyPaymentResult(intent, { amountCents, currency, customerId }) {
  if (intent.status !== 'succeeded' || Number(intent.amount_received) !== Number(amountCents) || String(intent.currency).toLowerCase() !== String(currency).toLowerCase() || (typeof intent.customer === 'string' ? intent.customer : intent.customer?.id) !== customerId) throw billingError(409, 'Payment has not been confirmed by Stripe');
}
export async function payFamilyCharge({ agencyId, userId, chargeId, expectedAmountCents, automatic = false }) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [rows] = await db.execute('SELECT * FROM learning_session_charges WHERE id = ? AND agency_id = ? FOR UPDATE', [chargeId, agencyId]);
    const charge = rows[0];
    if (!charge) throw billingError(404, 'Charge not found');
    const payer = await requireResponsiblePayer(userId, charge.client_id, agencyId, db);
    if (charge.charge_status === 'CAPTURED') { await db.commit(); return { paid: true, alreadyPaid: true }; }
    if (!['PENDING', 'FAILED', 'AUTHORIZED'].includes(charge.charge_status) || !Number.isSafeInteger(Number(charge.total_cents)) || Number(charge.total_cents) < 1) throw billingError(409, 'Charge is not payable');
    if (!automatic && Number(expectedAmountCents) !== Number(charge.total_cents)) throw billingError(409, 'The amount changed. Review the bill before paying.');
    const insurance = await readClientInsurance(charge.client_id, agencyId, db);
    // This ledger does not yet prove a charge is an independently billable
    // nonclinical service. Neither a manual click nor recurring consent can
    // override Medicaid protections. Reconciliation of money already received
    // remains available; this guard prevents new collection attempts.
    if (hasMedicaidCoverage(insurance)) throw billingError(409, 'Medicaid coverage is recorded. Billing must review this charge before collecting a patient payment.');
    const [familyBalance] = await db.execute("SELECT id FROM family_receivables WHERE agency_id=? AND source_type='learning_charge' AND source_key=?", [agencyId, String(chargeId)]);
    if (familyBalance.length) throw billingError(409, 'This charge uses assigned payer shares. Pay it under Balances and payment tasks.');
    const cards = await GuardianPaymentCard.findActiveByGuardian(userId, agencyId, db);
    const card = cards.find(c => Number(c.id) === Number(payer.payment_card_id));
    if (!card?.stripe_payment_method_id || !card?.connected_account_id) throw billingError(409, 'Assign your own verified card to this client first');
    const [merchant] = await db.execute("SELECT stripe_connect_account_id FROM agency_billing_accounts WHERE agency_id = ? AND stripe_connect_status = 'active'", [agencyId]);
    if (merchant[0]?.stripe_connect_account_id !== card.connected_account_id) throw billingError(409, 'This card belongs to a different payment account. Add it again for this organization.');
    if (automatic) {
      if ((insurance?.primary?.memberId || insurance?.secondary?.memberId) && charge.charge_type === 'SESSION_FEE') throw billingError(409, 'Insurance must be adjudicated before automatically charging a patient balance');
      const [consents] = await db.execute("SELECT id FROM guardian_billing_consents WHERE id = ? AND agency_id = ? AND guardian_user_id = ? AND client_id = ? AND payment_card_id = ? AND purpose = 'recurring' AND revoked_at IS NULL", [payer.consent_id || 0, agencyId, userId, charge.client_id, card.id]);
      if (!consents.length || Number(charge.total_cents) > Number(payer.recurring_limit_cents || 0)) throw billingError(409, 'No current recurring authorization covers this charge');
    }
    const baseKey = `family_charge:${agencyId}:${chargeId}`;
    const [previous] = await db.execute("SELECT * FROM learning_payments WHERE agency_id = ? AND learning_session_charge_id = ? AND processor = 'STRIPE' AND idempotency_key LIKE 'family_charge:%' ORDER BY id DESC LIMIT 1 FOR UPDATE", [agencyId, chargeId]);
    let previousPayment = previous[0];
    let key = previousPayment?.idempotency_key || baseKey;
    // A different guardian cannot inherit a pending request or its authentication secret.
    if (previousPayment && Number(previousPayment.created_by_user_id) !== Number(userId)) throw billingError(409, 'A payment is already in progress. Contact billing before retrying.');
    if (previousPayment && !previousPayment.processor_intent_id && Date.now() - new Date(previousPayment.created_at).getTime() > 23 * 3600000) throw billingError(409, 'This payment needs reconciliation before retrying');
    let snapshot = previousPayment?.metadata_json ? decryptFamilyBilling(previousPayment.metadata_json, `family-payment:${agencyId}:${chargeId}`) : { customerId: card.stripe_customer_id, paymentMethodId: card.stripe_payment_method_id, accountId: card.connected_account_id, amountCents: Number(charge.total_cents), currency: String(charge.currency || 'USD').toLowerCase() };
    if (snapshot.amountCents !== Number(charge.total_cents)) throw billingError(409, 'A pending payment has a different amount. Contact billing before retrying.');
    // Only a definitively cancelled intent permits a fresh attempt. Keep the
    // charge row locked while cancelling so competing requests cannot fork it.
    // Processing, successful, and unknown attempts always retain their key.
    if (!automatic && previousPayment?.processor_intent_id && snapshot.paymentMethodId !== card.stripe_payment_method_id) {
      const oldIntent = await StripePaymentsService.retrievePaymentIntent(previousPayment.processor_intent_id, snapshot.accountId);
      if (['requires_payment_method', 'canceled'].includes(oldIntent.status)) {
        const cancelled = oldIntent.status === 'canceled' ? oldIntent : await StripePaymentsService.cancelPaymentIntent(oldIntent.id, snapshot.accountId);
        if (cancelled.status !== 'canceled') throw billingError(409, 'The previous payment needs reconciliation before retrying');
        await db.execute("UPDATE learning_payments SET payment_status = 'VOIDED' WHERE id = ?", [previousPayment.id]);
        key = `${baseKey}:after:${previousPayment.id}`;
        previousPayment = null;
        snapshot = { customerId:card.stripe_customer_id, paymentMethodId:card.stripe_payment_method_id, accountId:card.connected_account_id, amountCents:Number(charge.total_cents), currency:String(charge.currency || 'USD').toLowerCase() };
      }
    }
    if (!previousPayment) await db.execute(`INSERT INTO learning_payments (agency_id, learning_session_charge_id, amount_cents, currency, payment_status, processor, idempotency_key, created_by_user_id, metadata_json) VALUES (?, ?, ?, ?, 'REQUIRES_ACTION', 'STRIPE', ?, ?, ?)`, [agencyId, chargeId, charge.total_cents, charge.currency || 'USD', key, userId, encryptFamilyBilling(snapshot, `family-payment:${agencyId}:${chargeId}`)]);
    // Persist the attempt before the external call. Its stable key is reused after
    // a network interruption; no new key is generated by the browser.
    await db.commit();
    let intent;
    try {
      intent = previousPayment?.processor_intent_id
        ? await StripePaymentsService.retrievePaymentIntent(previousPayment.processor_intent_id, snapshot.accountId)
        : await StripePaymentsService.chargePaymentMethod({ customerId: snapshot.customerId, paymentMethodId: snapshot.paymentMethodId, connectedAccountId: snapshot.accountId, amountCents: snapshot.amountCents, currency: snapshot.currency, metadata: { agency_id: String(agencyId), family_charge_id: String(chargeId) }, idempotencyKey: key });
    } catch (e) {
      const pending = e.payment_intent || e.raw?.payment_intent;
      if (!pending?.id) throw e;
      intent = await StripePaymentsService.retrievePaymentIntent(pending.id, snapshot.accountId);
    }
    if (Number(intent.amount) !== snapshot.amountCents || intent.currency !== snapshot.currency || (typeof intent.customer === 'string' ? intent.customer : intent.customer?.id) !== snapshot.customerId) throw billingError(409, 'Processor payment does not match this bill');
    await db.execute('UPDATE learning_payments SET processor_intent_id = ? WHERE idempotency_key = ?', [intent.id, key]);
    const authenticationRequired = intent.status === 'requires_payment_method' && (intent.last_payment_error?.code === 'authentication_required' || intent.last_payment_error?.decline_code === 'authentication_required');
    if (!automatic && (intent.status === 'requires_action' || authenticationRequired)) return { paid:false, requiresAction:true, clientSecret:intent.client_secret, ...(authenticationRequired ? {paymentMethodId:snapshot.paymentMethodId} : {}), connectedAccountId:snapshot.accountId, publishableKey:getStripePublishableKey() };
    if (intent.status === 'requires_payment_method' || intent.status === 'canceled') throw billingError(402, 'This payment was declined. Assign another verified card and retry, or contact billing.');
    verifyPaymentResult(intent, { amountCents:snapshot.amountCents, currency:snapshot.currency, customerId:snapshot.customerId });
    await db.beginTransaction();
    await db.execute("UPDATE learning_payments SET payment_status = 'CAPTURED', captured_at = CURRENT_TIMESTAMP WHERE idempotency_key = ?", [key]);
    await db.execute("UPDATE learning_session_charges SET charge_status = 'CAPTURED', captured_at = CURRENT_TIMESTAMP WHERE id = ? AND agency_id = ?", [chargeId, agencyId]);
    await auditBilling({ agencyId, userId, clientId: charge.client_id, action: automatic ? 'automatic_payment_captured' : 'payment_captured', objectId: chargeId }, db);
    await db.commit();
    return { paid: true };
  } catch (e) {
    await db.rollback();
    // Never return Stripe objects or card/customer identifiers in errors.
    if (e.type?.startsWith('Stripe')) throw billingError(402, 'The payment could not be completed. Contact billing or use another card.');
    throw e;
  } finally { db.release(); }
}

/** Signed webhook reconciliation uses the stored payment snapshot, not metadata
 * supplied by a browser or the payer's subsequently changed default card. */
export async function reconcileFamilyPayment(intent, connectedAccountId) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [rows] = await db.execute("SELECT * FROM learning_payments WHERE processor = 'STRIPE' AND processor_intent_id = ? AND idempotency_key LIKE 'family_charge:%' FOR UPDATE", [intent.id]);
    if (!rows.length) { await db.commit(); return false; }
    for (const payment of rows) {
      const snapshot = decryptFamilyBilling(payment.metadata_json, `family-payment:${payment.agency_id}:${payment.learning_session_charge_id}`);
      if (!snapshot || snapshot.accountId !== connectedAccountId) throw billingError(403, 'Payment account mismatch');
      verifyPaymentResult(intent, snapshot);
      if (['CAPTURED','VOIDED','REFUNDED'].includes(payment.payment_status)) continue;
      await db.execute("UPDATE learning_payments SET payment_status = 'CAPTURED', captured_at = CURRENT_TIMESTAMP WHERE id = ?", [payment.id]);
      await db.execute("UPDATE learning_session_charges SET charge_status = 'CAPTURED', captured_at = CURRENT_TIMESTAMP WHERE id = ? AND agency_id = ?", [payment.learning_session_charge_id,payment.agency_id]);
      await auditBilling({agencyId:payment.agency_id,userId:payment.created_by_user_id,action:'processor_payment_reconciled',objectId:payment.id},db);
    }
    await db.commit(); return true;
  } catch(e) {await db.rollback();throw e;} finally{db.release();}
}
