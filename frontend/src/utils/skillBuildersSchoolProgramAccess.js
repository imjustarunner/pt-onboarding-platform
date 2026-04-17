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

const SB_SCHOOL_PROGRAM_KEY = 'skillBuildersSchoolProgramEnabled';

/**
 * School-scoped Skill Builders (skills groups, school portal Skills area, coordinator/provider hub APIs).
 * Super admins bypass tenant flags for QA.
 */
export function canAccessSkillBuildersSchoolProgramSurfaces(opts = {}) {
  const role = String(opts.userRole || '').trim().toLowerCase();
  if (role === 'super_admin') return true;

  const tenantMatrixJson =
    opts.tenantAvailableAgencyFeaturesOverrideJson ??
    opts.tenant_available_agency_features_json ??
    null;

  const tenant = parseTenantMatrixJson(tenantMatrixJson);
  if (
    Object.prototype.hasOwnProperty.call(tenant, SB_SCHOOL_PROGRAM_KEY) &&
    tenant[SB_SCHOOL_PROGRAM_KEY] === false
  ) {
    return false;
  }

  const flags = parseFeatureFlags(opts.agencyFeatureFlags);
  const flagOn = isTruthyFeatureFlag(flags.skillBuildersSchoolProgramEnabled);
  if (flagOn) return true;

  return false;
}
