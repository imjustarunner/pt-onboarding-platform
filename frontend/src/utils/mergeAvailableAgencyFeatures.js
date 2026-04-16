import { AVAILABLE_AGENCY_FEATURE_KEYS } from '../config/availableAgencyFeatureKeys.js';

function globalDefaultAvailabilityForKey(key) {
  const entry = AVAILABLE_AGENCY_FEATURE_KEYS.find((f) => f.key === key);
  if (entry && entry.defaultAvailable === false) return false;
  return true;
}

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
 * Company Profile eligibility: tenant override wins when present.
 * Otherwise, explicit platform JSON per key; when a key is absent from platform JSON,
 * known opt-in keys (see `defaultAvailable: false` in availableAgencyFeatureKeys) default off.
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

  const parsed = parse(globalJson);
  if (Object.prototype.hasOwnProperty.call(parsed, key)) {
    return parsed[key] !== false;
  }
  return globalDefaultAvailabilityForKey(key);
}
