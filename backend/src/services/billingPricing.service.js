/**
 * Billing pricing for the platform.
 *
 * Amounts are in cents to avoid floating point drift.
 */

import AgencyBillingAccount from '../models/AgencyBillingAccount.model.js';
import PlatformBillingPricing from '../models/PlatformBillingPricing.model.js';
import { getCommunicationRateCards } from './agencyCommunicationBilling.service.js';

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
  communicationRateCents: {
    smsOutboundClient: { actualCostCents: 0, markupCents: 0 },
    smsInboundClient: { actualCostCents: 0, markupCents: 0 },
    smsNotification: { actualCostCents: 0, markupCents: 0 },
    phoneNumberMonthly: { actualCostCents: 0, markupCents: 0 },
    voiceOutboundMinute: { actualCostCents: 0, markupCents: 0 },
    voiceInboundMinute: { actualCostCents: 0, markupCents: 0 },
    videoParticipantMinute: { actualCostCents: 0, markupCents: 0 }
  },
  // Paid add-ons (flat monthly fees or per-seat), gated per agency.
  // NOTE: keep default at 0/off so existing agencies are unaffected.
  addonsUnitCents: {
    publicAvailability: 0,
    momentumList: 500  // $5 per person (active employee) per month
  },
  addonsEnabled: {
    publicAvailability: false,
    momentumList: false
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
  if (Buffer.isBuffer(v)) {
    const s = v.toString('utf8').trim();
    if (!s) return null;
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }
  if (typeof v === 'object') return v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }
  return null;
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
    communicationRateCents: {
      smsOutboundClient: {
        ...(b.communicationRateCents?.smsOutboundClient || {}),
        ...(o.communicationRateCents?.smsOutboundClient || {})
      },
      smsInboundClient: {
        ...(b.communicationRateCents?.smsInboundClient || {}),
        ...(o.communicationRateCents?.smsInboundClient || {})
      },
      smsNotification: {
        ...(b.communicationRateCents?.smsNotification || {}),
        ...(o.communicationRateCents?.smsNotification || {})
      },
      phoneNumberMonthly: {
        ...(b.communicationRateCents?.phoneNumberMonthly || {}),
        ...(o.communicationRateCents?.phoneNumberMonthly || {})
      },
      voiceOutboundMinute: {
        ...(b.communicationRateCents?.voiceOutboundMinute || {}),
        ...(o.communicationRateCents?.voiceOutboundMinute || {})
      },
      voiceInboundMinute: {
        ...(b.communicationRateCents?.voiceInboundMinute || {}),
        ...(o.communicationRateCents?.voiceInboundMinute || {})
      },
      videoParticipantMinute: {
        ...(b.communicationRateCents?.videoParticipantMinute || {}),
        ...(o.communicationRateCents?.videoParticipantMinute || {})
      }
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
    if (!fromDb || typeof fromDb !== 'object' || Array.isArray(fromDb)) {
      return FALLBACK_PRICING;
    }
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
  const momentumListUsersUsed = Number(usage?.momentumListUsersUsed || 0);
  const outboundSmsUsed = Number(usage?.outboundSmsUsed || 0);
  const inboundSmsUsed = Number(usage?.inboundSmsUsed || 0);
  const notificationSmsUsed = Number(usage?.notificationSmsUsed || 0);
  const phoneNumbersUsed = Number(usage?.phoneNumbersUsed || 0);
  const outboundCallMinutesUsed = Number(usage?.outboundCallMinutesUsed || 0);
  const inboundCallMinutesUsed = Number(usage?.inboundCallMinutesUsed || 0);
  const videoParticipantMinutesUsed = Number(usage?.videoParticipantMinutesUsed || 0);
  const communicationRates = getCommunicationRateCards(PRICING);

  const schoolsOver = overage(PRICING.included.schools, schoolsUsed);
  const programsOver = overage(PRICING.included.programs, programsUsed);
  const adminsOver = overage(PRICING.included.admins, adminsUsed);
  const onboardeesOver = overage(PRICING.included.activeOnboardees, activeOnboardeesUsed);

  const extraSchoolsCents = schoolsOver * PRICING.unitCents.school;
  const extraProgramsCents = programsOver * PRICING.unitCents.program;
  const extraAdminsCents = adminsOver * PRICING.unitCents.admin;
  const extraOnboardeesCents = onboardeesOver * PRICING.unitCents.onboardee;

  const publicAvailabilityAddonEnabled = Boolean(PRICING?.addonsEnabled?.publicAvailability);
  const publicAvailabilityAddonCents = publicAvailabilityAddonEnabled
    ? Math.max(0, Number(PRICING?.addonsUnitCents?.publicAvailability || 0))
    : 0;

  const momentumListAddonEnabled = Boolean(PRICING?.addonsEnabled?.momentumList);
  const momentumListUnitCents = Math.max(0, Number(PRICING?.addonsUnitCents?.momentumList || 0));
  const momentumListAddonCents = momentumListAddonEnabled
    ? momentumListUsersUsed * momentumListUnitCents
    : 0;

  const communicationLineItems = [
    {
      key: 'sms_outbound_client',
      label: 'SMS (Client Outbound)',
      used: outboundSmsUsed,
      unitCostCents: communicationRates.sms_outbound_client.billableUnitCents,
      actualUnitCostCents: communicationRates.sms_outbound_client.actualCostCents,
      markupUnitCents: communicationRates.sms_outbound_client.markupCents
    },
    {
      key: 'sms_inbound_client',
      label: 'SMS (Client Inbound)',
      used: inboundSmsUsed,
      unitCostCents: communicationRates.sms_inbound_client.billableUnitCents,
      actualUnitCostCents: communicationRates.sms_inbound_client.actualCostCents,
      markupUnitCents: communicationRates.sms_inbound_client.markupCents
    },
    {
      key: 'sms_notification',
      label: 'SMS (Notifications)',
      used: notificationSmsUsed,
      unitCostCents: communicationRates.sms_notification.billableUnitCents,
      actualUnitCostCents: communicationRates.sms_notification.actualCostCents,
      markupUnitCents: communicationRates.sms_notification.markupCents
    },
    {
      key: 'phone_number_monthly',
      label: 'Phone Numbers',
      used: phoneNumbersUsed,
      unitCostCents: communicationRates.phone_number_monthly.billableUnitCents,
      actualUnitCostCents: communicationRates.phone_number_monthly.actualCostCents,
      markupUnitCents: communicationRates.phone_number_monthly.markupCents
    },
    {
      key: 'voice_outbound_minute',
      label: 'Voice (Outbound Minutes)',
      used: outboundCallMinutesUsed,
      unitCostCents: communicationRates.voice_outbound_minute.billableUnitCents,
      actualUnitCostCents: communicationRates.voice_outbound_minute.actualCostCents,
      markupUnitCents: communicationRates.voice_outbound_minute.markupCents
    },
    {
      key: 'voice_inbound_minute',
      label: 'Voice (Inbound Minutes)',
      used: inboundCallMinutesUsed,
      unitCostCents: communicationRates.voice_inbound_minute.billableUnitCents,
      actualUnitCostCents: communicationRates.voice_inbound_minute.actualCostCents,
      markupUnitCents: communicationRates.voice_inbound_minute.markupCents
    },
    {
      key: 'video_participant_minute',
      label: 'Video (Participant Minutes)',
      used: videoParticipantMinutesUsed,
      unitCostCents: communicationRates.video_participant_minute.billableUnitCents,
      actualUnitCostCents: communicationRates.video_participant_minute.actualCostCents,
      markupUnitCents: communicationRates.video_participant_minute.markupCents
    }
  ].map((item) => {
    const actualCostCents = item.used * item.actualUnitCostCents;
    const markupCents = item.used * item.markupUnitCents;
    const extraCents = item.used * item.unitCostCents;
    return {
      ...item,
      included: 0,
      overage: item.used,
      actualCostCents,
      markupCents,
      extraCents
    };
  });

  const communicationActualCostCents = communicationLineItems.reduce((sum, item) => sum + Number(item.actualCostCents || 0), 0);
  const communicationMarkupCents = communicationLineItems.reduce((sum, item) => sum + Number(item.markupCents || 0), 0);
  const communicationSubtotalCents = communicationLineItems.reduce((sum, item) => sum + Number(item.extraCents || 0), 0);

  const totalCents =
    PRICING.baseFeeCents +
    extraSchoolsCents +
    extraProgramsCents +
    extraAdminsCents +
    extraOnboardeesCents +
    communicationSubtotalCents +
    publicAvailabilityAddonCents +
    momentumListAddonCents;

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
    ...communicationLineItems,
    {
      key: 'addon_public_availability',
      label: 'Add-on: Public Availability',
      included: 0,
      used: publicAvailabilityAddonEnabled ? 1 : 0,
      overage: publicAvailabilityAddonEnabled ? 1 : 0,
      unitCostCents: publicAvailabilityAddonCents,
      extraCents: publicAvailabilityAddonCents
    },
    {
      key: 'addon_momentum_list',
      label: 'Add-on: Momentum List',
      included: 0,
      used: momentumListUsersUsed,
      overage: momentumListAddonEnabled ? momentumListUsersUsed : 0,
      unitCostCents: momentumListUnitCents,
      extraCents: momentumListAddonCents
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
      phoneNumbersUsed,
      outboundCallMinutesUsed,
      inboundCallMinutesUsed,
      videoParticipantMinutesUsed,
      momentumListUsersUsed
    },
    totals: {
      baseFeeCents: PRICING.baseFeeCents,
      extraSchoolsCents,
      extraProgramsCents,
      extraAdminsCents,
      extraOnboardeesCents,
      communicationActualCostCents,
      communicationMarkupCents,
      communicationSubtotalCents,
      publicAvailabilityAddonCents,
      momentumListAddonCents,
      totalCents
    },
    lineItems
  };
}

