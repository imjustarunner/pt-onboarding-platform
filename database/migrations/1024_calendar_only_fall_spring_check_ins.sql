-- Migration 1024: Fall/Spring school check-ins are calendar-only (not attendable/staffable).
UPDATE company_events
SET staffing_config_json = JSON_OBJECT(
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
  AND event_type IN ('school_fall_check_in', 'school_spring_event', 'school_holiday', 'school_day_off', 'school_first_day');
