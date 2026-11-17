-- NULL agency rows are platform defaults. Scoped agency overrides retain their
-- precedence. This migration inserts no fee amounts and changes no old terms.
ALTER TABLE booking_cancellation_policies
  MODIFY agency_id INT NULL,
  MODIFY scope_level ENUM('platform','affiliation','tenant','business_type','payer','service','rate_category','package','appointment') NOT NULL DEFAULT 'tenant',
  ADD COLUMN payer_type VARCHAR(32) NULL,
  ADD COLUMN service_code VARCHAR(32) NULL,
  ADD COLUMN provider_category TINYINT UNSIGNED NULL,
  ADD COLUMN provider_level TINYINT UNSIGNED NULL,
  ADD COLUMN customer_tier_id VARCHAR(16) NULL,
  ADD COLUMN modality VARCHAR(24) NULL,
  ADD COLUMN no_show_suggested_wait_minutes INT NOT NULL DEFAULT 15,
  ADD COLUMN no_show_undo_after_end_minutes INT NOT NULL DEFAULT 10,
  ADD COLUMN supersedes_policy_id INT UNSIGNED NULL;
