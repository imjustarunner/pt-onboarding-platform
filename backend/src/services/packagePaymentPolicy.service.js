import { billingError } from './familyBillingPolicy.service.js';

export function assertPackagePaymentBinding({ entitlement, payment, agencyId, clientId, packageId, paymentIntentId, purchaserUserId }) {
  const matches = (row) => row && Number(row.agencyId) === Number(agencyId)
    && Number(row.clientId) === Number(clientId) && Number(row.packageId) === Number(packageId);
  if (!paymentIntentId || !matches(entitlement) || !matches(payment)
    || entitlement.stripePaymentIntentId !== paymentIntentId
    || payment.processorIntentId !== paymentIntentId || payment.processor !== 'STRIPE'
    || Number(payment.entitlementId) !== Number(entitlement.id)
    || !Number.isSafeInteger(payment.amountCents) || payment.amountCents <= 0
    || !['PENDING', 'SUCCEEDED'].includes(payment.paymentStatus)
    || (purchaserUserId != null && Number(entitlement.purchaserUserId) !== Number(purchaserUserId))) {
    throw billingError(409, 'Payment does not match this client’s saved package checkout');
  }
}

export function assertPackageStripeResult(intent, { entitlement, payment, connectedAccountId }) {
  const meta = intent?.metadata || {};
  if (!connectedAccountId || !intent || intent.id !== payment.processorIntentId
    || intent.status !== 'succeeded' || Number(intent.amount_received) !== payment.amountCents
    || Number(intent.amount) !== payment.amountCents
    || String(intent.currency).toLowerCase() !== String(payment.currency).toLowerCase()
    || meta.source !== 'unified_booking_package'
    || String(meta.agency_id) !== String(payment.agencyId)
    || String(meta.client_id) !== String(payment.clientId)
    || String(meta.package_id) !== String(payment.packageId)
    || String(meta.entitlement_id) !== String(entitlement.id)
    || (payment.metadata?.connectedAccountId && payment.metadata.connectedAccountId !== connectedAccountId)) {
    throw billingError(409, 'Stripe has not confirmed the expected package payment');
  }
}
