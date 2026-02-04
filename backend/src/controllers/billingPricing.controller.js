import { body, validationResult } from 'express-validator';
import AgencyBillingAccount from '../models/AgencyBillingAccount.model.js';
import PlatformBillingPricing from '../models/PlatformBillingPricing.model.js';
import { getEffectiveBillingPricingForAgency, getPlatformBillingPricing } from '../services/billingPricing.service.js';

function requireValid(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    return false;
  }
  return true;
}

export const pricingValidators = [
  body('pricing').not().isEmpty().withMessage('pricing is required'),
  body('pricing.baseFeeCents').optional().isInt({ min: 0 }).withMessage('baseFeeCents must be a non-negative integer'),
  body('pricing.included').optional().isObject().withMessage('included must be an object'),
  body('pricing.included.schools').optional().isInt({ min: 0 }),
  body('pricing.included.programs').optional().isInt({ min: 0 }),
  body('pricing.included.admins').optional().isInt({ min: 0 }),
  body('pricing.included.activeOnboardees').optional().isInt({ min: 0 }),
  body('pricing.unitCents').optional().isObject().withMessage('unitCents must be an object'),
  body('pricing.unitCents.school').optional().isInt({ min: 0 }),
  body('pricing.unitCents.program').optional().isInt({ min: 0 }),
  body('pricing.unitCents.admin').optional().isInt({ min: 0 }),
  body('pricing.unitCents.onboardee').optional().isInt({ min: 0 }),
  body('pricing.unitCents.phoneNumber').optional().isInt({ min: 0 }),
  body('pricing.smsUnitCents').optional().isObject().withMessage('smsUnitCents must be an object'),
  body('pricing.smsUnitCents.inboundClient').optional().isInt({ min: 0 }),
  body('pricing.smsUnitCents.outboundClient').optional().isInt({ min: 0 }),
  body('pricing.smsUnitCents.notification').optional().isInt({ min: 0 })
];

export const platformPricingValidators = [
  body('pricing').isObject().withMessage('pricing must be an object'),
  ...pricingValidators.slice(1)
];

export const agencyPricingOverrideValidators = [
  body('pricing')
    .custom((v) => v === null || (typeof v === 'object' && !Array.isArray(v)))
    .withMessage('pricing must be an object or null'),
  body('pricing.baseFeeCents')
    .if((value, { req }) => req.body?.pricing != null)
    .optional()
    .isInt({ min: 0 })
    .withMessage('baseFeeCents must be a non-negative integer'),
  body('pricing.included')
    .if((value, { req }) => req.body?.pricing != null)
    .optional()
    .isObject()
    .withMessage('included must be an object'),
  body('pricing.included.schools').if((v, { req }) => req.body?.pricing != null).optional().isInt({ min: 0 }),
  body('pricing.included.programs').if((v, { req }) => req.body?.pricing != null).optional().isInt({ min: 0 }),
  body('pricing.included.admins').if((v, { req }) => req.body?.pricing != null).optional().isInt({ min: 0 }),
  body('pricing.included.activeOnboardees').if((v, { req }) => req.body?.pricing != null).optional().isInt({ min: 0 }),
  body('pricing.unitCents')
    .if((value, { req }) => req.body?.pricing != null)
    .optional()
    .isObject()
    .withMessage('unitCents must be an object'),
  body('pricing.unitCents.school').if((v, { req }) => req.body?.pricing != null).optional().isInt({ min: 0 }),
  body('pricing.unitCents.program').if((v, { req }) => req.body?.pricing != null).optional().isInt({ min: 0 }),
  body('pricing.unitCents.admin').if((v, { req }) => req.body?.pricing != null).optional().isInt({ min: 0 }),
  body('pricing.unitCents.onboardee').if((v, { req }) => req.body?.pricing != null).optional().isInt({ min: 0 }),
  body('pricing.unitCents.phoneNumber').if((v, { req }) => req.body?.pricing != null).optional().isInt({ min: 0 }),
  body('pricing.smsUnitCents')
    .if((value, { req }) => req.body?.pricing != null)
    .optional()
    .isObject()
    .withMessage('smsUnitCents must be an object'),
  body('pricing.smsUnitCents.inboundClient').if((v, { req }) => req.body?.pricing != null).optional().isInt({ min: 0 }),
  body('pricing.smsUnitCents.outboundClient').if((v, { req }) => req.body?.pricing != null).optional().isInt({ min: 0 }),
  body('pricing.smsUnitCents.notification').if((v, { req }) => req.body?.pricing != null).optional().isInt({ min: 0 })
];

export const getPlatformPricing = async (req, res, next) => {
  try {
    const pricing = await getPlatformBillingPricing();
    res.json({ pricing });
  } catch (e) {
    next(e);
  }
};

export const updatePlatformPricing = async (req, res, next) => {
  try {
    if (!requireValid(req, res)) return;
    const pricing = req.body?.pricing || {};
    const saved = await PlatformBillingPricing.upsertPricingJson(pricing);
    res.json({ pricing: saved });
  } catch (e) {
    next(e);
  }
};

export const getAgencyPricing = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const parsedAgencyId = parseInt(agencyId, 10);
    if (!parsedAgencyId || Number.isNaN(parsedAgencyId)) {
      return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    }

    const acct = await AgencyBillingAccount.getByAgencyId(parsedAgencyId);
    const { platform, override, effective } = await getEffectiveBillingPricingForAgency(parsedAgencyId);
    res.json({
      agencyId: parsedAgencyId,
      billingEmail: acct?.billing_email || null,
      platformPricing: platform,
      pricingOverride: override,
      effectivePricing: effective
    });
  } catch (e) {
    next(e);
  }
};

export const updateAgencyPricingOverride = async (req, res, next) => {
  try {
    if (!requireValid(req, res)) return;
    const { agencyId } = req.params;
    const parsedAgencyId = parseInt(agencyId, 10);
    if (!parsedAgencyId || Number.isNaN(parsedAgencyId)) {
      return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    }

    const override = req.body?.pricing || null;
    const acct = await AgencyBillingAccount.updatePricingOverride(parsedAgencyId, override);
    const { platform, override: savedOverride, effective } = await getEffectiveBillingPricingForAgency(parsedAgencyId);
    res.json({
      agencyId: parsedAgencyId,
      billingEmail: acct?.billing_email || null,
      platformPricing: platform,
      pricingOverride: savedOverride,
      effectivePricing: effective
    });
  } catch (e) {
    next(e);
  }
};

