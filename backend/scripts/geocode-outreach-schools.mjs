/**
 * Backfill street addresses + lat/lng for outreach directory schools.
 * Uses Google Places Text Search (school name) with Geocoding fallback.
 * Requires GOOGLE_MAPS_API_KEY with Places API and Geocoding API enabled.
 * Usage: node backend/scripts/geocode-outreach-schools.mjs <agencyId>
 */
import {
  backfillOutreachSchoolGeocodes,
  ensureOutreachDirectory
} from '../src/services/outreachHub.service.js';

const agencyId = Number(process.argv[2] || 2);
if (!agencyId) {
  console.error('Usage: node backend/scripts/geocode-outreach-schools.mjs <agencyId>');
  process.exit(1);
}

await ensureOutreachDirectory(agencyId);
let geocoded = 0;
let remaining = 1;
let rounds = 0;
while (remaining > 0 && rounds < 30) {
  const result = await backfillOutreachSchoolGeocodes(agencyId, { limit: 50 });
  geocoded += result.geocoded;
  remaining = result.remaining;
  rounds += 1;
  console.log(`Round ${rounds}: geocoded ${result.geocoded}, remaining ${remaining}`);
  if (result.geocoded === 0) break;
}
console.log(`Finished: ${geocoded} schools geocoded for agency ${agencyId}`);
process.exit(0);
