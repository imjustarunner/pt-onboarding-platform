// TherapyNotes imports and coverage matching are retired. Preserve compatibility
// for older clients and historical flag review without reading feeds, altering
// bookings, or issuing coverage notifications.
export const ICS_COVERAGE_WINDOW_DAYS = 28;
const retired = () => ({
  ok: true,
  skipped: true,
  reason: 'therapy_notes_removed',
  message: 'TherapyNotes calendar integration has been removed. Office bookings and usage are tracked in this app.'
});
export async function refreshLocationBookingsFromEhr() { return retired(); }
export async function refreshAllLocationsFromEhr() { return retired(); }
export async function auditIcsCoverageForLocation() { return retired(); }
export async function auditIcsCoverageAllLocations() { return retired(); }
export async function getEhrSyncHealth() { return { ...retired(), locations: [] }; }
export async function ehrSyncAlreadyRanToday() { return true; }
export async function downgradeBookedWithoutExternalOverlap() { return { ...retired(), downgraded: 0 }; }
export default {
  refreshLocationBookingsFromEhr,
  refreshAllLocationsFromEhr,
  auditIcsCoverageForLocation,
  auditIcsCoverageAllLocations,
  getEhrSyncHealth,
  ehrSyncAlreadyRanToday,
  downgradeBookedWithoutExternalOverlap
};
