-- Prospective enrollment only. No current employee or shared rate is changed.
CREATE TABLE IF NOT EXISTS payroll_future_hire_enrollments (
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  effective_start DATE NOT NULL,
  enrolled_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, user_id),
  KEY idx_future_hire_user (user_id)
);
