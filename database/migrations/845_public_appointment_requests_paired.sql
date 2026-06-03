-- Migration 845: link paired intake/session requests and tag appointment role

ALTER TABLE public_appointment_requests
  ADD COLUMN appointment_role VARCHAR(16) NULL DEFAULT NULL
    COMMENT 'session | intake | NULL for legacy records'
    AFTER client_grade_level,
  ADD COLUMN paired_request_id INT NULL DEFAULT NULL
    COMMENT 'Links an intake request to its session request (or vice versa)'
    AFTER appointment_role;

ALTER TABLE public_appointment_requests
  ADD KEY idx_par_appointment_role (appointment_role),
  ADD KEY idx_par_paired_request (paired_request_id);
