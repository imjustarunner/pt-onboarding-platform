-- School-portal marketing campaigns owned by an agency.
--
-- Agency support/admin/super_admin set up a marketing splash that promotes a
-- *real registratable destination* (public marketing page, agency event,
-- skill-builders program events, program enrollment, agency enrollment).
-- The splash slides out as a toast in each targeted school's portal for
-- school_staff. They can preview the QR, download a PDF flier, and click
-- through to the actual public registration page.
--
-- Each campaign:
--   - Is owned by exactly one agency
--   - Targets one or more of that agency's schools (NULL row in the targets
--     table is interpreted as "all schools for this agency")
--   - Is dismissable per-user with re-show window
--   - Carries a destination_kind + destination_id pair that resolves to a
--     real public page in the destination resolver (controller).

CREATE TABLE IF NOT EXISTS agency_marketing_splashes (
  id                INT          AUTO_INCREMENT PRIMARY KEY,
  agency_id         INT          NOT NULL,
  created_by_user_id INT         NOT NULL,
  updated_by_user_id INT         NULL,

  title             VARCHAR(180) NOT NULL,
  subtitle          VARCHAR(240) NULL,
  body              TEXT         NULL,
  cta_label         VARCHAR(64)  NULL,
  accent_color      VARCHAR(16)  NULL  COMMENT 'Hex like #4f46e5 - falls back to agency brand',
  logo_path         VARCHAR(512) NULL,
  flier_path        VARCHAR(512) NULL  COMMENT 'StorageService key for downloadable PDF',
  flier_filename    VARCHAR(255) NULL,

  -- ── Destination ────────────────────────────────────────────────
  destination_kind  ENUM(
    'marketing_page',
    'event',
    'agency_events',
    'program_events',
    'program_enrollment',
    'agency_enrollment'
  ) NOT NULL,
  -- For destination_kind = marketing_page: this is public_marketing_pages.id
  -- For event / program_events / program_enrollment: company_events.id
  -- For agency_events / agency_enrollment: NULL (the agency itself is the entity)
  destination_id    INT          NULL,
  -- For program_events: optional JSON array of skill_builders_event_sessions.id
  -- to feature; NULL = "all sessions of this program"
  destination_subset_json JSON   NULL,
  -- Optional manager-specified override URL (otherwise resolved at read time)
  destination_override_url VARCHAR(1024) NULL,

  -- ── Schedule ───────────────────────────────────────────────────
  starts_at         TIMESTAMP    NULL,
  ends_at           TIMESTAMP    NULL,
  is_active         TINYINT(1)   NOT NULL DEFAULT 0,
  priority          INT          NOT NULL DEFAULT 0  COMMENT 'Higher = appears first in queue',

  -- ── Behavior knobs ─────────────────────────────────────────────
  initial_state     ENUM('peek', 'expanded', 'tab') NOT NULL DEFAULT 'peek',
  position          ENUM('right', 'bottom-right', 'bottom') NOT NULL DEFAULT 'right',
  show_qr           TINYINT(1)   NOT NULL DEFAULT 1,
  show_flier        TINYINT(1)   NOT NULL DEFAULT 1,
  reshow_after_hours INT         NOT NULL DEFAULT 24,

  -- ── Audience ───────────────────────────────────────────────────
  audience_school_staff_only TINYINT(1) NOT NULL DEFAULT 1,

  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_ams_agency_active (agency_id, is_active),
  INDEX idx_ams_window (is_active, starts_at, ends_at),

  CONSTRAINT fk_ams_agency  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_ams_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────────
-- Per-school targeting. If a campaign has zero rows in this table,
-- the resolver treats it as "all schools the agency has access to".
-- A row with disabled = 1 explicitly opts that school OUT.
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agency_marketing_splash_schools (
  splash_id              INT NOT NULL,
  school_organization_id INT NOT NULL,
  is_enabled             TINYINT(1) NOT NULL DEFAULT 1,
  paused_at              TIMESTAMP NULL,
  paused_by_user_id      INT NULL,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (splash_id, school_organization_id),
  INDEX idx_amss_school (school_organization_id, is_enabled),

  CONSTRAINT fk_amss_splash FOREIGN KEY (splash_id) REFERENCES agency_marketing_splashes(id) ON DELETE CASCADE,
  CONSTRAINT fk_amss_school FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-user dismissals so the toast doesn't haunt the same person every reload.
CREATE TABLE IF NOT EXISTS agency_marketing_splash_dismissals (
  id            INT          AUTO_INCREMENT PRIMARY KEY,
  splash_id     INT          NOT NULL,
  user_id       INT          NOT NULL,
  ack_kind      ENUM('snoozed', 'clicked', 'downloaded', 'closed') NOT NULL DEFAULT 'snoozed',
  dismissed_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_splash_user (splash_id, user_id),
  INDEX idx_amsd_user (user_id),

  CONSTRAINT fk_amsd_splash FOREIGN KEY (splash_id) REFERENCES agency_marketing_splashes(id) ON DELETE CASCADE,
  CONSTRAINT fk_amsd_user   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
