/* Keep long-running meeting plans while materializing only a rolling year.
   Held rows retain their original identity and date-specific presenter work.
   No clinical appointments are deleted or fee-settled by this migration. */
ALTER TABLE supervision_sessions ADD COLUMN recurrence_policy VARCHAR(16) NULL;
ALTER TABLE supervision_sessions ADD COLUMN recurrence_horizon_held TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE supervision_sessions ADD COLUMN recurrence_stopped TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE supervision_sessions ADD COLUMN recurrence_calendar_pending TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE supervision_sessions ADD COLUMN recurrence_calendar_generation INT NOT NULL DEFAULT 0;
ALTER TABLE provider_schedule_events ADD COLUMN recurrence_horizon_held TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE provider_schedule_events ADD COLUMN recurrence_stopped TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE provider_schedule_events ADD COLUMN recurrence_calendar_pending TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE provider_schedule_events ADD COLUMN recurrence_calendar_generation INT NOT NULL DEFAULT 0;
