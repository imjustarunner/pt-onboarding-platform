-- Migration 914: Life Balance Wheel assessment domain (V1)
-- Spec: docs/LIFE_BALANCE_WHEEL_SPEC.md §§3, 52, 55

ALTER TABLE intake_links
  MODIFY COLUMN form_type
    ENUM(
      'intake',
      'public_form',
      'job_application',
      'medical_records_request',
      'smart_school_roi',
      'smart_registration',
      'internal_preferences',
      'life_balance_wheel'
    )
    NOT NULL DEFAULT 'intake';

CREATE TABLE IF NOT EXISTS life_balance_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = platform default template',
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  timeframe VARCHAR(64) NOT NULL DEFAULT 'past-two-weeks',
  settings_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_lbw_templates_agency (agency_id),
  KEY idx_lbw_templates_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS life_balance_template_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT UNSIGNED NOT NULL,
  category_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  short_label VARCHAR(64) NOT NULL,
  description TEXT NULL,
  color VARCHAR(16) NOT NULL,
  icon VARCHAR(64) NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  questions_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lbw_tpl_cat (template_id, category_key),
  KEY idx_lbw_tpl_cat_order (template_id, display_order),
  CONSTRAINT fk_lbw_tpl_cat_template
    FOREIGN KEY (template_id) REFERENCES life_balance_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS life_balance_assessments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  template_id BIGINT UNSIGNED NOT NULL,
  template_version INT NOT NULL DEFAULT 1,
  client_id INT NULL,
  subject_user_id INT NULL COMMENT 'Staff/supervisor self-assessment subject',
  assigned_by_user_id INT NULL,
  coach_user_id INT NULL,
  intake_link_id INT NULL,
  packet_token VARCHAR(128) NULL,
  status ENUM('not_started', 'in_progress', 'completed', 'archived') NOT NULL DEFAULT 'not_started',
  access_token VARCHAR(64) NOT NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  summary_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lbw_access_token (access_token),
  KEY idx_lbw_assess_agency (agency_id),
  KEY idx_lbw_assess_client (client_id),
  KEY idx_lbw_assess_subject (subject_user_id),
  KEY idx_lbw_assess_status (status),
  CONSTRAINT fk_lbw_assess_template
    FOREIGN KEY (template_id) REFERENCES life_balance_templates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS life_balance_category_responses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  category_key VARCHAR(64) NOT NULL,
  score TINYINT NULL,
  note TEXT NULL,
  selected_option_ids_json JSON NULL,
  desired_score TINYINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lbw_resp_cat (assessment_id, category_key),
  CONSTRAINT fk_lbw_resp_assess
    FOREIGN KEY (assessment_id) REFERENCES life_balance_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS life_balance_priorities (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  category_key VARCHAR(64) NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lbw_prio (assessment_id, category_key),
  CONSTRAINT fk_lbw_prio_assess
    FOREIGN KEY (assessment_id) REFERENCES life_balance_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS life_balance_goals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  category_key VARCHAR(64) NOT NULL,
  goal_statement TEXT NOT NULL,
  obstacles TEXT NULL,
  support TEXT NULL,
  target_date DATE NULL,
  confidence TINYINT NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_lbw_goals_assess (assessment_id),
  CONSTRAINT fk_lbw_goals_assess
    FOREIGN KEY (assessment_id) REFERENCES life_balance_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS life_balance_action_steps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  goal_id BIGINT UNSIGNED NOT NULL,
  step_text TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_done TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_lbw_steps_goal (goal_id),
  CONSTRAINT fk_lbw_steps_goal
    FOREIGN KEY (goal_id) REFERENCES life_balance_goals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Platform default template
INSERT INTO life_balance_templates (agency_id, name, description, version, timeframe, settings_json, is_active)
SELECT NULL, 'Life Balance Wheel (Default)', 'Ten-category life satisfaction assessment', 1, 'past-two-weeks',
  JSON_OBJECT(
    'allowSkip', false,
    'requireAllCategoryScores', true,
    'showImportanceScore', false,
    'showConfidenceScore', false,
    'showNotes', true,
    'showLiveWheel', true,
    'showAverageScore', true,
    'showAutomatedInsights', false,
    'allowClientPrioritySelection', true,
    'maxPrioritySelections', 3,
    'allowGoalCreation', true,
    'enableHistoricalComparison', true
  ),
  1
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM life_balance_templates WHERE agency_id IS NULL AND name = 'Life Balance Wheel (Default)'
);

SET @lbw_tpl_id := (
  SELECT id FROM life_balance_templates
  WHERE agency_id IS NULL AND name = 'Life Balance Wheel (Default)'
  ORDER BY id ASC LIMIT 1
);

INSERT INTO life_balance_template_categories
  (template_id, category_key, label, short_label, description, color, icon, display_order, questions_json)
SELECT @lbw_tpl_id, v.category_key, v.label, v.short_label, v.description, v.color, v.icon, v.display_order, v.questions_json
FROM (
  SELECT 'physicalHealth' AS category_key, 'Physical Health & Energy' AS label, 'Health' AS short_label,
    'Your physical well-being, sleep, movement, nutrition, daily energy, and ability to care for your body.' AS description,
    '#BFD99B' AS color, 'heart-pulse' AS icon, 1 AS display_order,
    JSON_OBJECT(
      'scorePrompt', 'How satisfied are you with your physical health and energy right now?',
      'followUp', 'What is having the greatest effect on your physical health or energy?',
      'options', JSON_ARRAY('Sleep', 'Physical activity', 'Nutrition', 'Pain or illness', 'Stress', 'Routines', 'Other')
    ) AS questions_json
  UNION ALL SELECT 'mentalEmotional', 'Mental & Emotional Well-being', 'Well-being',
    'Your emotional steadiness, stress levels, mindset, self-talk, and ability to cope with challenges.',
    '#9FD5D4', 'brain', 2,
    JSON_OBJECT('scorePrompt', 'How satisfied are you with your mental and emotional well-being right now?',
      'followUp', 'What most affects your mental or emotional well-being right now?',
      'options', JSON_ARRAY('Stress', 'Anxiety', 'Mood', 'Self-talk', 'Overwhelm', 'Support', 'Other'))
  UNION ALL SELECT 'relationshipsFamily', 'Relationships & Family', 'Relationships',
    'The quality of connection, communication, support, and closeness with family and close loved ones.',
    '#F2CF79', 'heart-handshake', 3,
    JSON_OBJECT('scorePrompt', 'How satisfied are you with your relationships and family life right now?',
      'followUp', 'What would most improve your relationships or family life?',
      'options', JSON_ARRAY('Communication', 'Quality time', 'Boundaries', 'Conflict', 'Support', 'Closeness', 'Other'))
  UNION ALL SELECT 'friendsSocial', 'Friends & Social Life', 'Social Life',
    'Your friendships, community, belonging, and opportunities for meaningful social connection.',
    '#F2C28D', 'users', 4,
    JSON_OBJECT('scorePrompt', 'How satisfied are you with your friendships and social life right now?',
      'followUp', 'What would help your social life feel more fulfilling?',
      'options', JSON_ARRAY('More connection', 'Deeper friendships', 'Community', 'Loneliness', 'Time', 'Other'))
  UNION ALL SELECT 'careerPurpose', 'Career & Purpose', 'Career',
    'Your work, contribution, sense of purpose, growth opportunities, and alignment with what matters to you.',
    '#EFA58F', 'briefcase-business', 5,
    JSON_OBJECT('scorePrompt', 'How satisfied are you with your career and sense of purpose right now?',
      'followUp', 'What would make your work or purpose feel more aligned?',
      'options', JSON_ARRAY('Meaning', 'Growth', 'Workload', 'Recognition', 'Direction', 'Balance', 'Other'))
  UNION ALL SELECT 'finances', 'Finances', 'Finances',
    'Your financial stability, money habits, stress around finances, and confidence in managing resources.',
    '#B9A7D0', 'wallet-cards', 6,
    JSON_OBJECT('scorePrompt', 'How satisfied are you with your financial life right now?',
      'followUp', 'What is creating the most financial pressure or opportunity right now?',
      'options', JSON_ARRAY('Income', 'Expenses', 'Debt', 'Savings', 'Planning', 'Security', 'Other'))
  UNION ALL SELECT 'personalGrowth', 'Personal Growth & Learning', 'Growth',
    'Your learning, skill-building, personal development, curiosity, and sense of becoming who you want to be.',
    '#9EB6D6', 'sprout', 7,
    JSON_OBJECT('scorePrompt', 'How satisfied are you with your personal growth and learning right now?',
      'followUp', 'Where do you most want to grow next?',
      'options', JSON_ARRAY('Skills', 'Habits', 'Mindset', 'Education', 'Coaching', 'Creativity', 'Other'))
  UNION ALL SELECT 'recreationFun', 'Recreation & Fun', 'Fun',
    'Play, hobbies, rest, enjoyment, laughter, and space for activities that recharge you.',
    '#9ED0D2', 'sparkles', 8,
    JSON_OBJECT('scorePrompt', 'How satisfied are you with recreation, fun, and enjoyment in your life right now?',
      'followUp', 'What kind of fun or rest feels missing?',
      'options', JSON_ARRAY('Hobbies', 'Rest', 'Play', 'Time off', 'Creativity', 'Adventure', 'Other'))
  UNION ALL SELECT 'environmentHome', 'Environment & Home', 'Home',
    'Your living space, surroundings, organization, safety, and how well your environment supports you.',
    '#D9C6A4', 'home', 9,
    JSON_OBJECT('scorePrompt', 'How satisfied are you with your environment and home life right now?',
      'followUp', 'What would make your environment feel more supportive?',
      'options', JSON_ARRAY('Organization', 'Comfort', 'Safety', 'Clutter', 'Privacy', 'Location', 'Other'))
  UNION ALL SELECT 'spiritualityMeaning', 'Spirituality & Meaning', 'Meaning',
    'Your sense of meaning, values, faith or spirituality, inner alignment, and connection to something larger.',
    '#C7B5D8', 'sparkle', 10,
    JSON_OBJECT('scorePrompt', 'How satisfied are you with your sense of spirituality or meaning right now?',
      'followUp', 'What would deepen your sense of meaning or alignment?',
      'options', JSON_ARRAY('Values', 'Faith', 'Reflection', 'Community', 'Purpose', 'Peace', 'Other'))
) AS v
WHERE @lbw_tpl_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM life_balance_template_categories c
    WHERE c.template_id = @lbw_tpl_id AND c.category_key = v.category_key
  );
