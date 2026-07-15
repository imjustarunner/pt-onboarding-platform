-- Migration 920: Student Success Assessment
-- Distinct from Life Balance / Values / Athlete Readiness — Student Success Pathway visualization.

CREATE TABLE IF NOT EXISTS student_success_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL COMMENT 'NULL = platform default',
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  version INT NOT NULL DEFAULT 1,
  settings_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ss_templates_agency (agency_id),
  KEY idx_ss_templates_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_success_template_domains (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  short_label VARCHAR(64) NOT NULL,
  definition TEXT NULL,
  success_system ENUM('learning-habits','learning-mindset','readiness','support-network') NOT NULL,
  weight DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  color VARCHAR(16) NOT NULL,
  icon VARCHAR(64) NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_optional TINYINT(1) NOT NULL DEFAULT 0,
  age_groups_json JSON NULL,
  available_modes_json JSON NULL,
  score_labels_json JSON NULL,
  reflection_options_json JSON NULL,
  primary_question TEXT NULL,
  reflection_prompt TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ss_tpl_domain (template_id, domain_key),
  KEY idx_ss_tpl_domain_order (template_id, display_order),
  CONSTRAINT fk_ss_tpl_domain_template
    FOREIGN KEY (template_id) REFERENCES student_success_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_success_assessments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NULL,
  template_id BIGINT UNSIGNED NOT NULL,
  template_version INT NOT NULL DEFAULT 1,
  student_user_id INT NULL,
  client_id INT NULL,
  coach_user_id INT NULL,
  mode ENUM('full','weekly','transition','targeted') NOT NULL DEFAULT 'full',
  education_level VARCHAR(64) NULL,
  status ENUM('not_started','in_progress','completed','reviewed','archived') NOT NULL DEFAULT 'not_started',
  access_token VARCHAR(64) NOT NULL,
  context_json JSON NULL,
  summary_json JSON NULL,
  student_success_score INT NULL,
  selected_priorities_json JSON NULL,
  success_plans_json JSON NULL,
  coach_review_status VARCHAR(64) NULL,
  coach_review_note TEXT NULL,
  reviewed_at DATETIME NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ss_access_token (access_token),
  KEY idx_ss_assess_agency (agency_id),
  KEY idx_ss_assess_student (student_user_id),
  KEY idx_ss_assess_status (status),
  KEY idx_ss_assess_mode (mode),
  CONSTRAINT fk_ss_assess_template
    FOREIGN KEY (template_id) REFERENCES student_success_templates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_success_responses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assessment_id BIGINT UNSIGNED NOT NULL,
  domain_key VARCHAR(64) NOT NULL,
  score TINYINT UNSIGNED NULL,
  importance_score TINYINT UNSIGNED NULL,
  confidence_score TINYINT UNSIGNED NULL,
  reflection_chips_json JSON NULL,
  support_preference VARCHAR(64) NULL,
  note TEXT NULL,
  note_visibility ENUM('assigned-support-team','selected-staff','family','private') NOT NULL DEFAULT 'assigned-support-team',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ss_resp (assessment_id, domain_key),
  CONSTRAINT fk_ss_resp_assessment
    FOREIGN KEY (assessment_id) REFERENCES student_success_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_success_support_requests (
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
  KEY idx_ss_support_assessment (assessment_id),
  CONSTRAINT fk_ss_support_assessment
    FOREIGN KEY (assessment_id) REFERENCES student_success_assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO student_success_templates (agency_id, name, description, version, settings_json, is_active)
SELECT NULL,
  'Student Success Assessment',
  'Discover what is helping you learn, what is getting in the way, and what could make school feel more manageable and successful.',
  1,
  JSON_OBJECT(
    'pathwayName', 'Student Success Pathway',
    'subtitle', 'Discover what is helping you learn, what is getting in the way, and what could make school feel more manageable and successful.',
    'resultTitle', 'Your Student Success Profile',
    'enableImportance', true,
    'enableConfidence', true,
    'maxPriorities', 3,
    'strategyLibrary', JSON_OBJECT(
      'organization', JSON_ARRAY('Daily backpack reset','Assignment checklist','One folder per class','Digital file naming routine','End-of-day materials check','Weekly calendar review'),
      'timeManagement', JSON_ARRAY('Five-minute start','Homework start time','Time estimation','Work-break timer','Priority list','Plan backward from deadlines'),
      'taskCompletion', JSON_ARRAY('Break work into steps','Start with the easiest step','Submit immediately after completion','Use a completion checklist','Ask for clarification early','Track missing work'),
      'study', JSON_ARRAY('Practice retrieval','Flashcards','Practice problems','Teach the concept aloud','Distributed practice','Review mistakes','Study guide creation'),
      'confidence', JSON_ARRAY('Evidence-of-progress list','Strength reminder','Helpful self-talk','Small-win tracking','Preparation checklist','Ask for feedback'),
      'stress', JSON_ARRAY('Short breathing exercise','Break work into smaller tasks','Use a calm study space','Movement break','Ask for help','Plan ahead','Reduce multitasking')
    ),
    'disclaimer', 'This assessment is not a diagnostic test for learning disabilities, attention disorders, anxiety, depression, or any other condition. It should not be the sole basis for discipline, placement, or special-education decisions.'
  ),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM student_success_templates WHERE agency_id IS NULL AND is_active = 1 LIMIT 1
);

SET @ss_tpl_id := (
  SELECT id FROM student_success_templates WHERE agency_id IS NULL AND is_active = 1 ORDER BY id ASC LIMIT 1
);

INSERT INTO student_success_template_domains
  (template_id, domain_key, label, short_label, definition, success_system, weight, color, icon, display_order, is_active, is_optional,
   age_groups_json, available_modes_json, score_labels_json, reflection_options_json, primary_question, reflection_prompt)
SELECT @ss_tpl_id, d.domain_key, d.label, d.short_label, d.definition, d.success_system, d.weight, d.color, d.icon, d.display_order, 1, d.is_optional,
  d.age_groups_json, d.available_modes_json, d.score_labels_json, d.reflection_options_json, d.primary_question, d.reflection_prompt
FROM (
  SELECT
    'attendance' AS domain_key,
    'Attendance and Participation' AS label,
    'Attendance' AS short_label,
    'How consistently you attend, arrive prepared, participate, and remain engaged.' AS definition,
    'readiness' AS success_system,
    8.00 AS weight,
    '#0EA5E9' AS color,
    'presence' AS icon,
    1 AS display_order,
    0 AS is_optional,
    JSON_ARRAY('upper-elementary','middle-school','high-school','college','adult-education') AS age_groups_json,
    JSON_ARRAY('full','weekly','transition','targeted') AS available_modes_json,
    JSON_OBJECT('low','Rarely','mid','Sometimes','high','Consistently') AS score_labels_json,
    JSON_ARRAY('Transportation','Sleep','Health','Schedule','Motivation','Anxiety or stress','Family responsibilities','Feeling unprepared','Difficulty understanding the class','Social concerns','No significant issue','Other') AS reflection_options_json,
    'How consistently are you present, prepared, and involved in your classes or learning activities?' AS primary_question,
    'What most affects your attendance or participation?' AS reflection_prompt
  UNION ALL SELECT
    'organization','Organization','Organization',
    'How effectively you keep track of materials, assignments, deadlines, and responsibilities.',
    'learning-habits', 12.00, '#0284C7', 'folder', 2, 0,
    JSON_ARRAY('upper-elementary','middle-school','high-school','college','adult-education'),
    JSON_ARRAY('full','weekly','transition','targeted'),
    JSON_OBJECT('low','Frequently disorganized','mid','Organization is inconsistent','high','Highly organized'),
    JSON_ARRAY('Assignments','Papers','Digital files','Backpack','Schedule','Long-term projects','Notes','Study materials','Multiple classes','Other'),
    'How organized do you feel with your schoolwork and materials?',
    'What is hardest to keep organized?'
  UNION ALL SELECT
    'time_management','Time Management','Time',
    'How effectively you plan, start, and use time for schoolwork and other responsibilities.',
    'learning-habits', 12.00, '#22C55E', 'clock', 3, 0,
    JSON_ARRAY('upper-elementary','middle-school','high-school','college','adult-education'),
    JSON_ARRAY('full','weekly','transition','targeted'),
    JSON_OBJECT('low','Time frequently gets away from me','mid','Sometimes effective','high','Consistently effective'),
    JSON_ARRAY('Procrastination','Phone or gaming','Too many activities','I underestimate how long work will take','I do not know where to begin','I forget assignments','I feel overwhelmed','My schedule changes often','I work slowly','Other'),
    'How effectively do you manage your time for schoolwork?',
    'What most often interferes with your time management?'
  UNION ALL SELECT
    'assignment_completion','Assignment Completion','Assignments',
    'How consistently you begin, complete, and submit assignments.',
    'learning-habits', 14.00, '#84CC16', 'check', 4, 0,
    JSON_ARRAY('upper-elementary','middle-school','high-school','college','adult-education'),
    JSON_ARRAY('full','weekly','transition','targeted'),
    JSON_OBJECT('low','Rarely completed on time','mid','Inconsistent','high','Consistently completed and submitted'),
    JSON_ARRAY('I forget','I do not understand the directions','I do not know how to begin','The assignment feels too large','I lose motivation','I run out of time','I get distracted','I avoid asking for help','I finish but forget to submit','Other'),
    'How consistently do you complete and turn in your assignments?',
    'What most often prevents assignment completion?'
  UNION ALL SELECT
    'study_skills','Study and Learning Skills','Study Skills',
    'How effectively you review, practice, take notes, prepare for tests, and check understanding.',
    'learning-habits', 12.00, '#8B5CF6', 'book', 5, 0,
    JSON_ARRAY('middle-school','high-school','college','adult-education'),
    JSON_ARRAY('full','transition','targeted'),
    JSON_OBJECT('low','I do not have useful strategies','mid','Some strategies help','high','My strategies are consistent and effective'),
    JSON_ARRAY('Note-taking','Test preparation','Reading comprehension','Memorization','Practice problems','Essay planning','Reviewing mistakes','Asking questions','Studying over several days','Other'),
    'How effective are your current study and learning strategies?',
    'Which learning skill would help you most?'
  UNION ALL SELECT
    'academic_confidence','Academic Confidence','Confidence',
    'How strongly you believe you can learn, improve, and complete challenging academic work.',
    'learning-mindset', 10.00, '#A855F7', 'star', 6, 0,
    JSON_ARRAY('upper-elementary','middle-school','high-school','college','adult-education'),
    JSON_ARRAY('full','weekly','transition','targeted'),
    JSON_OBJECT('low','Very low confidence','mid','Confidence depends on the subject','high','Strong confidence'),
    JSON_ARRAY('Grades','Tests','Teacher feedback','Comparing myself with others','Past struggles','Understanding the material','Preparation','Support from others','Fear of mistakes','Other'),
    'How confident are you in your ability to learn and succeed academically?',
    'What most affects your academic confidence?'
  UNION ALL SELECT
    'persistence','Persistence and Frustration Tolerance','Persistence',
    'How effectively you continue working, change strategies, and seek help when learning becomes difficult.',
    'learning-mindset', 10.00, '#EC4899', 'flame', 7, 0,
    JSON_ARRAY('upper-elementary','middle-school','high-school','college','adult-education'),
    JSON_ARRAY('full','transition','targeted'),
    JSON_OBJECT('low','I usually stop or avoid it','mid','It depends on the situation','high','I persist and use helpful strategies'),
    JSON_ARRAY('I stop working','I become angry','I avoid the assignment','I rush','I ask for help','I try a different strategy','I take a short break and return','I worry that I cannot do it','I compare myself with others','Other'),
    'How effectively do you continue working when schoolwork becomes difficult?',
    'What usually happens when work becomes frustrating?'
  UNION ALL SELECT
    'stress','Stress and Emotional Readiness','Stress',
    'How manageable school-related stress feels and how effectively you can regulate emotions during learning.',
    'readiness', 8.00, '#F59E0B', 'heart', 8, 0,
    JSON_ARRAY('upper-elementary','middle-school','high-school','college','adult-education'),
    JSON_ARRAY('full','weekly','transition','targeted'),
    JSON_OBJECT('low','Overwhelming','mid','Sometimes manageable','high','Very manageable'),
    JSON_ARRAY('Tests','Grades','Homework','Presentations','Falling behind','Time pressure','Teacher expectations','Family expectations','Friendships','Future plans','Other'),
    'How manageable does school-related stress feel right now?',
    'What creates the most school-related stress?'
  UNION ALL SELECT
    'teacher_support','Teacher and School Support','Teacher Support',
    'How supported you feel by teachers, school staff, tutors, counselors, or coaches.',
    'support-network', 7.00, '#14B8A6', 'users', 9, 0,
    JSON_ARRAY('upper-elementary','middle-school','high-school','college','adult-education'),
    JSON_ARRAY('full','weekly','transition','targeted'),
    JSON_OBJECT('low','Rarely supported','mid','Support is inconsistent','high','Strongly supported'),
    JSON_ARRAY('Clearer instructions','More feedback','Extra help','Tutoring','More time to ask questions','Help organizing work','Test preparation','Counseling or coaching','Help communicating with teachers','Other'),
    'How supported do you feel by the adults helping you learn?',
    'What support would help most?'
  UNION ALL SELECT
    'goals_motivation','Goals and Motivation','Goals',
    'How clearly you understand what you are working toward and how motivated you feel to make progress.',
    'learning-mindset', 7.00, '#6366F1', 'flag', 10, 0,
    JSON_ARRAY('middle-school','high-school','college','adult-education'),
    JSON_ARRAY('full','transition','targeted'),
    JSON_OBJECT('low','I do not have clear goals','mid','I have some direction','high','My goals are clear and motivating'),
    JSON_ARRAY('Clearer goals','Seeing progress','More choice','More interesting work','Better connection to my future','Encouragement','Recognition','More confidence','Smaller steps','Other'),
    'How clear and motivating are your current academic or personal goals?',
    'What would make school feel more motivating?'
  UNION ALL SELECT
    'family_support','Family Support','Family',
    'How supported you feel by parents, guardians, or family members with learning.',
    'support-network', 0.00, '#64748B', 'home', 11, 1,
    JSON_ARRAY('upper-elementary','middle-school','high-school'),
    JSON_ARRAY('full','transition'),
    JSON_OBJECT('low','Rarely supported','mid','Support is mixed','high','Strongly supported'),
    JSON_ARRAY('Homework routine','Quiet workspace','Calendar review','Encouragement','Less distraction','Help communicating with school','Sleep routines','No significant need','Other'),
    'How supported do you feel by your family with school?',
    'What family support would help most?'
) AS d
WHERE @ss_tpl_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM student_success_template_domains x
    WHERE x.template_id = @ss_tpl_id AND x.domain_key = d.domain_key
  );
