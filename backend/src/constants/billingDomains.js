export const BILLING_DOMAIN = Object.freeze({
  AGENCY_SUBSCRIPTION: 'agency_subscription',
  CLIENT_GUARDIAN_PAYMENT: 'client_guardian_payment'
});

export const SUBSCRIPTION_MERCHANT_MODE = Object.freeze({
  AGENCY_MANAGED: 'agency_managed',
  PLATFORM_MANAGED: 'platform_managed'
});

export const SUBSCRIPTION_PAYMENT_PROVIDER = Object.freeze({
  QUICKBOOKS: 'QUICKBOOKS',
  STRIPE: 'STRIPE'
});

export const CLIENT_PAYMENTS_MODE = Object.freeze({
  NOT_CONFIGURED: 'not_configured',
  AGENCY_MANAGED: 'agency_managed',
  PLATFORM_MANAGED: 'platform_managed'
});

export const CONNECTION_OWNER_TYPE = Object.freeze({
  PLATFORM: 'platform',
  AGENCY: 'agency'
});

export function normalizeSubscriptionMerchantMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === SUBSCRIPTION_MERCHANT_MODE.PLATFORM_MANAGED) return SUBSCRIPTION_MERCHANT_MODE.PLATFORM_MANAGED;
  return SUBSCRIPTION_MERCHANT_MODE.AGENCY_MANAGED;
}

export function normalizeSubscriptionPaymentProvider(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === SUBSCRIPTION_PAYMENT_PROVIDER.STRIPE) return SUBSCRIPTION_PAYMENT_PROVIDER.STRIPE;
  return SUBSCRIPTION_PAYMENT_PROVIDER.QUICKBOOKS;
}

export function normalizeClientPaymentsMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === CLIENT_PAYMENTS_MODE.AGENCY_MANAGED) return CLIENT_PAYMENTS_MODE.AGENCY_MANAGED;
  if (normalized === CLIENT_PAYMENTS_MODE.PLATFORM_MANAGED) return CLIENT_PAYMENTS_MODE.PLATFORM_MANAGED;
  return CLIENT_PAYMENTS_MODE.NOT_CONFIGURED;
}

export function getConnectionOwnerForSubscriptionMode(mode) {
  return normalizeSubscriptionMerchantMode(mode) === SUBSCRIPTION_MERCHANT_MODE.PLATFORM_MANAGED
    ? CONNECTION_OWNER_TYPE.PLATFORM
    : CONNECTION_OWNER_TYPE.AGENCY;
}
