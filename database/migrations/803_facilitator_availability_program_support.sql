-- Extend the facilitator availability system to support Programs (not just company_events).
-- Previously the system only supported company_events; programs use a different table structure
-- (programs → program_sites → program_shift_signups).
--
-- Strategy: make company_event_id nullable and add a nullable program_id so either can be set.

-- 1. request_events: allow program_id in place of company_event_id
ALTER TABLE facilitator_availability_request_events
  MODIFY COLUMN company_event_id INT NULL DEFAULT NULL
    COMMENT 'Set when the request targets a company_event. Mutually exclusive with program_id.',
  ADD COLUMN program_id INT NULL DEFAULT NULL
    COMMENT 'Set when the request targets a program. Mutually exclusive with company_event_id.'
    AFTER company_event_id,
  ADD CONSTRAINT fk_fare_program
    FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE;

-- 2. date_entries: allow program_id in place of company_event_id
ALTER TABLE facilitator_availability_date_entries
  MODIFY COLUMN company_event_id INT NULL DEFAULT NULL
    COMMENT 'Set for company_event-based requests.',
  ADD COLUMN program_id INT NULL DEFAULT NULL
    COMMENT 'Set for program-based requests.'
    AFTER company_event_id,
  ADD CONSTRAINT fk_fade_program
    FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE;
