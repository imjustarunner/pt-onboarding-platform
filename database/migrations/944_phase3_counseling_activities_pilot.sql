-- Migration 944: Promote Phase 3 counseling activities to current_pilot
-- Feature flags:
--   activity.feelingsAdventure.enabled
--   activity.copingQuest.enabled
--   activity.emotionCharades.enabled
--   activity.calmDownBuilder.enabled
--   activity.storyShelf.enabled

UPDATE activity_registry
SET
  status = 'current_pilot',
  version = '1.0.0',
  feature_flag = 'activity.feelingsAdventure.enabled',
  estimated_duration_min = 10,
  estimated_duration_max = 25,
  launch_mode = 'embedded',
  platforms_json = '["mobile","web"]',
  manifest_json = JSON_SET(
    COALESCE(manifest_json, JSON_OBJECT()),
    '$.id', 'feelings-adventure',
    '$.displayName', 'Feelings Adventure',
    '$.status', 'current_pilot',
    '$.type', 'cooperative_board_game',
    '$.launchMode', 'embedded',
    '$.featureFlag', 'activity.feelingsAdventure.enabled',
    '$.oneLineDescription', 'Explore emotions and choices through situation cards.',
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
WHERE id = 'feelings-adventure';

UPDATE activity_registry
SET
  status = 'current_pilot',
  version = '1.0.0',
  feature_flag = 'activity.copingQuest.enabled',
  estimated_duration_min = 8,
  estimated_duration_max = 20,
  launch_mode = 'embedded',
  platforms_json = '["mobile","web"]',
  manifest_json = JSON_SET(
    COALESCE(manifest_json, JSON_OBJECT()),
    '$.id', 'coping-quest',
    '$.displayName', 'Coping Quest',
    '$.status', 'current_pilot',
    '$.type', 'choice_consequence_game',
    '$.launchMode', 'embedded',
    '$.featureFlag', 'activity.copingQuest.enabled',
    '$.oneLineDescription', 'Compare coping choices and discuss their likely effects.',
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
WHERE id = 'coping-quest';

UPDATE activity_registry
SET
  status = 'current_pilot',
  version = '1.0.0',
  feature_flag = 'activity.emotionCharades.enabled',
  estimated_duration_min = 8,
  estimated_duration_max = 20,
  launch_mode = 'embedded',
  platforms_json = '["mobile","web"]',
  manifest_json = JSON_SET(
    COALESCE(manifest_json, JSON_OBJECT()),
    '$.id', 'emotion-charades',
    '$.displayName', 'Emotion Charades',
    '$.status', 'current_pilot',
    '$.type', 'expressive_game',
    '$.launchMode', 'embedded',
    '$.featureFlag', 'activity.emotionCharades.enabled',
    '$.oneLineDescription', 'Practice recognizing and expressing emotional cues.',
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
WHERE id = 'emotion-charades';

UPDATE activity_registry
SET
  status = 'current_pilot',
  version = '1.0.0',
  feature_flag = 'activity.calmDownBuilder.enabled',
  estimated_duration_min = 8,
  estimated_duration_max = 20,
  launch_mode = 'embedded',
  platforms_json = '["mobile","web"]',
  manifest_json = JSON_SET(
    COALESCE(manifest_json, JSON_OBJECT()),
    '$.id', 'calm-down-builder',
    '$.displayName', 'Calm Down Builder',
    '$.status', 'current_pilot',
    '$.type', 'sequence_builder',
    '$.launchMode', 'embedded',
    '$.featureFlag', 'activity.calmDownBuilder.enabled',
    '$.oneLineDescription', 'Build and practice a personalized sequence of calming tools.',
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
WHERE id = 'calm-down-builder';

UPDATE activity_registry
SET
  status = 'current_pilot',
  version = '1.0.0',
  feature_flag = 'activity.storyShelf.enabled',
  estimated_duration_min = 10,
  estimated_duration_max = 30,
  launch_mode = 'embedded',
  platforms_json = '["mobile","web"]',
  manifest_json = JSON_SET(
    COALESCE(manifest_json, JSON_OBJECT()),
    '$.id', 'story-shelf',
    '$.displayName', 'StoryShelf',
    '$.status', 'current_pilot',
    '$.type', 'shared_reading',
    '$.launchMode', 'embedded',
    '$.featureFlag', 'activity.storyShelf.enabled',
    '$.oneLineDescription', 'Select topic-based short stories and read them aloud or together.',
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
WHERE id = 'story-shelf';
