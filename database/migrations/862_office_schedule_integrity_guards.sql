-- Migration 862: office schedule integrity guards
-- Adds VIRTUAL generated guard columns and unique indexes so the database rejects
-- duplicate non-cancelled room/time events and duplicate active standing slots.
--
-- Why VIRTUAL instead of STORED:
--   STORED columns require ALGORITHM=COPY (full table rebuild), which causes InnoDB
--   to re-validate every FK constraint on the table.  If any FK reference is
--   orphaned the rebuild aborts with errno 1215 "Cannot add foreign key constraint"
--   even though we are not adding a FK ourselves.
--   VIRTUAL columns use ALGORITHM=INPLACE — no rebuild, no FK re-check, no error.
--   MySQL 8.0 fully supports UNIQUE secondary indexes on virtual columns.
--
-- Each ALTER TABLE is split into two statements (ADD COLUMNs first, then the
-- UNIQUE KEY) for compatibility with older 8.0.x patch releases.
--
-- If a UNIQUE KEY statement fails with ER_DUP_ENTRY it means there are already
-- duplicate active rows in that table.  Open /admin/booking-conflict-resolver,
-- resolve all conflicts shown there, then re-run:
--   node database/run-migrations.js --unlog=862 --migration=862 --force

-- ── office_events ─────────────────────────────────────────────────────────────

ALTER TABLE office_events
  ADD COLUMN active_guard_room_id INT
    GENERATED ALWAYS AS (
      CASE
        WHEN status IS NULL OR UPPER(status) <> 'CANCELLED' THEN room_id
        ELSE NULL
      END
    ) VIRTUAL,
  ADD COLUMN active_guard_start_at DATETIME
    GENERATED ALWAYS AS (
      CASE
        WHEN status IS NULL OR UPPER(status) <> 'CANCELLED' THEN start_at
        ELSE NULL
      END
    ) VIRTUAL,
  ADD COLUMN active_guard_end_at DATETIME
    GENERATED ALWAYS AS (
      CASE
        WHEN status IS NULL OR UPPER(status) <> 'CANCELLED' THEN end_at
        ELSE NULL
      END
    ) VIRTUAL;

ALTER TABLE office_events
  ADD UNIQUE KEY uniq_office_events_active_room_slot (
    active_guard_room_id,
    active_guard_start_at,
    active_guard_end_at
  );

-- ── office_standing_assignments ───────────────────────────────────────────────

ALTER TABLE office_standing_assignments
  ADD COLUMN active_guard_office_location_id INT
    GENERATED ALWAYS AS (
      CASE WHEN is_active = TRUE THEN office_location_id ELSE NULL END
    ) VIRTUAL,
  ADD COLUMN active_guard_room_id INT
    GENERATED ALWAYS AS (
      CASE WHEN is_active = TRUE THEN room_id ELSE NULL END
    ) VIRTUAL,
  ADD COLUMN active_guard_weekday TINYINT
    GENERATED ALWAYS AS (
      CASE WHEN is_active = TRUE THEN weekday ELSE NULL END
    ) VIRTUAL,
  ADD COLUMN active_guard_hour TINYINT
    GENERATED ALWAYS AS (
      CASE WHEN is_active = TRUE THEN hour ELSE NULL END
    ) VIRTUAL;

ALTER TABLE office_standing_assignments
  ADD UNIQUE KEY uniq_office_standing_assignments_active_slot (
    active_guard_office_location_id,
    active_guard_room_id,
    active_guard_weekday,
    active_guard_hour
  );

-- ── office_booking_plans ──────────────────────────────────────────────────────

ALTER TABLE office_booking_plans
  ADD COLUMN active_guard_standing_assignment_id INT
    GENERATED ALWAYS AS (
      CASE WHEN is_active = TRUE THEN standing_assignment_id ELSE NULL END
    ) VIRTUAL;

ALTER TABLE office_booking_plans
  ADD UNIQUE KEY uniq_office_booking_plans_one_active (
    active_guard_standing_assignment_id
  );
