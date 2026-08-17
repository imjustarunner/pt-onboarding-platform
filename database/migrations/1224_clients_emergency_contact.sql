-- Migration 1224: store optional emergency contact on client account (self intake)
ALTER TABLE clients
  ADD COLUMN emergency_contact_name VARCHAR(255) NULL DEFAULT NULL
  COMMENT 'Optional emergency contact full name from intake',
  ADD COLUMN emergency_contact_relationship VARCHAR(120) NULL DEFAULT NULL
  COMMENT 'Optional relationship of emergency contact',
  ADD COLUMN emergency_contact_phone VARCHAR(40) NULL DEFAULT NULL
  COMMENT 'Optional emergency contact phone';
