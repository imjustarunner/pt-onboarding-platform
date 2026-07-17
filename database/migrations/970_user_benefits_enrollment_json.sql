-- Migration 970: Benefits enrollment (health premium, 401k enrolled, school mileage contract, YTD)
ALTER TABLE users
  ADD COLUMN benefits_enrollment_json JSON NULL
  COMMENT 'Enrollment state: health premium/enrolled, 401k enrolled, school mileage contract, employer contrib YTD';
