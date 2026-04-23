-- Program events: per-event family attendance confirmation tracking
--
-- The participants page surfaces a "Confirmed" column that is eventually fed by
-- automated text/email reminders ("We can't wait to see you — will you be
-- attending?"). Until those automations exist, coordinators record the answer
-- manually (and admins can override after a phone call etc.).
--
-- Values:
--   pending  -> No reply yet (default for every new enrollment)
--   yes      -> Family confirmed they will attend
--   no       -> Family said they will NOT attend
-- The set_method column lets us distinguish a real automated reply from an
-- admin override later when reporting.

ALTER TABLE company_event_clients
  ADD COLUMN confirmation_status ENUM('pending', 'yes', 'no') NOT NULL DEFAULT 'pending'
    COMMENT 'Family attendance confirmation — set by reply or admin override'
    AFTER intake_outcome,
  ADD COLUMN confirmation_set_at DATETIME NULL DEFAULT NULL
    AFTER confirmation_status,
  ADD COLUMN confirmation_set_by_user_id INT NULL DEFAULT NULL
    AFTER confirmation_set_at,
  ADD COLUMN confirmation_set_method ENUM('text', 'email', 'admin_override') NULL DEFAULT NULL
    AFTER confirmation_set_by_user_id,
  ADD CONSTRAINT fk_cec_confirmation_set_by
    FOREIGN KEY (confirmation_set_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
