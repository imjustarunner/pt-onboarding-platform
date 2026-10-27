-- One employee submission, with linked wage and expense entries for payroll review.
CREATE TABLE company_event_travel_policy (
  id TINYINT NOT NULL PRIMARY KEY,
  effective_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO company_event_travel_policy (id) VALUES (1);

CREATE TABLE company_event_travel_reports (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  company_event_id INT NOT NULL,
  event_date DATE NOT NULL,
  revision INT NOT NULL DEFAULT 1,
  report_json JSON NOT NULL,
  reviewed_by_user_id INT NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_event_travel_occurrence (agency_id, user_id, company_event_id, event_date)
);
ALTER TABLE payroll_time_claims ADD COLUMN event_travel_report_id INT NULL,
  ADD INDEX idx_time_event_travel (event_travel_report_id);
ALTER TABLE payroll_mileage_claims ADD COLUMN event_travel_report_id INT NULL,
  ADD INDEX idx_mileage_event_travel (event_travel_report_id);
