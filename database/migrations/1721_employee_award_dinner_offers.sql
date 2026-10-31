-- An invitation/offer does not fulfill a two-year dinner award. Preserve each
-- offer or response separately, including dates that staff know and their notes.
CREATE TABLE IF NOT EXISTS employee_award_dinner_offers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  milestone_id INT NOT NULL,
  outcome ENUM('offered','unable_to_attend','declined','no_show') NOT NULL,
  offered_on DATE NULL,
  note TEXT NULL,
  actor_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_award_dinner_offers (milestone_id, id)
);
