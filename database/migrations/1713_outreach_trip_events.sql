-- Keep Outreach Hub routes and their assigned event as one scheduling record.
ALTER TABLE outreach_trips
  ADD COLUMN company_event_id INT NULL,
  ADD COLUMN event_config_json JSON NULL,
  ADD UNIQUE KEY uq_outreach_trip_event (company_event_id),
  ADD CONSTRAINT fk_outreach_trip_event FOREIGN KEY (company_event_id)
    REFERENCES company_events(id) ON DELETE RESTRICT;
