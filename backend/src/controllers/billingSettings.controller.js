import { body, validationResult } from 'express-validator';
import AgencyBillingAccount from '../models/AgencyBillingAccount.model.js';
import AgencyBillingPaymentMethod from '../models/AgencyBillingPaymentMethod.model.js';
import BillingMerchantContextService from '../services/billingMerchantContext.service.js';
import { normalizeClientPaymentsMode, normalizeSubscriptionMerchantMode, normalizeSubscriptionPaymentProvider } from '../constants/billingDomains.js';
import pool from '../config/database.js';
import { getEffectiveBillingPricingForAgency, getFeatureCatalog, resolveFeatureEntitlements } from '../services/billingPricing.service.js';
import { getStripePublishableKey, isStripeConfigured } from '../services/stripePayments.service.js';

function parseJsonMaybe(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeRollout(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const status = String(value.status || 'coming_soon').trim().toLowerCase() === 'active' ? 'active' : 'coming_soon';
  return {
    status,
    comingSoonMessage: String(value.comingSoonMessage || 'Platform billing is coming soon for this tenant. Invoices and payment collection will appear here once billing is activated.').trim(),
    activationLabel: String(value.activationLabel || '').trim() || null,
    activatedAt: value.activatedAt ? String(value.activatedAt) : null,
    activatedByUserId: Number.isFinite(Number(value.activatedByUserId)) ? Number(value.activatedByUserId) : null
  };
}

function buildRolloutResponse(raw) {
  const rollout = normalizeRollout(parseJsonMaybe(raw) || {});
  return {
    ...rollout,
    isActive: rollout.status === 'active'
  };
}

function normalizeFeatureControls(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  return {
    allAlaCarteDisabled: value.allAlaCarteDisabled === true
  };
}

function extractFeatureControls(featureEntitlementsJson) {
  const raw = parseJsonMaybe(featureEntitlementsJson) || {};
  return normalizeFeatureControls(raw.__settings);
}

function mergeFeatureSettings(featureEntitlementsJson, featureControls, nextEntitlements = null) {
  const raw = parseJsonMaybe(featureEntitlementsJson) || {};
  const merged = nextEntitlements && typeof nextEntitlements === 'object'
    ? { ...raw, ...nextEntitlements }
    : { ...raw };
  const controls = normalizeFeatureControls(featureControls);
  if (controls.allAlaCarteDisabled) merged.__settings = controls;
  else delete merged.__settings;
  return merged;
}

function sanitizeAgencyFeatureSelections(requested, resolvedEntitlements, catalog, featureControls = null) {
  const next = {};
  const payload = requested && typeof requested === 'object' ? requested : {};
  const controls = normalizeFeatureControls(featureControls);
  for (const [key, entitlement] of Object.entries(resolvedEntitlements || {})) {
    const feature = catalog?.[key] || {};
    const incoming = payload?.[key] && typeof payload[key] === 'object' ? payload[key] : {};
    const canSelfServe =
      controls.allAlaCarteDisabled !== true &&
      feature.tenantSelfServe !== false &&
      entitlement.available === true &&
      entitlement.locked !== true;
    next[key] = {
      ...entitlement,
      enabled: canSelfServe && incoming.enabled !== undefined ? incoming.enabled === true : entitlement.enabled === true,
      quantity: canSelfServe && feature.pricingModel === 'manual_quantity' && Number.isFinite(Number(incoming.quantity))
        ? Math.max(0, Number(incoming.quantity))
        : entitlement.quantity
    };
  }
  return next;
}

async function getStripeConnectStatusForAgency(agencyId) {
  const [rows] = await pool.query(
    `SELECT stripe_connect_account_id, stripe_connect_status
     FROM agency_billing_accounts WHERE agency_id = ? LIMIT 1`,
    [agencyId]
  );
  const row = rows[0];
  return {
    stripeConnectStatus: row?.stripe_connect_status || 'not_connected',
    stripeConnectAccountId: row?.stripe_connect_account_id || null
  };
}

function buildSubscriptionProviderStatus({ account, merchantMode, quickBooksStatus, stripeConnect }) {
  const provider = normalizeSubscriptionPaymentProvider(account?.subscription_payment_provider);
  if (provider === 'STRIPE') {
    const stripeReady = merchantMode === 'platform_managed'
      ? isStripeConfigured()
      : (isStripeConfigured() && stripeConnect?.stripeConnectStatus === 'active' && !!stripeConnect?.stripeConnectAccountId);
    return {
      provider,
      isConnected: stripeReady,
      paymentsEnabled: stripeReady,
      needsReconnectForPayments: merchantMode === 'agency_managed' ? !stripeReady : false,
      stripePublishableKey: getStripePublishableKey(),
      stripeConnectedAccountId: merchantMode === 'agency_managed' ? (stripeConnect?.stripeConnectAccountId || null) : null
    };
  }
  return {
    provider: 'QUICKBOOKS',
    isConnected: !!quickBooksStatus?.isConnected,
    paymentsEnabled: !!quickBooksStatus?.paymentsEnabled,
    needsReconnectForPayments: !!quickBooksStatus?.needsReconnectForPayments,
    stripePublishableKey: null,
    stripeConnectedAccountId: null
  };
}

function maskStripePublishableKey(key) {
  const raw = String(key || '').trim();
  if (!raw) return null;
  if (raw.length <= 10) return raw;
  return `${raw.slice(0, 7)}...${raw.slice(-4)}`;
}

export const getPlatformStripeStatus = async (req, res, next) => {
  try {
    const publishableKey = getStripePublishableKey();
    const configured = isStripeConfigured() && !!publishableKey;
    res.json({
      configured,
      mode: 'platform_managed',
      provider: 'STRIPE',
      publishableKeyPresent: !!publishableKey,
      publishableKeyPreview: maskStripePublishableKey(publishableKey),
      message: configured
        ? 'Platform Stripe is ready for tenant subscription and feature billing.'
        : 'Platform Stripe is not configured yet. Add STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY on the server.'
    });
  } catch (error) {
    next(error);
  }
};

export const getBillingSettings = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const account = await AgencyBillingAccount.getByAgencyId(agencyId);
    const qboStatus = await BillingMerchantContextService.getQuickBooksStatusForAgencySubscription(agencyId);
    const stripeConnect = await getStripeConnectStatusForAgency(agencyId);
    const subscriptionProviderStatus = buildSubscriptionProviderStatus({
      account,
      merchantMode: account?.subscription_merchant_mode || 'agency_managed',
      quickBooksStatus: qboStatus,
      stripeConnect
    });
    const pricingBundle = await getEffectiveBillingPricingForAgency(agencyId);
    const featureCatalog = getFeatureCatalog(pricingBundle?.effective);
    const featureEntitlements = resolveFeatureEntitlements({
      pricingConfig: pricingBundle?.effective,
      featureEntitlementsJson: account?.feature_entitlements_json || null
    });
    res.json({
      agencyId: parseInt(agencyId, 10),
      billingEmail: account?.billing_email || null,
      autopayEnabled: !!account?.autopay_enabled,
      subscriptionMerchantMode: account?.subscription_merchant_mode || 'agency_managed',
      subscriptionPaymentProvider: normalizeSubscriptionPaymentProvider(account?.subscription_payment_provider),
      clientPaymentsMode: account?.client_payments_mode || 'not_configured',
      billingRollout: buildRolloutResponse(account?.billing_rollout_json),
      billingProviderReadiness: {
        subscriptionProvider: subscriptionProviderStatus.provider.toLowerCase(),
        subscriptionStripeReady: subscriptionProviderStatus.provider === 'STRIPE' && subscriptionProviderStatus.paymentsEnabled,
        invoicesEnabled: true,
        invoiceDownloadsEnabled: true,
        receiptDownloadsEnabled: true
      },
      quickBooksStatus: qboStatus,
      subscriptionProviderStatus,
      stripeConnectStatus: stripeConnect.stripeConnectStatus,
      stripeConnectAccountId: stripeConnect.stripeConnectAccountId,
      featureCatalog,
      featureEntitlements,
      featureControls: extractFeatureControls(account?.feature_entitlements_json || null)
    });
  } catch (error) {
    next(error);
  }
};

export const updateBillingSettings = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }
    const { agencyId } = req.params;
    const {
      billingEmail,
      autopayEnabled,
      subscriptionMerchantMode,
      subscriptionPaymentProvider,
      clientPaymentsMode,
      billingRollout,
      featureEntitlements,
      featureControls
    } = req.body;
    const parsedAgencyId = parseInt(agencyId, 10);
    const normalizedMerchantMode = subscriptionMerchantMode === undefined ? undefined : normalizeSubscriptionMerchantMode(subscriptionMerchantMode);
    const normalizedPaymentProvider = subscriptionPaymentProvider === undefined ? undefined : normalizeSubscriptionPaymentProvider(subscriptionPaymentProvider);
    const normalizedClientPaymentsMode = clientPaymentsMode === undefined ? undefined : normalizeClientPaymentsMode(clientPaymentsMode);
    const existingAccount = await AgencyBillingAccount.getByAgencyId(parsedAgencyId);
    const nextBillingEmail = billingEmail === undefined ? undefined : (billingEmail || null);
    const nextAutopayEnabled = autopayEnabled === undefined ? undefined : !!autopayEnabled;
    const effectiveMerchantMode = normalizedMerchantMode || existingAccount?.subscription_merchant_mode || 'agency_managed';
    const effectivePaymentProvider = normalizedPaymentProvider || normalizeSubscriptionPaymentProvider(existingAccount?.subscription_payment_provider);
    const merchantModeWillChange = normalizedMerchantMode && normalizedMerchantMode !== String(existingAccount?.subscription_merchant_mode || 'agency_managed');
    const paymentProviderWillChange = normalizedPaymentProvider && normalizedPaymentProvider !== normalizeSubscriptionPaymentProvider(existingAccount?.subscription_payment_provider);
    const effectiveAutopayEnabled = nextAutopayEnabled === undefined ? !!existingAccount?.autopay_enabled : nextAutopayEnabled;
    const existingRollout = buildRolloutResponse(existingAccount?.billing_rollout_json);
    const nextRollout = billingRollout === undefined ? existingRollout : normalizeRollout(billingRollout);
    if (billingRollout !== undefined && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can activate tenant billing rollout.' } });
    }
    if (featureControls !== undefined && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can change tenant feature controls.' } });
    }
    if ((merchantModeWillChange || paymentProviderWillChange) && effectiveAutopayEnabled) {
      return res.status(400).json({ error: { message: 'Turn off autopay before switching the subscription billing merchant or payment provider.' } });
    }
    if (effectiveAutopayEnabled && nextRollout.status !== 'active') {
      return res.status(400).json({ error: { message: 'Activate billing for this tenant before enabling autopay.' } });
    }
    if (merchantModeWillChange || paymentProviderWillChange) {
      await AgencyBillingAccount.setSubscriptionMerchantMode(parsedAgencyId, {
        subscriptionMerchantMode: normalizedMerchantMode,
        subscriptionPaymentProvider: normalizedPaymentProvider,
        resetSubscriptionProcessorState: true
      });
      await AgencyBillingPaymentMethod.deactivateAllForAgency({
        agencyId: parsedAgencyId,
        updatedByUserId: req.user?.id || null,
        billingDomain: 'agency_subscription'
      });
    }
    if (normalizedClientPaymentsMode !== undefined) {
      await AgencyBillingAccount.setClientPaymentsMode(parsedAgencyId, {
        clientPaymentsMode: normalizedClientPaymentsMode
      });
    }
    if (effectiveAutopayEnabled) {
      const effectiveBillingEmail = nextBillingEmail === undefined ? (existingAccount?.billing_email || null) : nextBillingEmail;
      if (!effectiveBillingEmail) {
        return res.status(400).json({ error: { message: 'A billing email is required before enabling autopay.' } });
      }
      const qboStatus = await BillingMerchantContextService.getQuickBooksStatusForAgencySubscription(parsedAgencyId);
      const stripeConnect = await getStripeConnectStatusForAgency(parsedAgencyId);
      const subscriptionProviderStatus = buildSubscriptionProviderStatus({
        account: {
          ...existingAccount,
          subscription_merchant_mode: effectiveMerchantMode,
          subscription_payment_provider: effectivePaymentProvider
        },
        merchantMode: effectiveMerchantMode,
        quickBooksStatus: qboStatus,
        stripeConnect
      });
      if (!subscriptionProviderStatus?.isConnected || !subscriptionProviderStatus?.paymentsEnabled) {
        const reconnectMessage = effectivePaymentProvider === 'STRIPE'
          ? (effectiveMerchantMode === 'platform_managed'
            ? 'Configure platform Stripe before enabling Stripe autopay.'
            : 'Connect and activate the agency Stripe account before enabling Stripe autopay.')
          : (effectiveMerchantMode === 'platform_managed'
            ? 'Connect the platform QuickBooks merchant with Payments access before enabling autopay.'
            : 'Reconnect QuickBooks with Payments access before enabling autopay.');
        return res.status(400).json({ error: { message: reconnectMessage } });
      }
      const defaultMethod = await AgencyBillingPaymentMethod.getDefaultForAgency(parsedAgencyId, {
        billingDomain: 'agency_subscription',
        merchantMode: effectiveMerchantMode
      });
      const requiredProvider = effectivePaymentProvider === 'STRIPE' ? 'STRIPE' : 'QUICKBOOKS_PAYMENTS';
      if (!defaultMethod || String(defaultMethod.provider || '').trim().toUpperCase() !== requiredProvider) {
        return res.status(400).json({ error: { message: `A default ${effectivePaymentProvider === 'STRIPE' ? 'Stripe' : 'QuickBooks'} billing card on file is required before enabling autopay.` } });
      }
    }
    const account = await AgencyBillingAccount.updateSettings(agencyId, {
      billingEmail: nextBillingEmail,
      autopayEnabled: nextAutopayEnabled,
      subscriptionPaymentProvider: normalizedPaymentProvider
    });
    if (billingRollout !== undefined) {
      await AgencyBillingAccount.updateBillingRollout(parsedAgencyId, {
        ...nextRollout,
        activatedAt: nextRollout.status === 'active'
          ? (existingRollout.status === 'active' ? existingRollout.activatedAt : new Date().toISOString())
          : null,
        activatedByUserId: nextRollout.status === 'active'
          ? (req.user?.id || null)
          : null
      });
    }
    if (featureEntitlements !== undefined || featureControls !== undefined) {
      const pricingBundle = await getEffectiveBillingPricingForAgency(parsedAgencyId);
      const catalog = getFeatureCatalog(pricingBundle?.effective);
      const resolvedEntitlements = resolveFeatureEntitlements({
        pricingConfig: pricingBundle?.effective,
        featureEntitlementsJson: existingAccount?.feature_entitlements_json || null
      });
      const nextFeatureControls = featureControls === undefined
        ? extractFeatureControls(existingAccount?.feature_entitlements_json || null)
        : normalizeFeatureControls(featureControls);
      const nextEntitlements = featureEntitlements !== undefined
        ? sanitizeAgencyFeatureSelections(featureEntitlements, resolvedEntitlements, catalog, nextFeatureControls)
        : null;
      await AgencyBillingAccount.updateFeatureEntitlements(
        parsedAgencyId,
        mergeFeatureSettings(existingAccount?.feature_entitlements_json || null, nextFeatureControls, nextEntitlements)
      );
    }
    const refreshedAccount = await AgencyBillingAccount.getByAgencyId(parsedAgencyId);
    const qboStatus = await BillingMerchantContextService.getQuickBooksStatusForAgencySubscription(agencyId);
    const stripeConnect = await getStripeConnectStatusForAgency(parsedAgencyId);
    const refreshedProviderStatus = buildSubscriptionProviderStatus({
      account: refreshedAccount,
      merchantMode: normalizedMerchantMode || refreshedAccount?.subscription_merchant_mode || 'agency_managed',
      quickBooksStatus: qboStatus,
      stripeConnect
    });
    const pricingBundle = await getEffectiveBillingPricingForAgency(parsedAgencyId);
    const resolvedEntitlements = resolveFeatureEntitlements({
      pricingConfig: pricingBundle?.effective,
      featureEntitlementsJson: refreshedAccount?.feature_entitlements_json || null
    });
    res.json({
      agencyId: parseInt(agencyId, 10),
      billingEmail: refreshedAccount?.billing_email || null,
      autopayEnabled: !!refreshedAccount?.autopay_enabled,
      subscriptionMerchantMode: normalizedMerchantMode || refreshedAccount?.subscription_merchant_mode || 'agency_managed',
      subscriptionPaymentProvider: normalizeSubscriptionPaymentProvider(normalizedPaymentProvider || refreshedAccount?.subscription_payment_provider),
      clientPaymentsMode: normalizedClientPaymentsMode || refreshedAccount?.client_payments_mode || 'not_configured',
      billingRollout: buildRolloutResponse(refreshedAccount?.billing_rollout_json),
      billingProviderReadiness: {
        subscriptionProvider: normalizeSubscriptionPaymentProvider(normalizedPaymentProvider || refreshedAccount?.subscription_payment_provider).toLowerCase(),
        subscriptionStripeReady: refreshedProviderStatus.provider === 'STRIPE' && refreshedProviderStatus.paymentsEnabled,
        invoicesEnabled: true,
        invoiceDownloadsEnabled: true,
        receiptDownloadsEnabled: true
      },
      featureCatalog: getFeatureCatalog(pricingBundle?.effective),
      featureEntitlements: resolvedEntitlements,
      featureControls: extractFeatureControls(refreshedAccount?.feature_entitlements_json || null),
      quickBooksStatus: qboStatus,
      subscriptionProviderStatus: refreshedProviderStatus
    });
  } catch (error) {
    next(error);
  }
};

export const billingSettingsValidators = [
  body('billingEmail')
    .optional({ nullable: true })
    .custom((v) => {
      if (v === null || v === undefined || v === '') return true;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v));
    })
    .withMessage('billingEmail must be a valid email or empty'),
  body('autopayEnabled')
    .optional()
    .isBoolean()
    .withMessage('autopayEnabled must be true or false'),
  body('subscriptionMerchantMode')
    .optional()
    .isIn(['agency_managed', 'platform_managed'])
    .withMessage('subscriptionMerchantMode must be agency_managed or platform_managed'),
  body('subscriptionPaymentProvider')
    .optional()
    .isIn(['QUICKBOOKS', 'STRIPE', 'quickbooks', 'stripe'])
    .withMessage('subscriptionPaymentProvider must be QUICKBOOKS or STRIPE'),
  body('clientPaymentsMode')
    .optional()
    .isIn(['not_configured', 'agency_managed', 'platform_managed'])
    .withMessage('clientPaymentsMode must be not_configured, agency_managed, or platform_managed'),
  body('billingRollout')
    .optional()
    .isObject()
    .withMessage('billingRollout must be an object'),
  body('billingRollout.status')
    .optional()
    .isIn(['coming_soon', 'active'])
    .withMessage('billingRollout.status must be coming_soon or active'),
  body('featureEntitlements')
    .optional()
    .isObject()
    .withMessage('featureEntitlements must be an object'),
  body('featureControls')
    .optional()
    .isObject()
    .withMessage('featureControls must be an object'),
  body('featureControls.allAlaCarteDisabled')
    .optional()
    .isBoolean()
    .withMessage('featureControls.allAlaCarteDisabled must be true or false')
];
