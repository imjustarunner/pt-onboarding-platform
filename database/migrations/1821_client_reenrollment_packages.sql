ALTER TABLE client_update_requests
 ADD COLUMN purpose VARCHAR(24) NOT NULL DEFAULT 'update',
 ADD COLUMN service_enrollment_id BIGINT NULL,
 ADD COLUMN reenrollment_request_key VARCHAR(64) NULL,
 ADD COLUMN packet_config_json JSON NULL,
 ADD UNIQUE KEY ix_reenrollment_request (created_by_user_id,reenrollment_request_key);

CREATE TABLE client_service_provider_history (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 service_enrollment_id BIGINT NOT NULL,
 client_id INT NOT NULL,
 agency_id INT NOT NULL,
 provider_user_id INT NOT NULL,
 label VARCHAR(150) NOT NULL,
 service_status VARCHAR(24) NOT NULL,
 closure_reason VARCHAR(40) NULL,
 client_end_reason VARCHAR(500) NULL,
 recorded_at DATETIME NULL,
 ended_at DATETIME NOT NULL,
 UNIQUE KEY ix_service_episode_end (service_enrollment_id,ended_at),
 KEY ix_client_provider_history (client_id,agency_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO client_service_provider_history (service_enrollment_id,client_id,agency_id,provider_user_id,label,service_status,closure_reason,client_end_reason,recorded_at,ended_at)
 SELECT id,client_id,agency_id,provider_user_id,label,service_status,closure_reason,client_end_reason,created_at,COALESCE(ended_at,updated_at)
 FROM client_service_enrollments WHERE is_active=0;
