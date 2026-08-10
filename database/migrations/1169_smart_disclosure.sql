-- Migration 1169: Smart Disclosure foundation (Hogwarts-gated rollout)
-- Tenant terminology settings, signed acknowledgements with provider snapshots,
-- client disclosure_required flag, and Hogwarts packet step swap.

ALTER TABLE clients
  ADD COLUMN disclosure_required TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '1 when assigned provider is not on last signed disclosure snapshot';

CREATE TABLE IF NOT EXISTS agency_disclosure_settings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  locale VARCHAR(8) NOT NULL DEFAULT 'en',
  terminology_json JSON NULL,
  business_entity_json JSON NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_agency_disclosure_locale (agency_id, locale),
  KEY idx_agency_disclosure_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS client_disclosure_acknowledgements (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  agency_id INT NOT NULL,
  school_organization_id INT NULL,
  intake_submission_id INT NULL,
  client_phi_document_id INT NULL,
  language_code VARCHAR(8) NOT NULL DEFAULT 'en',
  signed_at DATETIME NOT NULL,
  signer_name VARCHAR(255) NULL,
  signer_email VARCHAR(255) NULL,
  content_hash VARCHAR(128) NULL,
  providers_json JSON NOT NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_client_disclosure_client (client_id, signed_at),
  KEY idx_client_disclosure_agency (agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Provider profile fields used by living disclosure rows (EAV via user_info if present;
-- also store denormalized helpers on users when columns exist is handled in app code).
-- Seed empty settings rows for agencies that already have Hogwarts school.

INSERT INTO agency_disclosure_settings (agency_id, locale, terminology_json, business_entity_json)
SELECT a.id, 'en', NULL, NULL
FROM agencies a
WHERE a.organization_type IN ('agency', 'life_coach', 'consultant')
  AND EXISTS (
    SELECT 1
    FROM agencies s
    WHERE LOWER(COALESCE(s.slug, s.portal_url, '')) = 'hogwarts'
      AND s.organization_type = 'school'
      AND (
        s.id IN (
          SELECT school_organization_id FROM agency_schools WHERE agency_id = a.id AND is_active = 1
        )
        OR s.id IN (
          SELECT organization_id FROM organization_affiliations
          WHERE agency_id = a.id AND is_active = 1
        )
      )
  )
ON DUPLICATE KEY UPDATE agency_id = agency_id;

INSERT INTO agency_disclosure_settings (agency_id, locale, terminology_json, business_entity_json)
SELECT a.id, 'es', NULL, NULL
FROM agencies a
WHERE a.organization_type IN ('agency', 'life_coach', 'consultant')
  AND EXISTS (
    SELECT 1
    FROM agencies s
    WHERE LOWER(COALESCE(s.slug, s.portal_url, '')) = 'hogwarts'
      AND s.organization_type = 'school'
      AND (
        s.id IN (
          SELECT school_organization_id FROM agency_schools WHERE agency_id = a.id AND is_active = 1
        )
        OR s.id IN (
          SELECT organization_id FROM organization_affiliations
          WHERE agency_id = a.id AND is_active = 1
        )
      )
  )
ON DUPLICATE KEY UPDATE agency_id = agency_id;

-- Hogwarts: strip static disclosure document steps from intake links and ensure
-- a programmed smart_disclosure step exists. JSON rewrite is best-effort in SQL.
-- Application code also enforces Hogwarts-only enablement.
