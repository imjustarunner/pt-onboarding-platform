-- Migration 1185: Interview Hub tables (templates, job question sets, interviews, artifacts)

CREATE TABLE IF NOT EXISTS interview_hub_templates (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  name VARCHAR(255) NOT NULL DEFAULT 'Default Interview',
  is_default TINYINT(1) NOT NULL DEFAULT 1,
  flow_sections_json JSON NULL COMMENT 'ordered section keys/labels',
  standard_questions_json JSON NULL,
  scorecard_criteria_json JSON NULL COMMENT 'array of {key,label,weight}',
  salutation_pool_json JSON NULL,
  icebreaker_pool_json JSON NULL,
  candidate_questions_prompt TEXT NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_interview_hub_templates_agency_default (agency_id, is_default),
  KEY idx_interview_hub_templates_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS interview_hub_job_question_sets (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  job_description_id INT NULL,
  title VARCHAR(255) NOT NULL,
  questions_json JSON NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_interview_hub_jqs_agency (agency_id),
  KEY idx_interview_hub_jqs_job (job_description_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hiring_interviews (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  candidate_user_id INT NOT NULL,
  hiring_profile_id INT NULL,
  provider_schedule_event_id INT NULL,
  template_id BIGINT NULL,
  job_question_set_id BIGINT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'scheduled' COMMENT 'scheduled|in_progress|completed|cancelled',
  interview_starts_at DATETIME NULL,
  interview_timezone VARCHAR(64) NULL,
  interviewer_user_ids_json JSON NULL,
  guest_join_token VARCHAR(128) NULL,
  host_join_token VARCHAR(128) NULL,
  invite_sent_at DATETIME NULL,
  public_join_url TEXT NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_hiring_interviews_agency (agency_id),
  KEY idx_hiring_interviews_candidate (candidate_user_id),
  KEY idx_hiring_interviews_schedule_event (provider_schedule_event_id),
  KEY idx_hiring_interviews_status (agency_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hiring_interview_artifacts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  hiring_interview_id BIGINT NOT NULL,
  flow_state_json JSON NULL,
  scorecard_json JSON NULL,
  private_notes_json JSON NULL COMMENT 'map userId -> notes text',
  team_chat_json JSON NULL,
  transcript_summary TEXT NULL,
  average_score DECIMAL(4,2) NULL,
  finalized_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hiring_interview_artifacts_interview (hiring_interview_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default salutation/icebreaker pools live in interviewHub.service.js
-- (ensureDefaultTemplate) rather than a seed INSERT here.
