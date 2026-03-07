import { body, validationResult } from 'express-validator';
import AgencyBillingAccount from '../models/AgencyBillingAccount.model.js';
import AgencyBillingPaymentMethod from '../models/AgencyBillingPaymentMethod.model.js';
import BillingMerchantContextService from '../services/billingMerchantContext.service.js';
import { normalizeClientPaymentsMode, normalizeSubscriptionMerchantMode } from '../constants/billingDomains.js';

export const getBillingSettings = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const account = await AgencyBillingAccount.getByAgencyId(agencyId);
    const qboStatus = await BillingMerchantContextService.getQuickBooksStatusForAgencySubscription(agencyId);
    res.json({
      agencyId: parseInt(agencyId, 10),
      billingEmail: account?.billing_email || null,
      autopayEnabled: !!account?.autopay_enabled,
      subscriptionMerchantMode: account?.subscription_merchant_mode || 'agency_managed',
      clientPaymentsMode: account?.client_payments_mode || 'not_configured',
      quickBooksStatus: qboStatus
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
    const { billingEmail, autopayEnabled, subscriptionMerchantMode, clientPaymentsMode } = req.body;
    const parsedAgencyId = parseInt(agencyId, 10);
    const normalizedMerchantMode = subscriptionMerchantMode === undefined ? undefined : normalizeSubscriptionMerchantMode(subscriptionMerchantMode);
    const normalizedClientPaymentsMode = clientPaymentsMode === undefined ? undefined : normalizeClientPaymentsMode(clientPaymentsMode);
    const existingAccount = await AgencyBillingAccount.getByAgencyId(parsedAgencyId);
    const nextBillingEmail = billingEmail === undefined ? undefined : (billingEmail || null);
    const nextAutopayEnabled = autopayEnabled === undefined ? undefined : !!autopayEnabled;
    const effectiveMerchantMode = normalizedMerchantMode || existingAccount?.subscription_merchant_mode || 'agency_managed';
    const merchantModeWillChange = normalizedMerchantMode && normalizedMerchantMode !== String(existingAccount?.subscription_merchant_mode || 'agency_managed');
    const effectiveAutopayEnabled = nextAutopayEnabled === undefined ? !!existingAccount?.autopay_enabled : nextAutopayEnabled;
    if (merchantModeWillChange && effectiveAutopayEnabled) {
      return res.status(400).json({ error: { message: 'Turn off autopay before switching the subscription billing merchant.' } });
    }
    if (merchantModeWillChange) {
      await AgencyBillingAccount.setSubscriptionMerchantMode(parsedAgencyId, {
        subscriptionMerchantMode: normalizedMerchantMode,
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
      if (!qboStatus?.isConnected || !qboStatus?.paymentsEnabled) {
        const reconnectMessage = effectiveMerchantMode === 'platform_managed'
          ? 'Connect the platform QuickBooks merchant with Payments access before enabling autopay.'
          : 'Reconnect QuickBooks with Payments access before enabling autopay.';
        return res.status(400).json({ error: { message: reconnectMessage } });
      }
      const defaultMethod = await AgencyBillingPaymentMethod.getDefaultForAgency(parsedAgencyId, {
        billingDomain: 'agency_subscription',
        merchantMode: effectiveMerchantMode
      });
      if (!defaultMethod || String(defaultMethod.provider || '').trim().toUpperCase() !== 'QUICKBOOKS_PAYMENTS') {
        return res.status(400).json({ error: { message: 'A default billing card on file is required before enabling autopay.' } });
      }
    }
    const account = await AgencyBillingAccount.updateSettings(agencyId, {
      billingEmail: nextBillingEmail,
      autopayEnabled: nextAutopayEnabled
    });
    const qboStatus = await BillingMerchantContextService.getQuickBooksStatusForAgencySubscription(agencyId);
    res.json({
      agencyId: parseInt(agencyId, 10),
      billingEmail: account?.billing_email || null,
      autopayEnabled: !!account?.autopay_enabled,
      subscriptionMerchantMode: normalizedMerchantMode || account?.subscription_merchant_mode || 'agency_managed',
      clientPaymentsMode: normalizedClientPaymentsMode || account?.client_payments_mode || 'not_configured',
      quickBooksStatus: qboStatus
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
  body('clientPaymentsMode')
    .optional()
    .isIn(['not_configured', 'agency_managed', 'platform_managed'])
    .withMessage('clientPaymentsMode must be not_configured, agency_managed, or platform_managed')
];

