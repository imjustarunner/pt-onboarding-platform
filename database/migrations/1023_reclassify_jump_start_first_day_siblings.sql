-- Migration 1023: ensure Jump Start / First Day of School rows are not Back to School,
-- including other schools in the same district broadcast.

UPDATE company_events
SET event_type = 'school_first_day',
    staffing_config_json = JSON_OBJECT(
      'enabled', false,
      'minProvidersPerSession', 0,
      'clientRule', JSON_OBJECT(
        'enabled', false,
        'confirmedStepSize', 1,
        'additionalProvidersPerStep', 0,
        'threshold', NULL
      ),
      'groupRule', JSON_OBJECT(
        'enabled', false,
        'baseProvidersForOneGroup', 0,
        'additionalProvidersPerGroup', 0
      ),
      'onCall', JSON_OBJECT('enabled', false, 'leadHours', 0),
      'waitlist', JSON_OBJECT('enabled', false),
      'providerSignup', JSON_OBJECT('enabled', false)
    )
WHERE is_active = 1
  AND event_type LIKE 'school\\_%'
  AND event_type <> 'school_first_day'
  AND (
    LOWER(TRIM(title)) LIKE '%first day of school%'
    OR LOWER(TRIM(title)) LIKE '%jump start%first day%'
    OR LOWER(TRIM(title)) LIKE 'jump start first day%'
    OR LOWER(TRIM(title)) = 'first day'
  );

UPDATE company_events ce
INNER JOIN (
  SELECT DISTINCT district_broadcast_id AS broadcast_id
  FROM company_events
  WHERE district_broadcast_id IS NOT NULL
    AND TRIM(district_broadcast_id) <> ''
    AND (
      event_type = 'school_first_day'
      OR LOWER(TRIM(title)) LIKE '%first day of school%'
      OR LOWER(TRIM(title)) LIKE '%jump start%first day%'
    )
) src ON src.broadcast_id = ce.district_broadcast_id
SET ce.event_type = 'school_first_day',
    ce.staffing_config_json = JSON_OBJECT(
      'enabled', false,
      'minProvidersPerSession', 0,
      'clientRule', JSON_OBJECT(
        'enabled', false,
        'confirmedStepSize', 1,
        'additionalProvidersPerStep', 0,
        'threshold', NULL
      ),
      'groupRule', JSON_OBJECT(
        'enabled', false,
        'baseProvidersForOneGroup', 0,
        'additionalProvidersPerGroup', 0
      ),
      'onCall', JSON_OBJECT('enabled', false, 'leadHours', 0),
      'waitlist', JSON_OBJECT('enabled', false),
      'providerSignup', JSON_OBJECT('enabled', false)
    )
WHERE ce.is_active = 1
  AND ce.event_type <> 'school_first_day';
