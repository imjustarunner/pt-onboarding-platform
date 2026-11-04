-- Receipt delivery is queued only by new settlements; no historical mail backfill.
CREATE TABLE family_receipt_deliveries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  payment_id BIGINT NOT NULL,
  event_key VARCHAR(150) NOT NULL,
  kind ENUM('payment','credit_available','credit_applied','refund') NOT NULL,
  status ENUM('pending','sending','sent','held','unknown') NOT NULL DEFAULT 'pending',
  communication_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  UNIQUE KEY uq_family_receipt_event(agency_id,event_key),
  KEY ix_family_receipt_pending(status,id),
  FOREIGN KEY(payment_id) REFERENCES family_ledger_payments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A credit belongs to the original payer, client, tenant and currency. The
-- original payment and receipt are retained; applications are not new charges.
CREATE TABLE family_copay_credits (
  payment_id BIGINT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  payer_user_id INT NOT NULL,
  service_date DATE NOT NULL,
  service_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_family_copay_credit_owner(agency_id,client_id,payer_user_id,service_date),
  FOREIGN KEY(payment_id) REFERENCES family_ledger_payments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE family_copay_credit_applications (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  payment_id BIGINT NOT NULL,
  allocation_id BIGINT NOT NULL,
  amount_cents INT NOT NULL,
  status ENUM('applied','reversed') NOT NULL DEFAULT 'applied',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reversed_at DATETIME NULL,
  KEY ix_family_credit_payment(payment_id,status),
  KEY ix_family_credit_allocation(allocation_id,status),
  FOREIGN KEY(payment_id) REFERENCES family_copay_credits(payment_id),
  FOREIGN KEY(allocation_id) REFERENCES family_receivable_allocations(id),
  CHECK(amount_cents>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE family_payment_refund_requests (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  payment_id BIGINT NOT NULL,
  payer_user_id INT NOT NULL,
  amount_cents INT NOT NULL,
  reason_encrypted LONGTEXT NOT NULL,
  status ENUM('requested','processing','completed','declined','review') NOT NULL DEFAULT 'requested',
  reviewed_by_user_id INT NULL,
  resolution_encrypted LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  KEY ix_family_refund_request_payment(payment_id,status),
  KEY ix_family_refund_request_work(agency_id,status,id),
  FOREIGN KEY(payment_id) REFERENCES family_ledger_payments(id),
  CHECK(amount_cents>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE family_payment_refunds ADD COLUMN request_id BIGINT NULL,
  ADD UNIQUE KEY uq_family_refund_request(request_id);
