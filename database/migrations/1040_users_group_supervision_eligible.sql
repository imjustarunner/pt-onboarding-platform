-- Migration 1040: Flag supervisors who may book/edit group supervision sessions
ALTER TABLE users
  ADD COLUMN group_supervision_eligible TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'Eligible to book and edit group supervision sessions'
  AFTER has_supervisor_privileges;
