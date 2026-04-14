import AgencyBillingPaymentMethod from '../models/AgencyBillingPaymentMethod.model.js';
import AgencyBillingAccount from '../models/AgencyBillingAccount.model.js';
import Agency from '../models/Agency.model.js';
import QuickBooksPaymentsService from '../services/quickbooksPayments.service.js';
import BillingMerchantContextService from '../services/billingMerchantContext.service.js';
import StripePaymentsService, { getStripePublishableKey } from '../services/stripePayments.service.js';

export const listAgencyBillingPaymentMethods = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const merchantContext = await BillingMerchantContextService.getAgencySubscriptionContext(agencyId);
    const methods = await AgencyBillingPaymentMethod.listByAgency(agencyId, {
      billingDomain: 'agency_subscription',
      merchantMode: merchantContext.merchantMode
    });
    res.json({
      agencyId,
      merchantMode: merchantContext.merchantMode,
      provider: merchantContext.provider,
      providerConnectionId: merchantContext.providerConnectionId,
      methods
    });
  } catch (error) {
    next(error);
  }
};

async function ensureStripeSubscriptionCustomer({ agencyId, merchantContext }) {
  const account = await AgencyBillingAccount.getByAgencyId(agencyId);
  const agency = await Agency.findById(agencyId);
  const existingCustomerId = String(account?.payment_customer_ref || '').trim();
  if (existingCustomerId && String(account?.payment_processor || '').trim().toUpperCase() === 'STRIPE') {
    return existingCustomerId;
  }
  const customer = await StripePaymentsService.ensureAppCustomer({
    customerKey: `agency_subscription_${agencyId}_${merchantContext.merchantMode}`,
    email: account?.billing_email || null,
    name: agency?.name || `Agency ${agencyId}`,
    connectedAccountId: merchantContext.stripeConnectedAccountId || null,
    metadata: {
      agency_id: String(agencyId),
      billing_domain: 'agency_subscription',
      merchant_mode: merchantContext.merchantMode
    }
  });
  await AgencyBillingAccount.setPaymentCustomerRef(agencyId, {
    paymentProcessor: 'STRIPE',
    paymentCustomerRef: customer.id
  });
  return customer.id;
}

export const getAgencyBillingPaymentMethodSetup = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const merchantContext = await BillingMerchantContextService.getAgencySubscriptionContext(agencyId);
    if (merchantContext.provider !== 'STRIPE') {
      return res.status(400).json({ error: { message: 'Stripe is not selected for this tenant billing setup.' } });
    }
    if (!merchantContext.providerReady || !merchantContext.paymentsEnabled) {
      return res.status(400).json({
        error: {
          message: merchantContext.merchantMode === 'platform_managed'
            ? 'Platform Stripe is not configured yet.'
            : 'This tenant must finish Stripe Connect onboarding before saving a Stripe billing card.'
        }
      });
    }

    const customerId = await ensureStripeSubscriptionCustomer({ agencyId, merchantContext });
    const setupIntent = await StripePaymentsService.createSetupIntent({
      customerId,
      connectedAccountId: merchantContext.stripeConnectedAccountId || null
    });

    res.json({
      agencyId,
      provider: merchantContext.provider,
      merchantMode: merchantContext.merchantMode,
      publishableKey: getStripePublishableKey(),
      clientSecret: setupIntent.client_secret,
      customerId,
      connectedAccountId: merchantContext.stripeConnectedAccountId || null
    });
  } catch (error) {
    next(error);
  }
};

function toIntOrNull(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractStoredCardMeta(card = null) {
  const source = card || {};
  return {
    providerPaymentMethodId: source.id || source.cardId || null,
    cardBrand: source.brand || source.cardType || source.type || null,
    last4: source.last4 || source.number?.slice?.(-4) || null,
    expMonth: toIntOrNull(source.expMonth || source.exp_month),
    expYear: toIntOrNull(source.expYear || source.exp_year)
  };
}

export const createAgencyBillingPaymentMethod = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const merchantContext = await BillingMerchantContextService.getAgencySubscriptionContext(agencyId);
    if (merchantContext.provider === 'STRIPE') {
      const stripePaymentMethodId = String(req.body?.stripePaymentMethodId || '').trim() || null;
      if (!stripePaymentMethodId) {
        return res.status(400).json({ error: { message: 'A Stripe payment method is required.' } });
      }
      if (!merchantContext.providerReady || !merchantContext.paymentsEnabled) {
        return res.status(400).json({
          error: {
            message: merchantContext.merchantMode === 'platform_managed'
              ? 'Platform Stripe is not configured yet.'
              : 'This tenant must finish Stripe Connect onboarding before saving a Stripe billing card.'
          }
        });
      }
      const customerId = await ensureStripeSubscriptionCustomer({ agencyId, merchantContext });
      const pm = await StripePaymentsService.attachPaymentMethod({
        customerId,
        paymentMethodId: stripePaymentMethodId,
        connectedAccountId: merchantContext.stripeConnectedAccountId || null
      });
      const cardDetails = pm?.card || {};
      const method = await AgencyBillingPaymentMethod.createFromProcessor({
        agencyId,
        billingDomain: 'agency_subscription',
        merchantMode: merchantContext.merchantMode,
        providerConnectionId: null,
        createdByUserId: req.user?.id || null,
        provider: 'STRIPE',
        providerCustomerId: customerId,
        providerPaymentMethodId: stripePaymentMethodId,
        cardBrand: cardDetails.brand || 'Card',
        last4: cardDetails.last4 || null,
        expMonth: toIntOrNull(cardDetails.exp_month),
        expYear: toIntOrNull(cardDetails.exp_year),
        isDefault: req.body?.isDefault !== false
      });

      return res.status(201).json({
        agencyId,
        merchantMode: merchantContext.merchantMode,
        provider: merchantContext.provider,
        method,
        processorCard: pm?.card || null
      });
    }

    const token = String(req.body?.token || '').trim() || null;
    const card = req.body?.card && typeof req.body.card === 'object' ? req.body.card : null;
    if (!token && !card) {
      return res.status(400).json({ error: { message: 'A QuickBooks payment token or card payload is required.' } });
    }

    const stored = await QuickBooksPaymentsService.createCard({
      agencyId,
      connectionId: merchantContext.providerConnectionId,
      token,
      card
    });
    const meta = extractStoredCardMeta(stored?.card);
    const method = await AgencyBillingPaymentMethod.createFromProcessor({
      agencyId,
      billingDomain: 'agency_subscription',
      merchantMode: merchantContext.merchantMode,
      providerConnectionId: merchantContext.providerConnectionId,
      createdByUserId: req.user?.id || null,
      provider: 'QUICKBOOKS_PAYMENTS',
      providerCustomerId: stored?.customerId || null,
      providerPaymentMethodId: meta.providerPaymentMethodId,
      cardBrand: meta.cardBrand,
      last4: meta.last4,
      expMonth: meta.expMonth,
      expYear: meta.expYear,
      isDefault: req.body?.isDefault !== false
    });

    res.status(201).json({
      agencyId,
      merchantMode: merchantContext.merchantMode,
      provider: merchantContext.provider,
      method,
      processorCard: stored?.card || null
    });
  } catch (error) {
    next(error);
  }
};

export const setAgencyBillingPaymentMethodDefault = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId || 0);
    const paymentMethodId = Number(req.params.paymentMethodId || 0);
    if (!agencyId || !paymentMethodId) {
      return res.status(400).json({ error: { message: 'Invalid payment method selection' } });
    }
    const method = await AgencyBillingPaymentMethod.setDefault({
      agencyId,
      paymentMethodId,
      updatedByUserId: req.user?.id || null,
      billingDomain: 'agency_subscription'
    });
    if (!method) return res.status(404).json({ error: { message: 'Payment method not found' } });
    res.json({ agencyId, method });
  } catch (error) {
    next(error);
  }
};
