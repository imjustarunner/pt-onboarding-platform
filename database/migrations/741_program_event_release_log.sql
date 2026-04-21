-- 741_program_event_release_log.sql
--
-- Adds a release log for the program-event kiosk checkout flow.
--
-- Context: when a non–Skill Builders program event ends and a parent /
-- approved-pickup adult arrives to take a child home, the kiosk now
-- shows the child's authorized-pickup list (sourced from the guardian
-- waiver profile) and walks the picker through:
--   1. Tapping the row matching themselves (or "Walk home alone" if the
--      walk-home authorization waiver was signed).
--   2. Signing for release (real e-signature, captured as a data URL).
--   3. (Optional) Snapping a release-day photo so program staff have a
--      visual record of who left with the child. The photo is encrypted
--      at rest via the same KMS-wrapped AES-256-GCM scheme used for
--      insurance card images, and only the storage path + the wrapping
--      metadata live in this row.
--
-- Each row is a single release event for one client at one event on one
-- day. Coordinators read this table to reconcile checkout activity
-- against the daily kiosk roster + emergency contacts.

CREATE TABLE IF NOT EXISTS company_event_releases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  -- NOTE: these three FK columns must match the referenced table `id` columns
  -- exactly (including signedness). In this schema, `company_events.id`,
  -- `agencies.id`, and `clients.id` are signed INT, so these must be INT too
  -- (not UNSIGNED) or MySQL will reject the FK constraint as incompatible.
  company_event_id INT NOT NULL,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,

  -- Which kiosk session originated this release (so we can pinpoint a
  -- station / device if there's a dispute later).
  kiosk_session_token_jti VARCHAR(128) NULL,

  -- Release recipient: the human walking out with the child. Either a
  -- name from the authorized-pickup list, or "Walk home alone" when
  -- the walk-home authorization waiver was honored.
  released_to_name VARCHAR(160) NOT NULL,
  released_to_relationship VARCHAR(80) NULL,
  released_to_phone VARCHAR(40) NULL,
  walk_home_alone TINYINT(1) NOT NULL DEFAULT 0,

  -- E-signature artifacts. signer_signature_data is the raw data URL
  -- captured at release time (real signature, drawn or reused). We keep
  -- the audit trio (when + ip + ua) in lock-step with the rest of the
  -- platform's e-sign records.
  signer_signature_data LONGTEXT NULL,
  signer_signature_source_method VARCHAR(64) NULL,
  signed_at DATETIME NOT NULL,
  signed_ip VARCHAR(64) NULL,
  signed_user_agent VARCHAR(512) NULL,

  -- Optional release photo, KMS-encrypted at rest in GCS.
  -- photo_storage_key is a relative GCS object key (no gs:// prefix)
  -- so we can rewrite buckets in disaster recovery.
  photo_storage_key VARCHAR(512) NULL,
  photo_content_type VARCHAR(80) NULL,
  photo_encryption_key_id VARCHAR(255) NULL,
  photo_encryption_wrapped_key_b64 TEXT NULL,
  photo_encryption_iv_b64 VARCHAR(64) NULL,
  photo_encryption_auth_tag_b64 VARCHAR(64) NULL,
  photo_encryption_aad VARCHAR(255) NULL,

  notes VARCHAR(500) NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_company_event_releases_event
    FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_company_event_releases_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_company_event_releases_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,

  KEY idx_company_event_releases_event_date (company_event_id, signed_at),
  KEY idx_company_event_releases_client (client_id, signed_at),
  KEY idx_company_event_releases_agency_date (agency_id, signed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
