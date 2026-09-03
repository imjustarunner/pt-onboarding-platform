-- Migration 1359: Note Aid work-queue items (server-persisted, encrypted PHI payload)
-- Keeps ToDos until clear/delete/done; signed/completed rows are purged after 24h.

CREATE TABLE IF NOT EXISTS note_aid_work_queue_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  agency_id INT NULL,
  client_id INT NULL,
  organization_id INT NULL,
  office_event_id INT NULL,
  clinical_session_id INT NULL,
  task_id INT NULL,
  draft_id INT NULL,
  clinical_note_id INT NULL,

  -- Stable client-side key (wq_* / task_*) so sync/upsert does not duplicate rows
  client_key VARCHAR(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,

  date_of_service DATE NULL,
  service_code VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  note_kind VARCHAR(48) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  time_label VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,

  status ENUM('not_started', 'started', 'completed', 'signed')
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NOT NULL DEFAULT 'not_started',

  -- Encrypted JSON envelope: { clientName, action, ... } (same pattern as clinical_note_drafts)
  payload_enc LONGTEXT NULL,

  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  signed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_nawq_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_nawq_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL,
  UNIQUE KEY uq_nawq_user_client_key (user_id, client_key),
  INDEX idx_nawq_user_status (user_id, status),
  INDEX idx_nawq_signed_at (signed_at),
  INDEX idx_nawq_completed_at (completed_at),
  INDEX idx_nawq_draft_id (draft_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
