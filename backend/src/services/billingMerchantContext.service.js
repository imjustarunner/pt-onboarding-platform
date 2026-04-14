import AgencyBillingAccount from '../models/AgencyBillingAccount.model.js';
import BillingProviderConnection from '../models/BillingProviderConnection.model.js';
import {
  BILLING_DOMAIN,
  CLIENT_PAYMENTS_MODE,
  CONNECTION_OWNER_TYPE,
  SUBSCRIPTION_MERCHANT_MODE,
  SUBSCRIPTION_PAYMENT_PROVIDER,
  getConnectionOwnerForSubscriptionMode,
  normalizeClientPaymentsMode,
  normalizeSubscriptionMerchantMode,
  normalizeSubscriptionPaymentProvider
} from '../constants/billingDomains.js';
import { isStripeConfigured, getStripePublishableKey } from './stripePayments.service.js';

class BillingMerchantContextService {
  static async getAgencySubscriptionContext(agencyId) {
    const parsedAgencyId = Number(agencyId || 0);
    if (!parsedAgencyId) throw new Error('Invalid agencyId');
    const account = await AgencyBillingAccount.getByAgencyId(parsedAgencyId);
    const merchantMode = normalizeSubscriptionMerchantMode(account?.subscription_merchant_mode);
    const provider = normalizeSubscriptionPaymentProvider(account?.subscription_payment_provider);
    const ownerType = getConnectionOwnerForSubscriptionMode(merchantMode);
    const ownerId = ownerType === CONNECTION_OWNER_TYPE.PLATFORM ? 0 : parsedAgencyId;
    let connection = null;
    if (provider === SUBSCRIPTION_PAYMENT_PROVIDER.QUICKBOOKS && account?.subscription_provider_connection_id) {
      connection = await BillingProviderConnection.findById(account.subscription_provider_connection_id);
    }
    if (provider === SUBSCRIPTION_PAYMENT_PROVIDER.QUICKBOOKS && !connection) {
      connection = await BillingProviderConnection.getByOwner({
        ownerType,
        ownerId,
        provider: 'QUICKBOOKS'
      });
    }
    const stripeConnectedAccountId = merchantMode === SUBSCRIPTION_MERCHANT_MODE.AGENCY_MANAGED
      ? (account?.stripe_connect_account_id || null)
      : null;
    const stripeReady = provider === SUBSCRIPTION_PAYMENT_PROVIDER.STRIPE
      ? (merchantMode === SUBSCRIPTION_MERCHANT_MODE.PLATFORM_MANAGED
        ? isStripeConfigured()
        : (isStripeConfigured() && String(account?.stripe_connect_status || '').toLowerCase() === 'active' && !!stripeConnectedAccountId))
      : false;
    return {
      agencyId: parsedAgencyId,
      account,
      billingDomain: BILLING_DOMAIN.AGENCY_SUBSCRIPTION,
      merchantMode,
      provider,
      connectionOwnerType: ownerType,
      connectionOwnerId: ownerId,
      providerConnectionId: connection?.id || null,
      connection,
      stripeConnectedAccountId,
      stripePublishableKey: provider === SUBSCRIPTION_PAYMENT_PROVIDER.STRIPE ? getStripePublishableKey() : null,
      providerReady: provider === SUBSCRIPTION_PAYMENT_PROVIDER.QUICKBOOKS
        ? !!connection?.is_connected
        : stripeReady,
      paymentsEnabled: provider === SUBSCRIPTION_PAYMENT_PROVIDER.QUICKBOOKS
        ? !!connection?.qbo_payments_enabled
        : stripeReady
    };
  }

  static async getAgencyClientPaymentsContext(agencyId) {
    const parsedAgencyId = Number(agencyId || 0);
    if (!parsedAgencyId) throw new Error('Invalid agencyId');
    const account = await AgencyBillingAccount.getByAgencyId(parsedAgencyId);
    const paymentsMode = normalizeClientPaymentsMode(account?.client_payments_mode);
    if (paymentsMode === CLIENT_PAYMENTS_MODE.NOT_CONFIGURED) {
      return {
        agencyId: parsedAgencyId,
        account,
        billingDomain: BILLING_DOMAIN.CLIENT_GUARDIAN_PAYMENT,
        paymentsMode,
        connectionOwnerType: null,
        connectionOwnerId: null,
        providerConnectionId: null,
        connection: null
      };
    }
    const ownerType = paymentsMode === CLIENT_PAYMENTS_MODE.PLATFORM_MANAGED
      ? CONNECTION_OWNER_TYPE.PLATFORM
      : CONNECTION_OWNER_TYPE.AGENCY;
    const ownerId = ownerType === CONNECTION_OWNER_TYPE.PLATFORM ? 0 : parsedAgencyId;
    let connection = null;
    if (account?.client_payments_provider_connection_id) {
      connection = await BillingProviderConnection.findById(account.client_payments_provider_connection_id);
    }
    if (!connection) {
      connection = await BillingProviderConnection.getByOwner({
        ownerType,
        ownerId,
        provider: 'QUICKBOOKS'
      });
    }
    return {
      agencyId: parsedAgencyId,
      account,
      billingDomain: BILLING_DOMAIN.CLIENT_GUARDIAN_PAYMENT,
      paymentsMode,
      connectionOwnerType: ownerType,
      connectionOwnerId: ownerId,
      providerConnectionId: connection?.id || null,
      connection
    };
  }

  static async getQuickBooksStatusForAgencySubscription(agencyId) {
    const context = await this.getAgencySubscriptionContext(agencyId);
    const connection = context.connection;
    return {
      agencyId: context.agencyId,
      merchantMode: context.merchantMode,
      provider: context.provider,
      connectionOwnerType: context.connectionOwnerType,
      connectionOwnerId: context.connectionOwnerId,
      providerConnectionId: context.providerConnectionId,
      isConnected: !!connection?.is_connected,
      paymentsEnabled: !!connection?.qbo_payments_enabled,
      scopeCsv: connection?.qbo_scope_csv || '',
      realmId: connection?.qbo_realm_id || null,
      tokenExpiresAt: connection?.qbo_token_expires_at || null,
      needsReconnectForPayments: !!connection?.is_connected && !connection?.qbo_payments_enabled
    };
  }

  static async ensureSubscriptionPaymentCustomerRef(agencyId, { account = null, merchantMode = null } = {}) {
    const parsedAgencyId = Number(agencyId || 0);
    if (!parsedAgencyId) throw new Error('Invalid agencyId');
    const billingAccount = account || await AgencyBillingAccount.getByAgencyId(parsedAgencyId);
    const existing = String(billingAccount?.payment_customer_ref || '').trim();
    if (existing) return existing;
    const mode = normalizeSubscriptionMerchantMode(merchantMode || billingAccount?.subscription_merchant_mode);
    const provider = normalizeSubscriptionPaymentProvider(billingAccount?.subscription_payment_provider);
    const paymentCustomerRef = mode === SUBSCRIPTION_MERCHANT_MODE.PLATFORM_MANAGED
      ? `platform-agency-${parsedAgencyId}`
      : `agency-${parsedAgencyId}`;
    await AgencyBillingAccount.setPaymentCustomerRef(parsedAgencyId, {
      paymentProcessor: provider === SUBSCRIPTION_PAYMENT_PROVIDER.STRIPE ? 'STRIPE' : 'QUICKBOOKS_PAYMENTS',
      paymentCustomerRef
    });
    return paymentCustomerRef;
  }
}

export default BillingMerchantContextService;
