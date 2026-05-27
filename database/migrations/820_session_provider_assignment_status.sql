-- Migration 820: draft/tentative/finalized assignment workflow for session staffing

ALTER TABLE company_event_session_providers
  ADD COLUMN assignment_status ENUM('draft', 'tentative', 'finalized') NOT NULL DEFAULT 'draft'
    COMMENT 'Draft is admin-only; tentative/finalized visible to assigned facilitators'
    AFTER assigned_at,
  ADD COLUMN published_at DATETIME NULL DEFAULT NULL
    COMMENT 'When assignment_status last moved to tentative or finalized'
    AFTER assignment_status,
  ADD COLUMN published_by_user_id INT NULL DEFAULT NULL
    COMMENT 'Admin who published tentative/finalized assignment'
    AFTER published_at,
  ADD CONSTRAINT fk_cesp_published_by
    FOREIGN KEY (published_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE facilitator_availability_requests
  ADD COLUMN tentative_schedule_posted_at DATETIME NULL DEFAULT NULL
    COMMENT 'When admin first posted tentative schedules for this request'
    AFTER push_sent_at,
  ADD COLUMN final_schedule_published_at DATETIME NULL DEFAULT NULL
    COMMENT 'When admin published finalized schedules for this request'
    AFTER tentative_schedule_posted_at;
