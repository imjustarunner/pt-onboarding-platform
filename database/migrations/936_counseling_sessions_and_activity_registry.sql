-- Migration 936: Counseling sessions, notes, chat, activity registry, activity runtime

CREATE TABLE IF NOT EXISTS counseling_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  client_user_id INT NULL,
  appointment_id INT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'scheduled'
    COMMENT 'scheduled|joining|active|ended',
  vonage_session_id VARCHAR(255) NULL,
  room_unique_name VARCHAR(255) NULL,
  title VARCHAR(255) NULL,
  started_at DATETIME NULL,
  ended_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_counseling_sessions_agency (agency_id),
  INDEX idx_counseling_sessions_provider (provider_user_id),
  INDEX idx_counseling_sessions_client (client_user_id),
  INDEX idx_counseling_sessions_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS counseling_session_notes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  author_user_id INT NOT NULL,
  visibility VARCHAR(32) NOT NULL
    COMMENT 'provider_private|shared|client_journal|activity_reflection',
  body TEXT NOT NULL,
  activity_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_csn_session (session_id),
  INDEX idx_csn_visibility (visibility),
  CONSTRAINT fk_csn_session FOREIGN KEY (session_id)
    REFERENCES counseling_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS counseling_session_chat (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  sender_user_id INT NOT NULL,
  sender_role VARCHAR(32) NOT NULL COMMENT 'provider|client|system',
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_csc_session (session_id),
  CONSTRAINT fk_csc_session FOREIGN KEY (session_id)
    REFERENCES counseling_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_registry (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  display_name VARCHAR(128) NOT NULL,
  version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
  activity_type VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'planned'
    COMMENT 'live_current|current_pilot|planned|disabled|retired',
  platforms_json JSON NOT NULL,
  launch_mode VARCHAR(32) NOT NULL DEFAULT 'embedded'
    COMMENT 'embedded|standalone|both',
  feature_flag VARCHAR(128) NULL,
  estimated_duration_min INT NULL,
  estimated_duration_max INT NULL,
  topics_json JSON NULL,
  entry_url VARCHAR(512) NULL
    COMMENT 'Standalone launch URL path relative to games-content or absolute',
  manifest_json JSON NOT NULL,
  sort_order INT NOT NULL DEFAULT 100,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_activity_registry_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS counseling_session_activity_runtime (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  activity_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'INACTIVE'
    COMMENT 'INACTIVE|PREVIEW|CLIENT_PROMPT|LOADING|ACTIVE|PAUSED|REFLECTING|COMPLETED|RETURNING|ERROR_RECOVERY',
  round_number INT NOT NULL DEFAULT 0,
  shared_state_json JSON NULL,
  checkpoint_json JSON NULL,
  pause_reason VARCHAR(128) NULL,
  invited_by_user_id INT NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_csar_session_active (session_id, activity_id),
  INDEX idx_csar_session (session_id),
  CONSTRAINT fk_csar_session FOREIGN KEY (session_id)
    REFERENCES counseling_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed Phase 1 registry
INSERT INTO activity_registry (
  id, display_name, version, activity_type, status, platforms_json, launch_mode,
  feature_flag, estimated_duration_min, estimated_duration_max, topics_json,
  entry_url, manifest_json, sort_order
) VALUES
(
  'mood-check-in',
  'Mood Check-In',
  '1.0.0',
  'core_activity',
  'live_current',
  '["mobile","web"]',
  'embedded',
  NULL,
  1,
  5,
  '["emotional_awareness","reflection"]',
  NULL,
  JSON_OBJECT(
    'id', 'mood-check-in',
    'displayName', 'Mood Check-In',
    'version', '1.0.0',
    'type', 'core_activity',
    'status', 'live_current',
    'platforms', JSON_ARRAY('mobile', 'web'),
    'launchMode', 'embedded',
    'displayModes', JSON_ARRAY('embedded', 'focus'),
    'roles', JSON_ARRAY('client', 'provider'),
    'estimatedDurationMinutes', JSON_OBJECT('minimum', 1, 'maximum', 5),
    'topics', JSON_ARRAY('emotional_awareness', 'reflection'),
    'supports', JSON_OBJECT(
      'sharedState', true,
      'turnTaking', false,
      'privatePrompts', false,
      'providerFacilitationPanel', true,
      'clientJournal', true,
      'sharedNotes', true,
      'resumeAfterReconnect', true,
      'reducedMotion', true,
      'scoring', false
    ),
    'sensitivityTags', JSON_ARRAY('emotion_exploration'),
    'oneLineDescription', 'Share how you are feeling at the beginning, middle, or end of a session.'
  ),
  10
),
(
  'thought-explorer',
  'Thought Explorer',
  '1.0.0',
  'standalone_game',
  'live_current',
  '["mobile","web"]',
  'standalone',
  'gamesPlatformEnabled',
  15,
  45,
  '["emotional_awareness","coping_skills","cognitive"]',
  '/games-content/thought-explorer-main/dist/index.html',
  JSON_OBJECT(
    'id', 'thought-explorer',
    'displayName', 'Thought Explorer',
    'version', '1.0.0',
    'type', 'standalone_game',
    'status', 'live_current',
    'platforms', JSON_ARRAY('mobile', 'web'),
    'launchMode', 'standalone',
    'featureFlag', 'gamesPlatformEnabled',
    'requiresUserGamesAccess', true,
    'entryUrl', '/games-content/thought-explorer-main/dist/index.html',
    'oneLineDescription', 'Explore thoughts, beliefs, and coping skills in an interactive adventure.',
    'topics', JSON_ARRAY('emotional_awareness', 'coping_skills')
  ),
  20
),
(
  'emotion-dice',
  'Emotion Dice',
  '1.0.0',
  'discussion_game',
  'planned',
  '["mobile","web"]',
  'embedded',
  'activity.emotionDice.enabled',
  5,
  15,
  '["emotional_awareness","communication","reflection"]',
  NULL,
  JSON_OBJECT(
    'id', 'emotion-dice',
    'displayName', 'Emotion Dice',
    'status', 'planned',
    'launchMode', 'embedded',
    'oneLineDescription', 'Roll an emotion and use it to begin a conversation.'
  ),
  30
),
(
  'peaceful-pond',
  'Peaceful Pond',
  '1.0.0',
  'calming_game',
  'disabled',
  '["mobile","web"]',
  'embedded',
  'activity.peacefulPond.enabled',
  4,
  12,
  '["calming","reflection"]',
  NULL,
  JSON_OBJECT(
    'id', 'peaceful-pond',
    'displayName', 'Peaceful Pond',
    'status', 'disabled',
    'launchMode', 'embedded',
    'oneLineDescription', 'Name a worry, pause, and symbolically set it down for a moment.'
  ),
  40
),
(
  'feelings-adventure',
  'Feelings Adventure',
  '1.0.0',
  'cooperative_board_game',
  'planned',
  '["mobile","web"]',
  'embedded',
  NULL,
  10,
  25,
  '["emotional_awareness","communication"]',
  NULL,
  JSON_OBJECT('id', 'feelings-adventure', 'displayName', 'Feelings Adventure', 'status', 'planned', 'launchMode', 'embedded', 'oneLineDescription', 'Explore emotions and choices through situation cards.'),
  50
),
(
  'coping-quest',
  'Coping Quest',
  '1.0.0',
  'choice_consequence_game',
  'planned',
  '["mobile","web"]',
  'embedded',
  NULL,
  8,
  20,
  '["coping_skills"]',
  NULL,
  JSON_OBJECT('id', 'coping-quest', 'displayName', 'Coping Quest', 'status', 'planned', 'launchMode', 'embedded', 'oneLineDescription', 'Compare coping choices and discuss their likely effects.'),
  60
),
(
  'emotion-charades',
  'Emotion Charades',
  '1.0.0',
  'expressive_game',
  'planned',
  '["mobile","web"]',
  'embedded',
  NULL,
  8,
  20,
  '["emotional_awareness","communication"]',
  NULL,
  JSON_OBJECT('id', 'emotion-charades', 'displayName', 'Emotion Charades', 'status', 'planned', 'launchMode', 'embedded', 'oneLineDescription', 'Practice recognizing and expressing emotional cues.'),
  70
),
(
  'feelings-capture',
  'Feelings Capture',
  '1.0.0',
  'touch_matching_game',
  'planned',
  '["mobile"]',
  'embedded',
  NULL,
  5,
  12,
  '["emotional_awareness"]',
  NULL,
  JSON_OBJECT('id', 'feelings-capture', 'displayName', 'Feelings Capture', 'status', 'planned', 'launchMode', 'embedded', 'platforms', JSON_ARRAY('mobile'), 'oneLineDescription', 'Identify multiple emotions connected to a situation.'),
  80
),
(
  'calm-down-builder',
  'Calm Down Builder',
  '1.0.0',
  'sequence_builder',
  'planned',
  '["mobile","web"]',
  'embedded',
  NULL,
  8,
  20,
  '["calming","coping_skills"]',
  NULL,
  JSON_OBJECT('id', 'calm-down-builder', 'displayName', 'Calm Down Builder', 'status', 'planned', 'launchMode', 'embedded', 'oneLineDescription', 'Build and practice a personalized sequence of calming tools.'),
  90
),
(
  'space-cabin-conversation',
  'Space Cabin Conversation',
  '1.0.0',
  'immersive_narrative',
  'planned',
  '["mobile","web"]',
  'embedded',
  NULL,
  10,
  30,
  '["communication","emotional_regulation"]',
  NULL,
  JSON_OBJECT('id', 'space-cabin-conversation', 'displayName', 'Space Cabin Conversation', 'status', 'planned', 'launchMode', 'embedded', 'webFullFidelity', true, 'oneLineDescription', 'Practice communication and perspective taking with an immersive scene.'),
  100
),
(
  'story-shelf',
  'StoryShelf',
  '1.0.0',
  'shared_reading',
  'planned',
  '["mobile","web"]',
  'embedded',
  NULL,
  10,
  30,
  '["reading","reflection"]',
  NULL,
  JSON_OBJECT('id', 'story-shelf', 'displayName', 'StoryShelf', 'status', 'planned', 'launchMode', 'embedded', 'oneLineDescription', 'Select topic-based short stories and read them aloud or together.'),
  110
),
(
  'test-game',
  'Test Game',
  '1.0.0',
  'integration_harness',
  'disabled',
  '["web"]',
  'standalone',
  NULL,
  1,
  5,
  '[]',
  '/games-content/test-game/index.html',
  JSON_OBJECT(
    'id', 'test-game',
    'displayName', 'Test Game',
    'status', 'disabled',
    'launchMode', 'standalone',
    'entryUrl', '/games-content/test-game/index.html',
    'oneLineDescription', 'Integration harness for games platform wiring.',
    'adminOnly', true
  ),
  999
)
ON DUPLICATE KEY UPDATE
  display_name = VALUES(display_name),
  status = VALUES(status),
  manifest_json = VALUES(manifest_json),
  entry_url = VALUES(entry_url),
  updated_at = CURRENT_TIMESTAMP;
