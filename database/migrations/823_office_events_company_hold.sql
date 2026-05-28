-- Migration 823: Company hold slot state for admin-blocked office time (no provider)
ALTER TABLE office_events
  MODIFY COLUMN slot_state ENUM('ASSIGNED_AVAILABLE','ASSIGNED_TEMPORARY','ASSIGNED_BOOKED','COMPANY_HOLD') NULL;
