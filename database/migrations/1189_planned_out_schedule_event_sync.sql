-- Migration 1189: Align linked schedule blocks with planned_out instants.
-- Some older rows stored the correct UTC on planned_outs but a 2h-shifted block on
-- provider_schedule_events (agency vs submitter timezone during create/migration).

UPDATE provider_schedule_events pse
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
  );
