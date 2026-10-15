-- Active room/hour uniqueness is enforced by uniq_office_standing_assignments_active_slot
-- (migrations 862/863). Historical inactive rows must not prevent returning to a room.
-- Retain the lookup index and every historical assignment, event, and booking plan.
ALTER TABLE office_standing_assignments
  DROP INDEX uniq_office_standing_assignment_slot,
  ADD INDEX idx_office_standing_assignment_history (room_id, provider_id, weekday, hour, assigned_frequency);
