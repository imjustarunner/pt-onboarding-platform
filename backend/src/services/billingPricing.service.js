/**
 * Billing pricing for the platform.
 *
 * Amounts are in cents to avoid floating point drift.
 */

import AgencyBillingAccount from '../models/AgencyBillingAccount.model.js';
import PlatformBillingPricing from '../models/PlatformBillingPricing.model.js';

const FALLBACK_PRICING = {
  baseFeeCents: 19900,
  included: {
    schools: 2,
    programs: 3,
    admins: 3,
    activeOnboardees: 15
  },
  unitCents: {
    school: 2500,
    program: 1000,
    admin: 500,
    onboardee: 400
  },
  // Per-message charges (cents) for SMS billing.
  smsUnitCents: {
    outboundClient: 0,
    notification: 0
  }
};

function overage(included, used) {
  const inc = Math.max(0, Number(included || 0));
  const u = Math.max(0, Number(used || 0));
  return Math.max(0, u - inc);
}

export function getBillingPricingConfig() {
  // Legacy synchronous accessor (used by older code paths).
  // For agency-specific pricing, use getEffectiveBillingPricingForAgency().
  return FALLBACK_PRICING;
}

function parseJsonMaybe(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function mergePricing(base, override) {
  const b = base || {};
  const o = override || {};
  return {
    baseFeeCents: o.baseFeeCents != null ? Number(o.baseFeeCents) : Number(b.baseFeeCents || 0),
    included: {
      ...(b.included || {}),
      ...(o.included || {})
    },
    unitCents: {
      ...(b.unitCents || {}),
      ...(o.unitCents || {})
    },
    smsUnitCents: {
      ...(b.smsUnitCents || {}),
      ...(o.smsUnitCents || {})
    }
  };
}

export async function getPlatformBillingPricing() {
  const fromDb = await PlatformBillingPricing.getPricingJson();
  if (!fromDb) return FALLBACK_PRICING;
  return mergePricing(FALLBACK_PRICING, fromDb);
}

export async function getEffectiveBillingPricingForAgency(agencyId) {
  const platform = await getPlatformBillingPricing();
  const acct = await AgencyBillingAccount.getByAgencyId(agencyId);
  const override = parseJsonMaybe(acct?.pricing_override_json) || null;
  const effective = override ? mergePricing(platform, override) : platform;
  return { platform, override, effective };
}

export function buildEstimate(usage, pricingConfig = null) {
  const PRICING = pricingConfig || FALLBACK_PRICING;
  const schoolsUsed = Number(usage?.schoolsUsed || 0);
  const programsUsed = Number(usage?.programsUsed || 0);
  const adminsUsed = Number(usage?.adminsUsed || 0);
  const activeOnboardeesUsed = Number(usage?.activeOnboardeesUsed || 0);
  const outboundSmsUsed = Number(usage?.outboundSmsUsed || 0);
  const notificationSmsUsed = Number(usage?.notificationSmsUsed || 0);

  const schoolsOver = overage(PRICING.included.schools, schoolsUsed);
  const programsOver = overage(PRICING.included.programs, programsUsed);
  const adminsOver = overage(PRICING.included.admins, adminsUsed);
  const onboardeesOver = overage(PRICING.included.activeOnboardees, activeOnboardeesUsed);

  const extraSchoolsCents = schoolsOver * PRICING.unitCents.school;
  const extraProgramsCents = programsOver * PRICING.unitCents.program;
  const extraAdminsCents = adminsOver * PRICING.unitCents.admin;
  const extraOnboardeesCents = onboardeesOver * PRICING.unitCents.onboardee;

  const smsOutboundUnitCents = Number(PRICING?.smsUnitCents?.outboundClient || 0);
  const smsNotificationUnitCents = Number(PRICING?.smsUnitCents?.notification || 0);
  const extraSmsOutboundCents = outboundSmsUsed * smsOutboundUnitCents;
  const extraSmsNotificationCents = notificationSmsUsed * smsNotificationUnitCents;

  const totalCents =
    PRICING.baseFeeCents +
    extraSchoolsCents +
    extraProgramsCents +
    extraAdminsCents +
    extraOnboardeesCents +
    extraSmsOutboundCents +
    extraSmsNotificationCents;

  const lineItems = [
    {
      key: 'schools',
      label: 'Schools',
      included: PRICING.included.schools,
      used: schoolsUsed,
      overage: schoolsOver,
      unitCostCents: PRICING.unitCents.school,
      extraCents: extraSchoolsCents
    },
    {
      key: 'programs',
      label: 'Programs',
      included: PRICING.included.programs,
      used: programsUsed,
      overage: programsOver,
      unitCostCents: PRICING.unitCents.program,
      extraCents: extraProgramsCents
    },
    {
      key: 'admins',
      label: 'Admins',
      included: PRICING.included.admins,
      used: adminsUsed,
      overage: adminsOver,
      unitCostCents: PRICING.unitCents.admin,
      extraCents: extraAdminsCents
    },
    {
      key: 'active_onboardees',
      label: 'Active Candidates',
      included: PRICING.included.activeOnboardees,
      used: activeOnboardeesUsed,
      overage: onboardeesOver,
      unitCostCents: PRICING.unitCents.onboardee,
      extraCents: extraOnboardeesCents
    },
    {
      key: 'sms_outbound_client',
      label: 'SMS (Client)',
      included: 0,
      used: outboundSmsUsed,
      overage: outboundSmsUsed,
      unitCostCents: smsOutboundUnitCents,
      extraCents: extraSmsOutboundCents
    },
    {
      key: 'sms_notification',
      label: 'SMS (Notifications)',
      included: 0,
      used: notificationSmsUsed,
      overage: notificationSmsUsed,
      unitCostCents: smsNotificationUnitCents,
      extraCents: extraSmsNotificationCents
    }
  ];

  return {
    pricing: PRICING,
    usage: {
      schoolsUsed,
      programsUsed,
      adminsUsed,
      activeOnboardeesUsed,
      outboundSmsUsed,
      notificationSmsUsed
    },
    totals: {
      baseFeeCents: PRICING.baseFeeCents,
      extraSchoolsCents,
      extraProgramsCents,
      extraAdminsCents,
      extraOnboardeesCents,
      extraSmsOutboundCents,
      extraSmsNotificationCents,
      totalCents
    },
    lineItems
  };
}

