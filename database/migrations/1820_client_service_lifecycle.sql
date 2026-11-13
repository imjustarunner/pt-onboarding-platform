ALTER TABLE client_service_enrollments
  ADD COLUMN service_status VARCHAR(24) NOT NULL DEFAULT 'active',
  ADD COLUMN ended_at DATETIME NULL,
  ADD COLUMN closure_reason VARCHAR(40) NULL,
  ADD COLUMN client_end_reason VARCHAR(500) NULL;
UPDATE client_service_enrollments SET service_status='discontinued',ended_at=updated_at WHERE is_active=0;

CREATE TABLE IF NOT EXISTS client_service_return_requests (
 id CHAR(36) PRIMARY KEY,
 client_id INT NOT NULL,
 agency_id INT NOT NULL,
 service_enrollment_id BIGINT NOT NULL,
 provider_user_id INT NOT NULL,
 requester_user_id INT NOT NULL,
 note_encrypted LONGTEXT NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'pending',
 pending_key TINYINT NULL DEFAULT 1,
 response_encrypted LONGTEXT NULL,
 reviewed_by_user_id INT NULL,
 reviewed_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY ix_pending_service_return (service_enrollment_id,requester_user_id,pending_key),
 KEY ix_service_return_team (agency_id,provider_user_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
