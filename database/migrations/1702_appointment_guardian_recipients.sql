-- Each guardian has an independent delivery result and personal preferences.
ALTER TABLE appointment_reminders
  ADD COLUMN recipient_guardian_user_id INT NULL,
  ADD COLUMN recipient_client_id INT NULL,
  ADD COLUMN parent_reminder_id INT NULL,
  ADD UNIQUE KEY uniq_guardian_reminder_expansion (parent_reminder_id, recipient_guardian_user_id);
