-- Migration 923: Values Alignment → Life Alignment Wheel (Current Life vs Ideal Life)
-- Extends 918 without dropping discovery library values.

ALTER TABLE values_alignment_responses
  ADD COLUMN current_life_score TINYINT UNSIGNED NULL
    COMMENT 'How strongly the value is reflected in current daily life (1–10)'
    AFTER alignment_score,
  ADD COLUMN ideal_life_score TINYINT UNSIGNED NULL
    COMMENT 'How strongly the participant would ideally like the value reflected (1–10)'
    AFTER current_life_score,
  ADD COLUMN confidence_to_change_score TINYINT UNSIGNED NULL
    COMMENT 'Optional confidence to change (1–10); not used in alignment index'
    AFTER ideal_life_score,
  ADD COLUMN personal_definition TEXT NULL
    COMMENT 'Participant rewrite of what this value means'
    AFTER confidence_to_change_score,
  ADD COLUMN season_status ENUM('active','not_relevant','paused','exploring') NOT NULL DEFAULT 'active'
    COMMENT 'Not Relevant in This Season and related flags'
    AFTER personal_definition;

ALTER TABLE values_alignment_assessments
  ADD COLUMN context_json JSON NULL
    COMMENT 'Mode, life season, concerns, goals, timeframe'
    AFTER summary_json;

-- Backfill Current/Ideal from legacy Importance/Alignment when present
UPDATE values_alignment_responses
SET
  current_life_score = COALESCE(current_life_score, alignment_score),
  ideal_life_score = COALESCE(ideal_life_score, importance_score)
WHERE (current_life_score IS NULL OR ideal_life_score IS NULL)
  AND (alignment_score IS NOT NULL OR importance_score IS NOT NULL);

SET @va_tpl_id := (
  SELECT id FROM values_alignment_templates
  WHERE agency_id IS NULL AND is_active = 1
  ORDER BY id ASC LIMIT 1
);

-- Ensure the ten Life Alignment Wheel core values exist
INSERT INTO values_alignment_template_values
  (template_id, value_key, label, definition, category, color, icon, display_order, is_active)
SELECT @va_tpl_id, v.value_key, v.label, v.definition, v.category, v.color, v.icon, v.display_order, 1
FROM (
  SELECT 'family' AS value_key,
    'Family' AS label,
    'The degree to which family relationships, responsibilities, connection, presence, and support are reflected in daily life. Family may include immediate, chosen, extended, caregiving, or household relationships.' AS definition,
    'connection' AS category, '#B45309' AS color, 'home' AS icon, 1 AS display_order
  UNION ALL SELECT 'integrity', 'Integrity',
    'The degree to which choices, words, commitments, and behavior align with personal principles.',
    'character', '#1D4ED8', 'shield', 2
  UNION ALL SELECT 'health', 'Health',
    'The degree to which physical, emotional, mental, and restorative needs receive appropriate attention.',
    'lifestyle', '#BE123C', 'heart-pulse', 3
  UNION ALL SELECT 'growth', 'Growth',
    'The degree to which learning, development, reflection, skill building, and personal improvement are present in life.',
    'growth', '#047857', 'sprout', 4
  UNION ALL SELECT 'faith', 'Faith',
    'The degree to which faith, spirituality, worship, meaning, prayer, reflection, or spiritual community are represented according to your own beliefs. This category is optional and renameable.',
    'purpose', '#6B21A8', 'sun', 5
  UNION ALL SELECT 'service', 'Service',
    'The degree to which helping, contributing, mentoring, volunteering, generosity, and care for others are reflected in life.',
    'purpose', '#6D28D9', 'gift', 6
  UNION ALL SELECT 'adventure', 'Adventure',
    'The degree to which exploration, novelty, play, creativity, challenge, spontaneity, and memorable experiences are present in life.',
    'lifestyle', '#F43F5E', 'map', 7
  UNION ALL SELECT 'financial_freedom', 'Financial Freedom',
    'The degree to which financial decisions support security, choice, reduced stress, future goals, and freedom from unwanted financial pressure. This supports reflection and does not replace qualified financial advice.',
    'lifestyle', '#0F766E', 'wallet', 8
  UNION ALL SELECT 'leadership', 'Leadership',
    'The degree to which you use influence, responsibility, initiative, courage, and guidance in ways that reflect personal values—not only formal authority.',
    'purpose', '#5B21B6', 'flag', 9
  UNION ALL SELECT 'relationships', 'Relationships',
    'The degree to which friendships, intimate relationships, community, social connection, and mutual support are present in life.',
    'connection', '#C2410C', 'users', 10
) AS v
WHERE @va_tpl_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM values_alignment_template_values x
    WHERE x.template_id = @va_tpl_id AND x.value_key = v.value_key
  );

-- Align labels/definitions/order for the core ten when they already exist
UPDATE values_alignment_template_values v
JOIN (
  SELECT 'family' AS value_key, 'Family' AS label,
    'The degree to which family relationships, responsibilities, connection, presence, and support are reflected in daily life. Family may include immediate, chosen, extended, caregiving, or household relationships.' AS definition,
    'connection' AS category, '#B45309' AS color, 'home' AS icon, 1 AS display_order
  UNION ALL SELECT 'integrity', 'Integrity',
    'The degree to which choices, words, commitments, and behavior align with personal principles.',
    'character', '#1D4ED8', 'shield', 2
  UNION ALL SELECT 'health', 'Health',
    'The degree to which physical, emotional, mental, and restorative needs receive appropriate attention.',
    'lifestyle', '#BE123C', 'heart-pulse', 3
  UNION ALL SELECT 'growth', 'Growth',
    'The degree to which learning, development, reflection, skill building, and personal improvement are present in life.',
    'growth', '#047857', 'sprout', 4
  UNION ALL SELECT 'faith', 'Faith',
    'The degree to which faith, spirituality, worship, meaning, prayer, reflection, or spiritual community are represented according to your own beliefs. This category is optional and renameable.',
    'purpose', '#6B21A8', 'sun', 5
  UNION ALL SELECT 'service', 'Service',
    'The degree to which helping, contributing, mentoring, volunteering, generosity, and care for others are reflected in life.',
    'purpose', '#6D28D9', 'gift', 6
  UNION ALL SELECT 'adventure', 'Adventure',
    'The degree to which exploration, novelty, play, creativity, challenge, spontaneity, and memorable experiences are present in life.',
    'lifestyle', '#F43F5E', 'map', 7
  UNION ALL SELECT 'financial_freedom', 'Financial Freedom',
    'The degree to which financial decisions support security, choice, reduced stress, future goals, and freedom from unwanted financial pressure. This supports reflection and does not replace qualified financial advice.',
    'lifestyle', '#0F766E', 'wallet', 8
  UNION ALL SELECT 'leadership', 'Leadership',
    'The degree to which you use influence, responsibility, initiative, courage, and guidance in ways that reflect personal values—not only formal authority.',
    'purpose', '#5B21B6', 'flag', 9
  UNION ALL SELECT 'relationships', 'Relationships',
    'The degree to which friendships, intimate relationships, community, social connection, and mutual support are present in life.',
    'connection', '#C2410C', 'users', 10
) AS src ON v.value_key = src.value_key
SET
  v.label = src.label,
  v.definition = src.definition,
  v.category = src.category,
  v.color = src.color,
  v.icon = src.icon,
  v.display_order = src.display_order,
  v.is_active = 1
WHERE v.template_id = @va_tpl_id;

UPDATE values_alignment_templates
SET
  name = 'Values Alignment Assessment',
  description = 'Compare the life you are currently living with the life you want to build, then choose the values that deserve more intentional attention.',
  version = GREATEST(COALESCE(version, 1), 2),
  settings_json = JSON_OBJECT(
    'assessmentVariant', 'life-alignment-wheel',
    'visualExperienceName', 'Life Alignment Wheel',
    'resultsTitle', 'Your Values Alignment Profile',
    'coachDashboardTitle', 'Values Alignment Overview',
    'subtitle', 'Compare the life you are currently living with the life you want to build, then choose the values that deserve more intentional attention.',
    'coreValueKeys', JSON_ARRAY(
      'family', 'integrity', 'health', 'growth', 'faith',
      'service', 'adventure', 'financial_freedom', 'leadership', 'relationships'
    ),
    'maxVisibleValues', 12,
    'minSelect', 5,
    'maxSelect', 12,
    'minRank', 6,
    'maxRank', 8,
    'maxPriorities', 3,
    'enableConfidenceToChange', true,
    'enableNotRelevant', true,
    'defaultMode', 'full',
    'defaultTimeframe', 'current-season',
    'highImportanceThreshold', 7,
    'highAlignmentThreshold', 7,
    'compassName', 'Life Alignment Wheel'
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE id = @va_tpl_id;
