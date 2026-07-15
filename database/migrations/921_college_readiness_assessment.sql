-- Migration 921: College Readiness Assessment
-- Distinct from Student Success — College Launchpad visualization.

CREATE TABLE IF NOT EXISTS college_readiness_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = platform default',
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  settings_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cr_templates_agency (agency_id),
  KEY idx_cr_templates_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS college_readiness_template_domains (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  short_label VARCHAR(64) NOT NULL,
  definition TEXT NULL,
  launch_system ENUM('academic','independence','planning','financial','transition') NOT NULL,
  launch_stage ENUM('explore','prepare','apply','enroll','transition','launch') NOT NULL,
  weight DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  color VARCHAR(16) NOT NULL,
  icon VARCHAR(64) NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_optional TINYINT(1) NOT NULL DEFAULT 0,
  student_versions_json JSON NULL,
  available_modes_json JSON NULL,
  score_labels_json JSON NULL,
  reflection_options_json JSON NULL,
  checklist_suggestions_json JSON NULL,
  primary_question TEXT NULL,
  reflection_prompt TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cr_tpl_domain (template_id, domain_key),
  KEY idx_cr_tpl_domain_order (template_id, display_order),
  CONSTRAINT fk_cr_tpl_domain_template
    FOREIGN KEY (template_id) REFERENCES college_readiness_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS college_readiness_assessments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL,
  template_id BIGINT UNSIGNED NOT NULL,
  template_version INT NOT NULL DEFAULT 1,
  student_user_id INT NULL,
  client_id INT NULL,
  counselor_user_id INT NULL,
  mode ENUM('full','quick','application','transition') NOT NULL DEFAULT 'full',
  student_version VARCHAR(64) NULL,
  status ENUM('not_started','in_progress','completed','reviewed','archived') NOT NULL DEFAULT 'not_started',
  access_token VARCHAR(64) NOT NULL,
  context_json JSON NULL,
  summary_json JSON NULL,
  college_readiness_score INT NULL,
  selected_priorities_json JSON NULL,
  launch_plans_json JSON NULL,
  checklist_json JSON NULL,
  deadlines_json JSON NULL,
  first_semester_plan_json JSON NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cr_access_token (access_token),
  KEY idx_cr_assess_agency (agency_id),
  KEY idx_cr_assess_student (student_user_id),
  KEY idx_cr_assess_status (status),
  CONSTRAINT fk_cr_assess_template
    FOREIGN KEY (template_id) REFERENCES college_readiness_templates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS college_readiness_responses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  readiness_score TINYINT UNSIGNED NULL,
  confidence_score TINYINT UNSIGNED NULL,
  support_availability_score TINYINT UNSIGNED NULL,
  reflection_chips_json JSON NULL,
  support_preference VARCHAR(64) NULL,
  note TEXT NULL,
  note_visibility ENUM('assigned-support-team','selected-staff','family','private') NOT NULL DEFAULT 'assigned-support-team',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cr_resp (assessment_id, domain_key),
  CONSTRAINT fk_cr_resp_assessment
    FOREIGN KEY (assessment_id) REFERENCES college_readiness_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS college_readiness_support_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NULL,
  requested_support VARCHAR(64) NOT NULL,
  description TEXT NULL,
  visibility ENUM('student-and-assignee','support-team','family-visible','restricted') NOT NULL DEFAULT 'support-team',
  status ENUM('submitted','acknowledged','scheduled','in_progress','completed','closed') NOT NULL DEFAULT 'submitted',
  assigned_to_user_id INT NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cr_support_assessment (assessment_id),
  CONSTRAINT fk_cr_support_assessment
    FOREIGN KEY (assessment_id) REFERENCES college_readiness_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO college_readiness_templates (agency_id, name, description, version, settings_json, is_active)
SELECT NULL,
  'College Readiness Assessment',
  'Understand how prepared you are for the academic, personal, financial, and practical demands of college life.',
  1,
  JSON_OBJECT(
    'launchpadName', 'College Launchpad',
    'subtitle', 'Understand how prepared you are for the academic, personal, financial, and practical demands of college life.',
    'resultTitle', 'Your College Readiness Plan',
    'enableConfidence', true,
    'enableSupportAvailability', true,
    'maxPriorities', 3,
    'financialDisclaimer', 'This assessment provides educational guidance and does not replace professional financial advice.',
    'disclaimer', 'This assessment is not an admissions test and does not determine whether someone is capable of attending college. It is not a diagnostic tool for learning or mental-health conditions.'
  ),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM college_readiness_templates WHERE agency_id IS NULL AND is_active = 1 LIMIT 1
);

SET @cr_tpl_id := (
  SELECT id FROM college_readiness_templates WHERE agency_id IS NULL AND is_active = 1 ORDER BY id ASC LIMIT 1
);

INSERT INTO college_readiness_template_domains
  (template_id, domain_key, label, short_label, definition, launch_system, launch_stage, weight, color, icon, display_order, is_active, is_optional,
   student_versions_json, available_modes_json, score_labels_json, reflection_options_json, checklist_suggestions_json, primary_question, reflection_prompt)
SELECT @cr_tpl_id, d.domain_key, d.label, d.short_label, d.definition, d.launch_system, d.launch_stage, d.weight, d.color, d.icon, d.display_order, 1, 0,
  d.student_versions_json, d.available_modes_json, d.score_labels_json, d.reflection_options_json, d.checklist_suggestions_json, d.primary_question, d.reflection_prompt
FROM (
  SELECT
    'academic_foundations' AS domain_key,
    'Academic Foundations' AS label,
    'Academic' AS short_label,
    'Confidence in reading, writing, mathematics, note-taking, and completing college-level academic work.' AS definition,
    'academic' AS launch_system,
    'prepare' AS launch_stage,
    12.00 AS weight,
    '#0EA5E9' AS color,
    'book' AS icon,
    1 AS display_order,
    JSON_ARRAY('junior','senior','first-generation','community-college','residential-four-year','transfer','returning-adult') AS student_versions_json,
    JSON_ARRAY('full','quick','application','transition') AS available_modes_json,
    JSON_OBJECT('low','Not prepared yet','mid','Partially prepared','high','Highly prepared') AS score_labels_json,
    JSON_ARRAY('Reading','Writing','Mathematics','Science','Research','Note-taking','Test preparation','Understanding assignments','Class participation','No major concern','Other') AS reflection_options_json,
    JSON_ARRAY('Understand course expectations','Know how to use a syllabus','Identify tutoring resources') AS checklist_suggestions_json,
    'How prepared do you feel for the academic demands of college-level courses?' AS primary_question,
    'Which academic area would benefit from more preparation?' AS reflection_prompt
  UNION ALL SELECT
    'study_strategies','Study and Learning Strategies','Study Skills',
    'Ability to learn independently, prepare for assessments, review information, and use effective study methods.',
    'academic','prepare', 10.00, '#0284C7', 'lightbulb', 2,
    JSON_ARRAY('junior','senior','first-generation','community-college','residential-four-year','transfer','returning-adult'),
    JSON_ARRAY('full','quick','transition'),
    JSON_OBJECT('low','I do not yet have effective strategies','mid','Some strategies work','high','My strategies are reliable and effective'),
    JSON_ARRAY('Weekly study planning','Test preparation','Reading difficult material','Taking useful notes','Memorization','Practice problems','Writing papers','Studying over several days','Reviewing mistakes','Other'),
    JSON_ARRAY('Practice weekly planning','Create a study schedule','Review mistakes after quizzes'),
    'How effective are your current study and learning strategies?',
    'Which study skill would help most?'
  UNION ALL SELECT
    'time_management','Time and Schedule Management','Time Mgmt',
    'Ability to plan independently, begin tasks, manage deadlines, and balance multiple responsibilities.',
    'academic','prepare', 10.00, '#22C55E', 'clock', 3,
    JSON_ARRAY('junior','senior','first-generation','community-college','residential-four-year','transfer','returning-adult'),
    JSON_ARRAY('full','quick','transition'),
    JSON_OBJECT('low','I will need significant support','mid','I can manage some responsibilities','high','I can manage my schedule consistently'),
    JSON_ARRAY('Procrastination','Forgetting deadlines','Phone or gaming','Work schedule','Activities','Family responsibilities','Underestimating task time','Feeling overwhelmed','Difficulty starting','Other'),
    JSON_ARRAY('Set up a weekly calendar','Practice estimating task time','Enter deadlines into calendar'),
    'How prepared are you to manage your own schedule without daily reminders from others?',
    'What makes time management most difficult?'
  UNION ALL SELECT
    'self_advocacy','Self-Advocacy','Self-Advocacy',
    'Ability to ask questions, request support, communicate needs, and take responsibility for resolving concerns.',
    'independence','transition', 10.00, '#8B5CF6', 'megaphone', 4,
    JSON_ARRAY('junior','senior','first-generation','community-college','residential-four-year','transfer','returning-adult'),
    JSON_ARRAY('full','quick','transition'),
    JSON_OBJECT('low','Very uncomfortable','mid','Sometimes comfortable','high','Highly confident'),
    JSON_ARRAY('Emailing an instructor','Asking a question in class','Attending office hours','Speaking with an advisor','Requesting tutoring','Discussing accommodations','Addressing a grade concern','Explaining that I am struggling','Asking family for support','Other'),
    JSON_ARRAY('Draft a sample instructor email','Practice asking one clarifying question','Locate office hours on a syllabus'),
    'How confident are you in asking for help and communicating your needs?',
    'Which self-advocacy task feels most difficult?'
  UNION ALL SELECT
    'independent_living','Independent Living Skills','Living Skills',
    'Ability to manage daily responsibilities outside of academics.',
    'independence','transition', 8.00, '#A855F7', 'home', 5,
    JSON_ARRAY('senior','first-generation','residential-four-year','transfer','returning-adult'),
    JSON_ARRAY('full','transition'),
    JSON_OBJECT('low','I need significant practice','mid','I can manage some areas','high','I am prepared and confident'),
    JSON_ARRAY('Laundry','Meal planning','Cleaning','Transportation','Appointments','Medication routine','Sleep schedule','Personal safety','Sharing a room','Managing personal documents','Other'),
    JSON_ARRAY('Practice laundry and meals','Create a personal documents folder','Build a sleep routine'),
    'How prepared are you to manage daily living responsibilities more independently?',
    'Which daily responsibility needs the most preparation?'
  UNION ALL SELECT
    'financial_readiness','Financial Readiness','Financial',
    'Understanding of college costs, budgeting, financial aid, borrowing, and daily money management.',
    'financial','apply', 12.00, '#F59E0B', 'wallet', 6,
    JSON_ARRAY('junior','senior','first-generation','community-college','residential-four-year','transfer','returning-adult'),
    JSON_ARRAY('full','quick','application'),
    JSON_OBJECT('low','Very unclear','mid','Some understanding','high','Well prepared'),
    JSON_ARRAY('Total cost of attendance','Financial aid','Scholarships','Student loans','Monthly budget','Banking','Credit cards','Work-study','Emergency expenses','Understanding bills','Other'),
    JSON_ARRAY('Complete financial-aid application','Review total cost','Build monthly budget','Understand student-loan terms'),
    'How prepared do you feel to understand and manage college-related finances?',
    'Which financial area needs the most clarification?'
  UNION ALL SELECT
    'application_enrollment','Application and Enrollment Knowledge','Applications',
    'Understanding of applications, deadlines, admissions requirements, enrollment tasks, and institutional processes.',
    'planning','apply', 10.00, '#EF4444', 'clipboard', 7,
    JSON_ARRAY('junior','senior','first-generation','community-college','residential-four-year','transfer','returning-adult'),
    JSON_ARRAY('full','quick','application'),
    JSON_OBJECT('low','Very unclear','mid','Partially clear','high','Fully clear'),
    JSON_ARRAY('Choosing schools or programs','Completing applications','Writing essays','Requesting recommendations','Sending transcripts','Financial-aid forms','Enrollment deposit','Housing application','Orientation','Course registration','Other'),
    JSON_ARRAY('Create application accounts','Request transcripts','Track deadlines','Register for orientation'),
    'How confident are you that you understand the application and enrollment process?',
    'Which step needs the most attention?'
  UNION ALL SELECT
    'career_direction','College and Career Direction','Direction',
    'Understanding of personal interests, educational goals, career possibilities, and program options.',
    'planning','explore', 8.00, '#14B8A6', 'compass', 8,
    JSON_ARRAY('junior','senior','first-generation','community-college','residential-four-year','transfer','returning-adult'),
    JSON_ARRAY('full','quick','application'),
    JSON_OBJECT('low','Very unclear','mid','Exploring several options','high','Clear and confident'),
    JSON_ARRAY('Career assessment','Job shadowing','College visit','Program research','Talking with professionals','Internship','Advisor conversation','Exploring majors','Understanding career outcomes','More time to explore','Other'),
    JSON_ARRAY('Identify three possible programs','Compare admission requirements','Research career outcomes'),
    'How clear are you about what you want to study or work toward?',
    'What would help clarify your direction?'
  UNION ALL SELECT
    'systems_navigation','College Systems Navigation','Campus Systems',
    'Ability to locate and use campus systems, offices, resources, and digital platforms.',
    'independence','enroll', 6.00, '#6366F1', 'map', 9,
    JSON_ARRAY('senior','first-generation','community-college','residential-four-year','transfer','returning-adult'),
    JSON_ARRAY('full','transition'),
    JSON_OBJECT('low','I do not know where to begin','mid','I know some resources','high','I can locate and use support effectively'),
    JSON_ARRAY('Academic advising','Tutoring','Financial aid','Student portal','Course registration','Library','Counseling','Health services','Career services','Disability or accessibility services','Other'),
    JSON_ARRAY('Activate student account','Identify advisor','Locate tutoring and accessibility offices'),
    'How confident are you in finding and using college resources and systems?',
    'Which college resource do you understand least?'
  UNION ALL SELECT
    'social_emotional','Social and Emotional Readiness','Social-Emotional',
    'Confidence in adjusting to change, managing stress, building relationships, and coping with challenges.',
    'transition','transition', 6.00, '#EC4899', 'heart', 10,
    JSON_ARRAY('junior','senior','first-generation','community-college','residential-four-year','transfer','returning-adult'),
    JSON_ARRAY('full','quick','transition'),
    JSON_OBJECT('low','Very unprepared','mid','Somewhat prepared','high','Highly prepared'),
    JSON_ARRAY('Making friends','Living away from home','Homesickness','Stress','Academic pressure','Roommates','Social expectations','Finding my place','Balancing freedom and responsibility','Asking for support','Other'),
    JSON_ARRAY('Identify support contacts','Plan a weekly check-in','Join one campus activity'),
    'How prepared do you feel for the social and emotional changes associated with college?',
    'What part of the transition concerns you most?'
  UNION ALL SELECT
    'support_network','Support Network','Support',
    'Awareness of people and services that can provide academic, personal, financial, and practical support.',
    'transition','launch', 4.00, '#64748B', 'users', 11,
    JSON_ARRAY('junior','senior','first-generation','community-college','residential-four-year','transfer','returning-adult'),
    JSON_ARRAY('full','quick','transition'),
    JSON_OBJECT('low','Very limited support','mid','Some available support','high','Strong and accessible support'),
    JSON_ARRAY('Academic advisor','Tutor','Faculty mentor','Family support','Peer mentor','Counselor','Financial-aid advisor','Career advisor','Accessibility support','Community organization','Other'),
    JSON_ARRAY('Build support-contact list','Schedule advisor meeting','Identify a mentor'),
    'How strong and accessible is your current support network?',
    'Which type of support would be most useful?'
  UNION ALL SELECT
    'motivation_confidence','Motivation and Transition Confidence','Motivation',
    'Commitment to the next step and confidence in adapting to college responsibilities.',
    'transition','launch', 4.00, '#0F766E', 'flag', 12,
    JSON_ARRAY('junior','senior','first-generation','community-college','residential-four-year','transfer','returning-adult'),
    JSON_ARRAY('full','quick','application','transition'),
    JSON_OBJECT('low','Very uncertain','mid','Mixed feelings','high','Highly confident and motivated'),
    JSON_ARRAY('Clearer plan','More information','Visiting campus','Meeting support staff','Practicing independent skills','Financial clarity','Academic preparation','Talking with current students','Family support','Smaller next steps','Other'),
    JSON_ARRAY('Write a first-semester goal','Complete a first-month check-in plan','Visit campus or meet a student'),
    'How confident and motivated do you feel about beginning college?',
    'What would most improve your confidence?'
) AS d
WHERE @cr_tpl_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM college_readiness_template_domains x
    WHERE x.template_id = @cr_tpl_id AND x.domain_key = d.domain_key
  );
