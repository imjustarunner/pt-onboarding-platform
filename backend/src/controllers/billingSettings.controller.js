import { body, validationResult } from 'express-validator';
import AgencyBillingAccount from '../models/AgencyBillingAccount.model.js';

export const getBillingSettings = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const account = await AgencyBillingAccount.getByAgencyId(agencyId);
    res.json({
      agencyId: parseInt(agencyId, 10),
      billingEmail: account?.billing_email || null
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
    const { billingEmail } = req.body;
    const account = await AgencyBillingAccount.updateBillingEmail(agencyId, billingEmail || null);
    res.json({
      agencyId: parseInt(agencyId, 10),
      billingEmail: account?.billing_email || null
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
    .withMessage('billingEmail must be a valid email or empty')
];

