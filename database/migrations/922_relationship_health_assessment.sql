-- Migration 922: Relationship Health Assessment (couples)
-- Dual-partner cycle with privacy until both submit; Dual Relationship Health Wheel.

CREATE TABLE IF NOT EXISTS relationship_health_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = platform default',
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  settings_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rh_templates_agency (agency_id),
  KEY idx_rh_templates_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS relationship_health_template_domains (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  short_label VARCHAR(64) NOT NULL,
  definition TEXT NULL,
  weight DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  color VARCHAR(16) NOT NULL,
  icon VARCHAR(64) NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_optional TINYINT(1) NOT NULL DEFAULT 0,
  allows_not_applicable TINYINT(1) NOT NULL DEFAULT 0,
  available_modes_json JSON NULL,
  score_labels_json JSON NULL,
  reflection_options_json JSON NULL,
  conversation_prompts_json JSON NULL,
  primary_question TEXT NULL,
  reflection_prompt TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rh_tpl_domain (template_id, domain_key),
  KEY idx_rh_tpl_domain_order (template_id, display_order),
  CONSTRAINT fk_rh_tpl_domain_template
    FOREIGN KEY (template_id) REFERENCES relationship_health_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS relationship_assessment_cycles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL,
  template_id BIGINT UNSIGNED NOT NULL,
  template_version INT NOT NULL DEFAULT 1,
  display_name VARCHAR(255) NULL,
  mode ENUM('full','quick','premarital','parenting','rebuilding-trust','transition','targeted') NOT NULL DEFAULT 'full',
  status ENUM(
    'draft','invited','in_progress','waiting_for_partner',
    'both_completed','shared_results_released','planning','completed','archived'
  ) NOT NULL DEFAULT 'draft',
  context_json JSON NULL,
  comparison_json JSON NULL,
  selected_priorities_json JSON NULL,
  growth_plans_json JSON NULL,
  shared_results_released_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rh_cycle_agency (agency_id),
  KEY idx_rh_cycle_status (status),
  CONSTRAINT fk_rh_cycle_template
    FOREIGN KEY (template_id) REFERENCES relationship_health_templates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS relationship_partner_assessments (
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
  UNIQUE KEY uq_rh_partner_token (access_token),
  UNIQUE KEY uq_rh_cycle_role (cycle_id, partner_role),
  KEY idx_rh_partner_cycle (cycle_id),
  CONSTRAINT fk_rh_partner_cycle
    FOREIGN KEY (cycle_id) REFERENCES relationship_assessment_cycles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS relationship_domain_responses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  partner_assessment_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  current_experience_score TINYINT UNSIGNED NULL,
  importance_score TINYINT UNSIGNED NULL,
  desired_experience_score TINYINT UNSIGNED NULL,
  reflection_chips_json JSON NULL,
  private_note TEXT NULL,
  shared_note TEXT NULL,
  note_visibility ENUM(
    'private','share-after-both-submit','professional-only',
    'partner-and-professional','discussion-prompt-only'
  ) NOT NULL DEFAULT 'private',
  support_preference VARCHAR(64) NULL,
  is_not_applicable TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rh_resp (partner_assessment_id, domain_key),
  CONSTRAINT fk_rh_resp_partner
    FOREIGN KEY (partner_assessment_id) REFERENCES relationship_partner_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO relationship_health_templates (agency_id, name, description, version, settings_json, is_active)
SELECT NULL,
  'Relationship Health Assessment',
  'Explore how each partner currently experiences the relationship, identify shared strengths, and choose areas to strengthen together.',
  1,
  JSON_OBJECT(
    'wheelName', 'Relationship Health Wheel',
    'subtitle', 'Explore how each partner currently experiences the relationship, identify shared strengths, and choose areas to strengthen together.',
    'sharedResultsTitle', 'Your Relationship Health Profile',
    'individualResultsTitle', 'Your Relationship Reflection',
    'enableImportance', true,
    'enableDesiredExperience', true,
    'maxPriorities', 3,
    'assessmentNumber', 21,
    'disclaimer', 'This assessment is not a diagnosis, compatibility test, or prediction of separation. It does not prove fault and is not a substitute for qualified couples therapy.',
    'financialDisclaimer', 'This assessment provides relationship reflection and does not replace qualified financial, legal, tax, or debt advice.'
  ),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM relationship_health_templates WHERE agency_id IS NULL AND is_active = 1 LIMIT 1
);

SET @rh_tpl_id := (
  SELECT id FROM relationship_health_templates WHERE agency_id IS NULL AND is_active = 1 ORDER BY id ASC LIMIT 1
);

INSERT INTO relationship_health_template_domains
  (template_id, domain_key, label, short_label, definition, weight, color, icon, display_order, is_active, is_optional, allows_not_applicable,
   available_modes_json, score_labels_json, reflection_options_json, conversation_prompts_json, primary_question, reflection_prompt)
SELECT @rh_tpl_id, d.domain_key, d.label, d.short_label, d.definition, d.weight, d.color, d.icon, d.display_order, 1, d.is_optional, d.allows_not_applicable,
  d.available_modes_json, d.score_labels_json, d.reflection_options_json, d.conversation_prompts_json, d.primary_question, d.reflection_prompt
FROM (
  SELECT
    'communication' AS domain_key,
    'Communication' AS label,
    'Communication' AS short_label,
    'How partners share information, express needs, listen, clarify meaning, and discuss important topics respectfully.' AS definition,
    10.00 AS weight,
    '#0EA5E9' AS color,
    'chat' AS icon,
    1 AS display_order,
    0 AS is_optional,
    0 AS allows_not_applicable,
    JSON_ARRAY('full','quick','premarital','parenting','rebuilding-trust','transition','targeted') AS available_modes_json,
    JSON_OBJECT('low','Significant concern','mid','Mixed or inconsistent','high','Strong and consistently positive') AS score_labels_json,
    JSON_ARRAY('We avoid difficult topics','Conversations become defensive','One or both of us interrupt','We make assumptions','Timing is poor','We communicate clearly','We struggle to express needs','We do not feel heard','We communicate mostly about responsibilities','Technology interrupts connection','We need more intentional conversation time','Other') AS reflection_options_json,
    JSON_ARRAY('What helps you feel most heard during an important conversation?') AS conversation_prompts_json,
    'How effective and respectful does communication currently feel in your relationship?' AS primary_question,
    'What most affects communication?' AS reflection_prompt
  UNION ALL SELECT
    'trust','Trust','Trust',
    'Honesty, reliability, safety, transparency, faithfulness, and confidence in one another.',
    10.00, '#0284C7', 'shield', 2, 0, 0,
    JSON_ARRAY('full','quick','premarital','rebuilding-trust','transition','targeted'),
    JSON_OBJECT('low','Significant concern','mid','Mixed or inconsistent','high','Strong and consistently positive'),
    JSON_ARRAY('Keeping commitments','Honest communication','Reliability','Emotional safety','Transparency','Past hurt','Secrecy','Broken agreements','Follow-through','Respecting boundaries','Trust is currently strong','Other'),
    JSON_ARRAY('What behavior helps you experience trust most clearly?'),
    'How strong and dependable does trust currently feel in your relationship?',
    'What most influences trust?'
  UNION ALL SELECT
    'intimacy','Intimacy','Intimacy',
    'Emotional, physical, affectionate, romantic, and sexual connection within the relationship.',
    10.00, '#EC4899', 'heart', 3, 0, 0,
    JSON_ARRAY('full','premarital','transition','targeted'),
    JSON_OBJECT('low','Significant concern','mid','Mixed or inconsistent','high','Strong and consistently positive'),
    JSON_ARRAY('Emotional connection','Physical affection','Stress','Fatigue','Parenting demands','Health concerns','Time','Unresolved conflict','Different levels of desire','Difficulty discussing preferences','Feeling pressured','Intimacy currently feels positive','Other','Prefer not to answer'),
    JSON_ARRAY('What form of closeness helps you feel most connected and cared for?'),
    'How connected and mutually satisfying does intimacy currently feel?',
    'What most affects intimacy?'
  UNION ALL SELECT
    'friendship','Friendship','Friendship',
    'Enjoyment, companionship, shared experiences, curiosity, and liking one another.',
    10.00, '#22C55E', 'smile', 4, 0, 0,
    JSON_ARRAY('full','quick','premarital','transition','targeted'),
    JSON_OBJECT('low','Significant concern','mid','Mixed or inconsistent','high','Strong and consistently positive'),
    JSON_ARRAY('Shared activities','Quality time','Humor','Busy schedules','Parenting demands','Stress','We have become task-focused','We know each other well','We need new shared experiences','We rarely have uninterrupted time','Friendship currently feels strong','Other'),
    JSON_ARRAY('What is one activity that helps the relationship feel like a friendship?'),
    'How strong does the friendship within your relationship currently feel?',
    'What most strengthens or limits friendship?'
  UNION ALL SELECT
    'conflict','Conflict','Conflict',
    'How disagreements are handled safely, respectfully, productively, and with the possibility of repair.',
    10.00, '#F59E0B', 'balance', 5, 0, 0,
    JSON_ARRAY('full','quick','premarital','parenting','rebuilding-trust','transition','targeted'),
    JSON_OBJECT('low','Conflict often feels harmful or unresolved','mid','Conflict outcomes vary','high','Conflict is generally respectful and repairable'),
    JSON_ARRAY('We avoid conflict','Conflict escalates quickly','One or both of us shut down','We repeat the same argument','We use criticism','We become defensive','We struggle to take breaks appropriately','We resolve issues respectfully','We apologize and repair','We bring up past issues','We struggle to find solutions','Other'),
    JSON_ARRAY('What helps prevent a disagreement from becoming harmful or unproductive?'),
    'How constructively do you and your partner currently handle disagreements?',
    'What most affects conflict?'
  UNION ALL SELECT
    'parenting','Parenting','Parenting',
    'Cooperation, communication, and support in parenting, step-parenting, co-parenting, or caregiving.',
    10.00, '#8B5CF6', 'users', 6, 1, 1,
    JSON_ARRAY('full','parenting','transition','targeted'),
    JSON_OBJECT('low','Significant concern','mid','Mixed or inconsistent','high','Strong and consistently positive'),
    JSON_ARRAY('Different discipline approaches','Unequal responsibilities','Scheduling','Communication','Step-family roles','Co-parenting boundaries','Support for one another','Decisions about children','Protecting couple time','Extended-family involvement','Parenting teamwork currently feels strong','Other','Not applicable','Prefer not to answer'),
    JSON_ARRAY('What parenting or caregiving responsibility would benefit most from clearer teamwork?'),
    'How effectively do you and your partner work together in parenting or caregiving responsibilities?',
    'What most affects parenting teamwork?'
  UNION ALL SELECT
    'finances','Finances','Finances',
    'Communication, decisions, responsibilities, and expectations related to money.',
    10.00, '#14B8A6', 'wallet', 7, 0, 0,
    JSON_ARRAY('full','quick','premarital','transition','targeted'),
    JSON_OBJECT('low','Significant concern','mid','Mixed or inconsistent','high','Strong and consistently positive'),
    JSON_ARRAY('Different spending habits','Different saving priorities','Debt','Income differences','Financial stress','Budgeting','Lack of transparency','Unequal decision authority','Division of financial tasks','Future financial goals','Finances currently feel collaborative','Other','Prefer not to answer'),
    JSON_ARRAY('What financial decision or expectation would benefit from greater clarity?'),
    'How healthy and collaborative does financial communication and decision making currently feel?',
    'What most affects financial teamwork?'
  UNION ALL SELECT
    'teamwork','Teamwork','Teamwork',
    'Experiencing the relationship as a cooperative partnership with shared responsibility and mutual support.',
    10.00, '#6366F1', 'handshake', 8, 0, 0,
    JSON_ARRAY('full','quick','parenting','transition','targeted'),
    JSON_OBJECT('low','Significant concern','mid','Mixed or inconsistent','high','Strong and consistently positive'),
    JSON_ARRAY('Responsibilities are uneven','Responsibilities are unclear','One partner carries more mental load','We solve problems well together','We support each other during stress','We struggle to ask for help','We make decisions collaboratively','We do not regularly review responsibilities','We adapt well when circumstances change','We feel like roommates rather than partners','Other'),
    JSON_ARRAY('What responsibility or recurring task would benefit from clearer ownership?'),
    'How much does your relationship currently feel like an effective team?',
    'What most affects teamwork?'
  UNION ALL SELECT
    'appreciation','Appreciation','Appreciation',
    'Noticing, acknowledging, valuing, and expressing gratitude for one another.',
    10.00, '#A855F7', 'star', 9, 0, 0,
    JSON_ARRAY('full','quick','premarital','parenting','transition','targeted'),
    JSON_OBJECT('low','Significant concern','mid','Mixed or inconsistent','high','Strong and consistently positive'),
    JSON_ARRAY('Appreciation is expressed often','Effort goes unnoticed','We assume the other person already knows','Criticism outweighs positive feedback','We appreciate each other differently','We need more verbal affirmation','We need more helpful actions','We need more affection','Stress reduces appreciation','We rarely celebrate progress','Other'),
    JSON_ARRAY('What specific action helps you feel valued rather than merely thanked?'),
    'How appreciated and valued do you currently feel within the relationship?',
    'What most affects appreciation?'
  UNION ALL SELECT
    'shared_vision','Shared Vision','Shared Vision',
    'Alignment around the life, relationship, family, and future partners want to build together.',
    10.00, '#0F766E', 'compass', 10, 0, 0,
    JSON_ARRAY('full','quick','premarital','transition','targeted'),
    JSON_OBJECT('low','Significant concern','mid','Mixed or inconsistent','high','Strong and consistently positive'),
    JSON_ARRAY('Family plans','Parenting','Career','Finances','Lifestyle','Location','Faith or spirituality','Health','Retirement','Time together','Personal growth','Extended family','Shared vision currently feels clear','Other'),
    JSON_ARRAY('What do you hope the relationship feels like three years from now?'),
    'How aligned do you currently feel about the future you are building together?',
    'What area of the future needs the most discussion?'
) AS d
WHERE @rh_tpl_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM relationship_health_template_domains x
    WHERE x.template_id = @rh_tpl_id AND x.domain_key = d.domain_key
  );
