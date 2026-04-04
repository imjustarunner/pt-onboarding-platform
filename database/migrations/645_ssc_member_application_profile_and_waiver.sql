-- SSC member applications: richer applicant profile answers + waiver audit fields

ALTER TABLE challenge_member_applications
  ADD COLUMN heard_about_club TEXT NULL AFTER timezone,
  ADD COLUMN running_fitness_background TEXT NULL AFTER heard_about_club,
  ADD COLUMN average_miles_per_week DECIMAL(6,2) NULL AFTER running_fitness_background,
  ADD COLUMN average_hours_per_week DECIMAL(6,2) NULL AFTER average_miles_per_week,
  ADD COLUMN current_fitness_activities TEXT NULL AFTER average_hours_per_week,
  ADD COLUMN waiver_signature_name VARCHAR(255) NULL AFTER current_fitness_activities,
  ADD COLUMN waiver_agreed_at DATETIME NULL AFTER waiver_signature_name,
  ADD COLUMN waiver_version VARCHAR(64) NULL AFTER waiver_agreed_at,
  ADD COLUMN waiver_ip_address VARCHAR(64) NULL AFTER waiver_version,
  ADD COLUMN waiver_user_agent VARCHAR(255) NULL AFTER waiver_ip_address;
