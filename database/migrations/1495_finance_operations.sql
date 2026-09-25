-- Finance Operations is tenant opt-in and separate from clinical billing.
CREATE TABLE finance_organizations (
 agency_id INT NOT NULL PRIMARY KEY,
 enabled TINYINT(1) NOT NULL DEFAULT 0,
 mode ENUM('self_managed','sponsored') NOT NULL DEFAULT 'self_managed',
 manager_agency_id INT NULL,
 is_demo TINYINT(1) NOT NULL DEFAULT 0,
 fiscal_start_month TINYINT NOT NULL DEFAULT 1,
 currency CHAR(3) NOT NULL DEFAULT 'usd',
 bank_enabled TINYINT(1) NOT NULL DEFAULT 0,
 revision INT NOT NULL DEFAULT 1,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE finance_access (
 agency_id INT NOT NULL,user_id INT NOT NULL,
 role ENUM('manager','requester','viewer') NOT NULL,
 PRIMARY KEY(agency_id,user_id)
) ENGINE=InnoDB;
CREATE TABLE finance_programs (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,agency_id INT NOT NULL,
 name VARCHAR(200) NOT NULL,description TEXT NULL,
 staff_user_id INT NULL,status VARCHAR(24) NOT NULL DEFAULT 'active',
 INDEX(agency_id,id)
) ENGINE=InnoDB;
CREATE TABLE finance_partners (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,agency_id INT NOT NULL,
 name VARCHAR(200) NOT NULL,kind VARCHAR(30) NOT NULL,
 contact VARCHAR(255) NULL,notes TEXT NULL,INDEX(agency_id,id)
) ENGINE=InnoDB;
CREATE TABLE finance_funds (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,agency_id INT NOT NULL,
 name VARCHAR(200) NOT NULL,kind ENUM('restricted','unrestricted','reserve') NOT NULL,
 restrictions TEXT NULL,INDEX(agency_id,id)
) ENGINE=InnoDB;
CREATE TABLE finance_receipts (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,agency_id INT NOT NULL,fund_id INT NOT NULL,
 amount_cents BIGINT NOT NULL,received_date DATE NOT NULL,reference VARCHAR(200) NOT NULL,
 actor_user_id INT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY(agency_id,fund_id,reference),INDEX(agency_id,fund_id)
) ENGINE=InnoDB;
CREATE TABLE finance_grants (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,agency_id INT NOT NULL,fund_id INT NOT NULL,
 partner_id INT NULL,name VARCHAR(200) NOT NULL,award_cents BIGINT NOT NULL,
 start_date DATE NOT NULL,end_date DATE NOT NULL,report_due DATE NULL,
 restrictions TEXT NULL,status VARCHAR(30) NOT NULL DEFAULT 'awarded',INDEX(agency_id,id)
) ENGINE=InnoDB;
CREATE TABLE finance_budgets (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,agency_id INT NOT NULL,
 program_id INT NOT NULL,fund_id INT NOT NULL,grant_id INT NULL,
 name VARCHAR(200) NOT NULL,amount_cents BIGINT NOT NULL,start_date DATE NOT NULL,end_date DATE NOT NULL,
 revision INT NOT NULL DEFAULT 1,INDEX(agency_id,id)
) ENGINE=InnoDB;
CREATE TABLE finance_allocations (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,agency_id INT NOT NULL,budget_id INT NOT NULL,
 name VARCHAR(200) NOT NULL,amount_cents BIGINT NOT NULL,INDEX(agency_id,id)
) ENGINE=InnoDB;
CREATE TABLE finance_events (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,agency_id INT NOT NULL,program_id INT NOT NULL,
 name VARCHAR(200) NOT NULL,kind VARCHAR(30) NOT NULL,start_date DATE NOT NULL,end_date DATE NOT NULL,
 location VARCHAR(255) NULL,description TEXT NULL,planned_participants INT NOT NULL DEFAULT 0,
 INDEX(agency_id,id)
) ENGINE=InnoDB;
CREATE TABLE finance_expenses (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,agency_id INT NOT NULL,
 request_key VARCHAR(80) NOT NULL,title VARCHAR(200) NOT NULL,description TEXT NULL,
 kind ENUM('vendor','reimbursement','scholarship') NOT NULL,
 program_id INT NOT NULL,event_id INT NULL,partner_id INT NULL,staff_user_id INT NULL,
 amount_cents BIGINT NOT NULL,expense_date DATE NOT NULL,category VARCHAR(80) NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'draft',revision INT NOT NULL DEFAULT 1,
 requested_by_user_id INT NULL,approved_by_user_id INT NULL,
 payment_reference VARCHAR(200) NULL,payment_date DATE NULL,quickbooks_reference VARCHAR(200) NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY(agency_id,request_key),UNIQUE KEY(agency_id,payment_reference),INDEX(agency_id,status,id)
) ENGINE=InnoDB;
CREATE TABLE finance_expense_splits (
 expense_id INT NOT NULL,agency_id INT NOT NULL,allocation_id INT NOT NULL,amount_cents BIGINT NOT NULL,
 PRIMARY KEY(expense_id,allocation_id),INDEX(agency_id,allocation_id)
) ENGINE=InnoDB;
CREATE TABLE finance_expense_history (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,agency_id INT NOT NULL,expense_id INT NOT NULL,
 actor_user_id INT NULL,from_status VARCHAR(24) NULL,to_status VARCHAR(24) NOT NULL,
 note TEXT NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX(agency_id,expense_id,id)
) ENGINE=InnoDB;
CREATE TABLE finance_documents (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,agency_id INT NOT NULL,
 name VARCHAR(255) NOT NULL,kind VARCHAR(30) NOT NULL,mime VARCHAR(100) NOT NULL,size_bytes INT NOT NULL,
 content_encrypted MEDIUMTEXT NOT NULL,sha256 CHAR(64) NOT NULL,
 visibility ENUM('internal','organization') NOT NULL DEFAULT 'internal',
 program_id INT NULL,grant_id INT NULL,expense_id INT NULL,request_id INT NULL,
 uploaded_by_user_id INT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX(agency_id,id)
) ENGINE=InnoDB;
CREATE TABLE finance_requests (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,agency_id INT NOT NULL,
 kind ENUM('support','budget_change','report') NOT NULL,title VARCHAR(200) NOT NULL,
 description TEXT NULL,program_id INT NULL,grant_id INT NULL,due_date DATE NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'open',response TEXT NULL,
 requested_by_user_id INT NULL,revision INT NOT NULL DEFAULT 1,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX(agency_id,status,id)
) ENGINE=InnoDB;
CREATE TABLE finance_audit (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,agency_id INT NOT NULL,actor_user_id INT NULL,
 action VARCHAR(100) NOT NULL,object_type VARCHAR(40) NOT NULL,object_id BIGINT NULL,
 detail_json JSON NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX(agency_id,id)
) ENGINE=InnoDB;
-- Bank consent for broader financial operations is explicit and distinct from payer verification.
ALTER TABLE bank_feed_sessions ADD COLUMN purpose VARCHAR(30) NOT NULL DEFAULT 'payer_deposit';
ALTER TABLE bank_feed_accounts ADD COLUMN purpose VARCHAR(30) NOT NULL DEFAULT 'payer_deposit';
CREATE TABLE finance_bank_entries (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,agency_id INT NOT NULL,account_id BIGINT UNSIGNED NOT NULL,
 external_id VARCHAR(128) NOT NULL,vendor_updated BIGINT NOT NULL,
 evidence_encrypted TEXT NOT NULL,evidence_hash CHAR(64) NOT NULL,
 expense_id INT NULL,review_status VARCHAR(24) NOT NULL DEFAULT 'unreviewed',
 UNIQUE KEY(account_id,external_id),UNIQUE KEY(agency_id,expense_id),INDEX(agency_id,account_id,id)
) ENGINE=InnoDB;
CREATE TABLE finance_bank_history (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,agency_id INT NOT NULL,entry_id BIGINT NOT NULL,
 evidence_encrypted TEXT NOT NULL,evidence_hash CHAR(64) NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE KEY(entry_id,evidence_hash)
) ENGINE=InnoDB;
