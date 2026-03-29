-- Summit Stats Challenge: manual all-time club records managed by club admins

CREATE TABLE IF NOT EXISTS summit_stats_club_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  records_json JSON NOT NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_ssc_club_records_agency (agency_id),
  CONSTRAINT fk_ssc_club_records_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_ssc_club_records_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_ssc_club_records_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
