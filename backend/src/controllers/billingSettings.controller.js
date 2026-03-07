import { body, validationResult } from 'express-validator';
import AgencyBillingAccount from '../models/AgencyBillingAccount.model.js';
import AgencyBillingPaymentMethod from '../models/AgencyBillingPaymentMethod.model.js';

export const getBillingSettings = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const account = await AgencyBillingAccount.getByAgencyId(agencyId);
    res.json({
      agencyId: parseInt(agencyId, 10),
      billingEmail: account?.billing_email || null,
      autopayEnabled: !!account?.autopay_enabled
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
    const { billingEmail, autopayEnabled } = req.body;
    const parsedAgencyId = parseInt(agencyId, 10);
    const nextBillingEmail = billingEmail === undefined ? undefined : (billingEmail || null);
    const nextAutopayEnabled = autopayEnabled === undefined ? undefined : !!autopayEnabled;
    if (nextAutopayEnabled) {
      const existingAccount = await AgencyBillingAccount.getByAgencyId(parsedAgencyId);
      const effectiveBillingEmail = nextBillingEmail === undefined ? (existingAccount?.billing_email || null) : nextBillingEmail;
      if (!effectiveBillingEmail) {
        return res.status(400).json({ error: { message: 'A billing email is required before enabling autopay.' } });
      }
      if (!existingAccount?.is_qbo_connected || !existingAccount?.qbo_payments_enabled) {
        return res.status(400).json({ error: { message: 'Reconnect QuickBooks with Payments access before enabling autopay.' } });
      }
      const defaultMethod = await AgencyBillingPaymentMethod.getDefaultForAgency(parsedAgencyId);
      if (!defaultMethod || String(defaultMethod.provider || '').trim().toUpperCase() !== 'QUICKBOOKS_PAYMENTS') {
        return res.status(400).json({ error: { message: 'A default QuickBooks Payments card on file is required before enabling autopay.' } });
      }
    }
    const account = await AgencyBillingAccount.updateSettings(agencyId, {
      billingEmail: nextBillingEmail,
      autopayEnabled: nextAutopayEnabled
    });
    res.json({
      agencyId: parseInt(agencyId, 10),
      billingEmail: account?.billing_email || null,
      autopayEnabled: !!account?.autopay_enabled
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
    .withMessage('autopayEnabled must be true or false')
];

