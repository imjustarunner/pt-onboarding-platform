-- Durable demo workflow. No providers, clients, permissions, or senders are seeded.
CREATE TABLE IF NOT EXISTS school_contact_workflows (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  school_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  assignment_id INT NOT NULL,
  plan_decided_at DATETIME NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  conversation_id BIGINT UNSIGNED NULL,
  initial_sent_at DATETIME NULL,
  sms_completed_at DATETIME NULL,
  followup_sent_at DATETIME NULL,
  parent_reply_at DATETIME NULL,
  provider_replied_at DATETIME NULL,
  external_reply_recorded_at DATETIME NULL,
  stale_notified_at DATETIME NULL,
  last_error VARCHAR(240) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_contact_pair (agency_id,client_id,school_id,provider_user_id),
  KEY idx_school_contact_pending (status,updated_at),
  KEY idx_school_contact_provider (agency_id,provider_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_contact_workflow_steps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  workflow_id BIGINT UNSIGNED NOT NULL,
  step_key VARCHAR(40) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'sending',
  message_id BIGINT UNSIGNED NULL,
  detail VARCHAR(240) NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  UNIQUE KEY uq_school_contact_step (workflow_id,step_key),
  CONSTRAINT fk_school_contact_step_workflow FOREIGN KEY (workflow_id) REFERENCES school_contact_workflows(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
