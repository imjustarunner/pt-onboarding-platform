/*
Create supervision_sessions.

Purpose:
- Allow app-scheduled supervision sessions (supervisee <-> supervisor) that can sync to Google Calendar.
- Store local source-of-truth (time, notes, modality) and Google sync metadata (event id, meet link, status).

Notes:
- We use DATETIME without timezone to match existing schedule patterns (office_events, etc).
- Use block comments because the migration runner drops `--`-prefixed statements.
*/

CREATE TABLE IF NOT EXISTS supervision_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  supervisor_user_id INT NOT NULL,
  supervisee_user_id INT NOT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,

  modality VARCHAR(32) NULL,        /* 'virtual' | 'in_person' | etc */
  location_text VARCHAR(255) NULL,
  notes TEXT NULL,

  status VARCHAR(32) NOT NULL DEFAULT 'SCHEDULED', /* SCHEDULED | CANCELLED */

  google_host_email VARCHAR(255) NULL,
  google_calendar_id VARCHAR(128) NULL,
  google_event_id VARCHAR(255) NULL,
  google_meet_link VARCHAR(1024) NULL,
  google_sync_status VARCHAR(32) NULL, /* PENDING | SYNCED | FAILED */
  google_sync_error TEXT NULL,
  google_synced_at DATETIME NULL,

  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_supervision_sessions_window (agency_id, start_at, end_at),
  INDEX idx_supervision_sessions_supervisor (supervisor_user_id, start_at),
  INDEX idx_supervision_sessions_supervisee (supervisee_user_id, start_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

