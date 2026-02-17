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
    onboardee: 400,
    phoneNumber: 0
  },
  // Per-message charges (cents) for SMS billing.
  smsUnitCents: {
    inboundClient: 0,
    outboundClient: 0,
    notification: 0
  },
  // Paid add-ons (flat monthly fees), gated per agency.
  // NOTE: keep default at 0/off so existing agencies are unaffected.
  addonsUnitCents: {
    publicAvailability: 0
  },
  addonsEnabled: {
    publicAvailability: false
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

function isMissingBillingSchemaError(e) {
  const code = String(e?.code || '');
  if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR' || code === 'ER_BAD_DB_ERROR') return true;
  const msg = String(e?.message || '').toLowerCase();
  return (
    msg.includes("doesn't exist") ||
    msg.includes('unknown column') ||
    msg.includes('agency_billing_accounts') ||
    msg.includes('platform_billing_pricing')
  );
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
    },
    addonsUnitCents: {
      ...(b.addonsUnitCents || {}),
      ...(o.addonsUnitCents || {})
    },
    addonsEnabled: {
      ...(b.addonsEnabled || {}),
      ...(o.addonsEnabled || {})
    }
  };
}

export async function getPlatformBillingPricing() {
  try {
    const fromDb = await PlatformBillingPricing.getPricingJson();
    if (!fromDb) return FALLBACK_PRICING;
    return mergePricing(FALLBACK_PRICING, fromDb);
  } catch (e) {
    // Keep billing/admin flows functional on partially migrated environments.
    if (!isMissingBillingSchemaError(e)) {
      console.warn('Billing pricing lookup failed; using fallback pricing:', e?.message || e);
    } else {
      console.warn('Billing pricing tables unavailable; using fallback pricing.');
    }
    return FALLBACK_PRICING;
  }
}

export async function getEffectiveBillingPricingForAgency(agencyId) {
  const platform = await getPlatformBillingPricing();
  let acct = null;
  try {
    acct = await AgencyBillingAccount.getByAgencyId(agencyId);
  } catch (e) {
    if (!isMissingBillingSchemaError(e)) {
      console.warn(`Agency billing account lookup failed for agency ${agencyId}; proceeding without override:`, e?.message || e);
    } else {
      console.warn(`Agency billing account table unavailable for agency ${agencyId}; proceeding without override.`);
    }
  }
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
  const inboundSmsUsed = Number(usage?.inboundSmsUsed || 0);
  const notificationSmsUsed = Number(usage?.notificationSmsUsed || 0);
  const phoneNumbersUsed = Number(usage?.phoneNumbersUsed || 0);

  const schoolsOver = overage(PRICING.included.schools, schoolsUsed);
  const programsOver = overage(PRICING.included.programs, programsUsed);
  const adminsOver = overage(PRICING.included.admins, adminsUsed);
  const onboardeesOver = overage(PRICING.included.activeOnboardees, activeOnboardeesUsed);

  const extraSchoolsCents = schoolsOver * PRICING.unitCents.school;
  const extraProgramsCents = programsOver * PRICING.unitCents.program;
  const extraAdminsCents = adminsOver * PRICING.unitCents.admin;
  const extraOnboardeesCents = onboardeesOver * PRICING.unitCents.onboardee;

  const smsOutboundUnitCents = Number(PRICING?.smsUnitCents?.outboundClient || 0);
  const smsInboundUnitCents = Number(PRICING?.smsUnitCents?.inboundClient || 0);
  const smsNotificationUnitCents = Number(PRICING?.smsUnitCents?.notification || 0);
  const extraSmsOutboundCents = outboundSmsUsed * smsOutboundUnitCents;
  const extraSmsInboundCents = inboundSmsUsed * smsInboundUnitCents;
  const extraSmsNotificationCents = notificationSmsUsed * smsNotificationUnitCents;
  const phoneNumberUnitCents = Number(PRICING?.unitCents?.phoneNumber || 0);
  const extraPhoneNumberCents = phoneNumbersUsed * phoneNumberUnitCents;

  const publicAvailabilityAddonEnabled = Boolean(PRICING?.addonsEnabled?.publicAvailability);
  const publicAvailabilityAddonCents = publicAvailabilityAddonEnabled
    ? Math.max(0, Number(PRICING?.addonsUnitCents?.publicAvailability || 0))
    : 0;

  const totalCents =
    PRICING.baseFeeCents +
    extraSchoolsCents +
    extraProgramsCents +
    extraAdminsCents +
    extraOnboardeesCents +
    extraSmsOutboundCents +
    extraSmsInboundCents +
    extraSmsNotificationCents +
    extraPhoneNumberCents +
    publicAvailabilityAddonCents;

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
      key: 'sms_inbound_client',
      label: 'SMS (Inbound)',
      included: 0,
      used: inboundSmsUsed,
      overage: inboundSmsUsed,
      unitCostCents: smsInboundUnitCents,
      extraCents: extraSmsInboundCents
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
    },
    {
      key: 'phone_numbers',
      label: 'Phone Numbers',
      included: 0,
      used: phoneNumbersUsed,
      overage: phoneNumbersUsed,
      unitCostCents: phoneNumberUnitCents,
      extraCents: extraPhoneNumberCents
    },
    {
      key: 'addon_public_availability',
      label: 'Add-on: Public Availability',
      included: 0,
      used: publicAvailabilityAddonEnabled ? 1 : 0,
      overage: publicAvailabilityAddonEnabled ? 1 : 0,
      unitCostCents: publicAvailabilityAddonCents,
      extraCents: publicAvailabilityAddonCents
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
      inboundSmsUsed,
      notificationSmsUsed,
      phoneNumbersUsed
    },
    totals: {
      baseFeeCents: PRICING.baseFeeCents,
      extraSchoolsCents,
      extraProgramsCents,
      extraAdminsCents,
      extraOnboardeesCents,
      extraSmsOutboundCents,
      extraSmsInboundCents,
      extraSmsNotificationCents,
      extraPhoneNumberCents,
      publicAvailabilityAddonCents,
      totalCents
    },
    lineItems
  };
}

