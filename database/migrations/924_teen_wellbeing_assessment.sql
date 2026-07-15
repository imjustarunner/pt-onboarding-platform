-- Migration 924: Teen Well-Being Assessment (Well-Being Constellation)
-- Age-appropriate well-being check-in for teens ~12–18. Not a clinical diagnosis tool.

CREATE TABLE IF NOT EXISTS teen_wellbeing_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = platform default',
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  settings_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_twb_templates_agency (agency_id),
  KEY idx_twb_templates_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teen_wellbeing_template_domains (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  short_label VARCHAR(64) NOT NULL,
  definition TEXT NULL,
  wellbeing_system ENUM(
    'inner-well-being',
    'relationships-and-support',
    'daily-functioning',
    'regulation-and-recovery'
  ) NOT NULL,
  weight DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  color VARCHAR(16) NOT NULL,
  icon VARCHAR(64) NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_sensitive TINYINT(1) NOT NULL DEFAULT 0,
  age_versions_json JSON NULL,
  available_modes_json JSON NULL,
  score_labels_json JSON NULL,
  reflection_options_json JSON NULL,
  support_suggestions_json JSON NULL,
  primary_question TEXT NULL,
  reflection_prompt TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_twb_tpl_domain (template_id, domain_key),
  KEY idx_twb_tpl_domain_order (template_id, display_order),
  CONSTRAINT fk_twb_tpl_domain_template
    FOREIGN KEY (template_id) REFERENCES teen_wellbeing_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teen_wellbeing_assessments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL,
  template_id BIGINT UNSIGNED NOT NULL,
  template_version INT NOT NULL DEFAULT 1,
  participant_user_id INT NULL,
  client_id INT NULL,
  counselor_user_id INT NULL,
  coach_user_id INT NULL,
  mode ENUM('full','weekly','quick','transition','targeted') NOT NULL DEFAULT 'full',
  age_version ENUM('ages-12-to-14','ages-15-to-18','transition-age-youth','custom') NOT NULL DEFAULT 'ages-15-to-18',
  setting VARCHAR(64) NULL,
  status ENUM('not_started','in_progress','completed','reviewed','archived') NOT NULL DEFAULT 'not_started',
  access_token VARCHAR(64) NOT NULL,
  context_json JSON NULL,
  summary_json JSON NULL,
  teen_wellbeing_index INT NULL,
  selected_priorities_json JSON NULL,
  wellbeing_plans_json JSON NULL,
  support_network_json JSON NULL,
  weekly_checkins_json JSON NULL,
  reviewed_at DATETIME NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_twb_access_token (access_token),
  KEY idx_twb_assess_agency (agency_id),
  KEY idx_twb_assess_participant (participant_user_id),
  KEY idx_twb_assess_status (status),
  KEY idx_twb_assess_mode (mode),
  CONSTRAINT fk_twb_assess_template
    FOREIGN KEY (template_id) REFERENCES teen_wellbeing_templates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teen_wellbeing_responses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  current_experience_score TINYINT UNSIGNED NULL,
  importance_score TINYINT UNSIGNED NULL,
  support_need_score TINYINT UNSIGNED NULL,
  reflection_chips_json JSON NULL,
  support_preference VARCHAR(64) NULL,
  written_reflection TEXT NULL,
  reflection_visibility ENUM(
    'private',
    'counselor',
    'selected-trusted-adult',
    'caregiver',
    'shared-with-plan',
    'do-not-save'
  ) NOT NULL DEFAULT 'private',
  prefer_not_to_answer TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_twb_resp (assessment_id, domain_key),
  CONSTRAINT fk_twb_resp_assessment
    FOREIGN KEY (assessment_id) REFERENCES teen_wellbeing_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teen_wellbeing_support_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NULL,
  requested_support VARCHAR(64) NOT NULL,
  urgency ENUM('routine','soon','today','urgent') NOT NULL DEFAULT 'routine',
  message TEXT NULL,
  message_visibility ENUM('participant-and-recipient','authorized-support-team','restricted') NOT NULL DEFAULT 'participant-and-recipient',
  status ENUM(
    'draft','submitted','acknowledged','contact_attempted','scheduled',
    'in_progress','completed','closed','unable_to_reach'
  ) NOT NULL DEFAULT 'draft',
  assigned_to_user_id INT NULL,
  expected_response_by DATETIME NULL,
  acknowledged_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_twb_support_assessment (assessment_id),
  CONSTRAINT fk_twb_support_assessment
    FOREIGN KEY (assessment_id) REFERENCES teen_wellbeing_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teen_wellbeing_safety_followups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  participant_user_id INT NULL,
  trigger_type ENUM(
    'direct-safety-response','written-statement','urgent-support-request','manual-review'
  ) NOT NULL,
  status ENUM(
    'pending-review','reviewed','contact-attempted','support-connected','escalated','resolved','closed'
  ) NOT NULL DEFAULT 'pending-review',
  assigned_to_user_id INT NULL,
  visibility ENUM('authorized-safety-team-only') NOT NULL DEFAULT 'authorized-safety-team-only',
  follow_up_summary TEXT NULL,
  next_action TEXT NULL,
  reviewed_at DATETIME NULL,
  resolved_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_twb_safety_assessment (assessment_id),
  CONSTRAINT fk_twb_safety_assessment
    FOREIGN KEY (assessment_id) REFERENCES teen_wellbeing_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teen_wellbeing_daily_checkins (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  participant_user_id INT NULL,
  assessment_id BIGINT UNSIGNED NULL,
  access_token VARCHAR(64) NULL,
  check_in_date DATE NOT NULL,
  overall_mood_score TINYINT UNSIGNED NULL,
  stress_manageability_score TINYINT UNSIGNED NULL,
  energy_score TINYINT UNSIGNED NULL,
  sleep_quality_score TINYINT UNSIGNED NULL,
  school_pressure_score TINYINT UNSIGNED NULL,
  social_connection_score TINYINT UNSIGNED NULL,
  activity_enjoyment_score TINYINT UNSIGNED NULL,
  support_requested TINYINT(1) NOT NULL DEFAULT 0,
  private_note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_twb_daily_date (check_in_date),
  KEY idx_twb_daily_token (access_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO teen_wellbeing_templates (agency_id, name, description, version, settings_json, is_active)
SELECT NULL,
  'Teen Well-Being Assessment',
  'Explore what is going well, what feels difficult, and what could help life feel more supported and manageable.',
  1,
  JSON_OBJECT(
    'visualExperienceName', 'Well-Being Constellation',
    'subtitle', 'Explore what is going well, what feels difficult, and what could help life feel more supported and manageable.',
    'resultsTitle', 'Your Well-Being Profile',
    'caregiverResultsTitle', 'Teen Support Overview',
    'counselorDashboardTitle', 'Teen Well-Being Support Overview',
    'enableImportance', true,
    'enableSupportNeed', true,
    'enableSupportRequests', true,
    'enableSafetyPathway', true,
    'enableQuickExit', true,
    'quickExitUrl', 'https://www.google.com',
    'maxPriorities', 3,
    'maxDomainWeight', 20,
    'disclaimer', 'This assessment is not a diagnosis, mental-health evaluation, depression test, anxiety test, or personality test. It reflects how life feels right now and does not replace a licensed professional.',
    'privacyNotice', 'Most of your reflections are private unless you choose to share them. If your responses suggest that you or someone else may be in immediate danger, a qualified adult may need to follow up according to the program’s safety policy.',
    'indexClarification', 'The Teen Well-Being Index summarizes how different areas of life feel right now. It is not a diagnosis and does not define who you are.'
  ),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM teen_wellbeing_templates WHERE agency_id IS NULL AND is_active = 1 LIMIT 1
);

SET @twb_tpl_id := (
  SELECT id FROM teen_wellbeing_templates WHERE agency_id IS NULL AND is_active = 1 ORDER BY id ASC LIMIT 1
);

INSERT INTO teen_wellbeing_template_domains
  (template_id, domain_key, label, short_label, definition, wellbeing_system, weight, color, icon,
   display_order, is_active, is_sensitive, age_versions_json, available_modes_json, score_labels_json,
   reflection_options_json, support_suggestions_json, primary_question, reflection_prompt)
SELECT @twb_tpl_id, d.domain_key, d.label, d.short_label, d.definition, d.wellbeing_system, d.weight, d.color, d.icon,
  d.display_order, 1, d.is_sensitive, d.age_versions_json, d.available_modes_json, d.score_labels_json,
  d.reflection_options_json, d.support_suggestions_json, d.primary_question, d.reflection_prompt
FROM (
  SELECT
    'confidence' AS domain_key,
    'Confidence' AS label,
    'Confidence' AS short_label,
    'How much you trust your abilities, decisions, effort, and ability to handle challenges.' AS definition,
    'inner-well-being' AS wellbeing_system,
    10.00 AS weight,
    '#0EA5E9' AS color,
    'spark' AS icon,
    1 AS display_order,
    0 AS is_sensitive,
    JSON_ARRAY('ages-12-to-14','ages-15-to-18','transition-age-youth') AS age_versions_json,
    JSON_ARRAY('full','weekly','transition','targeted') AS available_modes_json,
    JSON_OBJECT('low','Very little confidence','mid','Depends on the situation','high','Generally trust myself') AS score_labels_json,
    JSON_ARRAY('Grades','Appearance','Sports or activities','Friendships','Family feedback','Teacher or coach feedback','Comparing myself with others','Social media','Mistakes','Trying something new','Confidence is currently strong','Other','Prefer not to answer') AS reflection_options_json,
    JSON_ARRAY('Identify recent evidence of growth','Practice one small challenge','Create a strengths list','Reduce one unhelpful comparison','Ask a trusted person for specific feedback','Practice supportive self-talk','Track small wins') AS support_suggestions_json,
    'How confident do you currently feel in yourself and your ability to handle challenges?' AS primary_question,
    'What most affects your confidence?' AS reflection_prompt
  UNION ALL SELECT
    'friendships','Friendships','Friends',
    'How supported, respected, included, and connected you feel in friendships and peer relationships.',
    'relationships-and-support', 10.00, '#22C55E', 'users', 2, 0,
    JSON_ARRAY('ages-12-to-14','ages-15-to-18','transition-age-youth'),
    JSON_ARRAY('full','weekly','transition','targeted'),
    JSON_OBJECT('low','Very alone or unsupported','mid','Friendships feel mixed','high','Strongly connected and supported'),
    JSON_ARRAY('I have close friends I trust','I feel left out','Friend groups change often','Gossip','Conflict','Online communication','Social pressure','Difficulty meeting people','I do not feel understood','I give more support than I receive','I need stronger boundaries','Friendships are currently going well','Other','Prefer not to answer'),
    JSON_ARRAY('Contact one trusted friend','Join a group or activity','Practice one clear boundary','Ask for help with a conflict','Reduce time in a harmful group chat','Plan one positive shared activity','Identify what a healthy friendship means'),
    'How supported and connected do you currently feel in your friendships?',
    'What most affects your friendships?'
  UNION ALL SELECT
    'family','Family','Family',
    'How safe, supported, understood, respected, and connected you currently feel within family or household relationships. Family may include parents, guardians, foster family, chosen family, relatives, siblings, or other household relationships.',
    'relationships-and-support', 10.00, '#F59E0B', 'home', 3, 1,
    JSON_ARRAY('ages-12-to-14','ages-15-to-18','transition-age-youth'),
    JSON_ARRAY('full','weekly','transition','targeted'),
    JSON_OBJECT('low','Very unsupported or uncomfortable','mid','Family life feels mixed','high','Strongly supported and understood'),
    JSON_ARRAY('Communication','Conflict','Rules or expectations','Feeling understood','Feeling supported','Privacy','Time together','Household stress','Changes in the family','Caregiving responsibilities','Feeling compared with others','Family life is currently going well','Other','Prefer not to answer'),
    JSON_ARRAY('Calm conversation prompt','Request for support','Shared schedule','Trusted-adult plan','Boundary statement'),
    'How supported and understood do you currently feel within your family or household?',
    'What most affects family life?'
  UNION ALL SELECT
    'school','School','School',
    'How manageable, supportive, meaningful, and successful school currently feels.',
    'daily-functioning', 10.00, '#6366F1', 'book', 4, 0,
    JSON_ARRAY('ages-12-to-14','ages-15-to-18','transition-age-youth'),
    JSON_ARRAY('full','weekly','quick','transition','targeted'),
    JSON_OBJECT('low','Extremely difficult','mid','Mixed or inconsistent','high','Manageable and generally positive'),
    JSON_ARRAY('Workload','Grades','Tests','Missing assignments','Organization','Teachers','Attendance','Friendships','Bullying','Motivation','Understanding the material','Future pressure','School is currently going well','Other','Prefer not to answer'),
    JSON_ARRAY('Ask one teacher for help','Create an assignment list','Schedule tutoring','Break one assignment into steps','Identify missing work','Speak with a school counselor','Create a test-preparation plan','Establish a regular homework start time'),
    'How manageable and positive does school currently feel?',
    'What most affects your school experience?'
  UNION ALL SELECT
    'stress','Stress','Stress',
    'How manageable current pressures feel and how effectively you can recover after stressful experiences. Higher scores mean stress feels more manageable.',
    'regulation-and-recovery', 10.00, '#EF4444', 'wave', 5, 0,
    JSON_ARRAY('ages-12-to-14','ages-15-to-18','transition-age-youth'),
    JSON_ARRAY('full','weekly','quick','transition','targeted'),
    JSON_OBJECT('low','Overwhelming most of the time','mid','Manageable sometimes','high','Generally manageable'),
    JSON_ARRAY('School','Grades','Family','Friendships','Activities','Future plans','Money','Appearance','Social media','Lack of time','Health concerns','World events','I am not sure','Other','Prefer not to answer'),
    JSON_ARRAY('Short breathing exercise','Identify the next small step','Take a movement break','Reduce one nonessential demand','Talk with a trusted adult','Create a short stress plan','Use a calm location','Schedule recovery time'),
    'How manageable does your current stress feel?',
    'What creates the most stress?'
  UNION ALL SELECT
    'sleep','Sleep','Sleep',
    'How consistently you receive enough restorative sleep and maintain a workable sleep routine.',
    'regulation-and-recovery', 10.00, '#8B5CF6', 'moon', 6, 0,
    JSON_ARRAY('ages-12-to-14','ages-15-to-18','transition-age-youth'),
    JSON_ARRAY('full','weekly','quick','transition','targeted'),
    JSON_OBJECT('low','Almost never rested','mid','Rest varies','high','Usually well rested'),
    JSON_ARRAY('Phone or gaming','Homework','Activities','Stress or worry','Trouble falling asleep','Waking during the night','Noise','Household schedule','Early school start','Irregular bedtime','Health concerns','Sleep is currently going well','Other','Prefer not to answer'),
    JSON_ARRAY('Create a short wind-down routine','Charge the phone outside the bed area','Select a realistic bedtime range','Reduce late caffeine','Prepare school materials earlier','Discuss sleep concerns with a caregiver or qualified professional','Track sleep for one week without judgment'),
    'How rested do you usually feel after sleeping?',
    'What most affects your sleep?'
  UNION ALL SELECT
    'identity','Identity','Identity',
    'How comfortable you feel understanding, expressing, and developing who you are. Exploration is normal and is not treated as confusion or a problem.',
    'inner-well-being', 10.00, '#EC4899', 'compass', 7, 1,
    JSON_ARRAY('ages-12-to-14','ages-15-to-18','transition-age-youth'),
    JSON_ARRAY('full','transition','targeted'),
    JSON_OBJECT('low','Very uncomfortable or unsure','mid','Still figuring things out','high','Comfortable being myself'),
    JSON_ARRAY('Family expectations','Friend expectations','School environment','Social media','Culture','Faith or beliefs','Interests','Appearance','Future plans','Feeling different','Pressure to fit in','I feel comfortable being myself','Other','Prefer not to answer'),
    JSON_ARRAY('Identify personal strengths','Write three values that matter','Spend time in a supportive environment','Reduce one harmful comparison','Speak with a trusted mentor','Explore one interest','Create a personal identity statement'),
    'How comfortable do you currently feel being yourself and figuring out who you are?',
    'What most affects how you feel about your identity?'
  UNION ALL SELECT
    'activities','Activities','Activities',
    'How balanced, enjoyable, meaningful, and manageable sports, clubs, hobbies, work, and other activities currently feel.',
    'daily-functioning', 10.00, '#14B8A6', 'activity', 8, 0,
    JSON_ARRAY('ages-12-to-14','ages-15-to-18','transition-age-youth'),
    JSON_ARRAY('full','weekly','transition','targeted'),
    JSON_OBJECT('low','Mostly stressful or draining','mid','Activities feel mixed','high','Enjoyable and manageable'),
    JSON_ARRAY('Too many activities','Not enough activities','Schedule pressure','Coach or leader expectations','Competition','Teammates','Work responsibilities','Lack of enjoyment','Transportation','Cost','Activities currently feel balanced','I want to try something new','Other','Prefer not to answer'),
    JSON_ARRAY('Review the weekly schedule','Reduce one nonessential commitment','Try one new activity','Schedule recovery time','Speak with a coach or leader','Protect one free period','Identify which activity feels most meaningful'),
    'How positive and manageable do your current activities feel?',
    'What most affects your activities?'
  UNION ALL SELECT
    'purpose','Purpose','Purpose',
    'How much direction, meaning, motivation, or connection to future goals you currently feel. You do not need a full career plan.',
    'inner-well-being', 10.00, '#F97316', 'flag', 9, 0,
    JSON_ARRAY('ages-15-to-18','transition-age-youth'),
    JSON_ARRAY('full','transition','targeted'),
    JSON_OBJECT('low','Very little direction','mid','Some direction','high','Strong sense of direction and purpose'),
    JSON_ARRAY('Future uncertainty','School goals','Career ideas','Family expectations','Helping others','Faith or beliefs','Activities','Relationships','Creativity','Feeling useful','I am still exploring','I currently feel a strong sense of purpose','Other','Prefer not to answer'),
    JSON_ARRAY('Choose one short-term goal','Explore one career or interest','Volunteer or help someone','Meet with a mentor','Identify personal values','Begin a small project','Create a future-possibilities list'),
    'How much direction or purpose do you currently feel in your life?',
    'What most affects your sense of purpose?'
  UNION ALL SELECT
    'happiness','Happiness','Happiness',
    'How much enjoyment, positive emotion, connection, satisfaction, and hope you currently experience. Happiness is not the only measure of well-being.',
    'inner-well-being', 10.00, '#EAB308', 'sun', 10, 0,
    JSON_ARRAY('ages-12-to-14','ages-15-to-18','transition-age-youth'),
    JSON_ARRAY('full','weekly','quick','transition','targeted'),
    JSON_OBJECT('low','Almost never','mid','Sometimes','high','Frequently'),
    JSON_ARRAY('Friendships','Family','School','Activities','Stress','Sleep','Social media','Health','Feeling lonely','Lack of free time','Uncertainty about the future','I currently experience regular enjoyment','Other','Prefer not to answer'),
    JSON_ARRAY('Plan one enjoyable activity','Spend time with a supportive person','Reduce one draining commitment','Spend time outside','Return to a paused hobby','Identify one positive moment each day','Speak with a trusted adult if enjoyment has been absent for an extended period'),
    'How often does life currently include moments of happiness, enjoyment, or hope?',
    'What most affects happiness or enjoyment?'
) AS d
WHERE @twb_tpl_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM teen_wellbeing_template_domains x
    WHERE x.template_id = @twb_tpl_id AND x.domain_key = d.domain_key
  );
