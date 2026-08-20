-- Migration 1261: paper-packet provider disclosure tracking
-- (1) Store the provider list JSON on each per-school version row so we know
--     exactly who was on the printed packet for that content hash.
-- (2) New table records which packet version each paper-packet client signed
--     and snapshots the provider list — enabling the system to flag when a
--     newly assigned provider was not on the packet version the family signed.
--     Only applies to confirmations on or after 2026-08-20 (tracking start date).

ALTER TABLE school_packet_org_versions
  ADD COLUMN providers_json MEDIUMTEXT NULL DEFAULT NULL
    COMMENT 'JSON array of provider objects included in this packet version';

CREATE TABLE client_paper_packet_disclosures (
  id                          INT          AUTO_INCREMENT PRIMARY KEY,
  client_id                   INT          NOT NULL,
  school_organization_id      INT          NOT NULL,
  packet_version_label        VARCHAR(32)  NOT NULL COLLATE utf8mb4_unicode_ci
                                COMMENT 'Version label read off the signed paper packet (e.g. 1.02)',
  school_packet_org_version_id INT         NULL
                                COMMENT 'FK to school_packet_org_versions; null when version not yet in DB',
  providers_snapshot          MEDIUMTEXT   NULL
                                COMMENT 'JSON snapshot of provider objects from the signed version',
  confirmed_at                DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                COMMENT 'When agency staff confirmed packet receipt — tracking only applies after 2026-08-20',
  confirmed_by_user_id        INT          NULL,
  KEY idx_cppd_client    (client_id),
  KEY idx_cppd_school    (school_organization_id),
  KEY idx_cppd_version   (school_packet_org_version_id),
  KEY idx_cppd_confirmed (confirmed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
