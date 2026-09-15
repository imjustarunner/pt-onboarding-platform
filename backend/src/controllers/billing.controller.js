import BillingUsageService from '../services/billingUsage.service.js';
import { buildEstimate, getEffectiveBillingPricingForAgency, resolveFeatureEntitlements } from '../services/billingPricing.service.js';
import AgencyCommunicationBillingService from '../services/agencyCommunicationBilling.service.js';
import BillingMerchantContextService from '../services/billingMerchantContext.service.js';
import { formatPeriodLabel, getCurrentBillingPeriod } from '../utils/billingPeriod.js';
import AgencyBillingAccount from '../models/AgencyBillingAccount.model.js';
import pool from '../config/database.js';
import { createBusinessLifecycleService } from '../services/businessLifecycle.service.js';
import { applyBusinessAgreement } from '../services/businessLifecyclePolicy.js';
import { computeFeatureBillingForPeriod } from '../services/featureBilling.service.js';

export const getAgencyAddons = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    const parsedAgencyId = parseInt(agencyId, 10);
    if (!parsedAgencyId || Number.isNaN(parsedAgencyId)) {
      return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    }
    const pricingBundle = await getEffectiveBillingPricingForAgency(parsedAgencyId);
    const account = await AgencyBillingAccount.getByAgencyId(parsedAgencyId);
    const entitlements = resolveFeatureEntitlements({
      pricingConfig: pricingBundle?.effective,
      featureEntitlementsJson: account?.feature_entitlements_json || null
    });
    const billingMomentumList = Boolean(entitlements?.momentumList?.enabled);
    const publicAvailability = Boolean(entitlements?.publicAvailability?.enabled);
    const geminiNoteAid = Boolean(entitlements?.geminiNoteAid?.enabled);
    const officeSchedulingPublishing = Boolean(entitlements?.officeSchedulingPublishing?.enabled);
    const billingFocusMusic = Boolean(entitlements?.focusMusic?.enabled);

    const Agency = (await import('../models/Agency.model.js')).default;
    const agency = await Agency.findById(parsedAgencyId);
    const flags = agency?.feature_flags
      ? (typeof agency.feature_flags === 'string' ? (() => { try { return JSON.parse(agency.feature_flags); } catch { return {}; } })() : agency.feature_flags)
      : {};
    const featureFlagMomentumList = Boolean(flags.momentumListEnabled);
    const featureFlagFocusMusic = flags.focusMusicEnabled !== false;

    res.json({
      agencyId: parsedAgencyId,
      momentumList: billingMomentumList || featureFlagMomentumList,
      focusMusic: billingFocusMusic || featureFlagFocusMusic,
      publicAvailability,
      geminiNoteAid,
      officeSchedulingPublishing
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

    const lifecycle = await createBusinessLifecycleService(pool).billingState(parsedAgencyId);
    if (lifecycle.agreements.length && !['super_admin', 'admin'].includes(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Company administrator access is required to review management billing.' } });
    }
    const period = getCurrentBillingPeriod(new Date());
    const usage = await BillingUsageService.getUsage(parsedAgencyId, {
      periodStart: period.periodStart,
      periodEnd: period.periodEnd
    });
    const pricingBundle = await getEffectiveBillingPricingForAgency(parsedAgencyId);
    const account = await AgencyBillingAccount.getByAgencyId(parsedAgencyId);
    let featureBilling = null;
    try {
      featureBilling = await computeFeatureBillingForPeriod(parsedAgencyId, period.periodStart, period.periodEnd, pricingBundle.effective);
    } catch (error) {
      // An agreed management invoice must never silently omit feature charges.
      if (lifecycle.agreements.some(a => a.status === 'active')) throw error;
    }
    const estimate = applyBusinessAgreement(buildEstimate(usage, pricingBundle.effective, {
      featureEntitlements: account?.feature_entitlements_json || null, featureBilling
    }), lifecycle, period.periodStart.toISOString().slice(0, 7));
    const merchantContext = await BillingMerchantContextService.getAgencySubscriptionContext(parsedAgencyId);
    const communicationSummary = await AgencyCommunicationBillingService.getAgencyPeriodSummary({
      agencyId: parsedAgencyId,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd
    });

    res.json({
      agencyId: parsedAgencyId,
      billingCycle: {
        periodStart: period.periodStart.toISOString().slice(0, 10),
        periodEnd: period.periodEnd.toISOString().slice(0, 10),
        label: formatPeriodLabel(period)
      },
      pricing: estimate.pricing,
      merchantMode: merchantContext.merchantMode,
      providerConnectionId: merchantContext.providerConnectionId,
      communicationSummary,
      ...estimate
    });
  } catch (error) {
    next(error);
  }
};
