export function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return {};
}

export function isTruthyFeatureFlag(v) {
  if (v === true || v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function parseTenantMatrixJson(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && raw !== null) return { ...raw };
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return {};
}

const SCHOOL_PORTALS_FEATURE_KEY = 'schoolPortalsEnabled';

/**
 * School Overview + All School Portals (not Program Overview).
 * Super admins bypass tenant flags for QA.
 */
export function canAccessSchoolPortalsSurfaces(opts = {}) {
  const role = String(opts.userRole || '').trim().toLowerCase();
  if (role === 'super_admin') return true;

  const tenantMatrixJson =
    opts.tenantAvailableAgencyFeaturesOverrideJson ??
    opts.tenant_available_agency_features_json ??
    null;

  const tenant = parseTenantMatrixJson(tenantMatrixJson);
  if (
    Object.prototype.hasOwnProperty.call(tenant, SCHOOL_PORTALS_FEATURE_KEY) &&
    tenant[SCHOOL_PORTALS_FEATURE_KEY] === false
  ) {
    return false;
  }

  const flags = parseFeatureFlags(opts.agencyFeatureFlags);
  const flagOn = isTruthyFeatureFlag(flags.schoolPortalsEnabled);
  // Billing / agency profile syncs this flag when the feature is selected. A missing platform
  // `available_agency_features_json` key must not hide surfaces when the org flag is on.
  if (flagOn) return true;

  return false;
}
