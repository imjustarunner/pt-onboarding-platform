-- Migration 1239: Trip-scoped outreach activity, stop colors, calendar link

ALTER TABLE outreach_school_notes
  ADD COLUMN note_kind VARCHAR(32) NOT NULL DEFAULT 'general'
    COMMENT 'general | conversation | follow_up'
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  ADD COLUMN trip_id INT NULL DEFAULT NULL
    COMMENT 'Optional outreach_trips.id when logged on a trip',
  ADD COLUMN trip_stop_id INT NULL DEFAULT NULL
    COMMENT 'Optional outreach_trip_stops.id',
  ADD COLUMN contact_id INT NULL DEFAULT NULL
    COMMENT 'Linked outreach_school_contacts.id for conversation notes',
  ADD COLUMN spoken_with_name VARCHAR(255) NULL DEFAULT NULL
    COMMENT 'Contact name as typed (may create contact)'
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  ADD COLUMN follow_up_at DATE NULL DEFAULT NULL
    COMMENT 'When note_kind is follow_up';

CREATE INDEX idx_oh_notes_trip ON outreach_school_notes (trip_id, created_at);
CREATE INDEX idx_oh_notes_kind ON outreach_school_notes (outreach_school_id, note_kind);

ALTER TABLE outreach_activities
  ADD COLUMN trip_id INT NULL DEFAULT NULL
    COMMENT 'Optional outreach_trips.id when logged on a trip',
  ADD COLUMN trip_stop_id INT NULL DEFAULT NULL
    COMMENT 'Optional outreach_trip_stops.id';

CREATE INDEX idx_oh_act_trip ON outreach_activities (trip_id, activity_at);

ALTER TABLE tasks
  ADD COLUMN outreach_trip_id INT NULL DEFAULT NULL
    COMMENT 'Optional outreach trip this task was created from';

CREATE INDEX idx_tasks_outreach_trip ON tasks (outreach_trip_id);

ALTER TABLE outreach_trip_stops
  ADD COLUMN stop_color VARCHAR(16) NULL DEFAULT NULL
    COMMENT 'Hex color for stop color-coding'
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE provider_schedule_events
  ADD COLUMN outreach_trip_id INT NULL DEFAULT NULL
    COMMENT 'Linked outreach_trips.id for OUTREACH_TRIP events';

CREATE INDEX idx_pse_outreach_trip ON provider_schedule_events (outreach_trip_id);
