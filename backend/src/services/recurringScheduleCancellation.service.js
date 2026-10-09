import pool from '../config/database.js';

// The renewal worker holds this same lock through its writes. Cancellation
// cannot miss an occurrence inserted between selecting dates and stopping a series.
export async function withRecurringScheduleEdit(work) {
  const db = await pool.getConnection();
  let locked = false;
  try {
    const [[row]] = await db.execute("SELECT GET_LOCK('recurring-schedule-year', 10) AS acquired");
    locked = Number(row?.acquired) === 1;
    if (!locked) throw Object.assign(new Error('The recurring schedule is being updated. Please retry.'), { status: 409 });
    return await work(db);
  } finally {
    try { if (locked) await db.execute("SELECT RELEASE_LOCK('recurring-schedule-year')"); }
    finally { db.release(); }
  }
}

export async function cancelMeetingOccurrences({ kind, eventId, scope = 'single', actorUserId = null }) {
  if (!['meeting', 'supervision'].includes(kind) || !['single', 'future', 'others'].includes(scope)
      || (kind === 'supervision' && scope === 'others')) {
    throw Object.assign(new Error('Choose this occurrence or this and all future occurrences.'), { status: 400 });
  }
  const table = kind === 'meeting' ? 'provider_schedule_events' : 'supervision_sessions';
  const host = kind === 'meeting' ? 'provider_id' : 'supervisor_user_id';
  return withRecurringScheduleEdit(async db => {
    await db.beginTransaction();
    try {
      const [[anchor]] = await db.execute(`SELECT * FROM ${table} WHERE id=? FOR UPDATE`, [eventId]);
      if (!anchor) throw Object.assign(new Error('Meeting not found'), { status: 404 });
      if (scope !== 'single' && !anchor.recurrence_series_id) throw Object.assign(new Error('This meeting is not part of a recurring series.'), { status: 400 });
      if (kind === 'meeting' && !['TEAM_MEETING', 'HUDDLE'].includes(anchor.kind)) throw Object.assign(new Error('Use the appointment cancellation workflow for client sessions.'), { status: 409 });
      let rows;
      if (scope === 'single') rows = [anchor];
      else {
        const boundary = scope === 'others' ? 'id<>?' : '(start_at>=? OR (all_day=1 AND start_date>=?))';
        const predicate = kind === 'supervision' && scope === 'future' ? 'start_at>=?' : boundary;
        const values = scope === 'others' ? [anchor.id] : kind === 'supervision' ? [anchor.start_at] : [anchor.start_at, anchor.start_date];
        [rows] = await db.execute(`SELECT * FROM ${table} WHERE agency_id <=> ? AND ${host}=? AND recurrence_series_id=? AND ${predicate} FOR UPDATE`,
          [anchor.agency_id, anchor[host], anchor.recurrence_series_id, ...values]);
        await db.execute(`UPDATE ${table} SET recurrence_stopped=1 WHERE agency_id <=> ? AND ${host}=? AND recurrence_series_id=?`,
          [anchor.agency_id, anchor[host], anchor.recurrence_series_id]);
      }
      rows = rows.filter(row => !row.finalized_at && !row.meeting_completed_at
        && (String(row.status).toUpperCase() !== 'CANCELLED' || Number(row.recurrence_horizon_held)));
      const ids = rows.map(row => Number(row.id));
      if (ids.length) await db.execute(`UPDATE ${table} SET status='CANCELLED', recurrence_horizon_held=0,
        recurrence_calendar_pending=1, updated_at=CURRENT_TIMESTAMP${kind === 'meeting' ? ', updated_by_user_id=?' : ''}
        WHERE id IN (${ids.map(() => '?').join(',')})`, kind === 'meeting' ? [actorUserId, ...ids] : ids);
      await db.commit();
      return { rows, ids, cancelledCount: ids.length, seriesId: anchor.recurrence_series_id || null, scope };
    } catch (error) { await db.rollback(); throw error; }
  });
}
