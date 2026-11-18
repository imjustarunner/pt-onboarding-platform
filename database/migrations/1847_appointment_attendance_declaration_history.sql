-- Keep every signed declaration when a withdrawn decision is replaced.
ALTER TABLE appointment_no_show_reviews
 DROP INDEX uq_no_show_appointment,
 ADD INDEX idx_no_show_appointment_version (appointment_id,id);

CREATE TABLE appointment_change_workflow_history (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 appointment_id INT UNSIGNED NOT NULL,
 agency_id INT NOT NULL,
 review_id BIGINT UNSIGNED NOT NULL,
 signed_payload LONGTEXT NOT NULL,
 archived_by_user_id INT NOT NULL,
 archived_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_workflow_history_review(review_id),
 KEY idx_workflow_history_appointment(appointment_id,id)
);
