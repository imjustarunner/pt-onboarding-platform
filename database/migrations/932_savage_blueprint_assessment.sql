-- Migration 932: The Savage Blueprint Assessment
-- Flagship men's development / performance assessment — intentional, integrated, sustainable execution.
-- Primary viz: Blueprint Wheel (12-domain radial). Secondary: Domain Performance Gauges + 90-Day Focus Board.
-- Savage ≠ intentional execution — NOT aggression, dominance, wealth, emotional numbness, or pain tolerance.
-- Fatherhood is conditional (allows_not_applicable); when N/A it is excluded from denominators.

CREATE TABLE IF NOT EXISTS savage_blueprint_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = platform default',
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  settings_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_sb_templates_agency (agency_id),
  KEY idx_sb_templates_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS savage_blueprint_template_domains (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  short_label VARCHAR(64) NOT NULL,
  definition TEXT NULL,
  savage_system ENUM(
    'body-and-performance',
    'mission-and-leadership',
    'connection-and-emotional-mastery',
    'challenge-and-legacy'
  ) NOT NULL,
  weight DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  color VARCHAR(16) NOT NULL,
  icon VARCHAR(64) NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_optional TINYINT(1) NOT NULL DEFAULT 0,
  is_sensitive TINYINT(1) NOT NULL DEFAULT 0,
  allows_not_applicable TINYINT(1) NOT NULL DEFAULT 0,
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
  UNIQUE KEY uq_sb_tpl_domain (template_id, domain_key),
  KEY idx_sb_tpl_domain_order (template_id, display_order),
  CONSTRAINT fk_sb_tpl_domain_template
    FOREIGN KEY (template_id) REFERENCES savage_blueprint_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS savage_blueprint_assessments (
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
  savage_score INT NULL,
  priority_weighted_score INT NULL,
  selected_priorities_json JSON NULL,
  commitment_plans_json JSON NULL,
  focus_board_json JSON NULL COMMENT '90-Day Focus Board selections',
  weekly_checkins_json JSON NULL COMMENT 'The Savage Week light check-ins',
  reviewed_at DATETIME NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sb_access_token (access_token),
  KEY idx_sb_assess_agency (agency_id),
  KEY idx_sb_assess_participant (participant_user_id),
  KEY idx_sb_assess_status (status),
  KEY idx_sb_assess_mode (mode),
  CONSTRAINT fk_sb_assess_template
    FOREIGN KEY (template_id) REFERENCES savage_blueprint_templates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS savage_blueprint_responses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  current_performance_score TINYINT UNSIGNED NULL,
  personal_priority_score TINYINT UNSIGNED NULL,
  momentum_score TINYINT UNSIGNED NULL,
  effort_cost_score TINYINT UNSIGNED NULL,
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
  is_not_applicable TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sb_resp (assessment_id, domain_key),
  CONSTRAINT fk_sb_resp_assessment
    FOREIGN KEY (assessment_id) REFERENCES savage_blueprint_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO savage_blueprint_templates (agency_id, name, description, version, settings_json, is_active)
SELECT NULL,
  'The Savage Blueprint',
  'Map intentional performance across twelve domains — body, mission, connection, challenge, and legacy — then build a sustainable 90-day operating plan. Savage means integrated execution, not aggression or emotional numbness.',
  1,
  JSON_OBJECT(
    'visualExperienceName', 'Blueprint Wheel',
    'subtitle', 'What are you building — and where does intentional execution need focus?',
    'resultsTitle', 'Blueprint Command Center',
    'coachDashboardTitle', 'Savage Blueprint Development Overview',
    'enablePriority', true,
    'enableMomentum', true,
    'enableEffortCost', true,
    'enableLoadRecovery', true,
    'enableWeeklyCheckin', true,
    'maxPriorities', 2,
    'quickExitUrl', 'https://www.weather.com',
    'disclaimer', 'This assessment maps intentional, integrated, sustainable execution. It is not a masculinity test, toughness score, dominance rank, wealth measure, or emotional-numbness goal. It never recommends overwork, injury, sleep deprivation, or emotional suppression. Low scores are information about this season — not a verdict on worth.',
    'indexClarification', 'Savage Score summarizes current performance across the domains you completed. Priority, momentum, and effort cost do not change this standard score. Fatherhood is excluded when marked not applicable.',
    'focusClarification', 'The 90-Day Focus Board helps you choose primary and secondary growth domains, plus what to maintain and recover — without trying to upgrade everything at once.',
    'tierClarification', 'Domain tiers describe current performance bands (Foundation through Savage). They are operating labels, not ranks of masculinity or worth.'
  ),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM savage_blueprint_templates WHERE agency_id IS NULL AND is_active = 1 LIMIT 1
);

SET @sb_tpl_id := (
  SELECT id FROM savage_blueprint_templates WHERE agency_id IS NULL AND is_active = 1 ORDER BY id ASC LIMIT 1
);

INSERT INTO savage_blueprint_template_domains
  (template_id, domain_key, label, short_label, definition, savage_system, weight, color, icon,
   display_order, is_active, is_optional, is_sensitive, allows_not_applicable,
   participant_versions_json, available_modes_json,
   score_labels_json, reflection_options_json, action_suggestions_json, related_assessment_ids_json,
   primary_question, reflection_prompt)
SELECT @sb_tpl_id, d.domain_key, d.label, d.short_label, d.definition, d.savage_system, d.weight, d.color, d.icon,
  d.display_order, 1, d.is_optional, d.is_sensitive, d.allows_not_applicable,
  d.participant_versions_json, d.available_modes_json,
  d.score_labels_json, d.reflection_options_json, d.action_suggestions_json, d.related_assessment_ids_json,
  d.primary_question, d.reflection_prompt
FROM (
  SELECT
    'physical_capability' AS domain_key,
    'Physical Capability' AS label,
    'Physical' AS short_label,
    'Strength, mobility, energy, and recovery capacity that make intentional performance sustainable. Appearance and extreme training are not the measure.' AS definition,
    'body-and-performance' AS savage_system,
    10.00 AS weight,
    '#1B4332' AS color,
    'activity' AS icon,
    1 AS display_order,
    0 AS is_optional,
    0 AS is_sensitive,
    0 AS allows_not_applicable,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat','athlete') AS participant_versions_json,
    JSON_ARRAY('full','quick','annual-review','retreat','targeted') AS available_modes_json,
    JSON_OBJECT('low','Physical capacity feels limited','mid','Inconsistent capability','high','Strong, recoverable physical capacity') AS score_labels_json,
    JSON_ARRAY('Strength training','Conditioning','Sleep','Nutrition','Mobility','Injury limits','I train past recovery','Physical capacity currently feels strong','Work depletes my body','Other','Prefer not to answer') AS reflection_options_json,
    JSON_ARRAY('Schedule two realistic training sessions','Protect sleep as performance work','Add mobility or walking','Reduce unsustainable intensity','See a qualified clinician when needed') AS action_suggestions_json,
    JSON_ARRAY('athlete-readiness','mens-life','burden-purpose') AS related_assessment_ids_json,
    'How strong is your current physical capability for the life you are building?' AS primary_question,
    'What most affects your physical capability right now?' AS reflection_prompt
  UNION ALL SELECT
    'mental_toughness','Mental Toughness','Mental',
    'Steady attention, honest thinking, and composure under pressure — without denying fear, grief, or the need for rest and perspective. Suppression is not toughness.',
    'body-and-performance', 10.00, '#2D6A4F', 'brain', 2, 0, 1, 0,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat','athlete'),
    JSON_ARRAY('full','quick','annual-review','retreat','targeted'),
    JSON_OBJECT('low','Focus and composure feel depleted','mid','Mixed mental steadiness','high','Clear, honest, steady under pressure'),
    JSON_ARRAY('Focus under pressure','Honest self-talk','Decision courage','Fear management','I suppress emotion to look strong','Mental toughness currently feels strong','Rumination drains me','Other','Prefer not to answer'),
    JSON_ARRAY('Practice one grounding pause before decisions','Name fear without obeying it','Reduce one distraction source','Journal one hard truth','Seek counseling for persistent overwhelm'),
    JSON_ARRAY('mens-life','digital-wellness','burden-purpose'),
    'How steady and honest is your mind when meaningful pressure shows up?',
    'What strengthens or drains mental toughness for you?'
  UNION ALL SELECT
    'purpose_mission','Purpose & Mission','Purpose',
    'Clarity about what is worth building in this season — direction that can coexist with rest, limits, and changing roles. One permanent life purpose is not required.',
    'mission-and-leadership', 10.00, '#40916C', 'compass', 3, 0, 0, 0,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat','athlete'),
    JSON_ARRAY('full','quick','annual-review','retreat','targeted'),
    JSON_OBJECT('low','Little clarity about direction','mid','Direction feels mixed or seasonal','high','Clear, practiced sense of mission'),
    JSON_ARRAY('Work or craft','Family or caregiving','Faith or meaning','Service','Creative contribution','Leadership','I am still clarifying','Purpose currently feels clear','I confuse busyness with mission','Other','Prefer not to answer'),
    JSON_ARRAY('Write a one-sentence season mission','Protect one weekly practice that expresses it','Release one obligation that no longer fits','Talk with a mentor about direction','Connect daily work to one larger reason'),
    JSON_ARRAY('mens-life','personal-fulfillment','values-alignment','burden-purpose'),
    'How clearly are you practicing a sense of worthwhile direction right now?',
    'What most shapes your sense of purpose in this season?'
  UNION ALL SELECT
    'leadership','Leadership','Leadership',
    'Influence through clarity, accountability, and care for others — not dominance, control, or image. Leadership includes asking for feedback and protecting sustainable standards.',
    'mission-and-leadership', 10.00, '#52796F', 'flag', 4, 0, 0, 0,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat','athlete'),
    JSON_ARRAY('full','quick','annual-review','retreat','targeted'),
    JSON_OBJECT('low','Little practiced leadership','mid','Mixed leadership practice','high','Clear, accountable, caring leadership'),
    JSON_ARRAY('Team or workplace','Family influence','Coaching others','Community roles','I lead by control','Leadership currently feels strong','I avoid hard conversations','Other','Prefer not to answer'),
    JSON_ARRAY('Clarify one standard you will uphold','Give one piece of direct feedback','Ask for feedback this week','Delegate one owned task','Protect recovery for the people you lead'),
    JSON_ARRAY('mens-life','burden-purpose'),
    'How well do you lead through clarity, accountability, and care — not control?',
    'Where is leadership tested most for you right now?'
  UNION ALL SELECT
    'financial_strength','Financial Strength','Financial',
    'Stewardship, planning, and enoughness that support freedom and responsibility. Wealth, status spending, and comparison are not the measure.',
    'mission-and-leadership', 10.00, '#74C69D', 'wallet', 5, 0, 0, 0,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat','athlete'),
    JSON_ARRAY('full','quick','annual-review','retreat','targeted'),
    JSON_OBJECT('low','Financial foundation feels fragile','mid','Mixed financial practice','high','Steady, intentional financial stewardship'),
    JSON_ARRAY('Budgeting','Saving','Debt management','Giving','Long-term planning','I equate worth with income','Financial strength currently feels solid','Spending is reactive','Other','Prefer not to answer'),
    JSON_ARRAY('Review one monthly money practice','Automate one save or debt payment','Define enough for this season','Have one honest money conversation','Reduce one status-driven spend'),
    JSON_ARRAY('mens-life','personal-fulfillment'),
    'How intentional and sustainable is your financial stewardship right now?',
    'What most affects financial strength in this season?'
  UNION ALL SELECT
    'relationships','Relationships','Relationships',
    'Honest, reciprocal bonds that can hold truth, support, and mutual responsibility. Isolation or one-way loyalty is not strength.',
    'connection-and-emotional-mastery', 10.00, '#1D3557', 'users', 6, 0, 0, 0,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat','athlete'),
    JSON_ARRAY('full','quick','annual-review','retreat','targeted'),
    JSON_OBJECT('low','Connection feels thin or strained','mid','Mixed relational health','high','Honest, mutual, dependable bonds'),
    JSON_ARRAY('Partnership','Friendship','Family','Mentorship','I avoid closeness','Relationships currently feel strong','I over-function for others','Difficulty asking for help','Other','Prefer not to answer'),
    JSON_ARRAY('Initiate one honest conversation','Ask for support directly','Schedule recurring connection time','Repair one strained bond when safe','Join a community with mutual care'),
    JSON_ARRAY('relationship-health','mens-life','marriage-alignment'),
    'How strong and mutual are the relationships that support what you are building?',
    'What most affects your relationships right now?'
  UNION ALL SELECT
    'fatherhood','Fatherhood','Fatherhood',
    'Present, intentional care and guidance for children or father-figureship roles when applicable. Not applicable when you are not a father or father-figure in this season — and that is fully valid.',
    'connection-and-emotional-mastery', 10.00, '#457B9D', 'home', 7, 0, 1, 1,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat','athlete'),
    JSON_ARRAY('full','quick','annual-review','retreat','targeted'),
    JSON_OBJECT('low','Presence and guidance feel limited','mid','Mixed fatherhood practice','high','Present, intentional, sustainable fatherhood'),
    JSON_ARRAY('Daily presence','Guidance and teaching','Play and connection','Co-parenting coordination','I am not a father or father-figure','Fatherhood currently feels strong','Work crowds out presence','Other','Prefer not to answer'),
    JSON_ARRAY('Protect one undistracted presence block','Create one weekly ritual','Have one curious conversation','Align with co-parent on one standard','Ask for parenting support when needed'),
    JSON_ARRAY('parenting-confidence','mens-life','family-functioning'),
    'When fatherhood applies, how present and intentional is your practice right now?',
    'What most shapes fatherhood for you in this season — or is it not applicable?'
  UNION ALL SELECT
    'discipline','Discipline','Discipline',
    'Reliable practice and follow-through that support the life you value. Discipline includes rest rhythms; rigidity and self-punishment are not the goal.',
    'body-and-performance', 10.00, '#6D597A', 'anchor', 8, 0, 0, 0,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat','athlete'),
    JSON_ARRAY('full','quick','annual-review','retreat','targeted'),
    JSON_OBJECT('low','Follow-through feels unreliable','mid','Mixed consistency','high','Steady, sustainable practice'),
    JSON_ARRAY('Morning or evening routines','Work habits','Training consistency','Financial habits','Sleep rhythm','I am overly rigid','Discipline currently feels supportive','Shame drives my routines','Other','Prefer not to answer'),
    JSON_ARRAY('Protect one non-negotiable daily practice','Make the next action smaller','Add a weekly recovery block','Track completion without self-attack','Ask for structure support'),
    JSON_ARRAY('digital-wellness','mens-life','burden-purpose'),
    'How consistently do you practice the habits that support what you are building?',
    'What most helps or hinders your discipline?'
  UNION ALL SELECT
    'adventure_challenge','Adventure & Challenge','Adventure',
    'Chosen difficulty and exploration that build capacity and aliveness without glorifying harm. Challenge is distinct from chaos, coercion, or escape.',
    'challenge-and-legacy', 10.00, '#BC6C25', 'mountain', 9, 0, 0, 0,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat','athlete'),
    JSON_ARRAY('full','quick','annual-review','retreat','targeted'),
    JSON_OBJECT('low','Little chosen challenge','mid','Some challenge, inconsistent','high','Regular, chosen, recoverable challenge'),
    JSON_ARRAY('Physical training','Skill building','Hard conversations','Creative risk','Outdoors or travel','I confuse chaos with challenge','Adventure currently feels healthy','I push past recovery','Other','Prefer not to answer'),
    JSON_ARRAY('Choose one recoverable challenge this week','Define a clear stop-condition for intensity','Pair challenge with recovery','Ask a peer for accountability that includes rest','Reduce one unsafe or ego-driven push'),
    JSON_ARRAY('athlete-readiness','mens-life','burden-purpose'),
    'How well are you choosing growth-oriented challenge that you can recover from?',
    'What kinds of challenge feel meaningful versus harmful?'
  UNION ALL SELECT
    'emotional_intelligence','Emotional Intelligence','Emotional',
    'Awareness, naming, and skillful response to emotion in yourself and others. Emotional intelligence includes honesty and repair — not numbness or performance of calm.',
    'connection-and-emotional-mastery', 10.00, '#B08968', 'heart', 10, 0, 1, 0,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat','athlete'),
    JSON_ARRAY('full','quick','annual-review','retreat','targeted'),
    JSON_OBJECT('low','Emotional awareness feels limited','mid','Mixed emotional skill','high','Aware, honest, skillful emotional practice'),
    JSON_ARRAY('Naming feelings','Listening','Repair after conflict','Self-regulation','I treat emotion as weakness','Emotional intelligence currently feels strong','I shut down under stress','Other','Prefer not to answer'),
    JSON_ARRAY('Name one feeling before reacting','Practice one listening turn','Make one repair conversation','Journal emotional patterns weekly','Seek counseling for stuck patterns'),
    JSON_ARRAY('relationship-health','mens-life','teen-wellbeing'),
    'How skillfully do you notice and work with emotion — yours and others'' — without shutting down?',
    'What most affects emotional intelligence for you?'
  UNION ALL SELECT
    'brotherhood','Brotherhood','Brotherhood',
    'Trusted male peer bonds that hold truth, accountability, and mutual care. Brotherhood is not isolation, status circles, or one-way loyalty.',
    'connection-and-emotional-mastery', 10.00, '#9C6644', 'handshake', 11, 0, 0, 0,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat','athlete'),
    JSON_ARRAY('full','quick','annual-review','retreat','targeted'),
    JSON_OBJECT('low','Little trusted peer connection','mid','Some connection, inconsistent','high','Honest, mutual brotherhood'),
    JSON_ARRAY('Close friends','Accountability group','Mentors','Training partners','I go it alone','Brotherhood currently feels strong','Hard to ask for help','Other','Prefer not to answer'),
    JSON_ARRAY('Reach out to one trusted peer','Schedule a recurring check-in','Share one honest struggle','Invite mutual accountability','Join a group with real care'),
    JSON_ARRAY('mens-life','relationship-health'),
    'How present are trusted peer bonds that hold truth and mutual care?',
    'What most helps or blocks brotherhood for you?'
  UNION ALL SELECT
    'legacy','Legacy','Legacy',
    'Choices that shape the influence, values, and care you want to leave — through people, craft, and example. Legacy is not fame, wealth, or biological children alone.',
    'challenge-and-legacy', 10.00, '#8B5E34', 'landmark', 12, 0, 0, 0,
    JSON_ARRAY('general-adult','young-adult','midlife','leadership','coaching','retreat','athlete'),
    JSON_ARRAY('full','quick','annual-review','retreat','targeted'),
    JSON_OBJECT('low','Little intentional legacy practice','mid','Some alignment with long view','high','Clear, practiced legacy direction'),
    JSON_ARRAY('Mentorship','Family example','Craft or work','Community impact','Character transmission','Legacy currently feels intentional','I equate legacy with status','Other','Prefer not to answer'),
    JSON_ARRAY('Write a one-paragraph legacy statement','Teach one skill','Create one tradition','Mentor one person','Align one weekly action with long-view values'),
    JSON_ARRAY('mens-life','personal-fulfillment','values-alignment','burden-purpose'),
    'How closely do your current choices practice the legacy you want to build?',
    'What most shapes your sense of legacy now?'
) AS d
WHERE @sb_tpl_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM savage_blueprint_template_domains x
    WHERE x.template_id = @sb_tpl_id AND x.domain_key = d.domain_key
  );
