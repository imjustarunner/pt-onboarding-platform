-- Migration 918: Values Alignment Assessment (Values Compass)
-- Parallel to Life Balance Wheel — distinct tables, scoring, and visualization.

CREATE TABLE IF NOT EXISTS values_alignment_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = platform default template',
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  settings_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_va_templates_agency (agency_id),
  KEY idx_va_templates_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS values_alignment_template_values (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT UNSIGNED NOT NULL,
  value_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  definition TEXT NULL,
  category ENUM('connection','character','growth','purpose','lifestyle') NOT NULL,
  color VARCHAR(16) NOT NULL,
  icon VARCHAR(64) NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_va_tpl_value (template_id, value_key),
  KEY idx_va_tpl_value_order (template_id, display_order),
  CONSTRAINT fk_va_tpl_value_template
    FOREIGN KEY (template_id) REFERENCES values_alignment_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS values_alignment_assessments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL for anonymous/guest-linked platform assessments',
  template_id BIGINT UNSIGNED NOT NULL,
  template_version INT NOT NULL DEFAULT 1,
  client_id INT NULL,
  subject_user_id INT NULL,
  assigned_by_user_id INT NULL,
  coach_user_id INT NULL,
  status ENUM('not_started','selecting','ranking','scoring','completed','archived') NOT NULL DEFAULT 'not_started',
  access_token VARCHAR(64) NOT NULL,
  selected_keys_json JSON NULL,
  ranked_keys_json JSON NULL,
  priority_keys_json JSON NULL,
  summary_json JSON NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_va_access_token (access_token),
  KEY idx_va_assess_agency (agency_id),
  KEY idx_va_assess_client (client_id),
  KEY idx_va_assess_subject (subject_user_id),
  KEY idx_va_assess_status (status),
  CONSTRAINT fk_va_assess_template
    FOREIGN KEY (template_id) REFERENCES values_alignment_templates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS values_alignment_responses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  value_key VARCHAR(64) NOT NULL,
  importance_score TINYINT UNSIGNED NULL,
  alignment_score TINYINT UNSIGNED NULL,
  reflection_chips_json JSON NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_va_resp (assessment_id, value_key),
  CONSTRAINT fk_va_resp_assessment
    FOREIGN KEY (assessment_id) REFERENCES values_alignment_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS values_alignment_commitments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  value_key VARCHAR(64) NOT NULL,
  title VARCHAR(512) NULL,
  behavior TEXT NULL,
  starting_alignment_score TINYINT UNSIGNED NULL,
  desired_alignment_score TINYINT UNSIGNED NULL,
  obstacles TEXT NULL,
  support_needed TEXT NULL,
  first_step TEXT NULL,
  target_date DATE NULL,
  confidence_score TINYINT UNSIGNED NULL,
  status ENUM('draft','active','completed','paused','cancelled') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_va_commit_assessment (assessment_id),
  CONSTRAINT fk_va_commit_assessment
    FOREIGN KEY (assessment_id) REFERENCES values_alignment_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Platform default template
INSERT INTO values_alignment_templates (agency_id, name, description, version, settings_json, is_active)
SELECT NULL,
  'Values Alignment Assessment',
  'Discover what matters most—and how closely your current life reflects it.',
  1,
  JSON_OBJECT(
    'minSelect', 5,
    'maxSelect', 12,
    'minRank', 6,
    'maxRank', 8,
    'maxPriorities', 3,
    'highImportanceThreshold', 7,
    'highAlignmentThreshold', 7,
    'subtitle', 'Discover what matters most—and how closely your current life reflects it.',
    'compassName', 'Values Compass'
  ),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM values_alignment_templates WHERE agency_id IS NULL AND is_active = 1 LIMIT 1
);

SET @va_tpl_id := (
  SELECT id FROM values_alignment_templates WHERE agency_id IS NULL AND is_active = 1 ORDER BY id ASC LIMIT 1
);

INSERT INTO values_alignment_template_values
  (template_id, value_key, label, definition, category, color, icon, display_order, is_active)
SELECT @va_tpl_id, v.value_key, v.label, v.definition, v.category, v.color, v.icon, v.display_order, 1
FROM (
  SELECT 'family' AS value_key, 'Family' AS label, 'Nurturing close bonds with the people you call family.' AS definition, 'connection' AS category, '#B45309' AS color, 'home' AS icon, 1 AS display_order
  UNION ALL SELECT 'friendship', 'Friendship', 'Building mutual, lasting friendships rooted in trust and care.', 'connection', '#C2410C', 'users', 2
  UNION ALL SELECT 'love', 'Love', 'Giving and receiving deep affection and intimacy.', 'connection', '#9A3412', 'heart', 3
  UNION ALL SELECT 'belonging', 'Belonging', 'Feeling accepted and at home within a group or community.', 'connection', '#A16207', 'circle', 4
  UNION ALL SELECT 'community', 'Community', 'Contributing to and drawing strength from a shared community.', 'connection', '#854D0E', 'globe', 5
  UNION ALL SELECT 'partnership', 'Partnership', 'Investing in a committed, collaborative life partnership.', 'connection', '#92400E', 'link', 6
  UNION ALL SELECT 'integrity', 'Integrity', 'Acting consistently with your principles, even when doing so is difficult.', 'character', '#1D4ED8', 'shield', 7
  UNION ALL SELECT 'honesty', 'Honesty', 'Speaking and living truthfully with yourself and others.', 'character', '#1E40AF', 'message', 8
  UNION ALL SELECT 'courage', 'Courage', 'Facing fear, risk, or discomfort in service of what matters.', 'character', '#1E3A8A', 'flame', 9
  UNION ALL SELECT 'loyalty', 'Loyalty', 'Standing by the people and causes you have committed to.', 'character', '#312E81', 'hand', 10
  UNION ALL SELECT 'responsibility', 'Responsibility', 'Owning your choices and their impact on others.', 'character', '#3730A3', 'check', 11
  UNION ALL SELECT 'humility', 'Humility', 'Holding your strengths lightly and remaining open to growth.', 'character', '#4338CA', 'leaf', 12
  UNION ALL SELECT 'learning', 'Learning', 'Seeking knowledge and skill throughout your life.', 'growth', '#047857', 'book', 13
  UNION ALL SELECT 'discipline', 'Discipline', 'Practicing consistent effort toward meaningful goals.', 'growth', '#065F46', 'target', 14
  UNION ALL SELECT 'creativity', 'Creativity', 'Expressing original ideas and making something new.', 'growth', '#0F766E', 'spark', 15
  UNION ALL SELECT 'curiosity', 'Curiosity', 'Approaching life with open questions and wonder.', 'growth', '#0D9488', 'search', 16
  UNION ALL SELECT 'excellence', 'Excellence', 'Striving for quality and high standards in your craft.', 'growth', '#115E59', 'star', 17
  UNION ALL SELECT 'resilience', 'Resilience', 'Recovering and adapting when life becomes hard.', 'growth', '#134E4A', 'mountain', 18
  UNION ALL SELECT 'meaning', 'Meaning', 'Living with a sense of purpose that feels personally significant.', 'purpose', '#7C3AED', 'compass', 19
  UNION ALL SELECT 'service', 'Service', 'Using your time and gifts to help others.', 'purpose', '#6D28D9', 'gift', 20
  UNION ALL SELECT 'leadership', 'Leadership', 'Guiding others with clarity, care, and accountability.', 'purpose', '#5B21B6', 'flag', 21
  UNION ALL SELECT 'contribution', 'Contribution', 'Leaving work, ideas, or care that improves something beyond yourself.', 'purpose', '#4C1D95', 'layers', 22
  UNION ALL SELECT 'legacy', 'Legacy', 'Shaping what you leave behind for people and communities you care about.', 'purpose', '#581C87', 'tree', 23
  UNION ALL SELECT 'faith', 'Faith', 'Living in relationship with spiritual belief or sacred practice.', 'purpose', '#6B21A8', 'sun', 24
  UNION ALL SELECT 'health', 'Health', 'Caring for your body, mind, and energy with intention.', 'lifestyle', '#BE123C', 'heart-pulse', 25
  UNION ALL SELECT 'freedom', 'Freedom', 'Having space to choose how you live, work, and spend your time.', 'lifestyle', '#E11D48', 'wind', 26
  UNION ALL SELECT 'adventure', 'Adventure', 'Seeking new experiences, places, and challenges.', 'lifestyle', '#F43F5E', 'map', 27
  UNION ALL SELECT 'stability', 'Stability', 'Creating reliable foundations in home, work, and routine.', 'lifestyle', '#9F1239', 'anchor', 28
  UNION ALL SELECT 'balance', 'Balance', 'Distributing energy across work, rest, and relationships wisely.', 'lifestyle', '#881337', 'scale', 29
  UNION ALL SELECT 'financial_security', 'Financial Security', 'Building enough financial stability to support the life you want.', 'lifestyle', '#4C0519', 'wallet', 30
) AS v
WHERE @va_tpl_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM values_alignment_template_values x
    WHERE x.template_id = @va_tpl_id AND x.value_key = v.value_key
  );
