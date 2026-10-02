-- NULL keeps existing single-reminder behavior; [] explicitly disables reminders.
ALTER TABLE supervision_sessions ADD COLUMN meeting_settings_json JSON NULL;
