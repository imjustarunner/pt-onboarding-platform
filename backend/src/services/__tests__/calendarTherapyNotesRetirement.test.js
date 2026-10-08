import { expect, it } from 'vitest';
import integration from '../officeScheduleEhrSync.service.js';
it.each(['refreshLocationBookingsFromEhr', 'refreshAllLocationsFromEhr', 'auditIcsCoverageForLocation', 'auditIcsCoverageAllLocations', 'downgradeBookedWithoutExternalOverlap'])('%s is retired without reading feeds or changing reservations', async method => {
  expect(await integration[method]({ officeLocationId: 3 })).toMatchObject({ ok: true, skipped: true, reason: 'therapy_notes_removed' });
});
