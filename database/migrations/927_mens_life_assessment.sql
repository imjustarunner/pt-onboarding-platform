-- Migration 927: Men's Life Assessment (The Life Framework)
-- Flagship whole-life assessment — architectural framework viz, not a wheel.
-- Does not measure masculinity, worth, toughness, or success.

CREATE TABLE IF NOT EXISTS mens_life_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = platform default',
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  settings_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ml_templates_agency (agency_id),
  KEY idx_ml_templates_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mens_life_template_domains (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  short_label VARCHAR(64) NOT NULL,
  definition TEXT NULL,
  life_system ENUM(
    'meaning-and-direction',
    'relationships-and-responsibility',
    'strength-and-stewardship',
    'inner-stability'
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
  UNIQUE KEY uq_ml_tpl_domain (template_id, domain_key),
  KEY idx_ml_tpl_domain_order (template_id, display_order),
  CONSTRAINT fk_ml_tpl_domain_template
    FOREIGN KEY (template_id) REFERENCES mens_life_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mens_life_assessments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL,
  template_id BIGINT UNSIGNED NOT NULL,
  template_version INT NOT NULL DEFAULT 1,
  participant_user_id INT NULL,
  client_id INT NULL,
  coach_user_id INT NULL,
  counselor_user_id INT NULL,
  mentor_user_id INT NULL,
  spiritual_leader_user_id INT NULL,
  group_id INT NULL,
  mode ENUM('full','quick','annual-review','life-transition','mens-group','targeted') NOT NULL DEFAULT 'full',
  participant_version VARCHAR(64) NOT NULL DEFAULT 'married-men',
  status ENUM('not_started','in_progress','completed','reviewed','archived') NOT NULL DEFAULT 'not_started',
  access_token VARCHAR(64) NOT NULL,
  context_json JSON NULL,
  summary_json JSON NULL,
  mens_life_index INT NULL,
  importance_weighted_index INT NULL,
  selected_priorities_json JSON NULL,
  development_plans_json JSON NULL,
  weekly_commitments_json JSON NULL,
  accountability_plans_json JSON NULL,
  reviewed_at DATETIME NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ml_access_token (access_token),
  KEY idx_ml_assess_agency (agency_id),
  KEY idx_ml_assess_participant (participant_user_id),
  KEY idx_ml_assess_status (status),
  KEY idx_ml_assess_mode (mode),
  CONSTRAINT fk_ml_assess_template
    FOREIGN KEY (template_id) REFERENCES mens_life_templates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mens_life_responses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  current_strength_score TINYINT UNSIGNED NULL,
  personal_importance_score TINYINT UNSIGNED NULL,
  current_momentum_score TINYINT UNSIGNED NULL,
  role_demand_score TINYINT UNSIGNED NULL,
  reflection_chips_json JSON NULL,
  current_supports_json JSON NULL,
  barriers_json JSON NULL,
  personal_strengths_json JSON NULL,
  personal_definition TEXT NULL,
  support_preference VARCHAR(64) NULL,
  private_reflection TEXT NULL,
  note_visibility ENUM(
    'private','selected-coach','selected-counselor','selected-mentor',
    'selected-spiritual-leader','mens-group','shared-with-plan','do-not-save'
  ) NOT NULL DEFAULT 'private',
  season_status ENUM('active','not-relevant','paused','exploring') NOT NULL DEFAULT 'active',
  prefer_not_to_answer TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ml_resp (assessment_id, domain_key),
  CONSTRAINT fk_ml_resp_assessment
    FOREIGN KEY (assessment_id) REFERENCES mens_life_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mens_life_support_requests (
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
  KEY idx_ml_support_assessment (assessment_id),
  CONSTRAINT fk_ml_support_assessment
    FOREIGN KEY (assessment_id) REFERENCES mens_life_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO mens_life_templates (agency_id, name, description, version, settings_json, is_active)
SELECT NULL,
  'Men''s Life Assessment',
  'Take an honest look at the life you are building, identify what is strong, and choose where greater intention could make the greatest difference.',
  1,
  JSON_OBJECT(
    'visualExperienceName', 'The Life Framework',
    'subtitle', 'Take an honest look at the life you are building, identify what is strong, and choose where greater intention could make the greatest difference.',
    'resultsTitle', 'Your Men''s Life Profile',
    'alternativeResultsTitle', 'Your Whole-Life Framework',
    'coachDashboardTitle', 'Men''s Life Development Overview',
    'programDashboardTitle', 'Men''s Development Dashboard',
    'enableImportance', true,
    'enableMomentum', true,
    'enableRoleDemand', false,
    'enableSupportRequests', true,
    'maxPriorities', 3,
    'disclaimer', 'This assessment is not a masculinity score, diagnosis, or measure of worth, toughness, or success. It does not replace qualified medical, financial, legal, spiritual, or mental-health support.',
    'indexClarification', 'The Men''s Life Index summarizes your current experience across the domains you completed. It does not measure masculinity, worth, character, success, or potential.'
  ),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM mens_life_templates WHERE agency_id IS NULL AND is_active = 1 LIMIT 1
);

SET @ml_tpl_id := (
  SELECT id FROM mens_life_templates WHERE agency_id IS NULL AND is_active = 1 ORDER BY id ASC LIMIT 1
);

INSERT INTO mens_life_template_domains
  (template_id, domain_key, label, short_label, definition, life_system, weight, color, icon,
   display_order, is_active, is_optional, is_sensitive, participant_versions_json, available_modes_json,
   score_labels_json, reflection_options_json, action_suggestions_json, related_assessment_ids_json,
   primary_question, reflection_prompt)
SELECT @ml_tpl_id, d.domain_key, d.label, d.short_label, d.definition, d.life_system, d.weight, d.color, d.icon,
  d.display_order, 1, d.is_optional, d.is_sensitive, d.participant_versions_json, d.available_modes_json,
  d.score_labels_json, d.reflection_options_json, d.action_suggestions_json, d.related_assessment_ids_json,
  d.primary_question, d.reflection_prompt
FROM (
  SELECT
    'purpose' AS domain_key,
    'Purpose' AS label,
    'Purpose' AS short_label,
    'The degree to which life feels meaningful, directed, and connected to responsibilities or goals you consider worthwhile. One permanent life purpose is not required.' AS definition,
    'meaning-and-direction' AS life_system,
    10.00 AS weight,
    '#1E3A5F' AS color,
    'compass' AS icon,
    1 AS display_order,
    0 AS is_optional,
    0 AS is_sensitive,
    JSON_ARRAY('young-adult','single-men','married-men','fathers','leadership','midlife','later-life','coaching','counseling') AS participant_versions_json,
    JSON_ARRAY('full','quick','annual-review','life-transition','mens-group','targeted') AS available_modes_json,
    JSON_OBJECT('low','Very little meaning or direction','mid','Purpose feels mixed or unclear','high','Strong and consistent meaning') AS score_labels_json,
    JSON_ARRAY('Work or career','Family','Fatherhood','Marriage or partnership','Faith or spirituality','Service','Leadership','Creativity','Personal goals','Major life transition','Current responsibilities feel disconnected','I am still exploring','I currently feel strong purpose','Other','Prefer not to answer') AS reflection_options_json,
    JSON_ARRAY('Define one meaningful short-term goal','Identify one role that deserves greater intention','Remove one disconnected commitment','Schedule reflection time','Speak with a mentor','Identify one contribution','Write a current-season purpose statement','Connect daily work with a larger reason') AS action_suggestions_json,
    JSON_ARRAY('values-alignment','personal-fulfillment') AS related_assessment_ids_json,
    'How strong and clear does your current sense of purpose feel?' AS primary_question,
    'What most affects your sense of purpose?' AS reflection_prompt
  UNION ALL SELECT
    'marriage','Marriage or Partnership','Marriage',
    'The degree to which an intimate partnership feels connected, respectful, trusting, collaborative, and intentionally supported.',
    'relationships-and-responsibility', 10.00, '#8B5E3C', 'rings', 2, 0, 1,
    JSON_ARRAY('married-men','fathers','midlife','later-life','coaching','counseling'),
    JSON_ARRAY('full','quick','annual-review','life-transition','mens-group','targeted'),
    JSON_OBJECT('low','Significant concerns or disconnection','mid','Mixed or inconsistent','high','Strong, connected, and well supported'),
    JSON_ARRAY('Communication','Trust','Friendship','Intimacy','Conflict','Parenting','Finances','Work demands','Household responsibilities','Appreciation','Time together','Shared vision','The relationship currently feels strong','Not currently married or partnered','Other','Prefer not to answer'),
    JSON_ARRAY('Schedule a weekly relationship check-in','Express one specific appreciation','Clarify one recurring responsibility','Plan uninterrupted time','Ask one curiosity-based question','Create a conflict pause-and-return agreement','Attend couples counseling or coaching when appropriate'),
    JSON_ARRAY('relationship-health'),
    'How strong and supported does your marriage or intimate partnership currently feel?',
    'What most affects the relationship?'
  UNION ALL SELECT
    'fatherhood','Fatherhood','Fatherhood',
    'The degree to which you feel present, responsible, connected, and intentional with children, stepchildren, grandchildren, mentees, or others in a developmental role. Fatherhood is not defined only through financial provision.',
    'relationships-and-responsibility', 10.00, '#3F6212', 'users', 3, 0, 0,
    JSON_ARRAY('fathers','married-men','midlife','later-life','coaching','counseling','leadership'),
    JSON_ARRAY('full','quick','annual-review','life-transition','mens-group','targeted'),
    JSON_OBJECT('low','Significant disconnection or uncertainty','mid','Mixed or inconsistent','high','Present, connected, and intentional'),
    JSON_ARRAY('Limited time','Work demands','Co-parenting','Distance','Communication','Discipline','Emotional connection','Different developmental stages','Technology','Conflict with another caregiver','Feeling unsure what is needed','I want to be more present','This role currently feels strong','I do not currently have this role','Mentorship is more relevant to me','Other','Prefer not to answer'),
    JSON_ARRAY('Protect recurring one-on-one time','Ask a child or mentee one open question','Establish one consistent routine','Apologize and repair a recent mistake','Reduce device use during shared time','Clarify co-parenting responsibilities','Create a shared activity','Ask another father or mentor for support'),
    JSON_ARRAY(),
    'How strong and intentional does your current role as a father, caregiver, or mentor feel?',
    'What most affects this role?'
  UNION ALL SELECT
    'friendships','Friendships','Friendships',
    'The degree to which you have meaningful, honest, reciprocal, and dependable friendships. Quality is not measured by number of friends.',
    'relationships-and-responsibility', 10.00, '#0F766E', 'handshake', 4, 0, 0,
    JSON_ARRAY('young-adult','single-men','married-men','fathers','leadership','midlife','later-life','coaching','counseling'),
    JSON_ARRAY('full','quick','annual-review','life-transition','mens-group','targeted'),
    JSON_OBJECT('low','Very isolated or unsupported','mid','Friendships feel limited or mixed','high','Strong, honest, and dependable'),
    JSON_ARRAY('Lack of time','Distance','Work demands','Parenting','I rarely initiate contact','Conversations remain surface-level','Difficulty asking for support','Lack of shared activities','Friendships have changed across life stages','I want deeper rather than more friendships','I have dependable friends','I feel isolated','Other','Prefer not to answer'),
    JSON_ARRAY('Contact one friend','Schedule a recurring conversation','Plan one shared activity','Ask for support directly','Join a men''s group or community','Reconnect with a past friend when appropriate','Practice one honest statement','Create a monthly friendship routine'),
    JSON_ARRAY(),
    'How strong and meaningful do your current friendships feel?',
    'What most affects friendships?'
  UNION ALL SELECT
    'leadership','Leadership','Leadership',
    'The degree to which you use influence, responsibility, judgment, courage, and service in ways that align with personal values. Leadership is not only occupational authority.',
    'strength-and-stewardship', 10.00, '#1D4ED8', 'flag', 5, 0, 0,
    JSON_ARRAY('young-adult','single-men','married-men','fathers','leadership','midlife','later-life','coaching','counseling'),
    JSON_ARRAY('full','quick','annual-review','life-transition','mens-group','targeted'),
    JSON_OBJECT('low','Leadership feels unclear or ineffective','mid','Leadership is inconsistent','high','Leadership is clear, responsible, and effective'),
    JSON_ARRAY('Lack of opportunity','Too much responsibility','Unclear authority','Difficulty making decisions','Fear of conflict','Difficulty delegating','Communication','Lack of feedback','Lack of support','Overcommitment','Developing others','Leadership currently feels strong','I contribute without a formal title','Other'),
    JSON_ARRAY('Clarify one decision','Request leadership feedback','Mentor one person','Delegate one responsibility','Communicate one expectation clearly','Address one avoided issue','Create a leadership principle','Protect a decision-making block'),
    JSON_ARRAY(),
    'How effectively are you currently using leadership and influence?',
    'What most affects leadership?'
  UNION ALL SELECT
    'fitness','Fitness and Physical Capacity','Fitness',
    'The degree to which physical activity, strength, endurance, mobility, recovery, nutrition, sleep, and health routines support the life you want. Fitness is not defined by body size or appearance.',
    'strength-and-stewardship', 10.00, '#15803D', 'activity', 6, 0, 0,
    JSON_ARRAY('young-adult','single-men','married-men','fathers','leadership','midlife','later-life','coaching','counseling'),
    JSON_ARRAY('full','quick','annual-review','life-transition','mens-group','targeted'),
    JSON_OBJECT('low','Physical capacity currently feels very limited','mid','Fitness and recovery are inconsistent','high','Strong, sustainable, and supportive'),
    JSON_ARRAY('Lack of time','Work schedule','Parenting','Sleep','Stress','Injury','Health limitations','Nutrition','Inconsistent routine','Too much intensity','Lack of recovery','Lack of a clear plan','Fitness currently feels strong','Other','Prefer not to answer'),
    JSON_ARRAY('Schedule two or three realistic movement sessions','Protect sleep','Add mobility work','Schedule a medical appointment','Reduce an unsustainable training load','Create a meal-preparation routine','Take regular walking breaks','Define one functional fitness goal'),
    JSON_ARRAY('athlete-readiness'),
    'How well does your current physical fitness and recovery support the life you want to live?',
    'What most affects fitness?'
  UNION ALL SELECT
    'finances','Finances','Finances',
    'The degree to which financial habits support stability, responsibility, reduced pressure, personal values, and meaningful choice. This does not replace qualified financial advice. Worth is not defined by income.',
    'strength-and-stewardship', 10.00, '#A16207', 'wallet', 7, 0, 1,
    JSON_ARRAY('young-adult','single-men','married-men','fathers','leadership','midlife','later-life','coaching','counseling'),
    JSON_ARRAY('full','quick','annual-review','life-transition','mens-group','targeted'),
    JSON_OBJECT('low','Significant uncertainty or pressure','mid','Mixed or inconsistent','high','Stable, intentional, and aligned'),
    JSON_ARRAY('Income','Debt','Spending','Saving','Unexpected expenses','Lack of a budget','Family responsibilities','Financial communication','Different household priorities','Career uncertainty','Retirement','Financial habits currently feel aligned','I avoid reviewing finances','Other','Prefer not to answer'),
    JSON_ARRAY('Review current spending','Create a basic monthly plan','Establish an emergency-fund target','Automate a savings amount','Schedule a financial conversation','Review debt','Clarify household responsibilities','Meet with a qualified financial professional','Define one financial freedom milestone'),
    JSON_ARRAY(),
    'How stable, intentional, and aligned do your current finances feel?',
    'What most affects financial well-being?'
  UNION ALL SELECT
    'spiritual_life','Spiritual Life','Spiritual',
    'The degree to which faith, spirituality, personal beliefs, worship, prayer, reflection, meaning, and spiritual community are represented according to your worldview. Optional and worldview-sensitive; does not measure religious worth.',
    'meaning-and-direction', 10.00, '#6D28D9', 'sun', 8, 1, 1,
    JSON_ARRAY('young-adult','single-men','married-men','fathers','leadership','midlife','later-life','coaching','counseling'),
    JSON_ARRAY('full','quick','annual-review','life-transition','mens-group','targeted'),
    JSON_OBJECT('low','Very disconnected or unclear','mid','Mixed or inconsistent','high','Strongly connected and integrated'),
    JSON_ARRAY('Lack of time','Lack of community','Inconsistent practice','Doubt or uncertainty','Religious hurt','Difficult life circumstances','Fatigue','Lack of privacy','Lack of clarity','Spiritual life is currently meaningful','I am exploring what I believe','My beliefs and actions feel disconnected','This domain does not fit my worldview','Other','Prefer not to answer'),
    JSON_ARRAY('Create a brief prayer or reflection rhythm','Join a faith or meaning-centered community','Speak with a trusted spiritual leader','Read or listen to a spiritual resource','Participate in service','Schedule a quiet reflection period','Allow space for questions without forcing certainty'),
    JSON_ARRAY(),
    'How connected and intentional does your spiritual life currently feel?',
    'What most affects spiritual life?'
  UNION ALL SELECT
    'emotional_health','Emotional Health','Emotional',
    'The degree to which you can recognize emotions, communicate honestly, manage stress, recover from difficulty, and access appropriate support. Emotional expression is not weakness; suppression is not strength.',
    'inner-stability', 10.00, '#0E7490', 'heart', 9, 0, 1,
    JSON_ARRAY('young-adult','single-men','married-men','fathers','leadership','midlife','later-life','coaching','counseling'),
    JSON_ARRAY('full','quick','annual-review','life-transition','mens-group','targeted'),
    JSON_OBJECT('low','Emotions frequently feel overwhelming, shut down, or inaccessible','mid','Emotional health feels mixed','high','Emotions feel understandable, manageable, and supported'),
    JSON_ARRAY('Stress','Work','Marriage or relationship','Fatherhood','Finances','Health','Grief or loss','Anger','Isolation','Difficulty identifying emotions','Difficulty asking for help','Lack of recovery','Emotional health currently feels strong','Other','Prefer not to answer'),
    JSON_ARRAY('Name one emotion daily','Speak honestly with a trusted person','Schedule recovery time','Use a brief grounding exercise','Reduce one unsustainable demand','Speak with a counselor','Create an anger pause-and-return plan','Identify early stress signals','Create a personal support list'),
    JSON_ARRAY('teen-wellbeing'),
    'How well are you currently understanding, managing, and communicating your emotional experience?',
    'What most affects emotional health?'
  UNION ALL SELECT
    'legacy','Legacy','Legacy',
    'The degree to which current choices reflect the influence, values, relationships, contribution, and example you want to leave behind. Legacy is not only career, wealth, fame, or biological children.',
    'meaning-and-direction', 10.00, '#92400E', 'landmark', 10, 0, 0,
    JSON_ARRAY('young-adult','single-men','married-men','fathers','leadership','midlife','later-life','coaching','counseling'),
    JSON_ARRAY('full','quick','annual-review','life-transition','mens-group','targeted'),
    JSON_OBJECT('low','Very disconnected from the legacy I want','mid','Some parts align','high','Strongly aligned and intentional'),
    JSON_ARRAY('Family','Fatherhood','Mentorship','Leadership','Work','Service','Faith or spirituality','Financial stewardship','Community','Character','Traditions','Knowledge or skills','Current behavior feels aligned','I have not thought about legacy','Other','Prefer not to answer'),
    JSON_ARRAY('Write a one-paragraph legacy statement','Schedule time with a child or mentee','Document a family story','Teach one skill','Create one recurring tradition','Begin a service commitment','Align one financial decision with long-term values','Identify one character quality to practice'),
    JSON_ARRAY('personal-fulfillment','values-alignment'),
    'How closely does your current life reflect the legacy you want to build?',
    'What most affects legacy?'
) AS d
WHERE @ml_tpl_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM mens_life_template_domains x
    WHERE x.template_id = @ml_tpl_id AND x.domain_key = d.domain_key
  );
