-- Migration 1262: three-tier version precision for school paper packets
--
-- version_tenths   bumped when any major document template section changes (e.g. HIPAA text)
-- version_hundredths bumped when providers change (new/removed from care-team roster)
-- version_thousandths bumped when school staff change (and for any other minor changes)
--
-- The human-readable label is "{major}.{t}{h}{s}" with trailing zeros stripped:
--   t=0 h=2 s=0  →  1.02
--   t=1 h=0 s=0  →  1.1
--   t=1 h=2 s=3  →  1.123
--
-- The existing version_minor column is preserved for back-compat and acts as a monotonic
-- sequence number; new code uses the three precision columns instead.

ALTER TABLE school_packet_org_versions
  ADD COLUMN version_tenths      SMALLINT UNSIGNED NOT NULL DEFAULT 0
    COMMENT 'Bumped on major document content changes (template_version incremented)'
    AFTER version_minor,
  ADD COLUMN version_hundredths  SMALLINT UNSIGNED NOT NULL DEFAULT 0
    COMMENT 'Bumped when providers on the care-team roster change'
    AFTER version_tenths,
  ADD COLUMN version_thousandths SMALLINT UNSIGNED NOT NULL DEFAULT 0
    COMMENT 'Bumped when school staff change or other minor roster edits occur'
    AFTER version_hundredths,
  ADD COLUMN template_version_snapshot SMALLINT UNSIGNED NULL DEFAULT NULL
    COMMENT 'School packet template version active when this packet version was rendered'
    AFTER version_thousandths;
