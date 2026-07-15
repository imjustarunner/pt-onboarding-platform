-- Migration 928: Marriage Alignment Assessment (Shared Course Map)
-- Couples pairing pattern mirrors Relationship Health — separate completion, shared release.
-- Distinct from Relationship Health: Current Alignment + Desired Emphasis (future priorities).

CREATE TABLE IF NOT EXISTS marriage_alignment_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = platform default',
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  settings_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ma_templates_agency (agency_id),
  KEY idx_ma_templates_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marriage_alignment_template_domains (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  short_label VARCHAR(64) NOT NULL,
  definition TEXT NULL,
  alignment_system ENUM(
    'shared-direction',
    'home-and-responsibility',
    'connection-and-partnership',
    'vitality-and-experience'
  ) NOT NULL,
  weight DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  color VARCHAR(16) NOT NULL,
  icon VARCHAR(64) NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_optional TINYINT(1) NOT NULL DEFAULT 0,
  is_sensitive TINYINT(1) NOT NULL DEFAULT 0,
  allows_not_relevant TINYINT(1) NOT NULL DEFAULT 0,
  available_versions_json JSON NULL,
  available_modes_json JSON NULL,
  score_labels_json JSON NULL,
  reflection_options_json JSON NULL,
  conversation_prompts_json JSON NULL,
  action_suggestions_json JSON NULL,
  related_assessment_ids_json JSON NULL,
  primary_question TEXT NULL,
  desired_emphasis_question TEXT NULL,
  reflection_prompt TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ma_tpl_domain (template_id, domain_key),
  KEY idx_ma_tpl_domain_order (template_id, display_order),
  CONSTRAINT fk_ma_tpl_domain_template
    FOREIGN KEY (template_id) REFERENCES marriage_alignment_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marriage_alignment_cycles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL,
  template_id BIGINT UNSIGNED NOT NULL,
  template_version INT NOT NULL DEFAULT 1,
  display_name VARCHAR(255) NULL,
  mode ENUM('full','quick','annual-review','life-transition','premarital','targeted') NOT NULL DEFAULT 'full',
  participant_version VARCHAR(64) NOT NULL DEFAULT 'general',
  status ENUM(
    'draft','invited','in_progress','waiting_for_partner',
    'both_submitted','shared_results_released','priority_selection','planning','completed','archived'
  ) NOT NULL DEFAULT 'draft',
  context_json JSON NULL,
  comparison_json JSON NULL,
  selected_priorities_json JSON NULL,
  alignment_plans_json JSON NULL,
  shared_results_released_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ma_cycle_agency (agency_id),
  KEY idx_ma_cycle_status (status),
  CONSTRAINT fk_ma_cycle_template
    FOREIGN KEY (template_id) REFERENCES marriage_alignment_templates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marriage_alignment_partner_assessments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cycle_id BIGINT UNSIGNED NOT NULL,
  partner_role ENUM('partner-a','partner-b') NOT NULL,
  display_label VARCHAR(64) NULL,
  access_token VARCHAR(64) NOT NULL,
  status ENUM('not_started','in_progress','submitted','withdrawn','archived') NOT NULL DEFAULT 'not_started',
  individual_index INT NULL,
  selected_priorities_json JSON NULL,
  private_safety_json JSON NULL,
  started_at DATETIME NULL,
  submitted_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ma_partner_token (access_token),
  UNIQUE KEY uq_ma_cycle_role (cycle_id, partner_role),
  KEY idx_ma_partner_cycle (cycle_id),
  CONSTRAINT fk_ma_partner_cycle
    FOREIGN KEY (cycle_id) REFERENCES marriage_alignment_cycles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marriage_alignment_domain_responses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  partner_assessment_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  current_alignment_score TINYINT UNSIGNED NULL,
  desired_emphasis_score TINYINT UNSIGNED NULL,
  collaboration_confidence_score TINYINT UNSIGNED NULL,
  reflection_chips_json JSON NULL,
  personal_meaning TEXT NULL,
  partner_expectation_guess TEXT NULL,
  private_note TEXT NULL,
  shared_note TEXT NULL,
  note_visibility ENUM(
    'private','share-after-both-submit','professional-only',
    'partner-and-professional','discussion-prompt-only','do-not-save'
  ) NOT NULL DEFAULT 'private',
  support_preference VARCHAR(64) NULL,
  is_not_relevant TINYINT(1) NOT NULL DEFAULT 0,
  prefer_not_to_answer TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ma_resp (partner_assessment_id, domain_key),
  CONSTRAINT fk_ma_resp_partner
    FOREIGN KEY (partner_assessment_id) REFERENCES marriage_alignment_partner_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO marriage_alignment_templates (agency_id, name, description, version, settings_json, is_active)
SELECT NULL,
  'Marriage Alignment Assessment',
  'Compare how each partner sees the marriage today, clarify what each partner wants for the future, and choose what to build together.',
  1,
  JSON_OBJECT(
    'visualExperienceName', 'Shared Course Map',
    'subtitle', 'Compare how each partner sees the marriage today, clarify what each partner wants for the future, and choose what to build together.',
    'individualResultsTitle', 'Your Marriage Alignment Reflection',
    'sharedResultsTitle', 'Your Shared Marriage Course',
    'professionalDashboardTitle', 'Marriage Alignment Overview',
    'enableCollaborationConfidence', true,
    'maxPriorities', 3,
    'disclaimer', 'This assessment is not a compatibility test, divorce prediction, measure of love or commitment, or proof of fault. Alignment does not require identical preferences. It does not replace qualified couples counseling.',
    'indexClarification', 'The Marriage Alignment Index summarizes how aligned both partners currently perceive the marriage to be. It does not measure love, compatibility, commitment, or the future of the marriage.',
    'directionClarification', 'The Shared Direction Index measures similarity in preferred emphasis. It does not require identical preferences and does not measure relationship quality.'
  ),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM marriage_alignment_templates WHERE agency_id IS NULL AND is_active = 1 LIMIT 1
);

SET @ma_tpl_id := (
  SELECT id FROM marriage_alignment_templates WHERE agency_id IS NULL AND is_active = 1 ORDER BY id ASC LIMIT 1
);

INSERT INTO marriage_alignment_template_domains
  (template_id, domain_key, label, short_label, definition, alignment_system, weight, color, icon,
   display_order, is_active, is_optional, is_sensitive, allows_not_relevant,
   available_versions_json, available_modes_json, score_labels_json, reflection_options_json,
   conversation_prompts_json, action_suggestions_json, related_assessment_ids_json,
   primary_question, desired_emphasis_question, reflection_prompt)
SELECT @ma_tpl_id, d.domain_key, d.label, d.short_label, d.definition, d.alignment_system, d.weight, d.color, d.icon,
  d.display_order, 1, d.is_optional, d.is_sensitive, d.allows_not_relevant,
  d.available_versions_json, d.available_modes_json, d.score_labels_json, d.reflection_options_json,
  d.conversation_prompts_json, d.action_suggestions_json, d.related_assessment_ids_json,
  d.primary_question, d.desired_emphasis_question, d.reflection_prompt
FROM (
  SELECT
    'goals' AS domain_key,
    'Goals' AS label,
    'Goals' AS short_label,
    'The degree to which partners understand and support the personal, family, professional, financial, and long-term goals they are pursuing.' AS definition,
    'shared-direction' AS alignment_system,
    10.00 AS weight,
    '#1E3A5F' AS color,
    'compass' AS icon,
    1 AS display_order,
    0 AS is_optional,
    0 AS is_sensitive,
    0 AS allows_not_relevant,
    JSON_ARRAY('general','newlywed','premarital','parents-young-children','blended-family','empty-nest','retirement','counseling','faith-based') AS available_versions_json,
    JSON_ARRAY('full','quick','annual-review','life-transition','premarital','targeted') AS available_modes_json,
    JSON_OBJECT('low','Very different expectations','mid','Partially aligned','high','Strongly aligned and clear') AS score_labels_json,
    JSON_ARRAY('We have clear shared goals','Our goals are mostly assumed rather than discussed','Career goals compete','Family goals need clarification','We want different lifestyles','We have different timelines','One partner''s goals receive more attention','We support each other''s individual goals','We need a regular planning process','A major decision is approaching','Our goals currently feel aligned','Other','Prefer not to answer') AS reflection_options_json,
    JSON_ARRAY('What are the three most important outcomes we want to create during the next one to three years?') AS conversation_prompts_json,
    JSON_ARRAY('Create a shared one-year goal list','Identify one individual goal for each partner','Schedule a quarterly planning conversation','Clarify one major timeline','Identify one current tradeoff') AS action_suggestions_json,
    JSON_ARRAY('values-alignment') AS related_assessment_ids_json,
    'How aligned do you believe you and your partner currently are about your major goals and priorities?' AS primary_question,
    'How much attention should shared goal-setting receive during your next season?' AS desired_emphasis_question,
    'What most affects alignment around goals?' AS reflection_prompt
  UNION ALL SELECT
    'parenting','Parenting','Parenting',
    'Shared expectations, responsibilities, values, and support related to parenting, step-parenting, co-parenting, caregiving, or planning for children.',
    'home-and-responsibility', 10.00, '#3F6212', 'users', 2, 1, 0, 1,
    JSON_ARRAY('general','newlywed','premarital','parents-young-children','blended-family','empty-nest','counseling','faith-based'),
    JSON_ARRAY('full','quick','annual-review','life-transition','premarital','targeted'),
    JSON_OBJECT('low','Very different expectations','mid','Partially aligned','high','Strongly aligned and clear'),
    JSON_ARRAY('Discipline expectations','Daily routines','Division of responsibility','School decisions','Technology expectations','Different childhood experiences','Step-family roles','Co-parenting boundaries','Protecting couple time','Future family planning','Parenting currently feels aligned','No children','Other','Prefer not to answer'),
    JSON_ARRAY('Which parenting responsibility or expectation would benefit most from a clearer agreement?'),
    JSON_ARRAY('Define one shared parenting principle','Clarify responsibility for one recurring task','Establish a private parenting check-in','Schedule protected couple time'),
    JSON_ARRAY(),
    'How aligned do you believe you and your partner currently are in parenting or caregiving?',
    'How much attention should parenting alignment receive during your next season?',
    'What most affects parenting alignment?'
  UNION ALL SELECT
    'household','Household','Household',
    'Clear and fair expectations for household responsibilities, planning, maintenance, and invisible labor. Fairness is not every task split exactly in half.',
    'home-and-responsibility', 10.00, '#78716C', 'home', 3, 0, 0, 0,
    JSON_ARRAY('general','newlywed','premarital','parents-young-children','blended-family','empty-nest','retirement','counseling'),
    JSON_ARRAY('full','quick','annual-review','life-transition','premarital','targeted'),
    JSON_OBJECT('low','Very different expectations','mid','Partially aligned','high','Strongly aligned and clear'),
    JSON_ARRAY('Responsibilities are clear','Responsibilities are unclear','One partner carries more visible work','One partner carries more planning or mental load','We have different standards','Tasks are assigned but not completed consistently','Work schedules affect fairness','One partner feels unrecognized','We need a regular household review','Household teamwork currently feels aligned','Other','Prefer not to answer'),
    JSON_ARRAY('Which recurring household responsibility creates the most tension or invisible effort?'),
    JSON_ARRAY('Create a household responsibility map','Assign clear ownership','Review mental-load tasks','Schedule a weekly logistics meeting'),
    JSON_ARRAY(),
    'How aligned do you believe you and your partner currently are about household responsibilities and expectations?',
    'How much attention should household alignment receive during your next season?',
    'What most affects household alignment?'
  UNION ALL SELECT
    'time_together','Time Together','Time',
    'Agreement about the amount, quality, frequency, and type of time partners want to spend together.',
    'connection-and-partnership', 10.00, '#0F766E', 'clock', 4, 0, 0, 0,
    JSON_ARRAY('general','newlywed','premarital','parents-young-children','blended-family','empty-nest','retirement','counseling','faith-based'),
    JSON_ARRAY('full','quick','annual-review','life-transition','premarital','targeted'),
    JSON_OBJECT('low','Very different expectations','mid','Partially aligned','high','Strongly aligned and clear'),
    JSON_ARRAY('Work schedules','Parenting','Fatigue','Technology','Different definitions of quality time','Different social-energy needs','Lack of planning','We spend time together but do not feel connected','Time together currently feels aligned','Other','Prefer not to answer'),
    JSON_ARRAY('What type of shared time helps you feel most connected rather than simply physically present?'),
    JSON_ARRAY('Create a weekly connection block','Schedule a monthly date','Protect a daily ten-minute check-in','Define device-free time'),
    JSON_ARRAY('relationship-health'),
    'How aligned do you believe you and your partner currently are about time together?',
    'How much attention should intentional time together receive during your next season?',
    'What most affects time together?'
  UNION ALL SELECT
    'romance','Romance','Romance',
    'Compatible expectations for affection, emotional closeness, romance, physical intimacy, sexual communication, and intentional pursuit. Consent-centered; one partner does not owe intimacy.',
    'connection-and-partnership', 10.00, '#9F1239', 'heart', 5, 0, 1, 0,
    JSON_ARRAY('general','newlywed','premarital','parents-young-children','empty-nest','retirement','counseling'),
    JSON_ARRAY('full','quick','annual-review','life-transition','premarital','targeted'),
    JSON_OBJECT('low','Very different expectations','mid','Partially aligned','high','Strongly aligned and clear'),
    JSON_ARRAY('Emotional connection','Affection','Time','Stress','Fatigue','Parenting demands','Different levels of desire','Different definitions of romance','Difficulty discussing preferences','Feeling pressured','Feeling rejected','Romance currently feels aligned','Other','Prefer not to answer'),
    JSON_ARRAY('What helps romance feel mutual, safe, and meaningful rather than expected or obligatory?'),
    JSON_ARRAY('Discuss definitions of romance','Schedule intentional connection','Express one specific preference','Practice nonsexual affection','Clarify consent and boundaries'),
    JSON_ARRAY('relationship-health'),
    'How aligned do you believe you and your partner currently are about romance, affection, and intimacy?',
    'How much attention should romance and intimacy receive during your next season?',
    'What most affects romantic alignment?'
  UNION ALL SELECT
    'faith','Faith and Spiritual Life','Faith',
    'Understanding and respecting each other''s beliefs, practices, spiritual needs, and expectations. Optional and worldview-sensitive; alignment does not require identical beliefs.',
    'shared-direction', 10.00, '#6D28D9', 'sun', 6, 1, 1, 1,
    JSON_ARRAY('general','newlywed','premarital','parents-young-children','blended-family','empty-nest','retirement','counseling','faith-based'),
    JSON_ARRAY('full','quick','annual-review','life-transition','premarital','targeted'),
    JSON_OBJECT('low','Very different expectations','mid','Partially aligned','high','Strongly aligned and clear'),
    JSON_ARRAY('We share similar beliefs','We have different beliefs','We practice faith differently','Community participation','Family traditions','Children''s spiritual formation','One partner wants more involvement','One partner feels pressured','Our current arrangement feels respectful','This domain does not fit our worldview','Other','Prefer not to answer'),
    JSON_ARRAY('What shared value or spiritual practice would feel meaningful without requiring identical beliefs?'),
    JSON_ARRAY('Identify shared values','Create an optional prayer or reflection practice','Clarify expectations for children','Protect each partner''s freedom of belief'),
    JSON_ARRAY(),
    'How aligned do you believe you and your partner currently are regarding faith, spirituality, or shared meaning?',
    'How much attention should faith, spirituality, or shared meaning receive during your next season?',
    'What most affects alignment in this area?'
  UNION ALL SELECT
    'money','Money','Money',
    'Clear expectations, information, responsibilities, and goals related to finances. Does not replace qualified financial advice. Higher earner is not automatically the decision maker.',
    'home-and-responsibility', 10.00, '#A16207', 'wallet', 7, 0, 1, 0,
    JSON_ARRAY('general','newlywed','premarital','parents-young-children','blended-family','empty-nest','retirement','counseling'),
    JSON_ARRAY('full','quick','annual-review','life-transition','premarital','targeted'),
    JSON_OBJECT('low','Very different expectations','mid','Partially aligned','high','Strongly aligned and clear'),
    JSON_ARRAY('Spending priorities','Saving priorities','Debt','Income differences','Budgeting','Financial transparency','Major purchases','Financial roles','One partner controls more information','Financial risk tolerance','Money currently feels aligned','Other','Prefer not to answer'),
    JSON_ARRAY('Which financial expectation or responsibility would benefit most from greater clarity?'),
    JSON_ARRAY('Schedule a monthly money meeting','Review accounts together','Define spending thresholds','Clarify financial responsibilities','Create a shared savings target'),
    JSON_ARRAY(),
    'How aligned do you believe you and your partner currently are about money?',
    'How much attention should financial alignment receive during your next season?',
    'What most affects financial alignment?'
  UNION ALL SELECT
    'health','Health','Health',
    'Compatible expectations for supporting physical, emotional, and restorative health individually and together. Does not diagnose conditions or shame body size.',
    'vitality-and-experience', 10.00, '#15803D', 'activity', 8, 0, 0, 0,
    JSON_ARRAY('general','newlywed','premarital','parents-young-children','empty-nest','retirement','counseling'),
    JSON_ARRAY('full','quick','annual-review','life-transition','premarital','targeted'),
    JSON_OBJECT('low','Very different expectations','mid','Partially aligned','high','Strongly aligned and clear'),
    JSON_ARRAY('Sleep','Exercise','Nutrition','Medical care','Stress','Mental or emotional health','Different health priorities','Supporting one another without pressure','Health routines currently feel aligned','Other','Prefer not to answer'),
    JSON_ARRAY('How can we support each other''s health without becoming controlling, critical, or responsible for the other person''s choices?'),
    JSON_ARRAY('Plan a shared walk','Protect sleep routines','Clarify recovery needs','Support separate health goals'),
    JSON_ARRAY(),
    'How aligned do you believe you and your partner currently are about health and well-being?',
    'How much attention should health and well-being receive during your next season?',
    'What most affects health alignment?'
  UNION ALL SELECT
    'adventure','Adventure','Adventure',
    'Compatible expectations for novelty, play, travel, exploration, spontaneity, and memorable experiences. Adventure does not require expensive travel or physical risk.',
    'vitality-and-experience', 10.00, '#C2410C', 'map', 9, 0, 0, 0,
    JSON_ARRAY('general','newlywed','premarital','parents-young-children','empty-nest','retirement','counseling'),
    JSON_ARRAY('full','quick','annual-review','life-transition','premarital','targeted'),
    JSON_OBJECT('low','Very different expectations','mid','Partially aligned','high','Strongly aligned and clear'),
    JSON_ARRAY('Different interests','Different energy levels','Financial limits','Parenting responsibilities','Different risk tolerance','One partner prefers planning','One partner prefers spontaneity','We need more local experiences','Adventure is not a major priority now','Other','Prefer not to answer'),
    JSON_ARRAY('What kind of new experience would feel energizing to both of us during this season?'),
    JSON_ARRAY('Create a shared adventure list','Schedule a local day trip','Alternate partner-selected experiences','Create a monthly play or exploration routine'),
    JSON_ARRAY(),
    'How aligned do you believe you and your partner currently are about adventure, play, and new experiences?',
    'How much attention should adventure receive during your next season?',
    'What most affects alignment around adventure?'
  UNION ALL SELECT
    'growth','Growth','Growth',
    'Support for individual development, relationship learning, adaptation, feedback, and becoming more intentional over time.',
    'shared-direction', 10.00, '#1D4ED8', 'sprout', 10, 0, 0, 0,
    JSON_ARRAY('general','newlywed','premarital','parents-young-children','blended-family','empty-nest','retirement','counseling','faith-based'),
    JSON_ARRAY('full','quick','annual-review','life-transition','premarital','targeted'),
    JSON_OBJECT('low','Very different expectations','mid','Partially aligned','high','Strongly aligned and clear'),
    JSON_ARRAY('We support each other''s goals','One partner wants more change','One partner prefers stability','We struggle to give feedback','We repeat the same patterns','Counseling or coaching expectations differ','We celebrate each other''s progress','Growth currently feels supported','Other','Prefer not to answer'),
    JSON_ARRAY('How can we support individual growth without making the other partner feel left behind, controlled, or inadequate?'),
    JSON_ARRAY('Identify one growth goal for each partner','Choose one relationship skill','Schedule a monthly reflection','Celebrate one recent change'),
    JSON_ARRAY('relationship-health','personal-fulfillment'),
    'How aligned do you believe you and your partner currently are about personal and relationship growth?',
    'How much attention should growth receive during your next season?',
    'What most affects growth alignment?'
) AS d
WHERE @ma_tpl_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM marriage_alignment_template_domains x
    WHERE x.template_id = @ma_tpl_id AND x.domain_key = d.domain_key
  );
