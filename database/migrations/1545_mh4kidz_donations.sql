-- Online donations remain closed until the nonprofit details and merchant are configured.
CREATE TABLE finance_donation_settings (
 agency_id INT NOT NULL PRIMARY KEY,
 enabled TINYINT(1) NOT NULL DEFAULT 0,
 legal_name VARCHAR(200) NOT NULL DEFAULT 'MH4Kidz',
 ein VARCHAR(10) NOT NULL DEFAULT '',
 tax_exempt_confirmed TINYINT(1) NOT NULL DEFAULT 0,
 no_benefits_confirmed TINYINT(1) NOT NULL DEFAULT 0,
 fund_id INT NULL,
 sender_identity_id INT NULL,
 revision INT NOT NULL DEFAULT 1,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE finance_donations (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 fund_id INT NOT NULL,
 request_key VARCHAR(64) NOT NULL,
 request_hash CHAR(64) NOT NULL,
 receipt_token_hash CHAR(64) NOT NULL,
 donor_name VARCHAR(200) NOT NULL,
 donor_email VARCHAR(254) NOT NULL,
 city VARCHAR(100) NOT NULL DEFAULT '',
 region VARCHAR(100) NOT NULL DEFAULT '',
 public_recognition TINYINT(1) NOT NULL DEFAULT 1,
 recognition_version VARCHAR(40) NOT NULL,
 recognition_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 amount_cents BIGINT NOT NULL,
 refunded_cents BIGINT NOT NULL DEFAULT 0,
 currency CHAR(3) NOT NULL DEFAULT 'usd',
 status VARCHAR(30) NOT NULL DEFAULT 'pending',
 stripe_account_id VARCHAR(100) NOT NULL,
 stripe_session_id VARCHAR(255) NULL,
 stripe_payment_intent_id VARCHAR(255) NULL,
 livemode TINYINT(1) NOT NULL,
 issuer_json JSON NOT NULL,
 paid_at DATETIME NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY (agency_id,request_key),
 UNIQUE KEY (receipt_token_hash),
 UNIQUE KEY (stripe_account_id,stripe_payment_intent_id),
 INDEX (agency_id,status,paid_at)
) ENGINE=InnoDB;
CREATE TABLE finance_donation_refunds (
 stripe_refund_id VARCHAR(255) NOT NULL PRIMARY KEY,
 donation_id INT NOT NULL,
 amount_cents BIGINT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX (donation_id)
) ENGINE=InnoDB;
CREATE TABLE finance_donation_receipt_deliveries (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 donation_id INT NOT NULL,
 refunded_cents BIGINT NOT NULL DEFAULT 0,
 status VARCHAR(30) NOT NULL DEFAULT 'pending',
 communication_id INT NULL,
 attempts INT NOT NULL DEFAULT 0,
 last_error VARCHAR(250) NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY (donation_id,refunded_cents)
) ENGINE=InnoDB;
INSERT INTO finance_donation_settings (agency_id)
 SELECT a.id FROM agencies a JOIN finance_organizations f ON f.agency_id=a.id
 WHERE a.slug='mh4kidz' AND f.is_demo=0;
