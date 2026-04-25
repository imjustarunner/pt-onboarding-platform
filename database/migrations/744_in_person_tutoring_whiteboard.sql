-- Migration 744: persisted in-person tutoring whiteboards and guardian sharing controls
ALTER TABLE learning_class_session_in_person_plans
  ADD COLUMN IF NOT EXISTS whiteboard_json LONGTEXT NULL AFTER layout_prefs_json,
  ADD COLUMN IF NOT EXISTS share_whiteboard_with_guardian TINYINT(1) NOT NULL DEFAULT 0 AFTER whiteboard_json;
