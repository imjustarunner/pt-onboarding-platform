-- Public marketing / hub: registration availability banner on event cards.

ALTER TABLE company_events
  ADD COLUMN public_registration_status ENUM('open', 'limited', 'waitlist', 'closed') NOT NULL DEFAULT 'open'
    COMMENT 'Drives public listing registration CTA state' AFTER registration_eligible,
  ADD COLUMN public_registration_status_label VARCHAR(120) NULL DEFAULT NULL
    COMMENT 'Optional override for banner text' AFTER public_registration_status;
