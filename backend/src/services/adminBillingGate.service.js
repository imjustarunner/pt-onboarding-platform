import BillingUsageService from './billingUsage.service.js';
import { getEffectiveBillingPricingForAgency } from './billingPricing.service.js';

/**
 * Compute incremental monthly billing impact (cents) for adding admin users.
 * Returns null if no incremental cost.
 */
export async function getAdminAddBillingImpact(agencyId, { deltaAdmins = 1 } = {}) {
  const pricingBundle = await getEffectiveBillingPricingForAgency(agencyId);
  const pricing = pricingBundle.effective;
  const included = pricing.included.admins;
  const unitCents = pricing.unitCents.admin;

  const usage = await BillingUsageService.getUsage(agencyId);
  const current = Number(usage.adminsUsed || 0);
  const newCount = current + Number(deltaAdmins || 0);

  const currentOver = Math.max(0, current - included);
  const newOver = Math.max(0, newCount - included);
  const deltaOver = Math.max(0, newOver - currentOver);

  const deltaMonthlyCents = deltaOver * unitCents;
  if (deltaMonthlyCents <= 0) return null;

  return {
    includedAdmins: included,
    currentAdmins: current,
    newAdmins: newCount,
    deltaMonthlyCents,
    message: `Adding this admin will increase your monthly bill by $${(deltaMonthlyCents / 100).toFixed(2)}. Proceed?`
  };
}

