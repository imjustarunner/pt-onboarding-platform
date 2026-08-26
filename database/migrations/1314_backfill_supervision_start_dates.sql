-- Migration 1314: backfill supervision_start_date for prelicensed users whose
-- sessions or payroll supervision codes cannot credit hours (NULL or after first activity).

UPDATE user_agencies ua
INNER JOIN (
  SELECT
    ua2.agency_id,
    ua2.user_id,
    DATE_SUB(
      CASE
        WHEN sess.earliest_session IS NULL THEN pay.earliest_payroll
        WHEN pay.earliest_payroll IS NULL THEN sess.earliest_session
        ELSE LEAST(sess.earliest_session, pay.earliest_payroll)
      END,
      INTERVAL 1 DAY
    ) AS new_start_date
  FROM user_agencies ua2
  LEFT JOIN (
    SELECT
      ss.agency_id,
      uid.user_id,
      MIN(DATE(ss.start_at)) AS earliest_session
    FROM supervision_sessions ss
    INNER JOIN (
      SELECT session_id, user_id FROM supervision_session_attendees
      WHERE participant_role = 'supervisee'
      UNION
      SELECT session_id, user_id FROM supervision_session_attendance_rollups
      UNION
      SELECT session_id, user_id FROM supervision_session_hour_credits
    ) uid ON uid.session_id = ss.id
    WHERE UPPER(TRIM(COALESCE(ss.status, ''))) = 'FINALIZED'
    GROUP BY ss.agency_id, uid.user_id
  ) sess ON sess.agency_id = ua2.agency_id AND sess.user_id = ua2.user_id
  LEFT JOIN (
    SELECT
      pir.agency_id,
      pir.user_id,
      MIN(pir.service_date) AS earliest_payroll
    FROM payroll_import_rows pir
    WHERE UPPER(TRIM(pir.service_code)) IN ('99414', '99415', '99416')
    GROUP BY pir.agency_id, pir.user_id
  ) pay ON pay.agency_id = ua2.agency_id AND pay.user_id = ua2.user_id
  WHERE ua2.supervision_is_prelicensed = 1
    AND (sess.earliest_session IS NOT NULL OR pay.earliest_payroll IS NOT NULL)
) calc ON calc.agency_id = ua.agency_id AND calc.user_id = ua.user_id
SET ua.supervision_start_date = calc.new_start_date
WHERE ua.supervision_is_prelicensed = 1
  AND (
    ua.supervision_start_date IS NULL
    OR ua.supervision_start_date > calc.new_start_date
  );
