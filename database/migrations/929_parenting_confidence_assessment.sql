-- Migration 929: Parenting Confidence Assessment (Parenting Support Map)
-- Solo caregiver assessment — strengths-based, nonjudgmental.
-- Primary viz: Parenting Support Map (4 zones). Secondary: Capacity × Importance matrix.
-- Does not measure fitness to parent, custody suitability, or diagnose abuse.

CREATE TABLE IF NOT EXISTS parenting_confidence_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = platform default',
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  settings_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_pc_templates_agency (agency_id),
  KEY idx_pc_templates_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parenting_confidence_template_domains (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  short_label VARCHAR(64) NOT NULL,
  definition TEXT NULL,
  parenting_system ENUM(
    'guidance-and-structure',
    'connection-and-emotional-support',
    'caregiver-capacity',
    'family-integration'
  ) NOT NULL,
  weight DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  color VARCHAR(16) NOT NULL,
  icon VARCHAR(64) NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_optional TINYINT(1) NOT NULL DEFAULT 0,
  is_sensitive TINYINT(1) NOT NULL DEFAULT 0,
  participant_versions_json JSON NULL,
  available_modes_json JSON NULL,
  score_labels_json JSON NULL,
  reflection_options_json JSON NULL,
  action_suggestions_json JSON NULL,
  related_assessment_ids_json JSON NULL,
  primary_question TEXT NULL,
  reflection_prompt TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pc_tpl_domain (template_id, domain_key),
  KEY idx_pc_tpl_domain_order (template_id, display_order),
  CONSTRAINT fk_pc_tpl_domain_template
    FOREIGN KEY (template_id) REFERENCES parenting_confidence_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parenting_confidence_assessments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL,
  template_id BIGINT UNSIGNED NOT NULL,
  template_version INT NOT NULL DEFAULT 1,
  participant_user_id INT NULL,
  client_id INT NULL,
  coach_user_id INT NULL,
  counselor_user_id INT NULL,
  companion_assessment_id BIGINT UNSIGNED NULL COMMENT 'Optional co-parent companion (future)',
  group_id INT NULL,
  mode ENUM('full','quick','seasonal-review','transition','targeted') NOT NULL DEFAULT 'full',
  participant_version VARCHAR(64) NOT NULL DEFAULT 'general-caregiver',
  status ENUM('not_started','in_progress','completed','reviewed','archived') NOT NULL DEFAULT 'not_started',
  access_token VARCHAR(64) NOT NULL,
  context_json JSON NULL,
  summary_json JSON NULL,
  parenting_confidence_index INT NULL,
  importance_weighted_index INT NULL,
  selected_priorities_json JSON NULL,
  support_plans_json JSON NULL,
  weekly_commitments_json JSON NULL,
  reviewed_at DATETIME NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pc_access_token (access_token),
  KEY idx_pc_assess_agency (agency_id),
  KEY idx_pc_assess_participant (participant_user_id),
  KEY idx_pc_assess_status (status),
  KEY idx_pc_assess_mode (mode),
  CONSTRAINT fk_pc_assess_template
    FOREIGN KEY (template_id) REFERENCES parenting_confidence_templates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parenting_confidence_responses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  current_capacity_score TINYINT UNSIGNED NULL,
  personal_importance_score TINYINT UNSIGNED NULL,
  support_need_score TINYINT UNSIGNED NULL,
  demand_level_score TINYINT UNSIGNED NULL,
  reflection_chips_json JSON NULL,
  current_supports_json JSON NULL,
  barriers_json JSON NULL,
  personal_strengths_json JSON NULL,
  personal_definition TEXT NULL,
  support_preference VARCHAR(64) NULL,
  private_reflection TEXT NULL,
  note_visibility ENUM(
    'private','selected-coach','selected-counselor','shared-with-plan','do-not-save'
  ) NOT NULL DEFAULT 'private',
  season_status ENUM('active','not-relevant','paused','exploring') NOT NULL DEFAULT 'active',
  prefer_not_to_answer TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pc_resp (assessment_id, domain_key),
  CONSTRAINT fk_pc_resp_assessment
    FOREIGN KEY (assessment_id) REFERENCES parenting_confidence_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parenting_confidence_support_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NULL,
  requested_support VARCHAR(64) NOT NULL,
  urgency ENUM('routine','soon','today','urgent') NOT NULL DEFAULT 'routine',
  message TEXT NULL,
  message_visibility ENUM('participant-and-recipient','authorized-support-team','restricted') NOT NULL DEFAULT 'participant-and-recipient',
  status ENUM('draft','submitted','acknowledged','contact_attempted','scheduled','in_progress','completed','closed','unable_to_reach') NOT NULL DEFAULT 'draft',
  assigned_to_user_id INT NULL,
  expected_response_by DATETIME NULL,
  acknowledged_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_pc_support_assessment (assessment_id),
  CONSTRAINT fk_pc_support_assessment
    FOREIGN KEY (assessment_id) REFERENCES parenting_confidence_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO parenting_confidence_templates (agency_id, name, description, version, settings_json, is_active)
SELECT NULL,
  'Parenting Confidence Assessment',
  'Notice where you feel supported and confident as a parent, where capacity is stretched, and where a little more support could make the greatest difference.',
  1,
  JSON_OBJECT(
    'visualExperienceName', 'Parenting Support Map',
    'subtitle', 'How supported and confident do you feel as a parent right now?',
    'resultsTitle', 'Your Parenting Support Map',
    'alternativeResultsTitle', 'Your Caregiver Capacity Profile',
    'coachDashboardTitle', 'Parenting Confidence Overview',
    'programDashboardTitle', 'Parenting Support Dashboard',
    'enableImportance', true,
    'enableSupportNeed', true,
    'enableDemandLevel', false,
    'enableSupportRequests', true,
    'enableQuickExit', true,
    'maxPriorities', 3,
    'disclaimer', 'This assessment is not a measure of fitness to parent, custody suitability, or parenting quality. Low scores do not indicate abuse or neglect. It does not replace qualified medical, legal, or mental-health support.',
    'indexClarification', 'The Parenting Confidence Index summarizes how supported and capable you currently feel across the areas you completed. It does not measure your worth as a parent or predict child outcomes.',
    'safetyNote', 'If you or a child are in immediate danger, leave this page and contact local emergency services or a trusted crisis resource. Low capacity scores are not abuse conclusions.',
    'quickExitUrl', 'https://www.weather.com'
  ),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM parenting_confidence_templates WHERE agency_id IS NULL AND is_active = 1 LIMIT 1
);

SET @pc_tpl_id := (
  SELECT id FROM parenting_confidence_templates WHERE agency_id IS NULL AND is_active = 1 ORDER BY id ASC LIMIT 1
);

INSERT INTO parenting_confidence_template_domains
  (template_id, domain_key, label, short_label, definition, parenting_system, weight, color, icon,
   display_order, is_active, is_optional, is_sensitive, participant_versions_json, available_modes_json,
   score_labels_json, reflection_options_json, action_suggestions_json, related_assessment_ids_json,
   primary_question, reflection_prompt)
SELECT @pc_tpl_id, d.domain_key, d.label, d.short_label, d.definition, d.parenting_system, d.weight, d.color, d.icon,
  d.display_order, 1, d.is_optional, d.is_sensitive, d.participant_versions_json, d.available_modes_json,
  d.score_labels_json, d.reflection_options_json, d.action_suggestions_json, d.related_assessment_ids_json,
  d.primary_question, d.reflection_prompt
FROM (
  SELECT
    'consistency' AS domain_key,
    'Consistency' AS label,
    'Consistency' AS short_label,
    'How steady and predictable your day-to-day routines, expectations, and follow-through feel for the children in your care.' AS definition,
    'guidance-and-structure' AS parenting_system,
    10.00 AS weight,
    '#B45309' AS color,
    'calendar' AS icon,
    1 AS display_order,
    0 AS is_optional,
    0 AS is_sensitive,
    JSON_ARRAY('general-caregiver','parents-of-young-children','parents-of-school-age','parents-of-teens','single-caregiver','co-parenting','foster-or-kinship','blended-family','expecting-or-new') AS participant_versions_json,
    JSON_ARRAY('full','quick','seasonal-review','transition','targeted') AS available_modes_json,
    JSON_OBJECT('low','Routines feel hard to sustain','mid','Some consistency, some unpredictability','high','Steady and reliable enough for this season') AS score_labels_json,
    JSON_ARRAY('Busy schedules','Different caregivers','Unclear expectations','I start strong then lose steam','Transitions disrupt routines','Work or school demands','I currently feel fairly consistent','Other','Prefer not to answer') AS reflection_options_json,
    JSON_ARRAY('Protect one small daily routine','Write down two household expectations','Choose one transition to stabilize','Ask a co-caregiver to share one routine','Celebrate one consistent win this week') AS action_suggestions_json,
    JSON_ARRAY() AS related_assessment_ids_json,
    'How steady and reliable does your parenting consistency feel right now?' AS primary_question,
    'What most affects consistency in your home?' AS reflection_prompt
  UNION ALL SELECT
    'patience','Patience','Patience',
    'How able you feel to stay calm, pause, and respond thoughtfully when children need time, emotion, or repeated guidance.',
    'connection-and-emotional-support', 10.00, '#0F766E', 'heart-pulse', 2, 0, 0,
    JSON_ARRAY('general-caregiver','parents-of-young-children','parents-of-school-age','parents-of-teens','single-caregiver','co-parenting','foster-or-kinship','blended-family','expecting-or-new'),
    JSON_ARRAY('full','quick','seasonal-review','transition','targeted'),
    JSON_OBJECT('low','Patience feels very limited','mid','Patience comes and goes','high','I can usually pause and respond calmly'),
    JSON_ARRAY('Sleep deprivation','Stress overload','Sibling conflict','Repeated requests','My own childhood patterns','Limited breaks','I currently feel patient enough','Other','Prefer not to answer'),
    JSON_ARRAY('Practice a brief pause before responding','Protect one recovery break daily','Name your early stress signals','Use a calm-down phrase with your child','Ask for short relief from another adult'),
    JSON_ARRAY('personal-fulfillment'),
    'How supported does your patience feel in daily parenting moments?',
    'What most stretches your patience?'
  UNION ALL SELECT
    'boundaries','Boundaries','Boundaries',
    'How clear and sustainable your limits, household rules, and personal boundaries feel for you and the children in your care.',
    'guidance-and-structure', 10.00, '#92400E', 'shield', 3, 0, 0,
    JSON_ARRAY('general-caregiver','parents-of-young-children','parents-of-school-age','parents-of-teens','single-caregiver','co-parenting','foster-or-kinship','blended-family','expecting-or-new'),
    JSON_ARRAY('full','quick','seasonal-review','transition','targeted'),
    JSON_OBJECT('low','Boundaries feel unclear or hard to hold','mid','Some boundaries work, others slip','high','Limits feel clear and workable'),
    JSON_ARRAY('Guilt about saying no','Inconsistent co-caregiving','Screen-time limits','Bedtime pushback','I give in to keep peace','Unclear family rules','Boundaries currently feel workable','Other','Prefer not to answer'),
    JSON_ARRAY('Choose one boundary to practice this week','Script a calm, short limit statement','Align one rule with a co-caregiver','Protect one personal boundary for yourself','Review screens or bedtime with one clear limit'),
    JSON_ARRAY(),
    'How clear and sustainable do your parenting boundaries feel right now?',
    'What most affects boundaries?'
  UNION ALL SELECT
    'emotional_coaching','Emotional Coaching','Emotional',
    'How able you feel to notice, name, and guide children through feelings without dismissing or escalating their experience.',
    'connection-and-emotional-support', 10.00, '#0369A1', 'message-heart', 4, 0, 0,
    JSON_ARRAY('general-caregiver','parents-of-young-children','parents-of-school-age','parents-of-teens','single-caregiver','co-parenting','foster-or-kinship','blended-family','expecting-or-new'),
    JSON_ARRAY('full','quick','seasonal-review','transition','targeted'),
    JSON_OBJECT('low','Emotions feel hard to guide','mid','I support feelings sometimes','high','I can usually coach emotions with care'),
    JSON_ARRAY('Big feelings overwhelm me','I was not taught this growing up','Time pressure','I jump to fixing','Sibling rivalry','Teen withdrawal','Emotional coaching currently feels strong','Other','Prefer not to answer'),
    JSON_ARRAY('Practice naming one feeling with your child','Validate before problem-solving','Create a calm corner or reset ritual','Read one short emotion-coaching tip','Role-play a hard conversation when calm'),
    JSON_ARRAY('teen-wellbeing'),
    'How supported do you feel in guiding your child through emotions?',
    'What most affects emotional coaching?'
  UNION ALL SELECT
    'discipline','Discipline','Discipline',
    'How confident you feel using guidance, accountability, and repair that teaches rather than shames. This is not about physical punishment.',
    'guidance-and-structure', 10.00, '#A16207', 'scale', 5, 0, 1,
    JSON_ARRAY('general-caregiver','parents-of-young-children','parents-of-school-age','parents-of-teens','single-caregiver','co-parenting','foster-or-kinship','blended-family','expecting-or-new'),
    JSON_ARRAY('full','quick','seasonal-review','transition','targeted'),
    JSON_OBJECT('low','Discipline feels confusing or reactive','mid','Some approaches work, others do not','high','Guidance feels clear, fair, and workable'),
    JSON_ARRAY('I react instead of respond','Unclear natural consequences','Different discipline styles at home','Guilt after correcting','Power struggles','I currently feel confident guiding behavior','Other','Prefer not to answer'),
    JSON_ARRAY('Choose one teaching consequence in advance','Practice repair after a hard moment','Reduce lectures; use shorter guidance','Align with a co-caregiver on one response','Celebrate effort, not only compliance'),
    JSON_ARRAY(),
    'How confident do you feel guiding behavior with fairness and care?',
    'What most affects discipline and guidance?'
  UNION ALL SELECT
    'communication','Communication','Communication',
    'How open, respectful, and workable conversations feel between you and the children in your care.',
    'connection-and-emotional-support', 10.00, '#0E7490', 'messages', 6, 0, 0,
    JSON_ARRAY('general-caregiver','parents-of-young-children','parents-of-school-age','parents-of-teens','single-caregiver','co-parenting','foster-or-kinship','blended-family','expecting-or-new'),
    JSON_ARRAY('full','quick','seasonal-review','transition','targeted'),
    JSON_OBJECT('low','Talking feels strained or rare','mid','Some conversations work well','high','We can usually talk and listen'),
    JSON_ARRAY('Everyone is rushed','Screens interrupt us','Tone escalates quickly','Teens share little','I lecture more than I listen','Communication currently feels strong','Other','Prefer not to answer'),
    JSON_ARRAY('Ask one open question daily','Protect device-free conversation time','Reflect back what you heard','Share one appreciation each day','Schedule a short weekly family check-in'),
    JSON_ARRAY('relationship-health'),
    'How open and workable does communication feel with your child or children?',
    'What most affects communication?'
  UNION ALL SELECT
    'self_care','Self-Care','Self-Care',
    'How able you feel to protect rest, recovery, and basic personal needs so you can stay present as a caregiver.',
    'caregiver-capacity', 10.00, '#65A30D', 'leaf', 7, 0, 0,
    JSON_ARRAY('general-caregiver','parents-of-young-children','parents-of-school-age','parents-of-teens','single-caregiver','co-parenting','foster-or-kinship','blended-family','expecting-or-new'),
    JSON_ARRAY('full','quick','seasonal-review','transition','targeted'),
    JSON_OBJECT('low','I have almost no recovery','mid','Self-care is inconsistent','high','I protect enough recovery for this season'),
    JSON_ARRAY('No childcare help','Guilt about resting','Work demands','Sleep debt','Health needs deferred','Self-care currently feels workable','Other','Prefer not to answer'),
    JSON_ARRAY('Schedule one non-negotiable rest block','Ask for one concrete help this week','Protect sleep as a parenting strategy','Take a short outdoor reset','Name one need you have been postponing'),
    JSON_ARRAY('personal-fulfillment','digital-wellness'),
    'How supported does your own rest and recovery feel right now?',
    'What most affects caregiver self-care?'
  UNION ALL SELECT
    'confidence','Confidence','Confidence',
    'How steady your trust feels in your ability to make parenting decisions, recover from hard moments, and keep learning.',
    'caregiver-capacity', 10.00, '#C2410C', 'spark', 8, 0, 0,
    JSON_ARRAY('general-caregiver','parents-of-young-children','parents-of-school-age','parents-of-teens','single-caregiver','co-parenting','foster-or-kinship','blended-family','expecting-or-new'),
    JSON_ARRAY('full','quick','seasonal-review','transition','targeted'),
    JSON_OBJECT('low','I often second-guess myself','mid','Confidence comes and goes','high','I generally trust my parenting judgment'),
    JSON_ARRAY('Comparing myself to others','Past mistakes linger','Conflicting advice','Hard developmental stages','Limited encouragement','Confidence currently feels solid','Other','Prefer not to answer'),
    JSON_ARRAY('Write three parenting strengths','Ask a trusted person what they notice you do well','Review one hard moment with self-compassion','Limit comparison scrolling','Choose one value to guide decisions this week'),
    JSON_ARRAY('values-alignment'),
    'How steady does your parenting confidence feel in this season?',
    'What most affects your confidence as a caregiver?'
  UNION ALL SELECT
    'support','Support','Support',
    'How connected you feel to practical help, emotional backup, and people who understand your caregiving load.',
    'caregiver-capacity', 10.00, '#4D7C0F', 'users', 9, 0, 0,
    JSON_ARRAY('general-caregiver','parents-of-young-children','parents-of-school-age','parents-of-teens','single-caregiver','co-parenting','foster-or-kinship','blended-family','expecting-or-new'),
    JSON_ARRAY('full','quick','seasonal-review','transition','targeted'),
    JSON_OBJECT('low','I feel largely alone','mid','Some support exists','high','I have dependable support'),
    JSON_ARRAY('Geographically isolated','Hard to ask for help','Unreliable offers','Limited family nearby','Co-parenting strain','I currently feel supported','Other','Prefer not to answer'),
    JSON_ARRAY('Identify one person you can ask for help','Join a parent community or group','Trade childcare with another family','List practical vs emotional support needs','Schedule one supportive conversation'),
    JSON_ARRAY(),
    'How supported do you feel in your parenting role right now?',
    'What most affects your support network?'
  UNION ALL SELECT
    'family_balance','Family Balance','Balance',
    'How workable the overall rhythm feels across caregiving, work, relationships, household needs, and personal life.',
    'family-integration', 10.00, '#78716C', 'balance', 10, 0, 0,
    JSON_ARRAY('general-caregiver','parents-of-young-children','parents-of-school-age','parents-of-teens','single-caregiver','co-parenting','foster-or-kinship','blended-family','expecting-or-new'),
    JSON_ARRAY('full','quick','seasonal-review','transition','targeted'),
    JSON_OBJECT('low','Life feels heavily out of balance','mid','Some weeks work, others do not','high','Rhythm feels workable for this season'),
    JSON_ARRAY('Too many commitments','Work-life conflict','Uneven household load','Little couple or personal time','Constant logistics','Balance currently feels workable','Other','Prefer not to answer'),
    JSON_ARRAY('Cut or pause one optional commitment','Create a simple weekly family rhythm','Share one household task','Protect one relationship or personal hour','Review weekends for recovery, not only activity'),
    JSON_ARRAY('mens-life','personal-fulfillment'),
    'How workable does your overall family rhythm feel right now?',
    'What most affects family balance?'
) AS d
WHERE @pc_tpl_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM parenting_confidence_template_domains x
    WHERE x.template_id = @pc_tpl_id AND x.domain_key = d.domain_key
  );
