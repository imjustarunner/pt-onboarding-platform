-- SchoolCareBridge membership is separate from clinical school affiliations.
CREATE TABLE IF NOT EXISTS schoolcarebridge_partners (
  agency_id INT NOT NULL PRIMARY KEY,
  workspace_mode ENUM('connected','standalone') NOT NULL DEFAULT 'standalone',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  public_listed BOOLEAN NOT NULL DEFAULT FALSE,
  settings_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS schoolcarebridge_agreements (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  revision INT NOT NULL DEFAULT 1,
  status ENUM('draft','issued') NOT NULL DEFAULT 'draft',
  terms_json JSON NOT NULL,
  rendered_html MEDIUMTEXT NULL,
  content_hash CHAR(64) NULL,
  agency_signer_user_id INT NULL,
  operator_signer_user_id INT NULL,
  agency_task_id INT NULL,
  operator_task_id INT NULL,
  issued_by_user_id INT NULL,
  issued_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY scb_agreement_partner (agency_id)
);
INSERT IGNORE INTO schoolcarebridge_partners (agency_id, workspace_mode, public_listed)
SELECT id, 'connected', TRUE FROM agencies
WHERE slug = 'itsco' AND organization_type = 'agency' AND is_active = TRUE AND COALESCE(is_archived,0) = 0;
INSERT IGNORE INTO schoolcarebridge_agreements (agency_id, terms_json)
SELECT agency_id, JSON_OBJECT('trialStart','2026-10-01','trialEnd','2027-03-31',
  'billingBasis','Per active school portal','billingFrequency','monthly','monthlyRateCents',NULL,
  'cancellationNoticeDays',30,'currency','USD','paidServiceRequiresAgreement',TRUE)
FROM schoolcarebridge_partners p JOIN agencies a ON a.id = p.agency_id WHERE a.slug = 'itsco';
