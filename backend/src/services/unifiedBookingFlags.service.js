/**
 * Unified booking is always on for every tenant.
 * Kept as a thin compatibility shim so adapters/controllers can call a single helper.
 * Office standing assignments remain independent; adapters always may write appointments.
 */

export function resolveUnifiedBookingFlags(_featureFlags = {}) {
  return {
    unifiedBookingEnabled: true
  };
}

export async function getUnifiedBookingFlagsForAgency(_agencyId) {
  return resolveUnifiedBookingFlags({});
}

export async function assertUnifiedBookingEnabled(_agencyId) {
  return resolveUnifiedBookingFlags({});
}
