-- Signed family summaries are separate from private working notes.
CREATE TABLE tutoring_note_publications (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 note_id INT NOT NULL,
 appointment_id INT UNSIGNED NOT NULL,
 session_id INT NOT NULL,
 agency_id INT NOT NULL,
 client_id INT NOT NULL,
 author_user_id INT NOT NULL,
 signed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 snapshot_json LONGTEXT NOT NULL,
 payload_hash CHAR(64) NOT NULL,
 UNIQUE KEY uq_tutoring_publication_note(note_id),
 KEY idx_tutoring_publication_client(agency_id,client_id,signed_at),
 KEY idx_tutoring_publication_appointment(appointment_id)
);
