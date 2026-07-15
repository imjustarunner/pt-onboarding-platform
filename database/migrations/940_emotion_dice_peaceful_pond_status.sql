-- Migration 940: Promote Emotion Dice to live_current and Peaceful Pond to current_pilot
-- Feature flags remain: activity.emotionDice.enabled / activity.peacefulPond.enabled

UPDATE activity_registry
SET
  status = 'live_current',
  version = '1.0.0',
  estimated_duration_min = 5,
  estimated_duration_max = 15,
  manifest_json = JSON_SET(
    COALESCE(manifest_json, JSON_OBJECT()),
    '$.id', 'emotion-dice',
    '$.displayName', 'Emotion Dice',
    '$.status', 'live_current',
    '$.launchMode', 'embedded',
    '$.featureFlag', 'activity.emotionDice.enabled',
    '$.oneLineDescription', 'Roll an emotion and use it to begin a conversation.',
    '$.platforms', JSON_ARRAY('mobile', 'web'),
    '$.supports', JSON_OBJECT(
      'sharedState', true,
      'turnTaking', true,
      'scoring', false,
      'reducedMotion', true,
      'providerFacilitationPanel', true,
      'clientJournal', true,
      'sharedNotes', true
    )
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'emotion-dice';

UPDATE activity_registry
SET
  status = 'current_pilot',
  version = '1.0.0',
  estimated_duration_min = 4,
  estimated_duration_max = 12,
  manifest_json = JSON_SET(
    COALESCE(manifest_json, JSON_OBJECT()),
    '$.id', 'peaceful-pond',
    '$.displayName', 'Peaceful Pond',
    '$.status', 'current_pilot',
    '$.launchMode', 'embedded',
    '$.featureFlag', 'activity.peacefulPond.enabled',
    '$.oneLineDescription', 'Name a worry, pause, and symbolically set it down for a moment.',
    '$.platforms', JSON_ARRAY('mobile', 'web'),
    '$.supports', JSON_OBJECT(
      'sharedState', true,
      'scoring', false,
      'reducedMotion', true,
      'providerFacilitationPanel', true,
      'clientJournal', true,
      'sharedNotes', true
    )
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'peaceful-pond';
