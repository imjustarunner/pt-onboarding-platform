-- Kudos reward tiers: configurable thresholds for rewards eligibility
-- Admins configure tiers per agency; users see progress toward next tier

CREATE TABLE IF NOT EXISTS kudos_reward_tiers (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  tier_name VARCHAR(120) NOT NULL,
  points_threshold INT NOT NULL,
  reward_description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  INDEX idx_agency_threshold (agency_id, points_threshold)
);
