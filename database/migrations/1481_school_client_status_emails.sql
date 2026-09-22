CREATE TABLE school_client_status_email_states (
 client_id INT NOT NULL, school_organization_id INT NOT NULL,
 state_hash CHAR(64) NOT NULL DEFAULT '', revision INT NOT NULL DEFAULT 0,
 PRIMARY KEY(client_id,school_organization_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE school_client_status_emails (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL, school_organization_id INT NOT NULL, client_id INT NOT NULL,
 revision INT NOT NULL, state_hash CHAR(64) NOT NULL, state_json JSON NOT NULL,
 delivery_status VARCHAR(24) NOT NULL DEFAULT 'pending', communication_id INT NULL,
 attempts INT NOT NULL DEFAULT 0, last_error VARCHAR(500) NULL,
 next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, sent_at DATETIME NULL,
 UNIQUE KEY uq_school_client_status_revision(client_id,school_organization_id,revision),
 KEY ix_school_client_status_due(delivery_status,next_attempt_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Unsent digest drafts are retired; historical sent communications stay intact.
UPDATE user_communications SET delivery_status='failed',
 error_message='Superseded: school assignment and waitlist notices now send individually.'
 WHERE template_type='school_ready_to_schedule_digest' AND delivery_status='pending';
