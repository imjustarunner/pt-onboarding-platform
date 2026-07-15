-- Migration 926: Digital Wellness Assessment (Digital Wellness Grid)
-- Distinct from Life Balance / Values / Fulfillment — modular grid, intentional-use focus, not abstinence.

CREATE TABLE IF NOT EXISTS digital_wellness_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = platform default',
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  settings_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_dw_templates_agency (agency_id),
  KEY idx_dw_templates_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS digital_wellness_template_domains (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  short_label VARCHAR(64) NOT NULL,
  definition TEXT NULL,
  digital_wellness_system ENUM(
    'digital-consumption',
    'recovery-and-body',
    'performance-and-attention',
    'connection-and-presence',
    'integration'
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
  strategy_suggestions_json JSON NULL,
  primary_question TEXT NULL,
  reflection_prompt TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dw_tpl_domain (template_id, domain_key),
  KEY idx_dw_tpl_domain_order (template_id, display_order),
  CONSTRAINT fk_dw_tpl_domain_template
    FOREIGN KEY (template_id) REFERENCES digital_wellness_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS digital_wellness_assessments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL,
  template_id BIGINT UNSIGNED NOT NULL,
  template_version INT NOT NULL DEFAULT 1,
  participant_user_id INT NULL,
  client_id INT NULL,
  coach_user_id INT NULL,
  counselor_user_id INT NULL,
  caregiver_user_id INT NULL,
  educator_user_id INT NULL,
  mode ENUM('full','quick','evening','focus-productivity','family','targeted') NOT NULL DEFAULT 'full',
  participant_version VARCHAR(64) NOT NULL DEFAULT 'general-adult',
  status ENUM('not_started','in_progress','completed','reviewed','archived') NOT NULL DEFAULT 'not_started',
  access_token VARCHAR(64) NOT NULL,
  context_json JSON NULL,
  summary_json JSON NULL,
  digital_wellness_index INT NULL,
  selected_priorities_json JSON NULL,
  digital_wellness_plans_json JSON NULL,
  experiments_json JSON NULL,
  dayflow_json JSON NULL,
  usage_summary_json JSON NULL,
  reviewed_at DATETIME NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dw_access_token (access_token),
  KEY idx_dw_assess_agency (agency_id),
  KEY idx_dw_assess_participant (participant_user_id),
  KEY idx_dw_assess_status (status),
  KEY idx_dw_assess_mode (mode),
  CONSTRAINT fk_dw_assess_template
    FOREIGN KEY (template_id) REFERENCES digital_wellness_templates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS digital_wellness_responses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  current_wellness_score TINYINT UNSIGNED NULL,
  intentional_control_score TINYINT UNSIGNED NULL,
  personal_importance_score TINYINT UNSIGNED NULL,
  reflection_chips_json JSON NULL,
  value_provided_json JSON NULL,
  barriers_json JSON NULL,
  support_preference VARCHAR(64) NULL,
  private_note TEXT NULL,
  note_visibility ENUM(
    'private','selected-caregiver','selected-counselor','selected-coach',
    'workplace-related-only','shared-with-plan','do-not-save'
  ) NOT NULL DEFAULT 'private',
  season_status ENUM('active','not-relevant','paused','exploring') NOT NULL DEFAULT 'active',
  prefer_not_to_answer TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dw_resp (assessment_id, domain_key),
  CONSTRAINT fk_dw_resp_assessment
    FOREIGN KEY (assessment_id) REFERENCES digital_wellness_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS digital_wellness_support_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NULL,
  requested_support VARCHAR(64) NOT NULL,
  urgency ENUM('routine','soon','today','urgent') NOT NULL DEFAULT 'routine',
  message TEXT NULL,
  message_visibility ENUM('participant-and-recipient','authorized-support-team','restricted') NOT NULL DEFAULT 'participant-and-recipient',
  status ENUM('draft','submitted','acknowledged','scheduled','in_progress','completed','closed') NOT NULL DEFAULT 'draft',
  assigned_to_user_id INT NULL,
  expected_response_by DATETIME NULL,
  acknowledged_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_dw_support_assessment (assessment_id),
  CONSTRAINT fk_dw_support_assessment
    FOREIGN KEY (assessment_id) REFERENCES digital_wellness_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO digital_wellness_templates (agency_id, name, description, version, settings_json, is_active)
SELECT NULL,
  'Digital Wellness Assessment',
  'Understand how technology currently affects your attention, sleep, relationships, productivity, movement, and ability to stay present.',
  1,
  JSON_OBJECT(
    'visualExperienceName', 'Digital Wellness Grid',
    'subtitle', 'Understand how technology currently affects your attention, sleep, relationships, productivity, movement, and ability to stay present.',
    'resultsTitle', 'Your Digital Wellness Profile',
    'caregiverResultsTitle', 'Digital Wellness Support Overview',
    'coachDashboardTitle', 'Digital Wellness Overview',
    'enableIntentionalControl', true,
    'enableImportance', true,
    'enableSupportRequests', true,
    'enableQuickExit', true,
    'quickExitUrl', 'https://www.google.com',
    'maxPriorities', 3,
    'disclaimer', 'This assessment is not a diagnosis, addiction assessment, or measure of self-control. Screen time alone does not determine digital wellness. It does not replace qualified medical or mental-health support.',
    'indexClarification', 'The Digital Wellness Index summarizes how digital habits currently affect your life. It does not diagnose addiction or determine whether your total screen time is good or bad.'
  ),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM digital_wellness_templates WHERE agency_id IS NULL AND is_active = 1 LIMIT 1
);

SET @dw_tpl_id := (
  SELECT id FROM digital_wellness_templates WHERE agency_id IS NULL AND is_active = 1 ORDER BY id ASC LIMIT 1
);

INSERT INTO digital_wellness_template_domains
  (template_id, domain_key, label, short_label, definition, digital_wellness_system, weight, color, icon,
   display_order, is_active, is_optional, is_sensitive, participant_versions_json, available_modes_json,
   score_labels_json, reflection_options_json, strategy_suggestions_json, primary_question, reflection_prompt)
SELECT @dw_tpl_id, d.domain_key, d.label, d.short_label, d.definition, d.digital_wellness_system, d.weight, d.color, d.icon,
  d.display_order, 1, 0, d.is_sensitive, d.participant_versions_json, d.available_modes_json,
  d.score_labels_json, d.reflection_options_json, d.strategy_suggestions_json, d.primary_question, d.reflection_prompt
FROM (
  SELECT
    'screen_time' AS domain_key,
    'Screen Time' AS label,
    'Screen Time' AS short_label,
    'How balanced, intentional, and useful overall device use currently feels. Lower screen time is not always better.' AS definition,
    'digital-consumption' AS digital_wellness_system,
    10.00 AS weight,
    '#0EA5E9' AS color,
    'monitor' AS icon,
    1 AS display_order,
    0 AS is_sensitive,
    JSON_ARRAY('teen','college-student','general-adult','parent-caregiver','workplace','family','coaching-counseling') AS participant_versions_json,
    JSON_ARRAY('full','quick','evening','focus-productivity','family','targeted') AS available_modes_json,
    JSON_OBJECT('low','Mostly automatic or disruptive','mid','Mixed or inconsistent','high','Intentional, useful, and balanced') AS score_labels_json,
    JSON_ARRAY('Work or school requirements','Phone checking','Streaming','Browsing','Messaging','Gaming','Social media','Multitasking','Boredom','Stress','Habit','Screen use currently feels balanced','I am unsure where the time goes','Other','Prefer not to answer') AS reflection_options_json,
    JSON_ARRAY('Identify required versus optional screen time','Create one screen-free period','Move the phone during a specific routine','Disable selected nonessential notifications','Use a focus mode','Add a transition alarm','Choose a specific purpose before opening a device','Review one week of screen-time data without judgment') AS strategy_suggestions_json,
    'How balanced and intentional does your overall screen use currently feel?' AS primary_question,
    'What most affects your overall screen use?' AS reflection_prompt
  UNION ALL SELECT
    'gaming','Gaming','Gaming',
    'How balanced, enjoyable, social, and manageable gaming currently feels. Frequent play is not automatically harmful.',
    'digital-consumption', 10.00, '#8B5CF6', 'gamepad', 2, 0,
    JSON_ARRAY('teen','college-student','general-adult','family','coaching-counseling'),
    JSON_ARRAY('full','quick','evening','family','targeted'),
    JSON_OBJECT('low','Frequently disruptive or difficult to manage','mid','Mixed','high','Enjoyable, intentional, and balanced'),
    JSON_ARRAY('Gaming is a meaningful hobby','Gaming helps me connect with others','I play longer than intended','I lose sleep','Responsibilities are delayed','Competition creates stress','I become frustrated','I spend more than intended','Gaming helps me relax','I use gaming to avoid other concerns','I have difficulty stopping','Gaming currently feels balanced','I do not currently game','Other','Prefer not to answer'),
    JSON_ARRAY('Choose a planned start and stop time','Finish the current round rather than beginning another','Use a visible timer','Schedule gaming after priority responsibilities','Create a bedtime cutoff','Plan gaming with friends','Review in-game spending','Test one shorter gaming session','Choose one offline transition activity'),
    'How positive and balanced does gaming currently feel in your life?',
    'What most affects gaming balance?'
  UNION ALL SELECT
    'social_media','Social Media','Social Media',
    'How social-media use affects connection, mood, comparison, attention, information, and personal choice.',
    'digital-consumption', 10.00, '#EC4899', 'share', 3, 0,
    JSON_ARRAY('teen','college-student','general-adult','parent-caregiver','family','coaching-counseling'),
    JSON_ARRAY('full','quick','evening','family','targeted'),
    JSON_OBJECT('low','Frequently draining or difficult to manage','mid','Mixed','high','Useful, intentional, and generally positive'),
    JSON_ARRAY('Connection with friends or family','Learning or inspiration','Entertainment','Comparison','Appearance pressure','News or world events','Conflict','Negative comments','Automatic scrolling','Fear of missing out','Posting pressure','Notifications','Social media currently feels positive','I do not use social media','Other','Prefer not to answer'),
    JSON_ARRAY('Mute or unfollow draining content','Intentionally follow useful content','Remove selected notifications','Move social apps off the home screen','Set a defined social-media window','Avoid social media during the bedtime routine','Create a before-and-after mood check','Reduce exposure to one comparison trigger'),
    'How healthy and intentional does social-media use currently feel?',
    'What most affects your social-media experience?'
  UNION ALL SELECT
    'sleep','Sleep','Sleep',
    'How well digital habits support restful sleep and a consistent bedtime routine.',
    'recovery-and-body', 10.00, '#6366F1', 'moon', 4, 0,
    JSON_ARRAY('teen','college-student','general-adult','parent-caregiver','workplace','family','coaching-counseling'),
    JSON_ARRAY('full','quick','evening','family','targeted'),
    JSON_OBJECT('low','Digital use regularly disrupts sleep','mid','Sleep effects are mixed','high','Digital habits strongly support rest'),
    JSON_ARRAY('Phone use in bed','Gaming','Streaming','Social media','Late work or school use','Notifications','Messages','Worry about missing something','Device used as an alarm','Irregular bedtime','Digital habits currently support sleep','Sleep difficulty does not appear digitally related','Other','Prefer not to answer'),
    JSON_ARRAY('Create a digital wind-down period','Schedule sleep or focus mode','Charge the device outside the bed area','Use a separate alarm clock','Set a final gaming or streaming episode','Reduce screen brightness','Complete required work earlier where possible','Choose an offline wind-down activity'),
    'How well do your current digital habits support restful sleep?',
    'What most affects sleep?'
  UNION ALL SELECT
    'productivity','Productivity','Productivity',
    'How effectively technology supports task completion, organization, and useful work without creating unnecessary distraction.',
    'performance-and-attention', 10.00, '#059669', 'check', 5, 0,
    JSON_ARRAY('teen','college-student','general-adult','workplace','coaching-counseling'),
    JSON_ARRAY('full','quick','focus-productivity','targeted'),
    JSON_OBJECT('low','Technology frequently disrupts progress','mid','Technology helps and distracts','high','Technology strongly supports focused work'),
    JSON_ARRAY('Notifications','Email','Messaging','Social media','Gaming','Multitasking','Too many open tabs','Unclear priorities','Online meetings','Digital organization','Procrastination','Helpful productivity tools','Technology currently supports my work','Other'),
    JSON_ARRAY('Create one protected focus block','Silence nonessential notifications','Close unused tabs','Use a single-task workspace','Batch email or messaging','Define the next task before opening a browser','Use a website blocker','Create a work shutdown routine','Remove one unnecessary digital tool'),
    'How effectively does technology currently support your productivity?',
    'What most affects digital productivity?'
  UNION ALL SELECT
    'relationships','Relationships','Relationships',
    'How digital use supports or interferes with attention, communication, closeness, boundaries, and shared time.',
    'connection-and-presence', 10.00, '#F59E0B', 'users', 6, 0,
    JSON_ARRAY('teen','college-student','general-adult','parent-caregiver','family','coaching-counseling'),
    JSON_ARRAY('full','quick','evening','family','targeted'),
    JSON_OBJECT('low','Digital habits frequently interfere with connection','mid','Digital effects are mixed','high','Technology supports connection without replacing presence'),
    JSON_ARRAY('Messaging helps us stay connected','Video calls support long-distance connection','Devices interrupt conversations','One or more people feel ignored','Response expectations create pressure','Group chats feel overwhelming','Online conflict','Shared gaming creates connection','Social media creates comparison or jealousy','We lack shared device boundaries','Digital communication currently feels healthy','Other','Prefer not to answer'),
    JSON_ARRAY('Create a device-free meal','Use Do Not Disturb during conversations','Clarify response-time expectations','Plan one shared offline activity','Move phones out of reach during connection time','Use digital tools intentionally for long-distance relationships','Address one online misunderstanding directly','Create a shared household charging area'),
    'How well does digital use currently support your relationships?',
    'What most affects digital relationships?'
  UNION ALL SELECT
    'exercise','Exercise','Exercise',
    'How digital routines affect movement, physical activity, outdoor time, and breaks from sitting.',
    'recovery-and-body', 10.00, '#22C55E', 'activity', 7, 0,
    JSON_ARRAY('teen','college-student','general-adult','workplace','coaching-counseling'),
    JSON_ARRAY('full','quick','evening','focus-productivity','targeted'),
    JSON_OBJECT('low','Digital use frequently replaces needed movement','mid','Balance is inconsistent','high','Digital use and movement feel well balanced'),
    JSON_ARRAY('Work or school requires long periods of sitting','Gaming','Streaming','Social media','Lack of time','Fatigue','Health limitations','Weather or access','Fitness technology helps','I take regular movement breaks','Exercise and digital use currently feel balanced','Other','Prefer not to answer'),
    JSON_ARRAY('Add a movement break between digital blocks','Stand during one call','Take a short walk after gaming or work','Schedule an activity before streaming','Use a gentle movement reminder','Place the device away from the exercise area','Use digital fitness tools only when helpful','Choose an accessible form of movement'),
    'How well do your digital habits leave room for movement and physical activity?',
    'What most affects movement?'
  UNION ALL SELECT
    'mindfulness','Mindfulness','Mindfulness',
    'The ability to notice thoughts, emotions, surroundings, and choices without automatically reaching for digital stimulation.',
    'connection-and-presence', 10.00, '#14B8A6', 'leaf', 8, 0,
    JSON_ARRAY('teen','college-student','general-adult','coaching-counseling'),
    JSON_ARRAY('full','quick','evening','targeted'),
    JSON_OBJECT('low','Automatic checking is very frequent','mid','Presence varies','high','I can be present and choose intentionally'),
    JSON_ARRAY('Boredom','Stress','Habit','Notifications','Fear of missing something','Avoiding uncomfortable thoughts','Waiting','Social expectations','Device is always nearby','I already use intentional pauses','Mindfulness tools on my device help','Other','Prefer not to answer'),
    JSON_ARRAY('Pause for one breath before unlocking','Identify the reason for opening the device','Create a device-free waiting activity','Place the phone face down or out of reach','Complete one daily activity without digital input','Practice a brief grounding exercise','Use a mindful unlock prompt','Notice the emotion before choosing the activity'),
    'How able are you to remain present without automatically checking or using a device?',
    'What most affects digital mindfulness?'
  UNION ALL SELECT
    'focus','Focus','Focus',
    'How effectively you can direct and sustain attention in an environment containing digital interruptions.',
    'performance-and-attention', 10.00, '#F97316', 'target', 9, 0,
    JSON_ARRAY('teen','college-student','general-adult','workplace','coaching-counseling'),
    JSON_ARRAY('full','quick','focus-productivity','targeted'),
    JSON_OBJECT('low','Digital distractions regularly take over','mid','Focus is inconsistent','high','I can protect and recover focus effectively'),
    JSON_ARRAY('Phone','Notifications','Messages','Social media','Gaming','Email','Open tabs','Online meetings','Background videos','Music','Internal urge to check','Digital environment currently supports focus','Other'),
    JSON_ARRAY('Use a timed focus block','Enable focus mode','Place the phone in another location','Use a single browser window','Block selected sites temporarily','Schedule message checks','Create a visual focus cue','Use a separate work profile','Plan a short recovery break'),
    'How effectively can you focus when digital distractions are available?',
    'What most affects focus?'
  UNION ALL SELECT
    'balance','Balance','Balance',
    'The overall degree to which digital activities and offline life feel intentional, flexible, and aligned with personal priorities.',
    'integration', 10.00, '#64748B', 'scale', 10, 0,
    JSON_ARRAY('teen','college-student','general-adult','parent-caregiver','workplace','family','coaching-counseling'),
    JSON_ARRAY('full','quick','evening','family','targeted'),
    JSON_OBJECT('low','Digital life frequently crowds out other priorities','mid','Balance is inconsistent','high','Digital and offline life feel intentional and sustainable'),
    JSON_ARRAY('Work or school demands','Gaming','Social media','Streaming','Messaging expectations','Lack of offline activities','Sleep','Stress','Relationships','Limited free time','Digital life currently feels balanced','I need more helpful digital connection','I need more offline recovery','Other','Prefer not to answer'),
    JSON_ARRAY('Schedule one offline activity','Define one protected digital activity','Create a weekly screen-use review','Set one device boundary','Add one connection or movement block','Remove one low-value digital habit','Protect one screen-free recovery period','Create separate work and personal device routines'),
    'How balanced does your digital and offline life currently feel?',
    'What most affects overall balance?'
) AS d
WHERE @dw_tpl_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM digital_wellness_template_domains x
    WHERE x.template_id = @dw_tpl_id AND x.domain_key = d.domain_key
  );
