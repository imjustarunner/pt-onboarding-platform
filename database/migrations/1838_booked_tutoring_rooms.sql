-- Scheduled tutoring has its own monitored media scope, independent of a standing office.
ALTER TABLE clinical_video_sessions MODIFY session_kind ENUM('office','counseling','tutoring') NOT NULL;
ALTER TABLE therapy_session_artifacts MODIFY session_kind ENUM('office','counseling','tutoring') NOT NULL;
ALTER TABLE learning_class_sessions ADD COLUMN actual_ended_at DATETIME NULL;
ALTER TABLE learning_class_sessions ADD COLUMN booked_media_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL;
ALTER TABLE tutoring_session_notes MODIFY student_subject_id INT NULL;
CREATE TABLE IF NOT EXISTS tutoring_session_visits (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 session_id BIGINT NOT NULL,
 user_id INT NOT NULL,
 client_id INT NOT NULL,
 actor VARCHAR(100) NOT NULL,
 status ENUM('waiting','admitted','ended') NOT NULL DEFAULT 'waiting',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 admitted_at DATETIME NULL,
 ended_at DATETIME NULL,
 duration_seconds INT NULL,
 INDEX tutoring_visit_actor(session_id,user_id,status),
 INDEX tutoring_visit_attendance(session_id,admitted_at)
);
