import pool from '../config/database.js';
import { assertAppointmentWindowAvailable } from './appointmentConflict.service.js';
import { assertNoReviewTimeOverlap } from './supervisionReviewTime.service.js';

export async function withMeetingWindow({ userIds, startAt, endAt, timeZone, excludeMeetingId = null, excludeSupervisionId = null }, work) {
  const ids = [...new Set(userIds.map(Number).filter(id => id > 0))].sort((a,b) => a-b);
  const db = await pool.getConnection();
  const locks = [];
  try {
    // Match both appointment booking and documentation-review writers.
    for (const prefix of ['public-provider-selection:', 'supervision-time:']) {
      for (const id of ids) {
        const key = `${prefix}${id}`;
        const [[row]] = await db.execute('SELECT GET_LOCK(?, 5) AS acquired', [key]);
        if (Number(row?.acquired) !== 1) throw Object.assign(new Error('This schedule is being updated. Please retry.'), { status: 409 });
        locks.push(key);
      }
    }
    for (const id of ids) {
      await assertAppointmentWindowAvailable(db, { providerUserId: id, startAt, endAt,
        sourceTimezone: timeZone, providerScheduleEventId: excludeMeetingId, supervisionSessionId: excludeSupervisionId });
    }
    await assertNoReviewTimeOverlap(db, ids, startAt, endAt);
    return await work(db);
  } finally {
    for (const key of locks.reverse()) await db.execute('SELECT RELEASE_LOCK(?)', [key]).catch(() => {});
    db.release();
  }
}
