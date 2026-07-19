/**
 * Business type → nested capability gates.
 * Selecting tenant service types (agency_business_types) opens the right
 * feature / public-finder / role-surface packs. Counseling-only tenants
 * must not see tutoring/learning surfaces; learning tenants must not get
 * clinical note / medical billing packs unless those types are also enabled.
 *
 * Canonical clinical type is mental_health (healthcare is a read alias).
 */

import AgencyBusinessType, { BUSINESS_TYPE_CODES } from '../models/AgencyBusinessType.model.js';

/** Public finder / enrollment service_type codes allowed per business type. */
export const PUBLIC_SERVICE_BY_BUSINESS_TYPE = {
  mental_health: ['counseling', 'evaluation'],
  learning: ['tutoring'],
  tutoring: ['tutoring'],
  coaching: ['coaching'],
  consulting: ['consulting'],
  mentorship: ['coaching'],
  skills_development: ['tutoring', 'coaching'],
  other: []
};

/**
 * Feature flag keys nested under business types.
 * Core ops (payroll, hiring, presence, etc.) stay unscoped (always eligible
 * for platform/tenant toggles regardless of vertical).
 */
export const FEATURE_KEYS_BY_BUSINESS_TYPE = {
  mental_health: [
    'noteAidEnabled',
    'clinicalNoteGeneratorEnabled',
    'medicalBillingEnabled',
    'clinicalChartEnabled',
    'clinicalNoteSigningEnabled',
    'medicalClaimsEnabled',
    'claimMdEnabled',
    'medcancelEnabled',
    'gamesPlatformEnabled',
    'inSchoolSubmissionsEnabled'
  ],
  learning: [
    'standardsLearningEnabled',
    'groupClassSessionsEnabled',
    'learningProgramBillingEnabled',
    'guardianWaiversEnabled',
    'schoolPortalsEnabled',
    'skillBuildersSchoolProgramEnabled',
    'inSchoolSubmissionsEnabled'
  ],
  tutoring: [
    'standardsLearningEnabled',
    'groupClassSessionsEnabled',
    'guardianWaiversEnabled'
  ],
  coaching: [
    'publicProviderFinderEnabled',
    'aiProviderSearchEnabled'
  ],
  consulting: [
    'publicProviderFinderEnabled',
    'aiProviderSearchEnabled'
  ],
  mentorship: [
    'publicProviderFinderEnabled'
  ],
  skills_development: [
    'standardsLearningEnabled',
    'groupClassSessionsEnabled',
    'guardianWaiversEnabled',
    'publicProviderFinderEnabled'
  ],
  other: []
};

/** Role / enrollment surfaces implied by business type (not user.role ENUMs). */
export const ROLE_SURFACES_BY_BUSINESS_TYPE = {
  mental_health: ['provider', 'clinical_practice_assistant', 'supervisor', 'counseling_enrollment'],
  learning: ['provider', 'tutoring_enrollment', 'school_staff'],
  tutoring: ['provider', 'tutoring_enrollment'],
  coaching: ['provider', 'practitioner_assistant', 'coaching_enrollment'],
  consulting: ['provider', 'practitioner_assistant', 'consulting_enrollment'],
  mentorship: ['provider', 'coaching_enrollment'],
  skills_development: ['provider', 'tutoring_enrollment'],
  other: ['provider']
};

/** Default business types when a tenant has none configured yet. */
export const DEFAULT_BUSINESS_TYPES_BY_ORG_TYPE = {
  agency: ['mental_health'],
  life_coach: ['coaching'],
  consultant: ['consulting'],
  learning: ['learning', 'tutoring'],
  clinical: ['mental_health'],
  school: ['learning', 'tutoring'],
  program: ['learning', 'skills_development'],
  affiliation: [],
  clubwebapp: []
};

const VERTICAL_SCOPED_FEATURE_KEYS = new Set(
  Object.values(FEATURE_KEYS_BY_BUSINESS_TYPE).flat()
);

export function defaultsForOrganizationType(organizationType) {
  const t = String(organizationType || 'agency').trim().toLowerCase();
  const codes = DEFAULT_BUSINESS_TYPES_BY_ORG_TYPE[t];
  if (Array.isArray(codes) && codes.length) return [...codes];
  if (t === 'life_coach' || t === 'consultant') {
    return DEFAULT_BUSINESS_TYPES_BY_ORG_TYPE[t] || [];
  }
  return [...DEFAULT_BUSINESS_TYPES_BY_ORG_TYPE.agency];
}

export function publicServiceTypesForBusinessTypes(businessTypes = []) {
  const out = new Set();
  for (const raw of businessTypes || []) {
    const code = AgencyBusinessType.normalizeType(raw?.businessType || raw?.business_type || raw);
    if (!code) continue;
    for (const st of PUBLIC_SERVICE_BY_BUSINESS_TYPE[code] || []) out.add(st);
  }
  return Array.from(out);
}

export function featureKeysForBusinessTypes(businessTypes = []) {
  const out = new Set();
  for (const raw of businessTypes || []) {
    const code = AgencyBusinessType.normalizeType(raw?.businessType || raw?.business_type || raw);
    if (!code) continue;
    for (const key of FEATURE_KEYS_BY_BUSINESS_TYPE[code] || []) out.add(key);
  }
  return Array.from(out);
}

export function roleSurfacesForBusinessTypes(businessTypes = []) {
  const out = new Set();
  for (const raw of businessTypes || []) {
    const code = AgencyBusinessType.normalizeType(raw?.businessType || raw?.business_type || raw);
    if (!code) continue;
    for (const surface of ROLE_SURFACES_BY_BUSINESS_TYPE[code] || []) out.add(surface);
  }
  return Array.from(out);
}

/**
 * Vertical-scoped keys require at least one matching business type.
 * Unscoped keys always pass (platform/tenant availability still applies).
 * When no business types are enabled yet, vertical keys fail closed except
 * during soft bootstrap (allowBootstrap=true).
 */
export function isFeatureAllowedForBusinessTypes(featureKey, businessTypes = [], { allowBootstrap = false } = {}) {
  const key = String(featureKey || '').trim();
  if (!key) return false;
  if (!VERTICAL_SCOPED_FEATURE_KEYS.has(key)) return true;
  const enabled = (businessTypes || []).filter((t) => {
    const on = t?.isEnabled !== false && t?.is_enabled !== 0 && t?.is_enabled !== false;
    return on && AgencyBusinessType.normalizeType(t?.businessType || t?.business_type || t);
  });
  if (!enabled.length) return !!allowBootstrap;
  const allowed = new Set(featureKeysForBusinessTypes(enabled));
  return allowed.has(key);
}

export function isPublicServiceTypeAllowed(serviceType, businessTypes = [], { allowBootstrap = false } = {}) {
  const st = String(serviceType || '').trim().toLowerCase();
  if (!st) return false;
  const enabled = (businessTypes || []).filter((t) => {
    const on = t?.isEnabled !== false && t?.is_enabled !== 0 && t?.is_enabled !== false;
    return on && AgencyBusinessType.normalizeType(t?.businessType || t?.business_type || t);
  });
  if (!enabled.length) return !!allowBootstrap;
  return publicServiceTypesForBusinessTypes(enabled).includes(st);
}

export function buildCapabilitiesPayload(businessTypes = []) {
  const enabled = (businessTypes || []).filter((t) => t?.isEnabled !== false && t?.is_enabled !== 0 && t?.is_enabled !== false);
  return {
    enabledBusinessTypes: enabled.map((t) => AgencyBusinessType.normalizeType(t?.businessType || t?.business_type || t)).filter(Boolean),
    allowedPublicServiceTypes: publicServiceTypesForBusinessTypes(enabled),
    allowedFeatureKeys: featureKeysForBusinessTypes(enabled),
    allowedRoleSurfaces: roleSurfacesForBusinessTypes(enabled),
    catalog: BUSINESS_TYPE_CODES
  };
}

export async function getEnabledBusinessTypesForAgency(agencyId, { ensureDefaults = false, organizationType = null } = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) return [];
  let rows = await AgencyBusinessType.listForAgency(aid);
  if (ensureDefaults && !rows.length) {
    const defaults = defaultsForOrganizationType(organizationType);
    if (defaults.length) {
      rows = await AgencyBusinessType.setForAgency(
        aid,
        defaults.map((businessType, sortOrder) => ({ businessType, isEnabled: true, sortOrder }))
      );
    }
  }
  return rows.filter((t) => t.isEnabled);
}

export async function getCapabilitiesForAgency(agencyId, { ensureDefaults = false, organizationType = null } = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) return buildCapabilitiesPayload([]);
  let rows = await AgencyBusinessType.listForAgency(aid);
  if (ensureDefaults && !rows.length && organizationType != null) {
    const defaults = defaultsForOrganizationType(organizationType);
    if (defaults.length) {
      rows = await AgencyBusinessType.setForAgency(
        aid,
        defaults.map((businessType, sortOrder) => ({ businessType, isEnabled: true, sortOrder }))
      );
    }
  }
  return buildCapabilitiesPayload(rows.filter((t) => t.isEnabled));
}
