-- Migration 1022: First Day of School is an important date, not a Back to School event.
-- Reclassify mis-typed rows so they no longer consume the yearly Back to School slot
-- and do not open provider staffing.

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
  AND event_type IN ('school_back_to_school', 'school_other')
  AND (
    LOWER(TRIM(title)) LIKE '%first day of school%'
    OR LOWER(TRIM(title)) LIKE 'jump start first day%'
    OR LOWER(TRIM(title)) = 'first day'
  );
