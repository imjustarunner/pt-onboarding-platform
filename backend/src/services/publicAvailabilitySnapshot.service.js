import Availability from './providerAvailability.service.js';
import { readPublicSnapshot } from './publicReadSnapshot.service.js';

// Search preferences are applied AFTER this shared snapshot: office/virtual and
// day/time searches reuse the same provider week, rather than rebuilding it.
export async function readPublicWeekAvailability(options, { fresh = false } = {}) {
  // Only trusted server-side hold/booking validation passes this option.
  if (fresh) return Availability.computeWeekAvailability(options);
  const date = new Date(`${String(options.weekStartYmd).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid availability week');
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  const normalized = {
    agencyId: Number(options.agencyId), providerId: Number(options.providerId),
    weekStartYmd: date.toISOString().slice(0, 10),
    intakeOnly: Boolean(options.intakeOnly), slotMinutes: 60,
    includeGoogleBusy: true, externalCalendarIds: []
  };
  return readPublicSnapshot({ key: ['public-week-v2', normalized], kind: 'availability', providerId: normalized.providerId }, async () => {
    const result = await Availability.computeWeekAvailability(normalized);
    if (!result) throw new Error('Availability could not be loaded');
    // Explicit public allowlist: no busy events, client data, or calendar URLs.
    const slots = rows => (rows || []).map(({ startAt, endAt, buildingId, buildingName, roomId, roomLabel, sessionType, frequency }) =>
      ({ startAt, endAt, buildingId, buildingName, roomId, roomLabel, sessionType, frequency }));
    return { ok: true, agencyId: normalized.agencyId, providerId: normalized.providerId,
      weekStart: normalized.weekStartYmd, weekEnd: result.weekEnd, timeZone: result.timeZone, slotMinutes: 60,
      checkedAt: new Date().toISOString(), inPersonSlots: slots(result.inPersonSlots), virtualSlots: slots(result.virtualSlots) };
  });
}
