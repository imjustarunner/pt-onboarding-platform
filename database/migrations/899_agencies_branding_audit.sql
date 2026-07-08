-- Migration 899 agencies branding audit tripwire
-- The same out of band restore or import that collapsed users roles also
-- reverted tenant branding in the agencies table back to an old snapshot.
-- Branding values cannot be derived so we cannot hard block a revert the way
-- we block the clinician role. Instead we record every branding change with the
-- connecting DB account via USER so the next revert is attributable and we can
-- shut off the vector. Captures color_palette theme_settings and logo_url.

CREATE TABLE IF NOT EXISTS agencies_branding_audit (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  slug VARCHAR(100) NULL,
  old_color_palette TEXT NULL,
  new_color_palette TEXT NULL,
  old_theme_settings TEXT NULL,
  new_theme_settings TEXT NULL,
  old_logo_url VARCHAR(500) NULL,
  new_logo_url VARCHAR(500) NULL,
  db_user VARCHAR(255) NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_aba_agency (agency_id),
  INDEX idx_aba_changed_at (changed_at)
);

DROP TRIGGER IF EXISTS trg_agencies_branding_audit;

CREATE TRIGGER trg_agencies_branding_audit
AFTER UPDATE ON agencies
FOR EACH ROW
BEGIN
  IF NOT (OLD.color_palette <=> NEW.color_palette)
     OR NOT (OLD.theme_settings <=> NEW.theme_settings)
     OR NOT (OLD.logo_url <=> NEW.logo_url) THEN
    INSERT INTO agencies_branding_audit
      (agency_id, slug, old_color_palette, new_color_palette,
       old_theme_settings, new_theme_settings, old_logo_url, new_logo_url, db_user)
    VALUES
      (NEW.id, NEW.slug, OLD.color_palette, NEW.color_palette,
       OLD.theme_settings, NEW.theme_settings, OLD.logo_url, NEW.logo_url, USER());
  END IF;
END;
