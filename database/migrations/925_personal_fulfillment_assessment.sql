-- Migration 925: Personal Fulfillment Assessment (Fulfillment Horizon)
-- Distinct from Life Balance / Values / Teen Well-Being — beacon horizon visualization, not a wheel.

CREATE TABLE IF NOT EXISTS personal_fulfillment_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = platform default',
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  settings_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_pf_templates_agency (agency_id),
  KEY idx_pf_templates_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_fulfillment_template_domains (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  short_label VARCHAR(64) NOT NULL,
  definition TEXT NULL,
  fulfillment_system ENUM(
    'meaning-and-direction',
    'positive-experience',
    'capability-and-progress',
    'connection-and-autonomy'
  ) NOT NULL,
  weight DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  color VARCHAR(16) NOT NULL,
  icon VARCHAR(64) NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_optional TINYINT(1) NOT NULL DEFAULT 0,
  participant_versions_json JSON NULL,
  available_modes_json JSON NULL,
  score_labels_json JSON NULL,
  reflection_options_json JSON NULL,
  support_suggestions_json JSON NULL,
  primary_question TEXT NULL,
  reflection_prompt TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pf_tpl_domain (template_id, domain_key),
  KEY idx_pf_tpl_domain_order (template_id, display_order),
  CONSTRAINT fk_pf_tpl_domain_template
    FOREIGN KEY (template_id) REFERENCES personal_fulfillment_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_fulfillment_assessments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL,
  template_id BIGINT UNSIGNED NOT NULL,
  template_version INT NOT NULL DEFAULT 1,
  participant_user_id INT NULL,
  client_id INT NULL,
  coach_user_id INT NULL,
  counselor_user_id INT NULL,
  mentor_user_id INT NULL,
  mode ENUM('full','quick','life-transition','recovery-review','targeted') NOT NULL DEFAULT 'full',
  participant_version VARCHAR(64) NOT NULL DEFAULT 'general-adult',
  status ENUM('not_started','in_progress','completed','reviewed','archived') NOT NULL DEFAULT 'not_started',
  access_token VARCHAR(64) NOT NULL,
  context_json JSON NULL,
  summary_json JSON NULL,
  personal_fulfillment_index INT NULL,
  weighted_fulfillment_index INT NULL,
  selected_priorities_json JSON NULL,
  fulfillment_plans_json JSON NULL,
  experiments_json JSON NULL,
  fulfillment_sources_json JSON NULL,
  reviewed_at DATETIME NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pf_access_token (access_token),
  KEY idx_pf_assess_agency (agency_id),
  KEY idx_pf_assess_participant (participant_user_id),
  KEY idx_pf_assess_status (status),
  KEY idx_pf_assess_mode (mode),
  CONSTRAINT fk_pf_assess_template
    FOREIGN KEY (template_id) REFERENCES personal_fulfillment_templates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_fulfillment_responses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  current_fulfillment_score TINYINT UNSIGNED NULL,
  personal_importance_score TINYINT UNSIGNED NULL,
  growth_momentum_score TINYINT UNSIGNED NULL,
  reflection_chips_json JSON NULL,
  fulfillment_sources_json JSON NULL,
  barriers_json JSON NULL,
  personal_definition TEXT NULL,
  support_preference VARCHAR(64) NULL,
  private_note TEXT NULL,
  note_visibility ENUM(
    'private','selected-coach','selected-counselor','selected-mentor','shared-with-plan','do-not-save'
  ) NOT NULL DEFAULT 'private',
  season_status ENUM('active','not-relevant','paused','exploring') NOT NULL DEFAULT 'active',
  prefer_not_to_answer TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pf_resp (assessment_id, domain_key),
  CONSTRAINT fk_pf_resp_assessment
    FOREIGN KEY (assessment_id) REFERENCES personal_fulfillment_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_fulfillment_support_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NULL,
  requested_support VARCHAR(64) NOT NULL,
  message TEXT NULL,
  message_visibility ENUM('participant-and-recipient','authorized-support-team','restricted') NOT NULL DEFAULT 'participant-and-recipient',
  status ENUM('draft','submitted','acknowledged','scheduled','in_progress','completed','closed') NOT NULL DEFAULT 'draft',
  assigned_to_user_id INT NULL,
  expected_response_by DATETIME NULL,
  acknowledged_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_pf_support_assessment (assessment_id),
  CONSTRAINT fk_pf_support_assessment
    FOREIGN KEY (assessment_id) REFERENCES personal_fulfillment_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO personal_fulfillment_templates (agency_id, name, description, version, settings_json, is_active)
SELECT NULL,
  'Personal Fulfillment Assessment',
  'Explore what currently gives your life meaning, satisfaction, energy, and hope, then choose what deserves more intentional attention.',
  1,
  JSON_OBJECT(
    'visualExperienceName', 'Fulfillment Horizon',
    'subtitle', 'Explore what currently gives your life meaning, satisfaction, energy, and hope, then choose what deserves more intentional attention.',
    'resultsTitle', 'Your Personal Fulfillment Profile',
    'coachDashboardTitle', 'Personal Fulfillment Overview',
    'enableImportance', true,
    'enableMomentum', true,
    'enableSupportRequests', true,
    'maxPriorities', 3,
    'disclaimer', 'This assessment is not a mental-health diagnosis, depression assessment, personality test, or measure of worth. It reflects how fulfilling life feels right now and does not replace qualified care.',
    'indexClarification', 'The Personal Fulfillment Index summarizes current satisfaction across the domains you completed. It does not measure your worth, success, productivity, or mental health.'
  ),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM personal_fulfillment_templates WHERE agency_id IS NULL AND is_active = 1 LIMIT 1
);

SET @pf_tpl_id := (
  SELECT id FROM personal_fulfillment_templates WHERE agency_id IS NULL AND is_active = 1 ORDER BY id ASC LIMIT 1
);

INSERT INTO personal_fulfillment_template_domains
  (template_id, domain_key, label, short_label, definition, fulfillment_system, weight, color, icon,
   display_order, is_active, is_optional, participant_versions_json, available_modes_json, score_labels_json,
   reflection_options_json, support_suggestions_json, primary_question, reflection_prompt)
SELECT @pf_tpl_id, d.domain_key, d.label, d.short_label, d.definition, d.fulfillment_system, d.weight, d.color, d.icon,
  d.display_order, 1, 0, d.participant_versions_json, d.available_modes_json, d.score_labels_json,
  d.reflection_options_json, d.support_suggestions_json, d.primary_question, d.reflection_prompt
FROM (
  SELECT
    'purpose' AS domain_key,
    'Purpose' AS label,
    'Purpose' AS short_label,
    'The degree to which life feels meaningful, directed, and connected to something you consider worthwhile.' AS definition,
    'meaning-and-direction' AS fulfillment_system,
    10.00 AS weight,
    '#0F766E' AS color,
    'compass' AS icon,
    1 AS display_order,
    JSON_ARRAY('general-adult','young-adult','midlife','later-life','career-coaching','life-coaching','counseling') AS participant_versions_json,
    JSON_ARRAY('full','quick','life-transition','recovery-review','targeted') AS available_modes_json,
    JSON_OBJECT('low','Very little meaning','mid','Some meaning, inconsistent','high','Strong and consistent meaning') AS score_labels_json,
    JSON_ARRAY('Work or career','Family','Relationships','Faith or spirituality','Service','Creativity','Learning','Leadership','Caregiving','Personal goals','Major life transition','I am still exploring','I currently feel strong purpose','Other','Prefer not to answer') AS reflection_options_json,
    JSON_ARRAY('Identify one meaningful short-term goal','Reconnect with a valued responsibility','Begin a small service activity','Schedule time for reflection','Speak with a mentor','Write a personal purpose statement','Remove one commitment disconnected from current priorities') AS support_suggestions_json,
    'How much meaning and direction do you currently experience in your life?' AS primary_question,
    'What most affects your sense of purpose?' AS reflection_prompt
  UNION ALL SELECT
    'joy','Joy','Joy',
    'The degree to which life currently contains enjoyment, delight, play, pleasure, laughter, and positive experiences.',
    'positive-experience', 10.00, '#EA580C', 'sun', 2,
    JSON_ARRAY('general-adult','young-adult','midlife','later-life','life-coaching','counseling'),
    JSON_ARRAY('full','quick','life-transition','recovery-review','targeted'),
    JSON_OBJECT('low','Almost never','mid','Occasionally or inconsistently','high','Frequently and meaningfully'),
    JSON_ARRAY('Stress','Workload','Relationships','Health','Fatigue','Financial pressure','Lack of free time','Grief or loss','I have stopped doing things I enjoy','I experience regular joy','I feel guilty when resting or having fun','I am unsure what I enjoy now','Other','Prefer not to answer'),
    JSON_ARRAY('Schedule one enjoyable activity','Reconnect with a hobby','Spend time with a joyful person','Create an unstructured hour','Listen to music','Spend time outdoors','Reduce one obligation that prevents recovery','Plan one small experience to anticipate'),
    'How often does your current life include genuine enjoyment or joy?',
    'What most affects joy?'
  UNION ALL SELECT
    'gratitude','Gratitude','Gratitude',
    'The degree to which you notice, appreciate, and reflect on meaningful people, experiences, opportunities, and ordinary moments.',
    'positive-experience', 10.00, '#CA8A04', 'heart', 3,
    JSON_ARRAY('general-adult','young-adult','midlife','later-life','life-coaching','counseling'),
    JSON_ARRAY('full','quick','life-transition','recovery-review','targeted'),
    JSON_OBJECT('low','Very difficult to access','mid','Present sometimes','high','Consistently meaningful'),
    JSON_ARRAY('I naturally notice positive things','I use a gratitude practice','Stress makes gratitude difficult','Grief or disappointment is present','I compare myself with others','I move too quickly to notice','I overlook ordinary experiences','Relationships help me notice','Faith or reflection supports gratitude','Gratitude currently feels strong','Gratitude feels forced','Other','Prefer not to answer'),
    JSON_ARRAY('Record three specific moments of gratitude','Send one appreciation message','Reflect on one supportive relationship','Create an evening gratitude prompt','Photograph one meaningful daily detail','Share appreciation directly','Notice one thing without requiring the day to feel positive overall'),
    'How accessible and meaningful does gratitude currently feel in your life?',
    'What most affects gratitude?'
  UNION ALL SELECT
    'accomplishment','Accomplishment','Accomplishment',
    'The degree to which you experience progress, competence, completion, mastery, and satisfaction with personal efforts.',
    'capability-and-progress', 10.00, '#2563EB', 'flag', 4,
    JSON_ARRAY('general-adult','young-adult','midlife','career-coaching','life-coaching','counseling'),
    JSON_ARRAY('full','quick','life-transition','targeted'),
    JSON_OBJECT('low','Very dissatisfied or stuck','mid','Some progress, satisfaction varies','high','Strong sense of progress'),
    JSON_ARRAY('Goals are unclear','Progress feels too slow','I compare myself with others','I dismiss completed work','I focus only on what remains','I have too many goals','I lack feedback','Perfectionism','External recognition','I currently feel proud of my progress','I need rest after a demanding period','Other'),
    JSON_ARRAY('Document recent progress','Finish one small open task','Define a realistic completion point','Reduce the number of active goals','Celebrate one meaningful accomplishment','Request useful feedback','Create a progress tracker','Choose one priority goal'),
    'How satisfied do you currently feel with your progress and accomplishments?',
    'What most affects your sense of accomplishment?'
  UNION ALL SELECT
    'relationships','Relationships','Relationships',
    'The degree to which you experience meaningful, supportive, reciprocal, and authentic connection with other people.',
    'connection-and-autonomy', 10.00, '#DB2777', 'users', 5,
    JSON_ARRAY('general-adult','young-adult','midlife','later-life','life-coaching','counseling'),
    JSON_ARRAY('full','quick','life-transition','recovery-review','targeted'),
    JSON_OBJECT('low','Very disconnected or unsupported','mid','Relationships feel mixed','high','Strongly connected and supported'),
    JSON_ARRAY('Lack of time','Distance','Conflict','Loneliness','Lack of community','Difficulty asking for support','Relationships feel one-sided','Difficulty setting boundaries','Major life transition','I want deeper rather than more relationships','My relationships currently feel fulfilling','Other','Prefer not to answer'),
    JSON_ARRAY('Schedule one meaningful conversation','Contact a trusted friend','Join a community group','Express appreciation','Communicate one boundary','Plan uninterrupted relationship time','Ask for support','Step back from one consistently harmful interaction'),
    'How fulfilling and supportive do your current relationships feel?',
    'What most affects relationship fulfillment?'
  UNION ALL SELECT
    'freedom','Freedom','Freedom',
    'The degree to which you experience choice, flexibility, autonomy, space, and the ability to make meaningful decisions.',
    'connection-and-autonomy', 10.00, '#7C3AED', 'wind', 6,
    JSON_ARRAY('general-adult','young-adult','midlife','later-life','career-coaching','life-coaching','counseling'),
    JSON_ARRAY('full','quick','life-transition','recovery-review','targeted'),
    JSON_OBJECT('low','Very restricted','mid','Some choice, significant limits','high','Strong autonomy and flexibility'),
    JSON_ARRAY('Work responsibilities','Family responsibilities','Financial limitations','Health limitations','Caregiving','Schedule','Other people''s expectations','Difficulty saying no','Unclear boundaries','Legal or practical limitations','I currently experience healthy freedom','Too much unstructured freedom','Other','Prefer not to answer'),
    JSON_ARRAY('Decline one low-priority commitment','Protect one personal block of time','Delegate one responsibility','Create a financial-flexibility goal','Renegotiate one expectation','Establish a communication boundary','Choose one activity based on personal preference','Create structure if too much freedom feels unmanageable'),
    'How much freedom and personal choice do you currently experience?',
    'What most affects freedom?'
  UNION ALL SELECT
    'energy','Energy','Energy',
    'The degree to which you have sufficient physical, mental, and emotional capacity to engage with daily life.',
    'capability-and-progress', 10.00, '#DC2626', 'bolt', 7,
    JSON_ARRAY('general-adult','young-adult','midlife','later-life','career-coaching','life-coaching','counseling'),
    JSON_ARRAY('full','quick','life-transition','recovery-review','targeted'),
    JSON_OBJECT('low','Very little usable energy','mid','Energy is inconsistent','high','Strong and sustainable energy'),
    JSON_ARRAY('Sleep','Health','Workload','Stress','Caregiving','Relationships','Schedule','Nutrition','Lack of movement','Too many decisions','Lack of recovery','Energy is currently strong','Other','Prefer not to answer'),
    JSON_ARRAY('Protect a sleep window','Schedule recovery','Reduce one draining obligation','Add short movement','Create a meal or hydration routine','Protect a no-meeting block','Take a technology break','Seek qualified health support when appropriate'),
    'How much usable energy do you currently have for the people and responsibilities that matter?',
    'What most affects energy?'
  UNION ALL SELECT
    'hope','Hope','Hope',
    'The degree to which you can imagine positive possibilities, believe change is possible, and identify realistic paths forward.',
    'meaning-and-direction', 10.00, '#0284C7', 'sunrise', 8,
    JSON_ARRAY('general-adult','young-adult','midlife','later-life','life-coaching','counseling'),
    JSON_ARRAY('full','quick','life-transition','recovery-review','targeted'),
    JSON_OBJECT('low','Very little hope right now','mid','Hope varies','high','Strong and realistic hope'),
    JSON_ARRAY('Current stress','Financial pressure','Health','Relationships','Work or career','World events','Past disappointment','Lack of direction','Supportive people','Faith or spirituality','Recent progress','I currently feel hopeful','Other','Prefer not to answer'),
    JSON_ARRAY('Identify one realistic next step','Talk with a supportive person','Create two possible future paths','Document recent progress','Reduce exposure to one overwhelming information source','Reconnect with faith or meaning when personally relevant','Schedule qualified support when hope remains very low'),
    'How hopeful do you currently feel about your future?',
    'What most affects hope?'
  UNION ALL SELECT
    'confidence','Confidence','Confidence',
    'The degree to which you trust your judgment, abilities, adaptability, and capacity to handle challenges.',
    'capability-and-progress', 10.00, '#4338CA', 'shield', 9,
    JSON_ARRAY('general-adult','young-adult','midlife','career-coaching','life-coaching','counseling'),
    JSON_ARRAY('full','quick','life-transition','targeted'),
    JSON_OBJECT('low','Very little self-trust','mid','Confidence depends on the situation','high','Strong and reliable confidence'),
    JSON_ARRAY('Recent success','Recent setback','Comparing myself with others','Feedback','Work or school','Relationships','Appearance','Financial circumstances','Lack of experience','Fear of mistakes','Confidence is currently strong','Other','Prefer not to answer'),
    JSON_ARRAY('Create an evidence-of-competence list','Make one low-risk decision','Attempt one small challenge','Ask for specific feedback','Reduce one comparison trigger','Practice supportive self-talk','Document how a previous challenge was handled'),
    'How much do you currently trust yourself to make decisions and handle challenges?',
    'What most affects confidence?'
  UNION ALL SELECT
    'curiosity','Curiosity','Curiosity',
    'The degree to which you remain interested, open, exploratory, creative, and willing to learn.',
    'meaning-and-direction', 10.00, '#059669', 'search', 10,
    JSON_ARRAY('general-adult','young-adult','midlife','later-life','career-coaching','life-coaching','counseling'),
    JSON_ARRAY('full','quick','life-transition','recovery-review','targeted'),
    JSON_OBJECT('low','Very limited','mid','Present occasionally','high','Strongly present'),
    JSON_ARRAY('Lack of time','Fatigue','Stress','Repetitive routine','Fear of failure','Pressure to be productive','Lack of access','I already have strong interests','I consume information without applying it','I want to explore something new','I do not know what interests me now','Other'),
    JSON_ARRAY('Read or watch one introductory resource','Try a new activity','Visit a new place','Begin a small creative project','Ask someone about their expertise','Schedule an exploration hour','Choose one question to investigate','Apply one new idea before consuming more information'),
    'How present are curiosity, learning, and exploration in your current life?',
    'What most affects curiosity?'
) AS d
WHERE @pf_tpl_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM personal_fulfillment_template_domains x
    WHERE x.template_id = @pf_tpl_id AND x.domain_key = d.domain_key
  );
