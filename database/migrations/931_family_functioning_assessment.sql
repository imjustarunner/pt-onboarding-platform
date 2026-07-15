-- Migration 931: Family Functioning Assessment (Family Ecosystem Map)
-- Solo caregiver / household reflection — neutral, non-blaming.
-- Primary viz: Family Ecosystem Map (4 zones). Secondary: Functioning × Importance matrix.
-- Does not diagnose dysfunction, custody fitness, or abuse. Low scores are not abuse conclusions.

CREATE TABLE IF NOT EXISTS family_functioning_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = platform default',
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  settings_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ff_templates_agency (agency_id),
  KEY idx_ff_templates_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS family_functioning_template_domains (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  short_label VARCHAR(64) NOT NULL,
  definition TEXT NULL,
  family_system ENUM(
    'communication-and-safety',
    'structure-and-cooperation',
    'connection-and-enjoyment',
    'adaptability'
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
  UNIQUE KEY uq_ff_tpl_domain (template_id, domain_key),
  KEY idx_ff_tpl_domain_order (template_id, display_order),
  CONSTRAINT fk_ff_tpl_domain_template
    FOREIGN KEY (template_id) REFERENCES family_functioning_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS family_functioning_assessments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL,
  template_id BIGINT UNSIGNED NOT NULL,
  template_version INT NOT NULL DEFAULT 1,
  participant_user_id INT NULL,
  client_id INT NULL,
  coach_user_id INT NULL,
  counselor_user_id INT NULL,
  companion_assessment_id BIGINT UNSIGNED NULL COMMENT 'Optional Family Perspectives companion (future)',
  cycle_id VARCHAR(64) NULL COMMENT 'Optional multi-participant cycle id (RH-style stub)',
  group_id INT NULL,
  mode ENUM('full','quick','seasonal-review','transition','targeted') NOT NULL DEFAULT 'full',
  participant_version VARCHAR(64) NOT NULL DEFAULT 'general-household',
  status ENUM('not_started','in_progress','completed','reviewed','archived') NOT NULL DEFAULT 'not_started',
  access_token VARCHAR(64) NOT NULL,
  context_json JSON NULL,
  summary_json JSON NULL,
  family_functioning_index INT NULL,
  importance_weighted_index INT NULL,
  selected_priorities_json JSON NULL,
  support_plans_json JSON NULL,
  weekly_commitments_json JSON NULL,
  reviewed_at DATETIME NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ff_access_token (access_token),
  KEY idx_ff_assess_agency (agency_id),
  KEY idx_ff_assess_participant (participant_user_id),
  KEY idx_ff_assess_status (status),
  KEY idx_ff_assess_mode (mode),
  KEY idx_ff_assess_cycle (cycle_id),
  CONSTRAINT fk_ff_assess_template
    FOREIGN KEY (template_id) REFERENCES family_functioning_templates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS family_functioning_responses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  current_functioning_score TINYINT UNSIGNED NULL,
  personal_importance_score TINYINT UNSIGNED NULL,
  support_need_score TINYINT UNSIGNED NULL,
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
  UNIQUE KEY uq_ff_resp (assessment_id, domain_key),
  CONSTRAINT fk_ff_resp_assessment
    FOREIGN KEY (assessment_id) REFERENCES family_functioning_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS family_functioning_support_requests (
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
  KEY idx_ff_support_assessment (assessment_id),
  CONSTRAINT fk_ff_support_assessment
    FOREIGN KEY (assessment_id) REFERENCES family_functioning_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO family_functioning_templates (agency_id, name, description, version, settings_json, is_active)
SELECT NULL,
  'Family Functioning Assessment',
  'Notice how family life is working across communication, respect, routines, teamwork, conflict, emotional safety, connection, flexibility, responsibilities, and fun — from one participant''s current experience.',
  1,
  JSON_OBJECT(
    'visualExperienceName', 'Family Ecosystem Map',
    'subtitle', 'How is family life working right now?',
    'resultsTitle', 'Your Family Ecosystem Map',
    'alternativeResultsTitle', 'Your Family Functioning Profile',
    'coachDashboardTitle', 'Family Functioning Overview',
    'programDashboardTitle', 'Family Functioning Dashboard',
    'enableImportance', true,
    'enableSupportNeed', true,
    'enableSupportRequests', true,
    'enableQuickExit', true,
    'maxPriorities', 3,
    'soloResultsLabel', 'This profile reflects one participant''s current experience of the family.',
    'disclaimer', 'This assessment reflects one person''s current experience of family life. It does not diagnose dysfunction, rank families, measure custody fitness, or conclude that abuse is or is not occurring. Low scores are not abuse conclusions.',
    'indexClarification', 'The Family Functioning Index summarizes how workable family life currently feels across the areas you completed. It does not measure family worth or predict outcomes.',
    'safetyNote', 'If you or someone in your household is in immediate danger, leave this page and contact local emergency services or a trusted crisis resource. Low functioning scores are not abuse conclusions. If violence or fear for safety is part of your situation, do not use family meetings or confrontation as a next step — seek qualified, confidential support first.',
    'violenceDisclosureNote', 'If someone discloses violence or fear for safety, do not recommend family meetings, mediation, or shared confrontation. Prioritize safety planning with qualified support.',
    'quickExitUrl', 'https://www.weather.com',
    'familyPerspectivesStub', true
  ),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM family_functioning_templates WHERE agency_id IS NULL AND is_active = 1 LIMIT 1
);

SET @ff_tpl_id := (
  SELECT id FROM family_functioning_templates WHERE agency_id IS NULL AND is_active = 1 ORDER BY id ASC LIMIT 1
);

INSERT INTO family_functioning_template_domains
  (template_id, domain_key, label, short_label, definition, family_system, weight, color, icon,
   display_order, is_active, is_optional, is_sensitive, participant_versions_json, available_modes_json,
   score_labels_json, reflection_options_json, action_suggestions_json, related_assessment_ids_json,
   primary_question, reflection_prompt)
SELECT @ff_tpl_id, d.domain_key, d.label, d.short_label, d.definition, d.family_system, d.weight, d.color, d.icon,
  d.display_order, 1, d.is_optional, d.is_sensitive, d.participant_versions_json, d.available_modes_json,
  d.score_labels_json, d.reflection_options_json, d.action_suggestions_json, d.related_assessment_ids_json,
  d.primary_question, d.reflection_prompt
FROM (
  SELECT
    'communication' AS domain_key,
    'Communication' AS label,
    'Communication' AS short_label,
    'How open, clear, and workable everyday talking and listening feel among people in the household.' AS definition,
    'communication-and-safety' AS family_system,
    10.00 AS weight,
    '#475569' AS color,
    'messages' AS icon,
    1 AS display_order,
    0 AS is_optional,
    0 AS is_sensitive,
    JSON_ARRAY('general-household','parents-and-children','couple-with-kids','multigenerational','blended-family','single-caregiver-household','co-parenting-household','chosen-family') AS participant_versions_json,
    JSON_ARRAY('full','quick','seasonal-review','transition','targeted') AS available_modes_json,
    JSON_OBJECT('low','Talking feels strained or rare','mid','Some conversations work well','high','We can usually talk and listen') AS score_labels_json,
    JSON_ARRAY('Everyone is rushed','Screens interrupt us','Tone escalates quickly','People shut down','Unclear expectations','We currently communicate fairly well','Other','Prefer not to answer') AS reflection_options_json,
    JSON_ARRAY('Protect ten device-free minutes of conversation','Ask one open question daily','Reflect back what you heard before responding','Share one appreciation each day','Schedule a short weekly check-in when safe') AS action_suggestions_json,
    JSON_ARRAY('relationship-health','parenting-confidence') AS related_assessment_ids_json,
    'How workable does everyday communication feel in your family right now?' AS primary_question,
    'What most affects communication at home?' AS reflection_prompt
  UNION ALL SELECT
    'respect','Respect','Respect',
    'How dignified, considerate, and mutual interactions feel — tone, boundaries, and regard for one another.',
    'communication-and-safety', 10.00, '#64748B', 'handshake', 2, 0, 0,
    JSON_ARRAY('general-household','parents-and-children','couple-with-kids','multigenerational','blended-family','single-caregiver-household','co-parenting-household','chosen-family'),
    JSON_ARRAY('full','quick','seasonal-review','transition','targeted'),
    JSON_OBJECT('low','Respect feels thin or one-sided','mid','Respect comes and goes','high','Regard for one another feels steady enough'),
    JSON_ARRAY('Sarcasm or put-downs','Uneven power','Dismissed opinions','Name-calling under stress','Different standards for adults and kids','Respect currently feels solid','Other','Prefer not to answer'),
    JSON_ARRAY('Agree on one non-negotiable respect rule','Pause before responding when tone rises','Name what respect looks like in your home','Repair after a disrespectful moment','Model the tone you want returned'),
    JSON_ARRAY('relationship-health'),
    'How respectful do everyday interactions feel in your family right now?',
    'What most affects respect at home?'
  UNION ALL SELECT
    'routines','Routines','Routines',
    'How predictable and workable daily rhythms, transitions, and household expectations feel.',
    'structure-and-cooperation', 10.00, '#A16207', 'calendar', 3, 0, 0,
    JSON_ARRAY('general-household','parents-and-children','couple-with-kids','multigenerational','blended-family','single-caregiver-household','co-parenting-household','chosen-family'),
    JSON_ARRAY('full','quick','seasonal-review','transition','targeted'),
    JSON_OBJECT('low','Rhythms feel chaotic or exhausting','mid','Some routines hold, others slip','high','Daily rhythm feels workable enough'),
    JSON_ARRAY('Busy schedules','Different caregivers','Unclear mornings or evenings','Transitions disrupt us','Too many competing demands','Routines currently feel workable','Other','Prefer not to answer'),
    JSON_ARRAY('Protect one small daily routine','Write down two household expectations','Stabilize one hard transition','Share one routine with another caregiver','Celebrate one consistent win this week'),
    JSON_ARRAY('parenting-confidence'),
    'How workable do family routines and daily rhythm feel right now?',
    'What most affects routines?'
  UNION ALL SELECT
    'teamwork','Teamwork','Teamwork',
    'How well household members pull together, share effort, and cooperate toward shared needs.',
    'structure-and-cooperation', 10.00, '#3F6212', 'users', 4, 0, 0,
    JSON_ARRAY('general-household','parents-and-children','couple-with-kids','multigenerational','blended-family','single-caregiver-household','co-parenting-household','chosen-family'),
    JSON_ARRAY('full','quick','seasonal-review','transition','targeted'),
    JSON_OBJECT('low','Cooperation feels rare','mid','We team up sometimes','high','We usually pull together when it matters'),
    JSON_ARRAY('Uneven load','Unclear roles','Competing priorities','Resistance to help','Little shared planning','Teamwork currently feels strong','Other','Prefer not to answer'),
    JSON_ARRAY('Name one shared household goal for the week','Ask for help with one concrete task','Create a simple shared checklist','Acknowledge cooperation when it happens','Trade one task you each prefer less'),
    JSON_ARRAY(),
    'How well does your household work as a team right now?',
    'What most affects teamwork?'
  UNION ALL SELECT
    'conflict_resolution','Conflict Resolution','Conflict',
    'How able the household feels to disagree, repair, and return to workable connection without lasting rupture.',
    'communication-and-safety', 10.00, '#9A3412', 'scale', 5, 0, 1,
    JSON_ARRAY('general-household','parents-and-children','couple-with-kids','multigenerational','blended-family','single-caregiver-household','co-parenting-household','chosen-family'),
    JSON_ARRAY('full','quick','seasonal-review','transition','targeted'),
    JSON_OBJECT('low','Conflict feels stuck or explosive','mid','Some repairs work, others linger','high','We can usually repair after hard moments'),
    JSON_ARRAY('We avoid hard topics','Arguments escalate quickly','Repair rarely happens','Same issues repeat','Someone leaves without closure','Conflict currently feels workable','Other','Prefer not to answer'),
    JSON_ARRAY('Agree on a pause signal before escalation','Practice one short repair phrase','Return to unfinished conversations when calm','Separate problem-solving from blame','Seek outside support if conflict feels unsafe'),
    JSON_ARRAY('relationship-health','marriage-alignment'),
    'How workable does conflict and repair feel in your family right now?',
    'What most affects conflict and repair?'
  UNION ALL SELECT
    'emotional_safety','Emotional Safety','Safety',
    'How safe it feels to express feelings, needs, and mistakes without fear of ridicule, punishment, or lasting rejection. This is not a clinical abuse screen.',
    'communication-and-safety', 10.00, '#1D4ED8', 'shield-heart', 6, 0, 1,
    JSON_ARRAY('general-household','parents-and-children','couple-with-kids','multigenerational','blended-family','single-caregiver-household','co-parenting-household','chosen-family'),
    JSON_ARRAY('full','quick','seasonal-review','transition','targeted'),
    JSON_OBJECT('low','Expressing feelings feels risky','mid','Safety comes and goes','high','It usually feels safe enough to be honest'),
    JSON_ARRAY('Fear of judgment','Walking on eggshells','Emotions get dismissed','Mistakes bring harsh reactions','Someone feels unheard','Emotional safety currently feels solid','Other','Prefer not to answer'),
    JSON_ARRAY('Validate before problem-solving','Create a calm reset ritual','Name feelings without fixing immediately','Protect one low-pressure check-in','If safety feels threatened, seek qualified confidential support'),
    JSON_ARRAY('teen-wellbeing','relationship-health'),
    'How emotionally safe does it feel to be honest in your family right now?',
    'What most affects emotional safety?'
  UNION ALL SELECT
    'connection','Connection','Connection',
    'How close, known, and emotionally available household members feel to one another in ordinary life.',
    'connection-and-enjoyment', 10.00, '#0F766E', 'heart', 7, 0, 0,
    JSON_ARRAY('general-household','parents-and-children','couple-with-kids','multigenerational','blended-family','single-caregiver-household','co-parenting-household','chosen-family'),
    JSON_ARRAY('full','quick','seasonal-review','transition','targeted'),
    JSON_OBJECT('low','Closeness feels thin','mid','Connection comes in pockets','high','We feel reasonably close and available'),
    JSON_ARRAY('Schedules crowd us out','Screens replace presence','Little one-on-one time','Emotional distance','Busy logistics','Connection currently feels strong','Other','Prefer not to answer'),
    JSON_ARRAY('Protect one short one-on-one moment weekly','Share one appreciation each day','Do a shared activity without multitasking','Ask what someone needs to feel more connected','Keep a simple ritual that belongs to your family'),
    JSON_ARRAY('relationship-health','personal-fulfillment'),
    'How connected does your family feel in everyday life right now?',
    'What most affects connection?'
  UNION ALL SELECT
    'flexibility','Flexibility','Flexibility',
    'How able the household feels to adapt when plans change, stress rises, or someone needs something different.',
    'adaptability', 10.00, '#7C3AED', 'wind', 8, 0, 0,
    JSON_ARRAY('general-household','parents-and-children','couple-with-kids','multigenerational','blended-family','single-caregiver-household','co-parenting-household','chosen-family'),
    JSON_ARRAY('full','quick','seasonal-review','transition','targeted'),
    JSON_OBJECT('low','Change feels destabilizing','mid','We adapt sometimes','high','We can usually flex without falling apart'),
    JSON_ARRAY('Rigid expectations','Stress overload','Unclear backups','Transitions are hard','Little shared problem-solving','Flexibility currently feels workable','Other','Prefer not to answer'),
    JSON_ARRAY('Name one plan B for a hard transition','Practice a short reset when plans change','Ask what each person needs during change','Reduce one rigid expectation this week','Celebrate a moment you adapted well together'),
    JSON_ARRAY(),
    'How flexible does your family feel when plans or stress change?',
    'What most affects flexibility?'
  UNION ALL SELECT
    'responsibilities','Responsibilities','Responsibilities',
    'How clear and fair household roles, chores, and follow-through feel across people who share the load.',
    'structure-and-cooperation', 10.00, '#B45309', 'clipboard', 9, 0, 0,
    JSON_ARRAY('general-household','parents-and-children','couple-with-kids','multigenerational','blended-family','single-caregiver-household','co-parenting-household','chosen-family'),
    JSON_ARRAY('full','quick','seasonal-review','transition','targeted'),
    JSON_OBJECT('low','Roles feel unclear or unfair','mid','Some follow-through works','high','Responsibilities feel clear enough for this season'),
    JSON_ARRAY('Uneven load','Unclear ownership','Reminders create friction','Age-appropriate expectations unclear','Resentment builds','Responsibilities currently feel workable','Other','Prefer not to answer'),
    JSON_ARRAY('Clarify one shared responsibility this week','Match one task to capacity, not guilt','Create a simple visible checklist','Thank follow-through when it happens','Renegotiate one unfair load item'),
    JSON_ARRAY('parenting-confidence','mens-life'),
    'How clear and workable do household responsibilities feel right now?',
    'What most affects responsibilities?'
  UNION ALL SELECT
    'fun','Fun','Fun',
    'How much lightness, play, humor, and shared enjoyment show up in ordinary family life.',
    'connection-and-enjoyment', 10.00, '#C2410C', 'sparkles', 10, 0, 0,
    JSON_ARRAY('general-household','parents-and-children','couple-with-kids','multigenerational','blended-family','single-caregiver-household','co-parenting-household','chosen-family'),
    JSON_ARRAY('full','quick','seasonal-review','transition','targeted'),
    JSON_OBJECT('low','Fun feels rare or postponed','mid','We enjoy each other sometimes','high','Lightness shows up often enough'),
    JSON_ARRAY('Too many logistics','Stress crowds out play','Different interests','Guilt about resting','Screens replace shared fun','Fun currently feels present','Other','Prefer not to answer'),
    JSON_ARRAY('Schedule one low-pressure shared activity','Protect ten minutes of play or humor','Let someone else choose the activity','Keep one family ritual that is purely enjoyable','Notice and name a moment of lightness'),
    JSON_ARRAY('personal-fulfillment'),
    'How present does fun and shared enjoyment feel in your family right now?',
    'What most affects fun at home?'
) AS d
WHERE @ff_tpl_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM family_functioning_template_domains x
    WHERE x.template_id = @ff_tpl_id AND x.domain_key = d.domain_key
  );
