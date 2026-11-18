-- Plotline self-service is opt-in at release. No existing company, identity,
-- permission, sender, automation classification or trial is changed here.
-- Shared counters survive process restarts and Cloud Run autoscaling. They are
-- intentionally independent of the signup/company request bodies.
CREATE TABLE IF NOT EXISTS plotline_capacity (
 bucket_key VARCHAR(120) NOT NULL PRIMARY KEY,
 used INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plotline_signups (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 email VARCHAR(254) NOT NULL,
 token_hash CHAR(64) NOT NULL,
 expires_at DATETIME NOT NULL,
 sent_at DATETIME NULL,
 requested_at DATETIME NOT NULL,
 consumed_at DATETIME NULL,
 user_id INT NULL,
 UNIQUE KEY plotline_signup_email (email),
 UNIQUE KEY plotline_signup_token (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plotline_company_drafts (
 id CHAR(36) NOT NULL PRIMARY KEY,
 owner_user_id INT NOT NULL,
 revision INT UNSIGNED NOT NULL DEFAULT 1,
 content_json JSON NOT NULL,
 logo_webp MEDIUMBLOB NULL,
 logo_sha256 CHAR(64) NULL,
 created_at DATETIME NOT NULL,
 updated_at DATETIME NOT NULL,
 KEY plotline_draft_owner (owner_user_id,updated_at),
 FOREIGN KEY (owner_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plotline_companies (
 agency_id INT NOT NULL PRIMARY KEY,
 owner_user_id INT NOT NULL,
 draft_id CHAR(36) NOT NULL,
 industry VARCHAR(40) NOT NULL,
 timezone VARCHAR(80) NOT NULL,
 is_qa TINYINT(1) NOT NULL DEFAULT 0,
 trial_started_at DATETIME NOT NULL,
 trial_ends_at DATETIME NOT NULL,
 terms_version VARCHAR(40) NOT NULL,
 terms_accepted_at DATETIME NOT NULL,
 continuation_requested_at DATETIME NULL,
 commercial_activated_at DATETIME NULL,
 created_at DATETIME NOT NULL,
 UNIQUE KEY plotline_company_draft (draft_id),
 KEY plotline_company_owner (owner_user_id),
 FOREIGN KEY (agency_id) REFERENCES agencies(id),
 FOREIGN KEY (owner_user_id) REFERENCES users(id),
 FOREIGN KEY (draft_id) REFERENCES plotline_company_drafts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plotline_audit_events (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NULL,
 actor_user_id INT NOT NULL,
 action VARCHAR(80) NOT NULL,
 object_id VARCHAR(100) NULL,
 metadata_json JSON NOT NULL,
 created_at DATETIME NOT NULL,
 KEY plotline_audit_company (agency_id,created_at),
 KEY plotline_audit_actor (actor_user_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
