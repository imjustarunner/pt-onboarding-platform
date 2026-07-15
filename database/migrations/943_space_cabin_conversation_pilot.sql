-- Migration 943: Promote Space Cabin Conversation to current_pilot (Phase 5)
-- Feature flag: activity.spaceCabin.enabled
-- Launch: embedded; webFullFidelity progressive enhancement

UPDATE activity_registry
SET
  status = 'current_pilot',
  version = '1.0.0',
  feature_flag = 'activity.spaceCabin.enabled',
  estimated_duration_min = 10,
  estimated_duration_max = 30,
  launch_mode = 'embedded',
  platforms_json = '["mobile","web"]',
  topics_json = '["communication","emotional_regulation","perspective_taking","social_problem_solving"]',
  manifest_json = JSON_SET(
    COALESCE(manifest_json, JSON_OBJECT()),
    '$.id', 'space-cabin-conversation',
    '$.displayName', 'Space Cabin Conversation',
    '$.status', 'current_pilot',
    '$.type', 'immersive_narrative',
    '$.launchMode', 'embedded',
    '$.webFullFidelity', true,
    '$.featureFlag', 'activity.spaceCabin.enabled',
    '$.oneLineDescription', 'Practice communication and perspective taking with an immersive scene.',
    '$.platforms', JSON_ARRAY('mobile', 'web'),
    '$.supports', JSON_OBJECT(
      'sharedState', true,
      'turnTaking', false,
      'scoring', false,
      'reducedMotion', true,
      'providerFacilitationPanel', true,
      'clientJournal', true,
      'sharedNotes', true,
      'performanceProfiles', true,
      'narrativeBranching', true
    )
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'space-cabin-conversation';
