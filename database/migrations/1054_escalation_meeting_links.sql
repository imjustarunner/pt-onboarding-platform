-- Migration 1054: Link org escalations to team meetings / action items
ALTER TABLE support_tickets
  ADD COLUMN linked_schedule_event_id INT NULL
  COMMENT 'Optional provider_schedule_events.id this escalation is tagged to';

ALTER TABLE support_tickets
  ADD COLUMN linked_recurrence_series_id VARCHAR(64) NULL
  COMMENT 'Optional recurrence series id when tagged to a recurring Admin Meeting';

ALTER TABLE support_tickets
  ADD COLUMN linked_action_item_id VARCHAR(64) NULL
  COMMENT 'Optional action item id within the meeting workspace JSON';

CREATE INDEX idx_support_tickets_linked_event
  ON support_tickets (linked_schedule_event_id);

CREATE INDEX idx_support_tickets_linked_series
  ON support_tickets (linked_recurrence_series_id);
