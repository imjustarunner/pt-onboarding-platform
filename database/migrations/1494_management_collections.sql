-- Collections owns workflow; family_receivable_allocations remains the A/R ledger.
-- No historical balances are enrolled and no collection permission is inferred.
CREATE TABLE family_collection_agreements (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  managing_agency_id INT NOT NULL,
  fee_basis_points INT NOT NULL DEFAULT 2500,
  eligibility_days INT NOT NULL DEFAULT 60,
  active TINYINT NOT NULL DEFAULT 0,
  agreement_reference VARCHAR(160) NOT NULL,
  UNIQUE KEY uq_collection_agreement (agency_id, managing_agency_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id),
  FOREIGN KEY (managing_agency_id) REFERENCES agencies(id),
  CHECK (agency_id <> managing_agency_id),
  CHECK (fee_basis_points BETWEEN 0 AND 10000),
  CHECK (eligibility_days >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE family_collection_permissions (
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  permission ENUM('view','escalate','manage','financial','settlement','admin') NOT NULL,
  PRIMARY KEY (agency_id,user_id,permission),
  FOREIGN KEY (agency_id) REFERENCES agencies(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE family_collection_balances (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  payer_user_id INT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  original_amount_cents BIGINT NOT NULL,
  created_by_user_id INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (agency_id) REFERENCES agencies(id),
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (payer_user_id) REFERENCES users(id),
  CHECK (original_amount_cents > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE family_collection_balance_items (
  balance_id BIGINT NOT NULL,
  allocation_id BIGINT NOT NULL,
  original_amount_cents BIGINT NOT NULL,
  PRIMARY KEY (balance_id,allocation_id),
  -- One allocation cannot be collectible through two concurrent groupings.
  UNIQUE KEY uq_collection_balance_allocation (allocation_id),
  FOREIGN KEY (balance_id) REFERENCES family_collection_balances(id),
  FOREIGN KEY (allocation_id) REFERENCES family_receivable_allocations(id),
  CHECK (original_amount_cents > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE family_collection_cases (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  balance_id BIGINT NOT NULL,
  agreement_id BIGINT NOT NULL,
  agency_id INT NOT NULL,
  managing_agency_id INT NOT NULL,
  fee_basis_points INT NOT NULL,
  transferred_amount_cents BIGINT NOT NULL,
  status ENUM('active','paused','closed') NOT NULL DEFAULT 'active',
  transfer_snapshot_encrypted LONGTEXT NOT NULL,
  request_key VARCHAR(150) NOT NULL,
  transferred_by_user_id INT NOT NULL,
  transferred_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_collection_case_balance (balance_id),
  UNIQUE KEY uq_collection_case_request (agency_id,request_key),
  KEY ix_collection_case_manager (managing_agency_id,status,id),
  FOREIGN KEY (balance_id) REFERENCES family_collection_balances(id),
  FOREIGN KEY (agreement_id) REFERENCES family_collection_agreements(id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id),
  FOREIGN KEY (managing_agency_id) REFERENCES agencies(id),
  CHECK (agency_id <> managing_agency_id),
  CHECK (fee_basis_points BETWEEN 0 AND 10000),
  CHECK (transferred_amount_cents > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE family_collection_recoveries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  case_id BIGINT NOT NULL,
  payment_id BIGINT NOT NULL,
  gross_recovery_cents BIGINT NOT NULL,
  collection_fee_cents BIGINT NOT NULL,
  agency_share_cents BIGINT NOT NULL,
  received_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_collection_recovery_payment (payment_id),
  UNIQUE KEY uq_collection_recovery_case (id,case_id),
  FOREIGN KEY (case_id) REFERENCES family_collection_cases(id),
  FOREIGN KEY (payment_id) REFERENCES family_ledger_payments(id),
  CHECK (gross_recovery_cents > 0 AND collection_fee_cents >= 0 AND agency_share_cents >= 0),
  CHECK (gross_recovery_cents = collection_fee_cents + agency_share_cents)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE family_collection_settlements (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  managing_agency_id INT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status ENUM('draft','approved','paid') NOT NULL DEFAULT 'draft',
  gross_recovery_cents BIGINT NOT NULL,
  collection_fee_cents BIGINT NOT NULL,
  net_amount_cents BIGINT NOT NULL,
  paid_at DATETIME(3) NULL,
  payment_reference_encrypted LONGTEXT NULL,
  FOREIGN KEY (agency_id) REFERENCES agencies(id),
  FOREIGN KEY (managing_agency_id) REFERENCES agencies(id),
  CHECK (agency_id <> managing_agency_id AND period_start <= period_end),
  CHECK (gross_recovery_cents > 0 AND collection_fee_cents >= 0 AND net_amount_cents >= 0),
  CHECK (gross_recovery_cents = collection_fee_cents + net_amount_cents),
  CHECK (status <> 'paid' OR (paid_at IS NOT NULL AND payment_reference_encrypted IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE family_collection_settlement_items (
  settlement_id BIGINT NOT NULL,
  recovery_id BIGINT NOT NULL,
  PRIMARY KEY (settlement_id,recovery_id),
  UNIQUE KEY uq_collection_settled_recovery (recovery_id),
  FOREIGN KEY (settlement_id) REFERENCES family_collection_settlements(id),
  FOREIGN KEY (recovery_id) REFERENCES family_collection_recoveries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
