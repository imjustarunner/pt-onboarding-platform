-- Legal identity and the name a client uses are distinct; parent updates require review.
ALTER TABLE clients ADD COLUMN preferred_name VARCHAR(255) NULL;
CREATE TABLE guardian_demographic_requests (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,
 client_id INT NOT NULL,
 guardian_user_id INT NOT NULL,
 intake_submission_id INT NULL,
 changes_encrypted LONGTEXT NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'pending',
 reviewed_by_user_id INT NULL,
 review_encrypted LONGTEXT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reviewed_at DATETIME NULL,
 INDEX ix_demographic_review (agency_id, client_id, status),
 INDEX ix_demographic_owner (guardian_user_id, client_id),
 UNIQUE KEY uq_demographic_enrollment (client_id, intake_submission_id)
) ENGINE=InnoDB;
