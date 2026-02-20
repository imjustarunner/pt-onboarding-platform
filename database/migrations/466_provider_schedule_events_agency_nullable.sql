-- Allow person-level schedule events to be agency-agnostic.
-- Personal events and schedule holds can be created without agency context.

ALTER TABLE provider_schedule_events
  MODIFY COLUMN agency_id INT NULL;
