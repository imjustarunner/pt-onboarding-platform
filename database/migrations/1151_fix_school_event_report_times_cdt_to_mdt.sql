-- Migration 1151: Fix employee_report_time on school events where report time
-- is at or after the local event start time.
--
-- Root cause: event start times were corrected from Central (CDT, UTC-5) wall-clock
-- representation to Mountain (MDT, UTC-6), shifting starts_at back by 1 hour.
-- employee_report_time (a standalone TIME column) was not adjusted in that pass,
-- leaving it 30–60 minutes after the new local start time on 16 affected events.
--
-- Fix: subtract 1 hour from any employee_report_time that is >= the local start
-- time (UTC start minus 6 hours for America/Denver MDT).
-- A 2-hour cap on the diff excludes event #5 which has a separate data anomaly
-- (14h45m difference) and should be reviewed separately.

UPDATE company_events
SET employee_report_time = SEC_TO_TIME(
  GREATEST(0, TIME_TO_SEC(employee_report_time) - 3600)
)
WHERE employee_report_time IS NOT NULL
  AND employee_report_time >= TIME(DATE_SUB(starts_at, INTERVAL 6 HOUR))
  AND TIMEDIFF(employee_report_time, TIME(DATE_SUB(starts_at, INTERVAL 6 HOUR))) <= '02:00:00'
  AND timezone IN ('America/Denver', 'America/Phoenix');
