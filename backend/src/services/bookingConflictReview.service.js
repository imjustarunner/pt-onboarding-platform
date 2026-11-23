import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { assertAppointmentWindowAvailable } from './appointmentConflict.service.js';
import { clientScheduleInstantToUtcMysql, utcDateToZonedYmd } from '../utils/zonedWallTime.util.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

/** Staff booking choices are recomputed on every request. Calendar identities
 * and titles stay private, and each save rechecks the reviewed conflicts. */
export async function reviewBookingConflicts(req, res, { providerId, agencyId, occurrences, timeZone, officeEventId = null, checkRoom, allowAvailableDates = true } = {}) {
  const result = { occurrences, acknowledgedTimeConflicts: [], skippedDates: [] };
  if (req.body?.reviewBookingConflicts !== true) return result;
  const own = Number(providerId) === Number(req.user.id);
  if (!own && !['admin', 'super_admin', 'support'].includes(req.user.role)) return result;
  const windows = [];
  const inspect = async occurrence => {
    const startAt = clientScheduleInstantToUtcMysql(occurrence.startAt, timeZone);
    const endAt = clientScheduleInstantToUtcMysql(occurrence.endAt, timeZone);
    const conflicts = [];
    await assertAppointmentWindowAvailable(pool, { providerUserId: providerId, agencyId,
      startAt, endAt, sourceTimezone: timeZone, status: 'scheduled', officeEventId,
      collectTimeConflict: conflict => conflicts.push(conflict) });
    if (checkRoom) {
      const conflict = await checkRoom({ startAt, endAt });
      if (conflict) conflicts.push(conflict);
    }
    conflicts.sort((a,b) => a.key.localeCompare(b.key));
    return { occurrence, startAt, endAt, conflicts,
      date: utcDateToZonedYmd(parseUtcDate(startAt), timeZone) };
  };
  for (let index = 0; index < occurrences.length; index += 6) {
    windows.push(...await Promise.all(occurrences.slice(index,index+6).map(inspect)));
  }
  const blocked = windows.filter(window => window.conflicts.length);
  if (!blocked.length) return result;
  const available = windows.filter(window => !window.conflicts.length);
  const canBookAvailable = allowAvailableDates && occurrences.length > 1 && available.length > 0;
  const review = createHash('sha256').update(JSON.stringify([req.user.id, providerId, agencyId,
    windows.map(({ startAt, endAt, conflicts }) => ({ startAt, endAt, conflicts }))])).digest('hex');
  const allowOverlap = blocked.every(window => window.conflicts.every(conflict => conflict.allowOverlap));
  const choice = req.body?.bookingConflictChoice;
  if (req.body?.bookingConflictReview === review && choice === 'overlap' && allowOverlap) {
    return { ...result, acknowledgedTimeConflicts: blocked.flatMap(window => window.conflicts.map(conflict => conflict.key)),
      decision: { choice:'overlap', actorUserId:req.user.id, reviewedAt:new Date().toISOString(),
        dates:blocked.map(window => ({date:window.date,reasons:window.conflicts.map(conflict=>conflict.reason)})) } };
  }
  if (req.body?.bookingConflictReview === review && choice === 'available' && canBookAvailable) {
    return { ...result, occurrences: available.map(window => window.occurrence),
      skippedDates: blocked.map(window => ({ date: window.date, reasons: [...new Set(window.conflicts.map(conflict => conflict.reason))] })),
      decision: { choice:'available', actorUserId:req.user.id, reviewedAt:new Date().toISOString(), skippedDates:blocked.map(window=>window.date) } };
  }
  res.status(409).json({ error: { code: 'REVIEW_BOOKING_CONFLICTS', review,
    message: 'Some dates overlap existing commitments. Review the dates and choose how to book.',
    conflicts: blocked.map(window => ({ date: window.date, reasons: [...new Set(window.conflicts.map(conflict => conflict.reason))] })),
    availableCount: available.length, requestedCount: occurrences.length,
    canBookAvailable, canOverlap: allowOverlap } });
  return null;
}
