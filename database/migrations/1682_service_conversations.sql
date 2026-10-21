ALTER TABLE chat_threads ADD COLUMN service_enrollment_id BIGINT NOT NULL DEFAULT 0;
DROP INDEX uq_client_secure_thread ON chat_threads;
CREATE UNIQUE INDEX uq_client_secure_thread ON chat_threads (client_id, agency_id, thread_type, service_enrollment_id);
