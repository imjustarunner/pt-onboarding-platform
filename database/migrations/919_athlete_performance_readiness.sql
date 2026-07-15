-- Migration 919: Athlete Performance Readiness Assessment
-- Distinct from Life Balance / Values Alignment — Readiness Stack visualization.

CREATE TABLE IF NOT EXISTS athlete_readiness_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = platform default',
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  settings_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ar_templates_agency (agency_id),
  KEY idx_ar_templates_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS athlete_readiness_template_domains (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  short_label VARCHAR(64) NOT NULL,
  definition TEXT NULL,
  readiness_layer ENUM('recovery','physical','mental','emotional','competitive') NOT NULL,
  weight DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  color VARCHAR(16) NOT NULL,
  icon VARCHAR(64) NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_optional TINYINT(1) NOT NULL DEFAULT 0,
  available_modes_json JSON NULL,
  score_labels_json JSON NULL,
  reflection_options_json JSON NULL,
  body_areas_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ar_tpl_domain (template_id, domain_key),
  KEY idx_ar_tpl_domain_order (template_id, display_order),
  CONSTRAINT fk_ar_tpl_domain_template
    FOREIGN KEY (template_id) REFERENCES athlete_readiness_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS athlete_readiness_assessments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL,
  template_id BIGINT UNSIGNED NOT NULL,
  template_version INT NOT NULL DEFAULT 1,
  athlete_user_id INT NULL,
  client_id INT NULL,
  coach_user_id INT NULL,
  mode ENUM('daily','competition','weekly','return-to-performance') NOT NULL DEFAULT 'daily',
  status ENUM('not_started','in_progress','completed','reviewed','archived') NOT NULL DEFAULT 'not_started',
  access_token VARCHAR(64) NOT NULL,
  context_json JSON NULL,
  summary_json JSON NULL,
  readiness_score INT NULL,
  coach_review_status VARCHAR(64) NULL,
  coach_review_note TEXT NULL,
  reviewed_at DATETIME NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ar_access_token (access_token),
  KEY idx_ar_assess_agency (agency_id),
  KEY idx_ar_assess_athlete (athlete_user_id),
  KEY idx_ar_assess_status (status),
  KEY idx_ar_assess_mode (mode),
  CONSTRAINT fk_ar_assess_template
    FOREIGN KEY (template_id) REFERENCES athlete_readiness_templates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS athlete_readiness_responses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  score TINYINT UNSIGNED NULL,
  reflection_chips_json JSON NULL,
  body_areas_json JSON NULL,
  support_preference VARCHAR(64) NULL,
  note TEXT NULL,
  note_visibility ENUM('athlete','coaching_staff','medical_staff','private','selected') NOT NULL DEFAULT 'coaching_staff',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ar_resp (assessment_id, domain_key),
  CONSTRAINT fk_ar_resp_assessment
    FOREIGN KEY (assessment_id) REFERENCES athlete_readiness_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS athlete_readiness_support_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NULL,
  requested_contact ENUM('coach','athletic-trainer','performance-staff','private-support') NOT NULL,
  urgency ENUM('routine','same-day','urgent') NOT NULL DEFAULT 'routine',
  message TEXT NULL,
  status ENUM('submitted','acknowledged','in_progress','resolved','closed') NOT NULL DEFAULT 'submitted',
  assigned_to_user_id INT NULL,
  resolved_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ar_support_assessment (assessment_id),
  CONSTRAINT fk_ar_support_assessment
    FOREIGN KEY (assessment_id) REFERENCES athlete_readiness_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO athlete_readiness_templates (agency_id, name, description, version, settings_json, is_active)
SELECT NULL,
  'Athlete Performance Readiness Assessment',
  'Understand how prepared your body and mind are to train, compete, and recover today.',
  1,
  JSON_OBJECT(
    'boardName', 'Performance Readiness Board',
    'subtitle', 'Understand how prepared your body and mind are to train, compete, and recover today.',
    'defaultMode', 'daily',
    'thresholds', JSON_OBJECT(
      'significantSupport', 39,
      'low', 54,
      'limited', 69,
      'ready', 84
    ),
    'urgentTriggers', JSON_ARRAY(
      'sudden or severe pain',
      'inability to move normally',
      'possible head injury symptoms',
      'chest pain',
      'difficulty breathing',
      'fainting',
      'severe illness symptoms'
    ),
    'urgentMessage', 'Your response may require prompt follow-up before training. Please contact the athletic trainer or designated medical professional. This assessment is not a medical diagnosis.'
  ),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM athlete_readiness_templates WHERE agency_id IS NULL AND is_active = 1 LIMIT 1
);

SET @ar_tpl_id := (
  SELECT id FROM athlete_readiness_templates WHERE agency_id IS NULL AND is_active = 1 ORDER BY id ASC LIMIT 1
);

INSERT INTO athlete_readiness_template_domains
  (template_id, domain_key, label, short_label, definition, readiness_layer, weight, color, icon, display_order, is_active, is_optional, available_modes_json, score_labels_json, reflection_options_json, body_areas_json)
SELECT @ar_tpl_id, d.domain_key, d.label, d.short_label, d.definition, d.readiness_layer, d.weight, d.color, d.icon, d.display_order, 1, d.is_optional,
  d.available_modes_json, d.score_labels_json, d.reflection_options_json, d.body_areas_json
FROM (
  SELECT
    'sleep' AS domain_key,
    'Sleep Quality' AS label,
    'Sleep' AS short_label,
    'Your perception of sleep duration, depth, and how restored you feel upon waking.' AS definition,
    'recovery' AS readiness_layer,
    12.00 AS weight,
    '#0EA5E9' AS color,
    'moon' AS icon,
    1 AS display_order,
    0 AS is_optional,
    JSON_ARRAY('daily','competition','weekly','return-to-performance') AS available_modes_json,
    JSON_OBJECT('low','Very poor','mid','Average','high','Fully restored') AS score_labels_json,
    JSON_ARRAY('Late bedtime','Early wake time','Trouble falling asleep','Waking during the night','Travel','Stress','Screen use','Pain or discomfort','Schedule demands','Other') AS reflection_options_json,
    NULL AS body_areas_json
  UNION ALL SELECT
    'recovery','Physical Recovery','Recovery',
    'How recovered you feel from recent training, competition, travel, or physical demands.',
    'recovery', 15.00, '#0284C7', 'refresh', 2, 0,
    JSON_ARRAY('daily','competition','weekly','return-to-performance'),
    JSON_OBJECT('low','Not recovered','mid','Partially recovered','high','Fully recovered'),
    JSON_ARRAY('Recent competition','High training load','Travel','Limited rest','Poor sleep','Muscle soreness','Illness','Schedule demands','Stress','Other'),
    NULL
  UNION ALL SELECT
    'energy','Energy Level','Energy',
    'Your available physical energy for training, competition, and normal daily demands.',
    'physical', 12.00, '#22C55E', 'bolt', 3, 0,
    JSON_ARRAY('daily','competition','weekly','return-to-performance'),
    JSON_OBJECT('low','Almost none','mid','Moderate','high','High and reliable'),
    JSON_ARRAY('Morning','Before training','During training','After training','Afternoon','Evening','Energy is stable','Unsure'),
    NULL
  UNION ALL SELECT
    'soreness','Soreness and Physical Comfort','Soreness',
    'Your perception of muscle soreness, stiffness, discomfort, or movement limitation.',
    'physical', 12.00, '#84CC16', 'activity', 4, 0,
    JSON_ARRAY('daily','competition','weekly','return-to-performance'),
    JSON_OBJECT('low','Significant discomfort or restriction','mid','Noticeable soreness','high','Comfortable and unrestricted'),
    JSON_ARRAY('Head or neck','Shoulders','Arms','Upper back','Lower back','Hips','Quadriceps','Hamstrings','Knees','Calves','Ankles','Feet','General soreness','No significant soreness','Other'),
    JSON_ARRAY('Head or neck','Shoulders','Arms','Upper back','Lower back','Hips','Quadriceps','Hamstrings','Knees','Calves','Ankles','Feet','General soreness')
  UNION ALL SELECT
    'focus','Mental Focus','Focus',
    'Your ability to concentrate, process instructions, stay present, and maintain attention.',
    'mental', 10.00, '#8B5CF6', 'target', 5, 0,
    JSON_ARRAY('daily','competition','weekly','return-to-performance'),
    JSON_OBJECT('low','Very distracted','mid','Inconsistent focus','high','Highly focused'),
    JSON_ARRAY('Fatigue','Stress','School or work','Personal concerns','Travel','Team issues','Upcoming competition','Lack of motivation','Physical discomfort','Other'),
    NULL
  UNION ALL SELECT
    'confidence','Confidence','Confidence',
    'Your belief in your ability to execute skills, respond to challenges, and perform effectively.',
    'emotional', 10.00, '#A855F7', 'shield', 6, 0,
    JSON_ARRAY('daily','competition','weekly','return-to-performance'),
    JSON_OBJECT('low','Very low confidence','mid','Uncertain','high','Highly confident'),
    JSON_ARRAY('Recent performance','Training quality','Physical readiness','Coach feedback','Team support','Competition level','Fear of mistakes','Preparation','Past success','Other'),
    NULL
  UNION ALL SELECT
    'motivation','Motivation','Motivation',
    'Your willingness and desire to engage fully in training or competition.',
    'mental', 8.00, '#EC4899', 'flame', 7, 0,
    JSON_ARRAY('daily','competition','weekly','return-to-performance'),
    JSON_OBJECT('low','Very unmotivated','mid','Neutral','high','Highly motivated'),
    JSON_ARRAY('Fatigue','Training repetition','Lack of progress','Strong goals','Competition excitement','Team energy','Coach relationship','Personal stress','Injury concern','Other'),
    NULL
  UNION ALL SELECT
    'stress','Stress Load','Stress',
    'Your current level of pressure from athletics, school, work, relationships, travel, or personal responsibilities.',
    'emotional', 8.00, '#F59E0B', 'alert', 8, 0,
    JSON_ARRAY('daily','competition','weekly','return-to-performance'),
    JSON_OBJECT('low','Overwhelming','mid','Noticeable but manageable','high','Calm and manageable'),
    JSON_ARRAY('Competition','Training','Coach expectations','Team expectations','School','Work','Family','Relationships','Travel','Finances','Injury concerns','Other'),
    NULL
  UNION ALL SELECT
    'nutrition','Nutrition and Hydration Readiness','Nutrition',
    'Whether recent food and fluid intake adequately support performance.',
    'physical', 7.00, '#14B8A6', 'droplet', 9, 0,
    JSON_ARRAY('daily','competition','weekly','return-to-performance'),
    JSON_OBJECT('low','Poorly fueled or dehydrated','mid','Adequate','high','Fully prepared'),
    JSON_ARRAY('Missed meal','Limited appetite','Travel','Schedule','Limited access to food','Forgot fluids','Stomach discomfort','Weight-management concerns','No significant issue','Other'),
    NULL
  UNION ALL SELECT
    'connection','Team and Coach Connection','Connection',
    'Your sense of support, trust, communication, and connection with teammates and coaches.',
    'competitive', 6.00, '#6366F1', 'users', 10, 0,
    JSON_ARRAY('daily','competition','weekly','return-to-performance'),
    JSON_OBJECT('low','Disconnected','mid','Mixed connection','high','Strongly connected'),
    JSON_ARRAY('More coach communication','More teammate support','Clearer expectations','Better feedback','More trust','Better conflict resolution','More team time','More individual attention','No significant need','Other'),
    NULL
  UNION ALL SELECT
    'competition','Competition Readiness','Compete',
    'Your overall belief that you are prepared to perform under the expected conditions.',
    'competitive', 0.00, '#EF4444', 'flag', 11, 1,
    JSON_ARRAY('competition'),
    JSON_OBJECT('low','Not ready','mid','Partially ready','high','Fully ready'),
    JSON_ARRAY('More rest','Clearer strategy','Additional warm-up','Coach conversation','Better focus','More confidence','Nutrition or hydration','Equipment preparation','Team communication','Other'),
    NULL
) AS d
WHERE @ar_tpl_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM athlete_readiness_template_domains x
    WHERE x.template_id = @ar_tpl_id AND x.domain_key = d.domain_key
  );
