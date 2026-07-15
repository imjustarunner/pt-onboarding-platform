-- Migration 942: Promote Feelings Capture to current_pilot (Phase 4)
-- Feature flag: activity.feelingsCapture.enabled (mobile-primary; web tap-friendly)

UPDATE activity_registry
SET
  status = 'current_pilot',
  version = '1.0.0',
  activity_type = 'touch_matching_game',
  platforms_json = JSON_ARRAY('mobile', 'web'),
  launch_mode = 'embedded',
  feature_flag = 'activity.feelingsCapture.enabled',
  estimated_duration_min = 5,
  estimated_duration_max = 12,
  topics_json = JSON_ARRAY('emotional_awareness'),
  manifest_json = JSON_SET(
    COALESCE(manifest_json, JSON_OBJECT()),
    '$.id', 'feelings-capture',
    '$.displayName', 'Feelings Capture',
    '$.status', 'current_pilot',
    '$.type', 'touch_matching_game',
    '$.launchMode', 'embedded',
    '$.featureFlag', 'activity.feelingsCapture.enabled',
    '$.oneLineDescription', 'Identify multiple emotions connected to a situation.',
    '$.platforms', JSON_ARRAY('mobile', 'web'),
    '$.supports', JSON_OBJECT(
      'sharedState', true,
      'turnTaking', false,
      'scoring', false,
      'reducedMotion', true,
      'providerFacilitationPanel', true,
      'clientJournal', true,
      'sharedNotes', true,
      'haptics', true,
      'staticMode', true
    )
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'feelings-capture';
