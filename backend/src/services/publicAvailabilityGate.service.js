import pool from '../config/database.js';
import { getEffectiveBillingPricingForAgency } from './billingPricing.service.js';

function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function isPublicProviderFinderFeatureEnabled(agencyRow) {
  const flags = parseFeatureFlags(agencyRow?.feature_flags);
  // Primary pricing toggle now lives in agency feature flags.
  if (flags.publicProviderFinderEnabled === true) return true;
  if (flags.publicProviderFinderEnabled === false) return false;
  // Backward compatibility for older agency rows that still use the legacy column.
  return agencyRow?.public_availability_enabled === true || agencyRow?.public_availability_enabled === 1;
}

/**
 * Public Availability gating:
 * - Feature flag: agencies.public_availability_enabled must be true
 * - Billing gate: pricing.addonsEnabled.publicAvailability must be true
 *
 * Returns { ok: true } or { ok: false, status, message }.
 */
export async function checkPublicAvailabilityGate(agencyId) {
  const aId = parseInt(agencyId, 10);
  if (!aId || Number.isNaN(aId)) return { ok: false, status: 400, message: 'Invalid agencyId' };

  const [rows] = await pool.execute(
    `SELECT id, public_availability_enabled, feature_flags
     FROM agencies
     WHERE id = ?
     LIMIT 1`,
    [aId]
  );
  const agency = rows?.[0] || null;
  if (!agency) return { ok: false, status: 404, message: 'Agency not found' };

  const enabled = isPublicProviderFinderFeatureEnabled(agency);
  if (!enabled) {
    return { ok: false, status: 403, message: 'Public availability is not enabled for this agency' };
  }

  const pricingBundle = await getEffectiveBillingPricingForAgency(aId);
  const paid = Boolean(pricingBundle?.effective?.addonsEnabled?.publicAvailability);
  if (!paid) {
    return { ok: false, status: 402, message: 'Public availability is not included in this agency plan' };
  }

  return { ok: true };
}

export { isPublicProviderFinderFeatureEnabled };

