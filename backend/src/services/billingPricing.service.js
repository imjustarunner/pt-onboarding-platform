/**
 * Billing pricing for the platform.
 *
 * Amounts are in cents to avoid floating point drift.
 */

import AgencyBillingAccount from '../models/AgencyBillingAccount.model.js';
import PlatformBillingPricing from '../models/PlatformBillingPricing.model.js';
import { getCommunicationRateCards } from './agencyCommunicationBilling.service.js';

/**
 * Phase B (optional): add catalog entries for remaining Company Profile feature_flags keys
 * (e.g. clinicalNoteGeneratorEnabled, publicProviderFinderEnabled) so subscription line items
 * and Tenant overview can show unified pricing. The superadmin hub maps a subset of flags
 * to these keys on the frontend until then.
 */
const DEFAULT_MIN_PRORATION_DAYS = 7;

function createFeatureCatalogEntry(key, label, description, options = {}) {
  const pricingModel = String(options.pricingModel || 'flat_monthly');
  // Dual-axis pricing fields. Either, both, or neither may be > 0.
  // - tenantMonthlyCents: flat-per-tenant monthly fee.
  // - userMonthlyCents: per-entitled-user monthly fee.
  // Legacy `unitAmountCents` is kept for `manual_quantity` features (e.g. Summer Programs).
  const tenantMonthlyCents = options.tenantMonthlyCents != null
    ? Math.max(0, Number(options.tenantMonthlyCents))
    : (pricingModel === 'flat_monthly' ? Math.max(0, Number(options.unitAmountCents || 0)) : 0);
  const userMonthlyCents = options.userMonthlyCents != null
    ? Math.max(0, Number(options.userMonthlyCents))
    : (pricingModel === 'usage' ? Math.max(0, Number(options.unitAmountCents || 0)) : 0);
  const perUserBillable = options.perUserBillable === true || userMonthlyCents > 0;
  const minProrationDays = Math.max(0, Number(options.minProrationDays != null ? options.minProrationDays : DEFAULT_MIN_PRORATION_DAYS));
  return {
    key,
    label,
    description,
    pricingModel,
    unitAmountCents: Number(options.unitAmountCents || 0),
    tenantMonthlyCents,
    userMonthlyCents,
    perUserBillable,
    minProrationDays,
    unitLabel: options.unitLabel || (pricingModel === 'manual_quantity' ? 'unit' : 'month'),
    usageKey: options.usageKey || null,
    defaultAvailable: options.defaultAvailable === true,
    tenantSelfServe: options.tenantSelfServe !== false,
    featureFlagKey: options.featureFlagKey ? String(options.featureFlagKey) : null
  };
}

const DEFAULT_FEATURE_CATALOG = {
  publicAvailability: createFeatureCatalogEntry(
    'publicAvailability',
    'Public Provider Finder',
    'External/public provider availability pages and provider finder publishing.',
    { featureFlagKey: 'publicProviderFinderEnabled' }
  ),
  momentumList: createFeatureCatalogEntry(
    'momentumList',
    'Momentum List',
    'Momentum Stickies, digest, and focus assistant billed per active employee.',
    {
      pricingModel: 'usage',
      unitAmountCents: 500,
      unitLabel: 'active employee',
      usageKey: 'momentumListUsersUsed',
      featureFlagKey: 'momentumListEnabled'
    }
  ),
  geminiNoteAid: createFeatureCatalogEntry(
    'geminiNoteAid',
    'Gemini Note Aid',
    'AI note helper access billed per active employee when this feature is ready.',
    {
      pricingModel: 'usage',
      unitAmountCents: 0,
      unitLabel: 'active employee',
      usageKey: 'activeEmployeesUsed',
      featureFlagKey: 'noteAidEnabled'
    }
  ),
  officeSchedulingPublishing: createFeatureCatalogEntry(
    'officeSchedulingPublishing',
    'Shift Programs',
    'Shift-based programs, scheduling workflows, and related operational publishing.',
    { featureFlagKey: 'shiftProgramsEnabled' }
  ),
  payrollWorkspace: createFeatureCatalogEntry(
    'payrollWorkspace',
    'Payroll workspace',
    'Payroll management tools and related admin workflows.',
    { featureFlagKey: 'payrollEnabled' }
  ),
  onboardingTraining: createFeatureCatalogEntry(
    'onboardingTraining',
    'Onboarding & Training',
    'Onboarding packages, checklist templates, intake forms, and related tenant workflows.',
    { featureFlagKey: 'onboardingTrainingEnabled' }
  ),
  schoolPortals: createFeatureCatalogEntry(
    'schoolPortals',
    'School portals & school overview',
    'School overview dashboard, school-scoped portal routes, digital intakes hub, and school staff sign-in for assigned school organizations.',
    { featureFlagKey: 'schoolPortalsEnabled', defaultAvailable: false }
  ),
  skillBuildersSchoolProgram: createFeatureCatalogEntry(
    'skillBuildersSchoolProgram',
    'Skill Builders school program',
    'School/program Skill Builders calendar, event portal, skills groups roster, provider hub program events, and related APIs.',
    { featureFlagKey: 'skillBuildersSchoolProgramEnabled', defaultAvailable: false }
  ),
  budgetManagementEnabled: createFeatureCatalogEntry(
    'budgetManagementEnabled',
    'Budget Management',
    'Budget planning, fiscal year tracking, expense management, and related finance workflows.',
    { featureFlagKey: 'budgetManagementEnabled' }
  ),
  hiringEnabled: createFeatureCatalogEntry(
    'hiringEnabled',
    'Hiring Process',
    'Applicant tracking, candidate pipelines, and hiring workflow management.',
    { featureFlagKey: 'hiringEnabled' }
  ),
  clinicalNoteGeneratorEnabled: createFeatureCatalogEntry(
    'clinicalNoteGeneratorEnabled',
    'Clinical Note Generator',
    'Clinical note generation tools surfaced in provider workflows.',
    { featureFlagKey: 'clinicalNoteGeneratorEnabled' }
  ),
  aiProviderSearchEnabled: createFeatureCatalogEntry(
    'aiProviderSearchEnabled',
    'AI Provider Search',
    'Gemini-powered provider search and smart directory filtering.',
    { featureFlagKey: 'aiProviderSearchEnabled' }
  ),
  presenceEnabled: createFeatureCatalogEntry(
    'presenceEnabled',
    'Presence / Team Board',
    'Presence statuses, team board visibility, and availability signaling for staff.',
    { featureFlagKey: 'presenceEnabled' }
  ),
  kudosEnabled: createFeatureCatalogEntry(
    'kudosEnabled',
    'Kudos',
    'Peer recognition, points, and reward-oriented appreciation tools.',
    { featureFlagKey: 'kudosEnabled' }
  ),
  medcancelEnabled: createFeatureCatalogEntry(
    'medcancelEnabled',
    'Med Cancel',
    'Medication cancellation claim submissions and related notifications.',
    { featureFlagKey: 'medcancelEnabled' }
  ),
  inSchoolSubmissionsEnabled: createFeatureCatalogEntry(
    'inSchoolSubmissionsEnabled',
    'In-School Submissions',
    'School mileage and other in-school claims submission workflows.',
    { featureFlagKey: 'inSchoolSubmissionsEnabled' }
  ),
  googleSsoEnabled: createFeatureCatalogEntry(
    'googleSsoEnabled',
    'Google Workspace SSO',
    'Google sign-in rules and enforced Workspace login for selected roles.',
    { tenantSelfServe: false, featureFlagKey: 'googleSsoEnabled' }
  ),
  workspaceProvisioningEnabled: createFeatureCatalogEntry(
    'workspaceProvisioningEnabled',
    'Workspace Provisioning',
    'Provision Google Workspace accounts and related pre-hire automation.',
    { tenantSelfServe: false, featureFlagKey: 'workspaceProvisioningEnabled' }
  ),
  bookClubEnabled: createFeatureCatalogEntry(
    'bookClubEnabled',
    'Book Club',
    'Tenant-wide book club, voting, meetings, and public preview experiences.',
    { featureFlagKey: 'bookClubEnabled' }
  ),
  standardsLearningEnabled: createFeatureCatalogEntry(
    'standardsLearningEnabled',
    'Standards-Aligned Learning',
    'Learning standards, goals, and progress tracking workflows.',
    { featureFlagKey: 'standardsLearningEnabled' }
  ),
  groupClassSessionsEnabled: createFeatureCatalogEntry(
    'groupClassSessionsEnabled',
    'Group Class Sessions',
    'Learning class sessions, moderation tools, and live class telemetry.',
    { featureFlagKey: 'groupClassSessionsEnabled' }
  ),
  guardianWaiversEnabled: createFeatureCatalogEntry(
    'guardianWaiversEnabled',
    'Guardian Waivers',
    'Guardian waivers and kiosk check-in eligibility gating.',
    { featureFlagKey: 'guardianWaiversEnabled' }
  ),
  platformSharedMarketingEnabled: createFeatureCatalogEntry(
    'platformSharedMarketingEnabled',
    'Shared Marketing',
    'Inclusion in platform-shared marketing and event promotion surfaces.',
    { tenantSelfServe: false, featureFlagKey: 'platformSharedMarketingEnabled' }
  ),
  platformPublicRegistrationEnabled: createFeatureCatalogEntry(
    'platformPublicRegistrationEnabled',
    'Public Registration Links',
    'Public registration catalogs and marketing enrollment links for this tenant.',
    { tenantSelfServe: false, featureFlagKey: 'platformPublicRegistrationEnabled' }
  ),
  gamesPlatformEnabled: createFeatureCatalogEntry(
    'gamesPlatformEnabled',
    'Games Platform',
    'Access to the mental health games platform and enabled game titles.',
    { featureFlagKey: 'gamesPlatformEnabled', perUserBillable: true }
  ),
  summerProgramManagement: createFeatureCatalogEntry(
    'summerProgramManagement',
    'Summer program management',
    'Custom project billing for registration, kiosk check-ins, staffing, and operational setup.',
    {
      pricingModel: 'manual_quantity',
      unitAmountCents: 150000,
      unitLabel: 'session',
      tenantSelfServe: false
    }
  )
};

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
  },
  featureCatalog: DEFAULT_FEATURE_CATALOG
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
    },
    featureCatalog: {
      ...(b.featureCatalog || {}),
      ...(o.featureCatalog || {})
    }
  };
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function legacyFeatureCatalogFromPricing(pricing) {
  const p = pricing || {};
  return {
    publicAvailability: {
      ...DEFAULT_FEATURE_CATALOG.publicAvailability,
      unitAmountCents: Math.max(0, Number(p?.addonsUnitCents?.publicAvailability || DEFAULT_FEATURE_CATALOG.publicAvailability.unitAmountCents || 0)),
      defaultAvailable: Boolean(p?.addonsEnabled?.publicAvailability)
    },
    momentumList: {
      ...DEFAULT_FEATURE_CATALOG.momentumList,
      unitAmountCents: Math.max(0, Number(p?.addonsUnitCents?.momentumList || DEFAULT_FEATURE_CATALOG.momentumList.unitAmountCents || 0)),
      defaultAvailable: Boolean(p?.addonsEnabled?.momentumList)
    }
  };
}

function normalizeFeatureCatalogEntry(key, value, fallback = {}) {
  const merged = {
    ...(DEFAULT_FEATURE_CATALOG[key] || {}),
    ...(fallback || {}),
    ...(isRecord(value) ? value : {})
  };
  const pricingModel = ['flat_monthly', 'usage', 'manual_quantity'].includes(String(merged.pricingModel || 'flat_monthly'))
    ? String(merged.pricingModel || 'flat_monthly')
    : 'flat_monthly';
  const unitAmountCents = Math.max(0, Number(merged.unitAmountCents || 0));
  // Auto-map legacy single-axis pricing into dual-axis fields when the new
  // fields are absent: flat_monthly -> tenantMonthlyCents, usage -> userMonthlyCents.
  const tenantMonthlyCents = merged.tenantMonthlyCents != null
    ? Math.max(0, Number(merged.tenantMonthlyCents))
    : (pricingModel === 'flat_monthly' ? unitAmountCents : 0);
  const userMonthlyCents = merged.userMonthlyCents != null
    ? Math.max(0, Number(merged.userMonthlyCents))
    : (pricingModel === 'usage' ? unitAmountCents : 0);
  const perUserBillable = merged.perUserBillable === true || userMonthlyCents > 0;
  const minProrationDays = Math.max(0, Number(
    merged.minProrationDays != null ? merged.minProrationDays : DEFAULT_MIN_PRORATION_DAYS
  ));
  return {
    key,
    label: String(merged.label || key),
    description: String(merged.description || ''),
    pricingModel,
    unitAmountCents,
    tenantMonthlyCents,
    userMonthlyCents,
    perUserBillable,
    minProrationDays,
    unitLabel: String(merged.unitLabel || 'month'),
    usageKey: merged.usageKey ? String(merged.usageKey) : null,
    defaultAvailable: merged.defaultAvailable === true,
    tenantSelfServe: merged.tenantSelfServe !== false,
    featureFlagKey: merged.featureFlagKey ? String(merged.featureFlagKey) : null
  };
}

export function getFeatureCatalog(pricingConfig = null) {
  const pricing = pricingConfig || FALLBACK_PRICING;
  const legacy = legacyFeatureCatalogFromPricing(pricing);
  const raw = isRecord(pricing?.featureCatalog) ? pricing.featureCatalog : {};
  const keys = Array.from(new Set([
    ...Object.keys(DEFAULT_FEATURE_CATALOG),
    ...Object.keys(legacy),
    ...Object.keys(raw)
  ]));
  const catalog = {};
  for (const key of keys) {
    catalog[key] = normalizeFeatureCatalogEntry(key, raw[key], legacy[key]);
  }
  return catalog;
}

function normalizeFeatureEntitlementEntry(rawEntry, catalogEntry, legacyEnabled = false) {
  const entry = isRecord(rawEntry) ? rawEntry : {};
  const available = entry.available === undefined
    ? (catalogEntry?.defaultAvailable === true || legacyEnabled)
    : entry.available === true;
  const enabled = entry.enabled === undefined
    ? legacyEnabled
    : entry.enabled === true;
  const included = entry.included === true;
  const unitAmountRaw = entry.unitAmountCents;
  const quantityRaw = entry.quantity;
  const quantity = Number.isFinite(Number(quantityRaw)) ? Math.max(0, Number(quantityRaw)) : null;
  const unitAmountCents = Number.isFinite(Number(unitAmountRaw)) ? Math.max(0, Number(unitAmountRaw)) : null;
  return {
    available,
    enabled: included ? true : enabled,
    included,
    locked: entry.locked === true,
    quantity,
    unitAmountCents,
    notes: entry.notes ? String(entry.notes) : ''
  };
}

export function resolveFeatureEntitlements({ pricingConfig = null, featureEntitlementsJson = null } = {}) {
  const pricing = pricingConfig || FALLBACK_PRICING;
  const catalog = getFeatureCatalog(pricing);
  const raw = parseJsonMaybe(featureEntitlementsJson) || {};
  const resolved = {};
  for (const key of Object.keys(catalog)) {
    const legacyEnabled = key === 'publicAvailability'
      ? Boolean(pricing?.addonsEnabled?.publicAvailability)
      : key === 'momentumList'
        ? Boolean(pricing?.addonsEnabled?.momentumList)
        : false;
    resolved[key] = normalizeFeatureEntitlementEntry(raw[key], catalog[key], legacyEnabled);
  }
  return resolved;
}

function resolveFeatureUsage(feature, usage, entitlement) {
  if (!feature || !entitlement?.enabled) return 0;
  if (feature.pricingModel === 'manual_quantity') {
    return Math.max(0, Number(entitlement?.quantity || 0));
  }
  if (feature.pricingModel === 'usage') {
    return Math.max(0, Number(usage?.[feature.usageKey] || 0));
  }
  return 1;
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

export function buildEstimate(usage, pricingConfig = null, options = {}) {
  const PRICING = pricingConfig || FALLBACK_PRICING;
  const schoolsUsed = Number(usage?.schoolsUsed || 0);
  const programsUsed = Number(usage?.programsUsed || 0);
  const adminsUsed = Number(usage?.adminsUsed || 0);
  const activeEmployeesUsed = Number(usage?.activeEmployeesUsed || 0);
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

  const featureCatalog = getFeatureCatalog(PRICING);
  const featureEntitlements = resolveFeatureEntitlements({
    pricingConfig: PRICING,
    featureEntitlementsJson: options?.featureEntitlements
  });
  // Dual-axis feature billing: when caller supplies a precomputed breakdown
  // (featureBilling = { tenantPortions, userPortions, totals, daysInPeriod })
  // it takes precedence over the legacy single-axis featureLineItems below.
  const featureBilling = options?.featureBilling || null;
  const featureLineItems = Object.keys(featureCatalog).map((key) => {
    const feature = featureCatalog[key];
    const entitlement = featureEntitlements[key];
    const unitAmountCents = entitlement?.unitAmountCents != null
      ? Math.max(0, Number(entitlement.unitAmountCents || 0))
      : Math.max(0, Number(feature?.unitAmountCents || 0));
    const used = resolveFeatureUsage(feature, usage, entitlement);
    const billableQuantity = entitlement?.included ? 0 : used;
    const extraCents = billableQuantity * unitAmountCents;
    return {
      key: `feature_${key}`,
      featureKey: key,
      label: feature.label,
      description: feature.description,
      included: entitlement?.included ? used : 0,
      used,
      overage: billableQuantity,
      unitCostCents: unitAmountCents,
      extraCents,
      selected: entitlement?.enabled === true,
      available: entitlement?.available === true,
      pricingModel: feature.pricingModel,
      unitLabel: feature.unitLabel
    };
  }).filter((item) => item.available || item.selected || item.included > 0);
  // When a dual-axis featureBilling is provided, charge it instead of the
  // legacy single-axis sum so we don't double-bill the same feature.
  const featureAddonsCents = featureBilling
    ? Number(featureBilling?.totals?.featureTotalCents || 0)
    : featureLineItems.reduce((sum, item) => sum + Number(item.extraCents || 0), 0);
  const publicAvailabilityAddonCents = Number(featureLineItems.find((item) => item.featureKey === 'publicAvailability')?.extraCents || 0);
  const momentumListAddonCents = Number(featureLineItems.find((item) => item.featureKey === 'momentumList')?.extraCents || 0);
  const momentumListUnitCents = Number(featureLineItems.find((item) => item.featureKey === 'momentumList')?.unitCostCents || 0);
  const publicAvailabilityAddonEnabled = featureEntitlements.publicAvailability?.enabled === true;
  const momentumListAddonEnabled = featureEntitlements.momentumList?.enabled === true;

  const totalCents =
    PRICING.baseFeeCents +
    extraSchoolsCents +
    extraProgramsCents +
    extraAdminsCents +
    extraOnboardeesCents +
    communicationSubtotalCents +
    featureAddonsCents;

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
    ...featureLineItems
  ];

  return {
    pricing: PRICING,
    featureCatalog,
    featureEntitlements,
    featureBilling,
    usage: {
      schoolsUsed,
      programsUsed,
      adminsUsed,
      activeEmployeesUsed,
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
      featureAddonsCents,
      publicAvailabilityAddonCents,
      momentumListAddonCents,
      totalCents
    },
    lineItems
  };
}
