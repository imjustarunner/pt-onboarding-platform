CREATE TABLE IF NOT EXISTS billing_payer_rule_state (
 agency_id INT PRIMARY KEY, revision INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS billing_payer_programs (
 agency_id INT NOT NULL,payer_id VARCHAR(32) NOT NULL,programs_json JSON NOT NULL,
 PRIMARY KEY(agency_id,payer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS billing_program_credential_rules (
 agency_id INT NOT NULL,program VARCHAR(20) NOT NULL,credential_tier VARCHAR(32) NOT NULL,allowed BOOLEAN NOT NULL,
 PRIMARY KEY(agency_id,program,credential_tier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS billing_program_service_rules (
 agency_id INT NOT NULL,program VARCHAR(20) NOT NULL,service_code VARCHAR(16) NOT NULL,allowed BOOLEAN NOT NULL,
 PRIMARY KEY(agency_id,program,service_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS billing_payer_service_overrides (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 agency_id INT NOT NULL,payer_id VARCHAR(32) NOT NULL,program VARCHAR(20) NOT NULL,plan_type VARCHAR(100) NOT NULL DEFAULT '',
 service_code VARCHAR(16) NOT NULL,allowed BOOLEAN NULL,effective_from DATE NOT NULL,effective_through DATE NOT NULL,
 reason VARCHAR(1000) NOT NULL,policy_reference VARCHAR(1000) NOT NULL,
 UNIQUE KEY uq_payer_service_period(agency_id,payer_id,program,plan_type,service_code,effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS billing_payer_rule_events (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,agency_id INT NOT NULL,revision INT NOT NULL,actor_user_id INT NOT NULL,
 rule_kind VARCHAR(32) NOT NULL,scope_json JSON NOT NULL,before_json JSON NULL,after_json JSON NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_payer_rule_revision(agency_id,revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
