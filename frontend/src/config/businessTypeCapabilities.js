/**
 * Mirrors backend businessTypeCapabilities.service.js — keep in sync.
 * Business types nest public finders, vertical feature keys, and role surfaces.
 * Canonical clinical type is mental_health (healthcare is a read alias).
 */

export const BUSINESS_TYPE_CODES = [
  'mental_health',
  'learning',
  'tutoring',
  'coaching',
  'consulting',
  'mentorship',
  'skills_development',
  'other'
];

export const BUSINESS_TYPE_ALIASES = {
  healthcare: 'mental_health'
};

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

export const DEFAULT_BUSINESS_TYPES_BY_ORG_TYPE = {
  agency: ['mental_health'],
  life_coach: ['coaching'],
  consultant: ['consulting'],
  learning: ['learning', 'tutoring'],
  clinical: ['mental_health'],
  school: ['learning', 'tutoring'],
  program: ['learning', 'skills_development']
};

const VERTICAL_SCOPED_FEATURE_KEYS = new Set(
  Object.values(FEATURE_KEYS_BY_BUSINESS_TYPE).flat()
);

function normalizeType(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (!t) return null;
  const aliased = BUSINESS_TYPE_ALIASES[t] || t;
  return BUSINESS_TYPE_CODES.includes(aliased) ? aliased : null;
}

function enabledCodes(businessTypes = []) {
  return (businessTypes || [])
    .filter((t) => t?.isEnabled !== false && t?.is_enabled !== 0 && t?.is_enabled !== false)
    .map((t) => normalizeType(t?.businessType || t?.business_type || t))
    .filter(Boolean);
}

export function publicServiceTypesForBusinessTypes(businessTypes = []) {
  const out = new Set();
  for (const code of enabledCodes(businessTypes)) {
    for (const st of PUBLIC_SERVICE_BY_BUSINESS_TYPE[code] || []) out.add(st);
  }
  return Array.from(out);
}

export function featureKeysForBusinessTypes(businessTypes = []) {
  const out = new Set();
  for (const code of enabledCodes(businessTypes)) {
    for (const key of FEATURE_KEYS_BY_BUSINESS_TYPE[code] || []) out.add(key);
  }
  return Array.from(out);
}

export function roleSurfacesForBusinessTypes(businessTypes = []) {
  const out = new Set();
  for (const code of enabledCodes(businessTypes)) {
    for (const surface of ROLE_SURFACES_BY_BUSINESS_TYPE[code] || []) out.add(surface);
  }
  return Array.from(out);
}

export function isFeatureAllowedForBusinessTypes(featureKey, businessTypes = [], { allowBootstrap = false } = {}) {
  const key = String(featureKey || '').trim();
  if (!key) return false;
  if (!VERTICAL_SCOPED_FEATURE_KEYS.has(key)) return true;
  const codes = enabledCodes(businessTypes);
  if (!codes.length) return !!allowBootstrap;
  return featureKeysForBusinessTypes(codes.map((businessType) => ({ businessType, isEnabled: true }))).includes(key);
}

export function isPublicServiceTypeAllowed(serviceType, businessTypes = [], { allowBootstrap = false } = {}) {
  const st = String(serviceType || '').trim().toLowerCase();
  if (!st) return false;
  const codes = enabledCodes(businessTypes);
  if (!codes.length) return !!allowBootstrap;
  return publicServiceTypesForBusinessTypes(codes.map((businessType) => ({ businessType, isEnabled: true }))).includes(st);
}

export function isRoleSurfaceAllowed(surface, businessTypes = [], { allowBootstrap = false } = {}) {
  const s = String(surface || '').trim().toLowerCase();
  if (!s) return false;
  const codes = enabledCodes(businessTypes);
  if (!codes.length) return !!allowBootstrap;
  return roleSurfacesForBusinessTypes(codes.map((businessType) => ({ businessType, isEnabled: true }))).includes(s);
}

export function buildCapabilitiesPayload(businessTypes = []) {
  const codes = enabledCodes(businessTypes);
  const asRows = codes.map((businessType) => ({ businessType, isEnabled: true }));
  return {
    enabledBusinessTypes: codes,
    allowedPublicServiceTypes: publicServiceTypesForBusinessTypes(asRows),
    allowedFeatureKeys: featureKeysForBusinessTypes(asRows),
    allowedRoleSurfaces: roleSurfacesForBusinessTypes(asRows),
    catalog: BUSINESS_TYPE_CODES
  };
}
