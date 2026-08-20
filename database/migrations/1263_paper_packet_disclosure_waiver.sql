-- Migration 1263: waiver support for "new packet needed" flag
--
-- When a major document section changes (tenths bump) the system flags that a
-- new paper packet must be signed. Admins can waive this requirement if the
-- change is minor (e.g. a typo fix) and record a reason that is displayed in
-- the disclosure panel.

ALTER TABLE client_paper_packet_disclosures
  ADD COLUMN waived_new_packet_at DATETIME NULL DEFAULT NULL
    COMMENT 'When an admin waived the new-packet requirement for this disclosure'
    AFTER confirmed_by_user_id,
  ADD COLUMN waived_new_packet_reason VARCHAR(500) NULL DEFAULT NULL
    COLLATE utf8mb4_unicode_ci
    COMMENT 'Why the admin waived the new-packet requirement'
    AFTER waived_new_packet_at,
  ADD COLUMN waived_by_user_id INT NULL DEFAULT NULL
    COMMENT 'Admin user who waived the requirement'
    AFTER waived_new_packet_reason;
