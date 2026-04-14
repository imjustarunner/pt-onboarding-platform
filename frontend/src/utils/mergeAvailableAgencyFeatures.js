/**
 * Merge platform-wide available_agency_features_json with per-tenant overrides (for display matrices).
 * Tenant explicit true/false wins; missing tenant keys inherit global per-key rules.
 */
export function mergeAvailableAgencyFeatures(globalJson, tenantOverrideJson) {
  const parse = (raw) => {
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
  };

  const global = parse(globalJson);
  const tenant = parse(tenantOverrideJson);
  const keys = new Set([...Object.keys(global), ...Object.keys(tenant)]);
  const out = {};
  for (const key of keys) {
    out[key] = isFeatureKeyAvailableAfterMerge(globalJson, tenantOverrideJson, key);
  }
  return out;
}

/**
 * Same semantics as legacy Company Profile gating: empty global JSON => all visible;
 * otherwise only explicit false on global hides; tenant override wins when present.
 */
export function isFeatureKeyAvailableAfterMerge(globalJson, tenantOverrideJson, key) {
  if (!key) return true;

  const parse = (raw) => {
    if (raw == null) return {};
    if (typeof raw === 'object' && raw !== null) return raw;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) || {};
      } catch {
        return {};
      }
    }
    return {};
  };

  const tenant = parse(tenantOverrideJson);
  if (Object.prototype.hasOwnProperty.call(tenant, key)) {
    return tenant[key] !== false;
  }

  const raw = globalJson;
  if (raw == null || (typeof raw === 'object' && Object.keys(raw).length === 0)) {
    return true;
  }
  const parsed = parse(globalJson);
  return parsed[key] !== false;
}
