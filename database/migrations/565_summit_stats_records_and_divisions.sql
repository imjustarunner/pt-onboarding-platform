-- Summit Stats: Records, Divisions, Recognition
-- Participant demographics (gender, DOB) for segmented leaderboards.
-- Master's Division (53+), recognition categories, Launch Season.

-- challenge_participant_profiles: Gender and DOB per challenge participant (for leaderboard segmentation)
CREATE TABLE IF NOT EXISTS challenge_participant_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  learning_class_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  gender VARCHAR(32) NULL COMMENT 'male, female, non_binary, prefer_not_to_say',
  date_of_birth DATE NULL COMMENT 'For age/Master''s eligibility',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_participant_profile (learning_class_id, provider_user_id),
  INDEX idx_participant_profiles_class (learning_class_id),
  INDEX idx_participant_profiles_provider (provider_user_id),
  CONSTRAINT fk_participant_profiles_class
    FOREIGN KEY (learning_class_id) REFERENCES learning_program_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_participant_profiles_provider
    FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Extend learning_program_classes: Master's Division and recognition
ALTER TABLE learning_program_classes
  ADD COLUMN masters_age_threshold INT NULL DEFAULT 53 COMMENT 'Age to qualify for Master''s Division (default 53)' AFTER week_start_time,
  ADD COLUMN recognition_categories_json JSON NULL COMMENT 'Enabled categories: fastest_male, fastest_female, fastest_masters_male, fastest_masters_female' AFTER masters_age_threshold,
  ADD COLUMN recognition_metric VARCHAR(32) NULL DEFAULT 'points' COMMENT 'points, distance, duration, activities_count' AFTER recognition_categories_json;
