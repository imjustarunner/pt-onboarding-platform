-- When a member erases their data from a club, workout rows are deleted but these
-- JSON buckets preserve club-facing totals (see backend summitClubErasureRetainedTotals.js).
CREATE TABLE IF NOT EXISTS summit_stats_club_erasure_retained_totals (
  agency_id INT NOT NULL PRIMARY KEY,
  totals_json JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sscert_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
