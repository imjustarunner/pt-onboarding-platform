-- Migration 930: The Burden & Purpose Assessment (The Builder's Path)
-- Solo flagship assessment — meaningful responsibility, not suffering glorification.
-- Primary viz: The Builder's Path (12 checkpoints / 4 regions). Secondary: Meaningful Burden Matrix.
-- Does not measure toughness, worth, pain tolerance, or success through overwork is never praised.

CREATE TABLE IF NOT EXISTS burden_purpose_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = platform default',
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  settings_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_bp_templates_agency (agency_id),
  KEY idx_bp_templates_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS burden_purpose_template_domains (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  short_label VARCHAR(64) NOT NULL,
  definition TEXT NULL,
  burden_system ENUM(
    'direction-and-identity',
    'capacity-and-readiness',
    'responsibility-and-contribution',
    'growth-and-exploration'
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
  UNIQUE KEY uq_bp_tpl_domain (template_id, domain_key),
  KEY idx_bp_tpl_domain_order (template_id, display_order),
  CONSTRAINT fk_bp_tpl_domain_template
    FOREIGN KEY (template_id) REFERENCES burden_purpose_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS burden_purpose_assessments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL,
  template_id BIGINT UNSIGNED NOT NULL,
  template_version INT NOT NULL DEFAULT 1,
  participant_user_id INT NULL,
  client_id INT NULL,
  coach_user_id INT NULL,
  counselor_user_id INT NULL,
  mentor_user_id INT NULL,
  group_id INT NULL,
  mode ENUM('full','quick','annual-review','retreat','targeted') NOT NULL DEFAULT 'full',
  participant_version VARCHAR(64) NOT NULL DEFAULT 'general-adult',
  status ENUM('not_started','in_progress','completed','reviewed','archived') NOT NULL DEFAULT 'not_started',
  access_token VARCHAR(64) NOT NULL,
  context_json JSON NULL,
  summary_json JSON NULL,
  burden_readiness_index INT NULL,
  importance_weighted_index INT NULL,
  selected_priorities_json JSON NULL,
  commitment_plans_json JSON NULL,
  weekly_checkins_json JSON NULL,
  burden_entries_json JSON NULL COMMENT 'In-session Meaningful Burden Matrix entries',
  reviewed_at DATETIME NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bp_access_token (access_token),
  KEY idx_bp_assess_agency (agency_id),
  KEY idx_bp_assess_participant (participant_user_id),
  KEY idx_bp_assess_status (status),
  KEY idx_bp_assess_mode (mode),
  CONSTRAINT fk_bp_assess_template
    FOREIGN KEY (template_id) REFERENCES burden_purpose_templates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS burden_purpose_responses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  current_practice_score TINYINT UNSIGNED NULL,
  personal_importance_score TINYINT UNSIGNED NULL,
  sustainable_capacity_score TINYINT UNSIGNED NULL,
  current_load_score TINYINT UNSIGNED NULL,
  reflection_chips_json JSON NULL,
  barriers_json JSON NULL,
  personal_strengths_json JSON NULL,
  personal_definition TEXT NULL,
  support_preference VARCHAR(64) NULL,
  private_reflection TEXT NULL,
  note_visibility ENUM(
    'private','selected-coach','selected-counselor','selected-mentor',
    'shared-with-plan','do-not-save'
  ) NOT NULL DEFAULT 'private',
  season_status ENUM('active','not-relevant','paused','exploring') NOT NULL DEFAULT 'active',
  prefer_not_to_answer TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bp_resp (assessment_id, domain_key),
  CONSTRAINT fk_bp_resp_assessment
    FOREIGN KEY (assessment_id) REFERENCES burden_purpose_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO burden_purpose_templates (agency_id, name, description, version, settings_json, is_active)
SELECT NULL,
  'The Burden & Purpose Assessment',
  'Identify what you are willing to carry with meaning, where your capacity is sustainable, and how to grow without glorifying overwork or self-erasure.',
  1,
  JSON_OBJECT(
    'visualExperienceName', 'The Builder''s Path',
    'subtitle', 'What are you willing to carry — and what deserves release, recovery, or wiser service?',
    'resultsTitle', 'Your Builder''s Path Profile',
    'coachDashboardTitle', 'Burden & Purpose Development Overview',
    'enableImportance', true,
    'enableSustainableCapacity', true,
    'enableCurrentLoad', true,
    'enableSupportRequests', true,
    'maxPriorities', 2,
    'quickExitUrl', 'https://www.weather.com',
    'disclaimer', 'This assessment explores meaningful responsibility and readiness. It does not measure toughness, worth, pain tolerance, or success. It never recommends unsafe challenge, sleep deprivation, abuse-as-loyalty, or emotional suppression. Low scores are not a crisis diagnosis.',
    'indexClarification', 'Burden Readiness summarizes current practice across the pillars you completed. Importance and sustainable capacity do not change this standard score. Meaningful burden is not the same as suffering.',
    'matrixClarification', 'The Meaningful Burden Matrix plots meaning against sustainable capacity. High meaning with low capacity may signal overextension — not a call for more strain.',
    'orientationClarification', 'Developmental orientations are self-reported pattern labels, not ranks of worth. A high readiness score can still reflect a Builder pattern.'
  ),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM burden_purpose_templates WHERE agency_id IS NULL AND is_active = 1 LIMIT 1
);

SET @bp_tpl_id := (
  SELECT id FROM burden_purpose_templates WHERE agency_id IS NULL AND is_active = 1 ORDER BY id ASC LIMIT 1
);

INSERT INTO burden_purpose_template_domains
  (template_id, domain_key, label, short_label, definition, burden_system, weight, color, icon,
   display_order, is_active, is_optional, is_sensitive, participant_versions_json, available_modes_json,
   score_labels_json, reflection_options_json, action_suggestions_json, related_assessment_ids_json,
   primary_question, reflection_prompt)
SELECT @bp_tpl_id, d.domain_key, d.label, d.short_label, d.definition, d.burden_system, d.weight, d.color, d.icon,
  d.display_order, 1, d.is_optional, d.is_sensitive, d.participant_versions_json, d.available_modes_json,
  d.score_labels_json, d.reflection_options_json, d.action_suggestions_json, d.related_assessment_ids_json,
  d.primary_question, d.reflection_prompt
FROM (
  SELECT
    'purpose' AS domain_key,
    'Purpose' AS label,
    'Purpose' AS short_label,
    'Clarity about what is worth carrying in this season — direction that can coexist with rest, limits, and changing roles. One permanent life purpose is not required.' AS definition,
    'direction-and-identity' AS burden_system,
    10.00 AS weight,
    '#1B4332' AS color,
    'compass' AS icon,
    1 AS display_order,
    0 AS is_optional,
    0 AS is_sensitive,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat') AS participant_versions_json,
    JSON_ARRAY('full','quick','annual-review','retreat','targeted') AS available_modes_json,
    JSON_OBJECT('low','Little clarity about what is worth carrying','mid','Direction feels mixed or seasonal','high','Clear, practiced sense of worthwhile direction') AS score_labels_json,
    JSON_ARRAY('Work or craft','Family or caregiving','Faith or meaning','Service','Creative contribution','Leadership','Personal growth','Community','I am still clarifying','Current responsibilities feel disconnected','I currently feel clear purpose','I am avoiding clarifying this even though it matters','Other','Prefer not to answer') AS reflection_options_json,
    JSON_ARRAY('Write a one-sentence season purpose','Protect one weekly practice that expresses it','Release one obligation that no longer fits','Talk with a mentor about direction','Connect daily work to one larger reason') AS action_suggestions_json,
    JSON_ARRAY('mens-life','personal-fulfillment','values-alignment') AS related_assessment_ids_json,
    'How clearly are you practicing a sense of worthwhile direction right now?' AS primary_question,
    'What most shapes your sense of purpose in this season?' AS reflection_prompt
  UNION ALL SELECT
    'voluntary_challenge','Voluntary Challenge','Challenge',
    'Chosen difficulty that builds capacity without glorifying harm. Growth challenge is distinct from coercion, chaos, or unsustainable strain.',
    'growth-and-exploration', 10.00, '#2D6A4F', 'mountain', 2, 0, 0,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat'),
    JSON_ARRAY('full','quick','annual-review','retreat','targeted'),
    JSON_OBJECT('low','Little chosen challenge','mid','Some challenge, inconsistent','high','Regular, chosen, recoverable challenge'),
    JSON_ARRAY('Physical training','Skill building','Hard conversations','Creative risk','Leadership stretch','Learning discomfort','I confuse chaos with challenge','I avoid challenge even though it matters','Challenge currently feels healthy','I push past recovery','Other','Prefer not to answer'),
    JSON_ARRAY('Choose one recoverable challenge this week','Define a clear stop-condition for intensity','Pair challenge with recovery','Ask a peer for accountability that includes rest','Reduce one unsafe or ego-driven push'),
    JSON_ARRAY('athlete-readiness','mens-life'),
    'How well are you choosing growth-oriented challenge that you can recover from?',
    'What kinds of challenge feel meaningful versus harmful?'
  UNION ALL SELECT
    'discipline','Discipline','Discipline',
    'Reliable practice and follow-through that support the life you value. Discipline includes rest rhythms; rigidity and self-punishment are not the goal.',
    'capacity-and-readiness', 10.00, '#40916C', 'anchor', 3, 0, 0,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat'),
    JSON_ARRAY('full','quick','annual-review','retreat','targeted'),
    JSON_OBJECT('low','Follow-through feels unreliable','mid','Mixed consistency','high','Steady, sustainable practice'),
    JSON_ARRAY('Morning or evening routines','Work habits','Training consistency','Financial habits','Sleep rhythm','I am overly rigid','I avoid structure even though it matters','Discipline currently feels supportive','Shame drives my routines','Other','Prefer not to answer'),
    JSON_ARRAY('Protect one non-negotiable daily practice','Make the next action smaller','Add a weekly recovery block','Track completion without self-attack','Ask for structure support'),
    JSON_ARRAY('digital-wellness','mens-life'),
    'How consistently do you practice the habits that support what you value?',
    'What most helps or hinders your discipline?'
  UNION ALL SELECT
    'responsibility','Responsibility','Responsibility',
    'Owning what is yours to carry — roles, promises, and consequences — without absorbing what is not yours or using duty to erase yourself.',
    'responsibility-and-contribution', 10.00, '#52796F', 'shield', 4, 0, 0,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat'),
    JSON_ARRAY('full','quick','annual-review','retreat','targeted'),
    JSON_OBJECT('low','Responsibility feels unclear or avoided','mid','Mixed ownership','high','Clear, owned, bounded responsibility'),
    JSON_ARRAY('Family roles','Work ownership','Financial obligations','Community roles','I carry others'' loads','I avoid responsibility even though it matters','Responsibility currently feels clear','Guilt drives over-responsibility','Other','Prefer not to answer'),
    JSON_ARRAY('List what is yours vs not yours','Keep one promise this week','Delegate or release one assumed load','Clarify a role expectation','Repair one missed responsibility'),
    JSON_ARRAY('mens-life','parenting-confidence'),
    'How clearly do you own what is yours to carry — and leave what is not?',
    'Where does responsibility feel meaningful versus crushing?'
  UNION ALL SELECT
    'resilience','Resilience','Resilience',
    'Capacity to recover, adapt, and continue with integrity after difficulty. Resilience includes asking for help; emotional suppression is not resilience.',
    'capacity-and-readiness', 10.00, '#74C69D', 'refresh', 5, 0, 1,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat'),
    JSON_ARRAY('full','quick','annual-review','retreat','targeted'),
    JSON_OBJECT('low','Recovery feels very limited','mid','Mixed recovery','high','Steady recovery with support'),
    JSON_ARRAY('Stress recovery','Setback response','Sleep after hard days','Support seeking','I equate toughness with silence','I avoid recovery even though it matters','Resilience currently feels strong','I bounce back by ignoring feelings','Other','Prefer not to answer'),
    JSON_ARRAY('Name one recovery practice after strain','Ask one person for support','Protect sleep after hard weeks','Use a pause-and-return plan','Speak with a counselor when load is heavy'),
    JSON_ARRAY('teen-wellbeing','mens-life'),
    'How well do you recover and adapt after difficulty without pretending you are unaffected?',
    'What most supports real resilience for you?'
  UNION ALL SELECT
    'physical_readiness','Physical Readiness','Physical',
    'Body capacity — strength, mobility, energy, sleep, and recovery — that makes meaningful burden sustainable. Appearance and extreme training are not the measure.',
    'capacity-and-readiness', 10.00, '#1D3557', 'activity', 6, 0, 0,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat'),
    JSON_ARRAY('full','quick','annual-review','retreat','targeted'),
    JSON_OBJECT('low','Physical capacity feels very limited','mid','Inconsistent physical readiness','high','Supportive, sustainable physical capacity'),
    JSON_ARRAY('Strength or conditioning','Sleep','Nutrition','Mobility','Injury or health limits','I train past recovery','I avoid physical care even though it matters','Physical readiness currently feels strong','Work depletes my body','Other','Prefer not to answer'),
    JSON_ARRAY('Schedule two realistic movement sessions','Protect sleep as capacity work','Add mobility or walking','Reduce unsustainable intensity','See a qualified clinician when needed'),
    JSON_ARRAY('athlete-readiness','mens-life'),
    'How well does your body capacity currently support the burdens you choose?',
    'What most affects physical readiness?'
  UNION ALL SELECT
    'mental_fortitude','Mental Fortitude','Mental',
    'Steady attention, honest thinking, and courage under pressure — without denying fear, grief, or the need for rest and perspective.',
    'capacity-and-readiness', 10.00, '#457B9D', 'brain', 7, 0, 1,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat'),
    JSON_ARRAY('full','quick','annual-review','retreat','targeted'),
    JSON_OBJECT('low','Focus and courage feel depleted','mid','Mixed mental steadiness','high','Clear, honest, steady under pressure'),
    JSON_ARRAY('Focus under pressure','Honest self-talk','Decision courage','Fear management','I suppress emotion to look strong','I avoid hard thinking even though it matters','Mental fortitude currently feels strong','Rumination drains me','Other','Prefer not to answer'),
    JSON_ARRAY('Practice one grounding pause before decisions','Name fear without obeying it','Reduce one distraction source','Journal one hard truth','Seek counseling for persistent overwhelm'),
    JSON_ARRAY('digital-wellness','personal-fulfillment'),
    'How steady and honest is your mind when meaningful pressure shows up?',
    'What strengthens or drains mental fortitude?'
  UNION ALL SELECT
    'character','Character','Character',
    'Integrity between values and action — honesty, courage, fairness, and reliability when it costs something. Character is practice, not reputation.',
    'direction-and-identity', 10.00, '#6D597A', 'scale', 8, 0, 0,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat'),
    JSON_ARRAY('full','quick','annual-review','retreat','targeted'),
    JSON_OBJECT('low','Values and actions feel misaligned','mid','Mixed integrity under pressure','high','Consistent values-aligned practice'),
    JSON_ARRAY('Honesty','Keeping promises','Fairness under pressure','Courageous apology','I avoid accountability even though it matters','Character currently feels strong','Image matters more than integrity lately','Other','Prefer not to answer'),
    JSON_ARRAY('Keep one costly promise','Make one repair conversation','Choose fairness over convenience once','Write a personal integrity rule','Ask a trusted person for feedback'),
    JSON_ARRAY('values-alignment','mens-life'),
    'How consistently do your actions match the character you want to practice?',
    'Where is character tested most right now?'
  UNION ALL SELECT
    'relationships','Relationships','Relationships',
    'Honest, reciprocal bonds that can hold truth, support, and mutual responsibility. Isolation or one-way loyalty is not strength.',
    'responsibility-and-contribution', 10.00, '#B08968', 'users', 9, 0, 0,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat'),
    JSON_ARRAY('full','quick','annual-review','retreat','targeted'),
    JSON_OBJECT('low','Connection feels thin or strained','mid','Mixed relational health','high','Honest, mutual, dependable bonds'),
    JSON_ARRAY('Partnership','Friendship','Family','Mentorship','I avoid closeness even though it matters','Relationships currently feel strong','I over-function for others','Difficulty asking for help','Other','Prefer not to answer'),
    JSON_ARRAY('Initiate one honest conversation','Ask for support directly','Schedule recurring connection time','Repair one strained bond when safe','Join a community with mutual care'),
    JSON_ARRAY('relationship-health','mens-life','marriage-alignment'),
    'How strong and mutual are the relationships that help you carry what matters?',
    'What most affects your relationships right now?'
  UNION ALL SELECT
    'service','Service','Service',
    'Contribution that helps others without requiring self-erasure. Service includes boundaries; martyrdom and abuse-as-loyalty are not service.',
    'responsibility-and-contribution', 10.00, '#9C6644', 'hand-heart', 10, 0, 0,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat'),
    JSON_ARRAY('full','quick','annual-review','retreat','targeted'),
    JSON_OBJECT('low','Little sustainable contribution','mid','Mixed or draining service','high','Clear, bounded, meaningful service'),
    JSON_ARRAY('Family care','Community work','Mentoring','Professional contribution','I serve past capacity','I avoid serving even though it matters','Service currently feels meaningful','Guilt drives my yes','Other','Prefer not to answer'),
    JSON_ARRAY('Choose one bounded act of service','Say no to one draining obligation','Align service with skills','Pair service with recovery','Ask who benefits if you burn out'),
    JSON_ARRAY('personal-fulfillment','mens-life'),
    'How well are you contributing in ways that help others without erasing yourself?',
    'Where does service feel meaningful versus depleting?'
  UNION ALL SELECT
    'adventure','Adventure','Adventure',
    'Exploration, novelty, and aliveness that renew courage and curiosity. Adventure is not recklessness or escape from responsibility.',
    'growth-and-exploration', 10.00, '#BC6C25', 'map', 11, 0, 0,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat'),
    JSON_ARRAY('full','quick','annual-review','retreat','targeted'),
    JSON_OBJECT('low','Little exploration or aliveness','mid','Occasional adventure','high','Regular, renewing exploration'),
    JSON_ARRAY('Travel or outdoors','Creative risk','New skills','Spontaneity','I use adventure to escape','I avoid adventure even though it matters','Adventure currently feels renewing','Life feels overly narrow','Other','Prefer not to answer'),
    JSON_ARRAY('Plan one low-cost exploratory experience','Try a new skill for four weeks','Protect curiosity time','Choose adventure that returns you stronger','Balance novelty with commitment'),
    JSON_ARRAY('personal-fulfillment'),
    'How present is renewing exploration in your current life?',
    'What kind of adventure would strengthen — not escape — your path?'
  UNION ALL SELECT
    'legacy','Legacy','Legacy',
    'Choices that shape the influence, values, and care you want to leave — through people, craft, and example. Legacy is not fame, wealth, or biological children alone.',
    'direction-and-identity', 10.00, '#8B5E34', 'landmark', 12, 0, 0,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat'),
    JSON_ARRAY('full','quick','annual-review','retreat','targeted'),
    JSON_OBJECT('low','Little intentional legacy practice','mid','Some alignment with long view','high','Clear, practiced legacy direction'),
    JSON_ARRAY('Mentorship','Family example','Craft or work','Community impact','Character transmission','I avoid thinking about legacy even though it matters','Legacy currently feels intentional','I equate legacy with status','Other','Prefer not to answer'),
    JSON_ARRAY('Write a one-paragraph legacy statement','Teach one skill','Create one tradition','Mentor one person','Align one weekly action with long-view values'),
    JSON_ARRAY('mens-life','personal-fulfillment','values-alignment'),
    'How closely do your current choices practice the legacy you want to build?',
    'What most shapes your sense of legacy now?'
) AS d
WHERE @bp_tpl_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM burden_purpose_template_domains x
    WHERE x.template_id = @bp_tpl_id AND x.domain_key = d.domain_key
  );
