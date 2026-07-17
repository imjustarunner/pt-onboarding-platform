-- Migration 961: finalize existing school-event staffing so assignments appear on provider calendars
-- School hub assign previously left assignment_status at default 'draft'.

UPDATE company_event_session_providers cesp
INNER JOIN company_events ce ON ce.id = cesp.company_event_id
SET
  cesp.assignment_status = 'finalized',
  cesp.published_at = COALESCE(cesp.published_at, NOW())
WHERE cesp.assignment_status = 'draft'
  AND ce.event_type LIKE 'school\_%' ESCAPE '\\';
