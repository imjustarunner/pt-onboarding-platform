-- Future actor-backed school waitlist/assignment transitions only. No backfill.
CREATE TABLE IF NOT EXISTS school_family_status_emails (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 school_status_email_id BIGINT UNSIGNED NOT NULL,
 agency_id INT NOT NULL, school_organization_id INT NOT NULL, client_id INT NOT NULL,
 actor_user_id INT NOT NULL, revision INT NOT NULL, state_hash CHAR(64) NOT NULL,
 plan_json LONGTEXT NULL, results_json JSON NULL,
 delivery_status VARCHAR(24) NOT NULL DEFAULT 'pending',
 attempts INT NOT NULL DEFAULT 0, last_error VARCHAR(500) NULL,
 next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_school_family_status_event(school_status_email_id),
 KEY ix_school_family_status_due(delivery_status,next_attempt_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
