-- SSC member application pipeline: intake forms, invite tokens, referral codes.

-- ── Pending/reviewed member applications ───────────────────────────────────
CREATE TABLE IF NOT EXISTS challenge_member_applications (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  agency_id         INT          NOT NULL COMMENT 'Club applied to',
  user_id           INT          NULL     COMMENT 'Linked user account (populated on approval)',
  referrer_user_id  INT          NULL     COMMENT 'User whose referral link brought this applicant',
  invite_id         INT          NULL     COMMENT 'Invite record that pre-seeded this application',

  -- Core identity (captured at application time)
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  email             VARCHAR(255) NOT NULL,
  phone             VARCHAR(30)  NULL,

  -- Activity profile
  gender            VARCHAR(20)  NULL,
  date_of_birth     DATE         NULL,
  weight_lbs        DECIMAL(6,2) NULL,
  height_inches     DECIMAL(5,2) NULL,
  timezone          VARCHAR(64)  NULL,

  -- Club custom field values at application time
  custom_fields     JSON         NULL,

  -- Workflow
  status            ENUM('pending','approved','denied') NOT NULL DEFAULT 'pending',
  manager_notes     TEXT         NULL,
  applied_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at       TIMESTAMP    NULL,
  reviewed_by       INT          NULL COMMENT 'User id of manager who reviewed',

  INDEX idx_cma_agency  (agency_id),
  INDEX idx_cma_status  (agency_id, status),
  INDEX idx_cma_email   (email),
  INDEX idx_cma_user    (user_id),
  INDEX idx_cma_ref     (referrer_user_id),
  CONSTRAINT fk_cma_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);

-- ── Manager-generated invite tokens ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS challenge_member_invites (
  id           INT          AUTO_INCREMENT PRIMARY KEY,
  agency_id    INT          NOT NULL,
  created_by   INT          NOT NULL COMMENT 'Manager user id',
  token        VARCHAR(64)  NOT NULL UNIQUE,
  email        VARCHAR(255) NULL     COMMENT 'Optional pre-fill email',
  label        VARCHAR(128) NULL     COMMENT 'Internal label (e.g. "Spring 2026 recruit")',
  auto_approve TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1 = skip approval queue on use',
  expires_at   TIMESTAMP    NULL,
  used_at      TIMESTAMP    NULL,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_cmi_agency (agency_id),
  INDEX idx_cmi_token  (token),
  CONSTRAINT fk_cmi_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);

-- ── Per-member referral codes (on user_agencies) ───────────────────────────
ALTER TABLE user_agencies
  ADD COLUMN referral_code         VARCHAR(16) NULL UNIQUE,
  ADD COLUMN referral_credit_count INT         NOT NULL DEFAULT 0;
