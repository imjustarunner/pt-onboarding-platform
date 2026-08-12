import pool from '../config/database.js';

/**
 * Keep linked provider_schedule_events in sync with planned_outs instants.
 * Planned outs are the source of truth for what the submitter booked; schedule
 * blocks can drift after timezone migrations or older create paths.
 */
export async function syncScheduleEventFromPlannedOut(plannedOutId) {
  const id = Number(plannedOutId || 0);
  if (!id) return { updated: false };

  const [result] = await pool.execute(
    `UPDATE provider_schedule_events pse
     INNER JOIN planned_outs po ON po.schedule_event_id = pse.id
     SET pse.start_at = po.start_at,
         pse.end_at = po.end_at,
         pse.updated_at = UTC_TIMESTAMP()
     WHERE po.id = ?
       AND COALESCE(po.all_day, 0) = 0
       AND po.start_at IS NOT NULL
       AND po.end_at IS NOT NULL
       AND UPPER(COALESCE(pse.status, 'ACTIVE')) <> 'CANCELLED'
       AND (
         pse.start_at <> po.start_at
         OR pse.end_at <> po.end_at
       )`,
    [id]
  );
  return { updated: Number(result?.affectedRows || 0) > 0 };
}

/** Repair every linked timed planned out whose schedule block times differ. */
export async function repairAllPlannedOutScheduleDrift() {
  const [result] = await pool.execute(
    `UPDATE provider_schedule_events pse
     INNER JOIN planned_outs po ON po.schedule_event_id = pse.id
     SET pse.start_at = po.start_at,
         pse.end_at = po.end_at,
         pse.updated_at = UTC_TIMESTAMP()
     WHERE COALESCE(po.all_day, 0) = 0
       AND po.start_at IS NOT NULL
       AND po.end_at IS NOT NULL
       AND UPPER(COALESCE(pse.status, 'ACTIVE')) <> 'CANCELLED'
       AND (
         pse.start_at <> po.start_at
         OR pse.end_at <> po.end_at
       )`
  );
  return Number(result?.affectedRows || 0);
}
