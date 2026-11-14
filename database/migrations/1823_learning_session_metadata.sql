-- Additive support for the existing tutoring appointment/session bridge.
-- No attendance, completion, compensation or historical service is changed.
ALTER TABLE learning_class_sessions
  ADD COLUMN metadata_json JSON NULL;
