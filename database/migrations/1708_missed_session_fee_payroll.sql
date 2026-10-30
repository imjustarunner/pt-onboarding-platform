-- Prospective, reviewed fee compensation. No existing fee or payroll is backfilled.
CREATE TABLE IF NOT EXISTS payroll_missed_fee_policies (
  agency_id INT PRIMARY KEY,
  enabled TINYINT NOT NULL DEFAULT 0,
  effective_on DATE NOT NULL,
  policy_version VARCHAR(64) NOT NULL DEFAULT 'missed-fee-share-v1',
  updated_by_user_id INT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payroll_missed_session_fees (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  receivable_id BIGINT NOT NULL,
  appointment_id INT UNSIGNED NOT NULL,
  client_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  event_date DATE NOT NULL,
  fee_kind VARCHAR(20) NOT NULL,
  category_snapshot TINYINT NOT NULL,
  share_basis_points INT NOT NULL,
  policy_version VARCHAR(64) NOT NULL,
  category_evidence_json JSON NOT NULL,
  net_collected_cents INT NOT NULL DEFAULT 0,
  entitlement_cents INT NOT NULL DEFAULT 0,
  review_reason VARCHAR(160) NULL,
  created_by_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_missed_fee_balance (agency_id,receivable_id),
  UNIQUE KEY uq_missed_fee_event_client (agency_id,appointment_id,client_id),
  KEY ix_missed_fee_provider (agency_id,provider_user_id,event_date),
  CHECK(category_snapshot IN (1,2,3)),
  CHECK(share_basis_points IN (2000,3000,4000)),
  CHECK(net_collected_cents>=0 AND entitlement_cents>=0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payroll_missed_fee_claims (
  fee_id BIGINT NOT NULL,
  claim_id INT NOT NULL,
  PRIMARY KEY(claim_id),
  KEY ix_missed_fee_claims(fee_id),
  FOREIGN KEY(fee_id) REFERENCES payroll_missed_session_fees(id),
  FOREIGN KEY(claim_id) REFERENCES payroll_time_claims(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
