-- Migration 1258: HITL diagnosis confirmation audit trail for intake note pipeline
CREATE TABLE IF NOT EXISTS client_diagnosis_confirmations (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id           INT UNSIGNED NOT NULL,
  client_id           INT UNSIGNED NOT NULL,
  draft_id            INT UNSIGNED NOT NULL
                        COMMENT 'FK to client_intake_note_drafts.id',

  action              VARCHAR(32)  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
                        COMMENT 'remain | confirmed | updated',

  suggested_dx_json   TEXT         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
                        COMMENT 'Snapshot of what the AI suggested at time of review',
  confirmed_dx_json   TEXT         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
                        COMMENT 'What the provider recorded (same as suggested when remain/confirmed)',

  comment             TEXT         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
                        COMMENT 'Optional provider justification note',

  actor_user_id       INT UNSIGNED NOT NULL
                        COMMENT 'Provider/admin who performed the HITL review',

  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_cdc_draft       (draft_id),
  INDEX idx_cdc_client      (client_id),
  INDEX idx_cdc_agency      (agency_id),
  INDEX idx_cdc_actor       (actor_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
