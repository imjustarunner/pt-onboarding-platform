-- Public marketing hub: optional session label + date range for families (e.g. "Session 1" / "June 1–12, 2026")

ALTER TABLE company_events
  ADD COLUMN public_session_label VARCHAR(128) NULL DEFAULT NULL
    COMMENT 'Family-facing session name for public listings (e.g. Session 1)',
  ADD COLUMN public_session_date_range VARCHAR(255) NULL DEFAULT NULL
    COMMENT 'Family-facing session dates text for public listings';
