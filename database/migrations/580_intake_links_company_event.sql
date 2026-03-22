-- Intake / digital forms scoped to a Skill Builders integrated company event

ALTER TABLE intake_links
  ADD COLUMN company_event_id INT NULL DEFAULT NULL AFTER learning_class_id,
  ADD INDEX idx_intake_links_company_event (company_event_id),
  ADD CONSTRAINT fk_intake_links_company_event
    FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE SET NULL;
