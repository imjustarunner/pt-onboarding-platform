-- Migration 1110: School ROI release emails can require Communications Center approval before send
ALTER TABLE agency_email_settings
  ADD COLUMN school_roi_emails_require_approval TINYINT(1) NOT NULL DEFAULT 1
  COMMENT 'When 1, school ROI / release signing emails queue as pending instead of sending immediately';
