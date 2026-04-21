-- Program events: participants workflow + provider assignment
-- Adds per-event intake/TP status and responsible provider for event participants.

ALTER TABLE company_event_clients
  ADD COLUMN assigned_provider_user_id INT NULL DEFAULT NULL
    COMMENT 'Provider responsible for intake/treatment plan for this event participant'
    AFTER enrolled_by_user_id,
  ADD COLUMN intake_complete TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Intake completed (event workflow)'
    AFTER assigned_provider_user_id,
  ADD COLUMN intake_completed_at DATETIME NULL DEFAULT NULL
    AFTER intake_complete,
  ADD COLUMN intake_completed_by_user_id INT NULL DEFAULT NULL
    AFTER intake_completed_at,
  ADD COLUMN treatment_plan_complete TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Treatment plan completed (event workflow)'
    AFTER intake_completed_by_user_id,
  ADD COLUMN treatment_plan_completed_at DATETIME NULL DEFAULT NULL
    AFTER treatment_plan_complete,
  ADD COLUMN treatment_plan_completed_by_user_id INT NULL DEFAULT NULL
    AFTER treatment_plan_completed_at,
  ADD INDEX idx_company_event_clients_provider (company_event_id, assigned_provider_user_id),
  ADD CONSTRAINT fk_company_event_clients_assigned_provider
    FOREIGN KEY (assigned_provider_user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_company_event_clients_intake_completed_by
    FOREIGN KEY (intake_completed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_company_event_clients_tp_completed_by
    FOREIGN KEY (treatment_plan_completed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

