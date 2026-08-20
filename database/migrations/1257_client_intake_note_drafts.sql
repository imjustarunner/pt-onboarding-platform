-- Migration 1257: client intake note drafts for 90791/H0031 AI-assisted pipeline
CREATE TABLE IF NOT EXISTS client_intake_note_drafts (
  id                      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id               INT UNSIGNED NOT NULL,
  client_id               INT UNSIGNED NOT NULL,
  provider_user_id        INT UNSIGNED NOT NULL,

  service_code            VARCHAR(16)  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
                            COMMENT '90791 or H0031',
  tool_id                 VARCHAR(64)  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
                            COMMENT 'Note Aid tool id used to generate the draft',

  status                  VARCHAR(32)  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft'
                            COMMENT 'draft | diagnosis_pending | ready | final | failed',

  diagnosis_action        VARCHAR(32)  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
                            COMMENT 'remain | confirmed | updated (set during HITL step)',

  suggested_dx_json       TEXT         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
                            COMMENT 'JSON: {code, description, justification} from AI',
  confirmed_dx_json       TEXT         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
                            COMMENT 'JSON: {code, description} after provider HITL confirm/update',

  scrubbed_input_enc      MEDIUMTEXT   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
                            COMMENT 'PHI-scrubbed intake summary sent to AI (optionally encrypted)',
  note_body_enc           MEDIUMTEXT   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
                            COMMENT 'Full AI-generated note body (optionally encrypted)',
  note_sections_json_enc  MEDIUMTEXT   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
                            COMMENT 'Parsed SOAP/section JSON (optionally encrypted)',
  session_context_enc     MEDIUMTEXT   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
                            COMMENT 'Extra context forwarded to AI if any (optionally encrypted)',

  treatment_plan_id       INT UNSIGNED NULL DEFAULT NULL
                            COMMENT 'FK to clinical_treatment_plans.id created on finalize',
  intake_submission_id    INT UNSIGNED NULL DEFAULT NULL
                            COMMENT 'FK to intake_submissions.id if draft was generated from a submission',

  error_message           TEXT         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
                            COMMENT 'Populated when status=failed',

  created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  finalized_at            DATETIME     NULL DEFAULT NULL,

  PRIMARY KEY (id),
  INDEX idx_cidn_client           (client_id),
  INDEX idx_cidn_agency_client    (agency_id, client_id),
  INDEX idx_cidn_provider         (provider_user_id),
  INDEX idx_cidn_status           (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
