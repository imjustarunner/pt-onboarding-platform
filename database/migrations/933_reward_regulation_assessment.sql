-- Migration 933: The Reward Regulation Assessment
-- Adult behavior / attention / reward-seeking regulation — premium behavior-performance dashboard.
-- Primary viz: Reward Regulation System (4 zones / 12 domain nodes). Secondary: Reward Channel Heatmap.
-- Evaluates self-reported behavior patterns — NOT dopamine levels, addiction diagnosis, or receptor damage.
-- Distinct from Digital Wellness (device habits), Savage Blueprint (life execution), Burden & Purpose (meaningful responsibility).

CREATE TABLE IF NOT EXISTS reward_regulation_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = platform default',
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  settings_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rr_templates_agency (agency_id),
  KEY idx_rr_templates_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reward_regulation_template_domains (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  short_label VARCHAR(64) NOT NULL,
  definition TEXT NULL,
  regulation_system ENUM(
    'command',
    'regulation',
    'environment',
    'direction'
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
  UNIQUE KEY uq_rr_tpl_domain (template_id, domain_key),
  KEY idx_rr_tpl_domain_order (template_id, display_order),
  CONSTRAINT fk_rr_tpl_domain_template
    FOREIGN KEY (template_id) REFERENCES reward_regulation_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reward_regulation_template_channels (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT UNSIGNED NOT NULL,
  channel_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  short_label VARCHAR(64) NOT NULL,
  description TEXT NULL,
  category VARCHAR(64) NOT NULL DEFAULT 'general',
  is_sensitive TINYINT(1) NOT NULL DEFAULT 0,
  is_optional TINYINT(1) NOT NULL DEFAULT 1,
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  color VARCHAR(16) NULL,
  support_routing_json JSON NULL COMMENT 'Optional specialized support preference stubs',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rr_tpl_channel (template_id, channel_key),
  KEY idx_rr_tpl_channel_order (template_id, display_order),
  CONSTRAINT fk_rr_tpl_channel_template
    FOREIGN KEY (template_id) REFERENCES reward_regulation_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reward_regulation_assessments (
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
  mode ENUM('full','quick','targeted','weekly') NOT NULL DEFAULT 'full',
  participant_version VARCHAR(64) NOT NULL DEFAULT 'general-adult',
  status ENUM('not_started','in_progress','completed','reviewed','archived') NOT NULL DEFAULT 'not_started',
  access_token VARCHAR(64) NOT NULL,
  context_json JSON NULL,
  summary_json JSON NULL,
  reward_regulation_score INT NULL,
  priority_weighted_score INT NULL,
  channel_impact_index INT NULL COMMENT 'Separate from regulation score; Impact Index does not enter standard score',
  selected_priorities_json JSON NULL,
  regulation_plans_json JSON NULL COMMENT 'cue remove / friction / replace / protect / lapse response',
  friction_board_json JSON NULL,
  weekly_checkins_json JSON NULL COMMENT 'Regulation Week light stub',
  selected_channels_json JSON NULL,
  reviewed_at DATETIME NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rr_access_token (access_token),
  KEY idx_rr_assess_agency (agency_id),
  KEY idx_rr_assess_participant (participant_user_id),
  KEY idx_rr_assess_status (status),
  KEY idx_rr_assess_mode (mode),
  CONSTRAINT fk_rr_assess_template
    FOREIGN KEY (template_id) REFERENCES reward_regulation_templates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reward_regulation_responses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  current_regulation_score TINYINT UNSIGNED NULL COMMENT 'Required for Reward Regulation Score (1–10)',
  personal_importance_score TINYINT UNSIGNED NULL,
  momentum_score TINYINT UNSIGNED NULL,
  reflection_chips_json JSON NULL,
  barriers_json JSON NULL,
  strengths_json JSON NULL,
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
  UNIQUE KEY uq_rr_resp (assessment_id, domain_key),
  CONSTRAINT fk_rr_resp_assessment
    FOREIGN KEY (assessment_id) REFERENCES reward_regulation_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reward_regulation_channel_responses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  channel_key VARCHAR(64) NOT NULL,
  is_relevant TINYINT(1) NOT NULL DEFAULT 1,
  pull_strength_score TINYINT UNSIGNED NULL COMMENT '1–10 how strongly this channel captures attention',
  frequency_score TINYINT UNSIGNED NULL COMMENT '1–10 how often',
  cost_score TINYINT UNSIGNED NULL COMMENT '1–10 perceived cost to goals/energy',
  value_score TINYINT UNSIGNED NULL COMMENT '1–10 value still provided',
  control_score TINYINT UNSIGNED NULL COMMENT '1–10 sense of choice around this channel',
  is_private TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Sensitive channels private by default',
  notes TEXT NULL,
  support_preference VARCHAR(64) NULL,
  prefer_not_to_answer TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rr_channel_resp (assessment_id, channel_key),
  CONSTRAINT fk_rr_channel_resp_assessment
    FOREIGN KEY (assessment_id) REFERENCES reward_regulation_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO reward_regulation_templates (agency_id, name, description, version, settings_json, is_active)
SELECT NULL,
  'The Reward Regulation Assessment',
  'Map how attention, impulse, recovery, and environment shape reward-seeking patterns — then build a friction and replacement plan. Measures self-reported behavior patterns, not dopamine chemistry or addiction.',
  1,
  JSON_OBJECT(
    'visualExperienceName', 'Reward Regulation System',
    'subtitle', 'What is controlling your attention — and how do you want to reclaim choice?',
    'resultsTitle', 'Reward Command Center',
    'coachDashboardTitle', 'Reward Regulation Overview',
    'enableImportance', true,
    'enableMomentum', true,
    'enableChannelInventory', true,
    'enableFrictionBoard', true,
    'enableWeeklyCheckin', true,
    'maxPriorities', 3,
    'quickExitUrl', 'https://www.weather.com',
    'disclaimer', 'This assessment maps self-reported attention, habit, and reward-seeking patterns. It does not measure dopamine levels, diagnose addiction, assess receptor damage, or prescribe detox. Brand language about dopamine-driven habits describes common motivational patterns — not a medical lab result. Low scores are information about this season, not a moral verdict or clinical label.',
    'indexClarification', 'Reward Regulation Score summarizes currentRegulationScore across completed domains (weighted average × 10). Personal importance, momentum, stimulation load, readiness to change, and Reward Channel Impact Index do not change this standard score.',
    'channelClarification', 'The Reward Channel Inventory and Impact Index are optional context. Skipping a channel never zeroes your regulation score. Sensitive channels stay private by default.',
    'levelClarification', 'Levels (Reactive through Self-Governed) describe regulation practice bands. They are operating labels — not addiction stages or diagnoses.'
  ),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM reward_regulation_templates WHERE agency_id IS NULL AND is_active = 1 LIMIT 1
);

SET @rr_tpl_id := (
  SELECT id FROM reward_regulation_templates WHERE agency_id IS NULL AND is_active = 1 ORDER BY id ASC LIMIT 1
);

INSERT INTO reward_regulation_template_domains
  (template_id, domain_key, label, short_label, definition, regulation_system, weight, color, icon,
   display_order, is_active, is_optional, is_sensitive,
   participant_versions_json, available_modes_json,
   score_labels_json, reflection_options_json, action_suggestions_json, related_assessment_ids_json,
   primary_question, reflection_prompt)
SELECT @rr_tpl_id, d.domain_key, d.label, d.short_label, d.definition, d.regulation_system, d.weight, d.color, d.icon,
  d.display_order, 1, 0, d.is_sensitive,
  d.participant_versions_json, d.available_modes_json,
  d.score_labels_json, d.reflection_options_json, d.action_suggestions_json, d.related_assessment_ids_json,
  d.primary_question, d.reflection_prompt
FROM (
  SELECT
    'attention_control' AS domain_key,
    'Attention Control' AS label,
    'Attention' AS short_label,
    'Ability to direct and reclaim attention when stimulating options compete for it. Not a measure of willpower virtue.' AS definition,
    'command' AS regulation_system,
    10.00 AS weight,
    '#1E3A5F' AS color,
    'focus' AS icon,
    1 AS display_order,
    0 AS is_sensitive,
    JSON_ARRAY('general-adult','young-adult','professional','athlete','parent','coaching') AS participant_versions_json,
    JSON_ARRAY('full','quick','targeted','weekly') AS available_modes_json,
    JSON_OBJECT('low','Attention feels frequently captured','mid','Mixed reclaim ability','high','Steady, practiced attention control') AS score_labels_json,
    JSON_ARRAY('Phone checking','Notifications','Open tabs','Background media','Boredom','Stress','Work multitasking','Attention currently feels steady','I lose track of time','Other','Prefer not to answer') AS reflection_options_json,
    JSON_ARRAY('Create one protected focus block','Silence nonessential alerts','Single-task one priority window','Place the phone out of reach during deep work','Name the pull before opening a channel') AS action_suggestions_json,
    JSON_ARRAY('digital-wellness','savage-blueprint') AS related_assessment_ids_json,
    'How well can you currently direct and reclaim your attention when rewarding options compete?' AS primary_question,
    'What most captures your attention right now?' AS reflection_prompt
  UNION ALL SELECT
    'impulse_control','Impulse Control','Impulse',
    'Pause between urge and action around rewarding or relieving behaviors. Impulse control is skill and environment — not moral purity.',
    'command', 10.00, '#2C4A6E', 'pause', 2, 0,
    JSON_ARRAY('general-adult','young-adult','professional','athlete','parent','coaching'),
    JSON_ARRAY('full','quick','targeted','weekly'),
    JSON_OBJECT('low','Urges often lead straight to action','mid','Mixed pause skill','high','Reliable pause before acting'),
    JSON_ARRAY('Food or snacking','Scrolling','Shopping','Messaging','Gaming','Late-night use','Stress relief','Impulse control currently feels solid','I act before noticing the urge','Other','Prefer not to answer'),
    JSON_ARRAY('Insert a 60-second pause before acting','Change one environmental cue','Pre-decide a replacement action','Use a friction step before high-pull apps','Track urge without obeying it once today'),
    JSON_ARRAY('digital-wellness','mens-life'),
    'How reliably can you pause between urge and action around rewarding behaviors?',
    'Where do impulses show up most for you?'
  UNION ALL SELECT
    'delayed_gratification','Delayed Gratification','Delay',
    'Willingness and ability to wait for larger or longer-term rewards instead of immediate stimulation.',
    'command', 10.00, '#3D5A80', 'hourglass', 3, 0,
    JSON_ARRAY('general-adult','young-adult','professional','athlete','parent','coaching'),
    JSON_ARRAY('full','quick','targeted','weekly'),
    JSON_OBJECT('low','Immediate reward usually wins','mid','Mixed delay capacity','high','Consistent ability to wait for better payoffs'),
    JSON_ARRAY('Work deadlines','Training goals','Money decisions','Entertainment vs rest','Social media','Food','Delay currently feels workable','I struggle when bored','Other','Prefer not to answer'),
    JSON_ARRAY('Define one delayed payoff you care about','Schedule a short wait before a treat','Break a long goal into visible milestones','Reduce one instant-access cue','Pair waiting with a low-stimulation activity'),
    JSON_ARRAY('savage-blueprint','burden-purpose'),
    'How well can you currently wait for longer-term rewards when immediate options are available?',
    'What makes delaying gratification harder or easier?'
  UNION ALL SELECT
    'boredom_tolerance','Boredom Tolerance','Boredom',
    'Capacity to stay with low-stimulation moments without automatically seeking novelty or escape.',
    'command', 10.00, '#4A6FA5', 'still', 4, 0,
    JSON_ARRAY('general-adult','young-adult','professional','athlete','parent','coaching'),
    JSON_ARRAY('full','quick','targeted','weekly'),
    JSON_OBJECT('low','Boredom quickly triggers seeking','mid','Mixed tolerance','high','Can stay present in low stimulation'),
    JSON_ARRAY('Waiting in lines','Commutes','Evenings alone','Work gaps','Social lulls','I reach for my phone immediately','Boredom currently feels manageable','Silence feels uncomfortable','Other','Prefer not to answer'),
    JSON_ARRAY('Practice one device-free wait daily','Keep a low-stim alternative nearby','Sit with boredom for two minutes before acting','Notice the urge without fixing it','Schedule one undistracted quiet block'),
    JSON_ARRAY('digital-wellness','personal-fulfillment'),
    'How well can you tolerate low-stimulation moments without automatically seeking a hit of novelty?',
    'When boredom shows up, what do you usually reach for?'
  UNION ALL SELECT
    'digital_boundaries','Digital Boundaries','Digital',
    'Intentional limits around devices, apps, and always-on access — distinct from total abstinence.',
    'environment', 10.00, '#5B8A72', 'shield', 5, 0,
    JSON_ARRAY('general-adult','young-adult','professional','athlete','parent','coaching'),
    JSON_ARRAY('full','quick','targeted','weekly'),
    JSON_OBJECT('low','Few workable digital limits','mid','Some boundaries, inconsistent','high','Clear, practiced digital boundaries'),
    JSON_ARRAY('No phone in bed','Focus modes','App limits','Notification control','Work/personal separation','Boundaries currently feel solid','I keep restarting rules','Other','Prefer not to answer'),
    JSON_ARRAY('Pick one boundary and make it environmental','Charge devices outside the bedroom','Batch messaging windows','Remove one high-pull app from home screen','Use grayscale or focus mode during deep work'),
    JSON_ARRAY('digital-wellness'),
    'How clear and workable are your digital boundaries right now?',
    'Which digital boundaries help — and which keep failing?'
  UNION ALL SELECT
    'emotional_regulation','Emotional Regulation','Emotion',
    'Ability to notice and work with emotion without defaulting to high-stimulation escape as the only tool.',
    'regulation', 10.00, '#6D597A', 'heart', 6, 1,
    JSON_ARRAY('general-adult','young-adult','professional','athlete','parent','coaching'),
    JSON_ARRAY('full','quick','targeted','weekly'),
    JSON_OBJECT('low','Emotion often drives seeking','mid','Mixed emotional skill','high','Can feel and respond without automatic escape'),
    JSON_ARRAY('Stress','Anxiety','Loneliness','Anger','Shame','Celebration','I use stimulation to numb','Emotional regulation currently feels steady','Other','Prefer not to answer'),
    JSON_ARRAY('Name the feeling before seeking relief','Use a short grounding pause','Replace one escape with a recovery action','Journal the cue-urge-reward loop','Seek counseling when patterns feel stuck'),
    JSON_ARRAY('mens-life','relationship-health','digital-wellness'),
    'How well can you work with emotion without automatically seeking stimulation as relief?',
    'Which emotions most often trigger reward-seeking for you?'
  UNION ALL SELECT
    'sleep_and_recovery','Sleep & Recovery','Sleep',
    'Sleep timing, wind-down, and recovery that protect regulation capacity — not hustle or detox mythology.',
    'regulation', 10.00, '#457B9D', 'moon', 7, 0,
    JSON_ARRAY('general-adult','young-adult','professional','athlete','parent','coaching'),
    JSON_ARRAY('full','quick','targeted','weekly'),
    JSON_OBJECT('low','Sleep/recovery regularly undermined','mid','Mixed recovery support','high','Sleep and recovery protect regulation'),
    JSON_ARRAY('Late screens','Gaming','Streaming','Work spillover','Caffeine timing','Irregular schedule','Sleep currently supports me','I wind down with stimulation','Other','Prefer not to answer'),
    JSON_ARRAY('Set a final stimulation cutoff','Protect a wind-down window','Charge devices away from bed','Keep one consistent wake time','Replace late scrolling with a quieter ritual'),
    JSON_ARRAY('digital-wellness','athlete-readiness','savage-blueprint'),
    'How well do sleep and recovery currently protect your regulation capacity?',
    'What most disrupts rest for you?'
  UNION ALL SELECT
    'physical_activation','Physical Activation','Body',
    'Movement and embodied activation that discharge restlessness and rebuild capacity — without punishing intensity.',
    'regulation', 10.00, '#2D6A4F', 'activity', 8, 0,
    JSON_ARRAY('general-adult','young-adult','professional','athlete','parent','coaching'),
    JSON_ARRAY('full','quick','targeted','weekly'),
    JSON_OBJECT('low','Little movement or activation','mid','Inconsistent activation','high','Regular, restorative physical activation'),
    JSON_ARRAY('Walking','Training','Outdoor time','Stretching','Sitting too long','I use movement as a replacement','Physical activation currently feels solid','Fatigue blocks movement','Other','Prefer not to answer'),
    JSON_ARRAY('Add a short walk after a high-pull session','Stand during one call','Schedule movement before evening scrolling','Keep shoes or gear visible as a cue','Choose recoverable intensity'),
    JSON_ARRAY('athlete-readiness','savage-blueprint','mens-life'),
    'How consistently does physical activation support your regulation right now?',
    'What helps or blocks movement as a regulation tool?'
  UNION ALL SELECT
    'purpose_and_direction','Purpose & Direction','Purpose',
    'A sense of worthwhile direction that makes delayed rewards and friction feel meaningful — not a permanent life thesis.',
    'direction', 10.00, '#BC6C25', 'compass', 9, 0,
    JSON_ARRAY('general-adult','young-adult','professional','athlete','parent','coaching'),
    JSON_ARRAY('full','quick','targeted','weekly'),
    JSON_OBJECT('low','Little directing purpose','mid','Some direction, inconsistent pull','high','Clear seasonal direction that competes with cheap rewards'),
    JSON_ARRAY('Work or craft','Family','Faith or meaning','Creative project','Health goal','I lack a competing why','Purpose currently feels clear','Other','Prefer not to answer'),
    JSON_ARRAY('Write a one-sentence seasonal why','Protect one weekly practice that expresses it','Link a friction plan to a valued outcome','Talk with a mentor about direction','Reduce one obligation that dilutes focus'),
    JSON_ARRAY('burden-purpose','savage-blueprint','personal-fulfillment','values-alignment'),
    'How clearly does a sense of direction currently compete with cheap, immediate rewards?',
    'What purpose, if any, pulls you toward better tradeoffs?'
  UNION ALL SELECT
    'real_world_connection','Real-World Connection','Connection',
    'In-person and reciprocal bonds that provide belonging without only relying on digital stimulation loops.',
    'direction', 10.00, '#9C6644', 'users', 10, 0,
    JSON_ARRAY('general-adult','young-adult','professional','athlete','parent','coaching'),
    JSON_ARRAY('full','quick','targeted','weekly'),
    JSON_OBJECT('low','Connection feels thin or mostly digital','mid','Mixed real-world connection','high','Regular, reciprocal real-world bonds'),
    JSON_ARRAY('Friends','Partner','Family','Community','Teams or classes','I default to screens for company','Connection currently feels strong','Loneliness drives seeking','Other','Prefer not to answer'),
    JSON_ARRAY('Schedule one undistracted meet-up','Initiate one honest check-in','Join a recurring in-person activity','Put phone away during shared meals','Ask for support directly'),
    JSON_ARRAY('relationship-health','mens-life','digital-wellness'),
    'How present are real-world connections that can compete with stimulation loops?',
    'What supports or blocks offline connection for you?'
  UNION ALL SELECT
    'environment_and_access','Environment & Access','Environment',
    'How cues, defaults, and ease of access shape reward-seeking — regulation through design, not only willpower.',
    'environment', 10.00, '#52796F', 'map', 11, 0,
    JSON_ARRAY('general-adult','young-adult','professional','athlete','parent','coaching'),
    JSON_ARRAY('full','quick','targeted','weekly'),
    JSON_OBJECT('low','Environment makes seeking effortless','mid','Some helpful design, inconsistent','high','Environment supports intentional choice'),
    JSON_ARRAY('Phone always nearby','Apps on home screen','Food in sight','Work desk setup','Shared living space','Environment currently helps','I rely only on willpower','Other','Prefer not to answer'),
    JSON_ARRAY('Move one high-pull cue out of sight','Add friction to one channel','Create a dedicated wind-down space','Separate work and leisure device zones','Make the replacement option easier to start'),
    JSON_ARRAY('digital-wellness','savage-blueprint'),
    'How well does your environment currently support intentional choice over automatic seeking?',
    'Which environmental cues most pull you?'
  UNION ALL SELECT
    'consistency_and_recovery','Consistency & Recovery','Consistency',
    'Ability to return after lapses without shame spirals — sustainable practice includes recovery, not perfection.',
    'direction', 10.00, '#8B5E34', 'refresh', 12, 0,
    JSON_ARRAY('general-adult','young-adult','professional','athlete','parent','coaching'),
    JSON_ARRAY('full','quick','targeted','weekly'),
    JSON_OBJECT('low','Lapses often become spirals','mid','Mixed return skill','high','Reliable return without harsh self-attack'),
    JSON_ARRAY('All-or-nothing thinking','Shame after lapses','Clear restart rituals','Accountability','I abandon plans after one miss','Consistency currently feels workable','Other','Prefer not to answer'),
    JSON_ARRAY('Write a simple lapse response plan','Define the next smallest restart action','Separate slip from identity','Ask for non-shaming accountability','Protect sleep after a hard day'),
    JSON_ARRAY('savage-blueprint','mens-life','burden-purpose'),
    'How well can you return to your plan after a lapse without collapsing into shame or abandonment?',
    'What helps you restart after a slip?'
) AS d
WHERE @rr_tpl_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM reward_regulation_template_domains x
    WHERE x.template_id = @rr_tpl_id AND x.domain_key = d.domain_key
  );

INSERT INTO reward_regulation_template_channels
  (template_id, channel_key, label, short_label, description, category, is_sensitive, is_optional,
   display_order, is_active, color, support_routing_json)
SELECT @rr_tpl_id, c.channel_key, c.label, c.short_label, c.description, c.category, c.is_sensitive, 1,
  c.display_order, 1, c.color, c.support_routing_json
FROM (
  SELECT
    'short_form_video' AS channel_key,
    'Short-form video' AS label,
    'Short video' AS short_label,
    'TikTok, Reels, Shorts, and similar rapid-scroll feeds.' AS description,
    'digital' AS category,
    0 AS is_sensitive,
    1 AS display_order,
    '#F59E0B' AS color,
    JSON_ARRAY('strategy','accountability','coach') AS support_routing_json
  UNION ALL SELECT
    'social_media','Social media','Social',
    'Feeds, posting, stories, and social comparison loops.',
    'digital', 0, 2, '#A78BFA',
    JSON_ARRAY('strategy','accountability','coach')
  UNION ALL SELECT
    'gaming','Gaming','Gaming',
    'Console, PC, mobile, or online games.',
    'digital', 0, 3, '#60A5FA',
    JSON_ARRAY('strategy','accountability','coach')
  UNION ALL SELECT
    'streaming','Streaming / binge media','Streaming',
    'Shows, movies, YouTube long-form, and binge watching.',
    'digital', 0, 4, '#34D399',
    JSON_ARRAY('strategy')
  UNION ALL SELECT
    'messaging_notifications','Messaging & notifications','Messages',
    'Constant checking of messages, email, and alerts.',
    'digital', 0, 5, '#38BDF8',
    JSON_ARRAY('strategy','setting-change')
  UNION ALL SELECT
    'news_information','News / information seeking','News',
    'Headline refreshing, doomscrolling, and information loops.',
    'digital', 0, 6, '#94A3B8',
    JSON_ARRAY('strategy')
  UNION ALL SELECT
    'shopping','Shopping / spending loops','Shopping',
    'Online shopping, deals, cart checking, and browsing.',
    'consumption', 0, 7, '#F472B6',
    JSON_ARRAY('strategy','accountability')
  UNION ALL SELECT
    'food_snacking','Food / snacking','Food',
    'Reward eating, snacking, or delivery loops.',
    'body', 0, 8, '#FB923C',
    JSON_ARRAY('strategy','coach')
  UNION ALL SELECT
    'work_achievement','Work / achievement loops','Work',
    'Overwork, status checking, or achievement as stimulation.',
    'performance', 0, 9, '#4ADE80',
    JSON_ARRAY('strategy','coach','mentor')
  UNION ALL SELECT
    'pornography','Pornography / adult content','Adult content',
    'Optional sensitive channel. Private by default. Not a diagnosis tool.',
    'sensitive', 1, 10, '#C084FC',
    JSON_ARRAY('counselor','private-follow-up','specialized-support','unsure')
  UNION ALL SELECT
    'gambling','Gambling / betting','Gambling',
    'Optional sensitive channel. Private by default. No betting strategies provided.',
    'sensitive', 1, 11, '#F87171',
    JSON_ARRAY('counselor','private-follow-up','specialized-support','support-today','unsure')
  UNION ALL SELECT
    'substances','Substances / alcohol','Substances',
    'Optional sensitive channel. Private by default. Not a clinical addiction assessment.',
    'sensitive', 1, 12, '#FB7185',
    JSON_ARRAY('counselor','private-follow-up','specialized-support','support-today','unsure')
  UNION ALL SELECT
    'nicotine_caffeine','Nicotine / caffeine loops','Stimulants',
    'Habitual stimulant use as regulation or stimulation.',
    'body', 0, 13, '#D6D3D1',
    JSON_ARRAY('strategy','coach')
  UNION ALL SELECT
    'dating_apps','Dating / novelty apps','Dating apps',
    'Swipe and novelty-seeking in dating or hookup apps.',
    'digital', 0, 14, '#E879F9',
    JSON_ARRAY('strategy','counselor','private-follow-up')
) AS c
WHERE @rr_tpl_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM reward_regulation_template_channels x
    WHERE x.template_id = @rr_tpl_id AND x.channel_key = c.channel_key
  );
