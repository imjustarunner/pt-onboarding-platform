import BillingUsageService from '../services/billingUsage.service.js';
import { buildEstimate, getEffectiveBillingPricingForAgency } from '../services/billingPricing.service.js';
import { formatPeriodLabel, getCurrentBillingPeriod } from '../utils/billingPeriod.js';

export const getAgencyAddons = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const parsedAgencyId = parseInt(agencyId, 10);
    if (!parsedAgencyId || Number.isNaN(parsedAgencyId)) {
      return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    }
    const pricingBundle = await getEffectiveBillingPricingForAgency(parsedAgencyId);
    const addons = pricingBundle?.effective?.addonsEnabled || {};
    const billingMomentumList = Boolean(addons.momentumList);

    const Agency = (await import('../models/Agency.model.js')).default;
    const agency = await Agency.findById(parsedAgencyId);
    const flags = agency?.feature_flags
      ? (typeof agency.feature_flags === 'string' ? (() => { try { return JSON.parse(agency.feature_flags); } catch { return {}; } })() : agency.feature_flags)
      : {};
    const featureFlagMomentumList = Boolean(flags.momentumListEnabled);

    res.json({
      agencyId: parsedAgencyId,
      momentumList: billingMomentumList || featureFlagMomentumList
    });
  } catch (error) {
    next(error);
  }
};

export const getAgencyBillingEstimate = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const parsedAgencyId = parseInt(agencyId, 10);
    if (!parsedAgencyId || Number.isNaN(parsedAgencyId)) {
      return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    }

    const period = getCurrentBillingPeriod(new Date());
    const usage = await BillingUsageService.getUsage(parsedAgencyId, {
      periodStart: period.periodStart,
      periodEnd: period.periodEnd
    });
    const pricingBundle = await getEffectiveBillingPricingForAgency(parsedAgencyId);
    const estimate = buildEstimate(usage, pricingBundle.effective);

    res.json({
      agencyId: parsedAgencyId,
      billingCycle: {
        periodStart: period.periodStart.toISOString().slice(0, 10),
        periodEnd: period.periodEnd.toISOString().slice(0, 10),
        label: formatPeriodLabel(period)
      },
      pricing: estimate.pricing,
      ...estimate
    });
  } catch (error) {
    next(error);
  }
};

