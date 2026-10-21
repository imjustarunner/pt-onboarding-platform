-- Demo progress is separate from real signatures, uploads and payment authority.
CREATE TABLE IF NOT EXISTS family_portal_onboarding_demo_steps (
 agency_id INT NOT NULL, client_id INT NOT NULL, guardian_user_id INT NOT NULL,
 step_key VARCHAR(32) NOT NULL, completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (agency_id,client_id,guardian_user_id,step_key)
);
-- Reserve before transport. Uncertain delivery is held for review, never retried blindly.
CREATE TABLE IF NOT EXISTS family_portal_onboarding_reminders (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL, guardian_user_id INT NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'sending',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 sent_at DATETIME NULL, reason VARCHAR(255) NULL,
 INDEX onboarding_reminder_recipient (agency_id,guardian_user_id,created_at)
);
