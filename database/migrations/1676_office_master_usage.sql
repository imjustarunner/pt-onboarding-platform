CREATE TABLE office_assignment_checkin_usage (
 assignment_id INT PRIMARY KEY,
 monitoring_started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_checked_at DATETIME NULL,
 unused_occurrences INT NOT NULL DEFAULT 0,
 downgraded_at DATETIME NULL,
 CONSTRAINT fk_office_checkin_usage_assignment FOREIGN KEY (assignment_id) REFERENCES office_standing_assignments(id)
);
