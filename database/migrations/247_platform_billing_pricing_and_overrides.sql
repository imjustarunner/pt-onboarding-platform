-- Migration: Platform billing pricing + per-agency overrides
-- Purpose:
--   1) Persist platform-wide default billing pricing (replaces hardcoded constants)
--   2) Allow per-agency pricing overrides for superadmin billing management

CREATE TABLE IF NOT EXISTS platform_billing_pricing (
  id INT PRIMARY KEY,
  pricing_json JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ensure singleton row exists (id=1) with an initial config.
-- Note: We intentionally include SMS per-message rates here (outbound client messages + notification messages).
INSERT INTO platform_billing_pricing (id, pricing_json)
VALUES (
  1,
  JSON_OBJECT(
    'baseFeeCents', 19900,
    'included', JSON_OBJECT(
      'schools', 2,
      'programs', 3,
      'admins', 3,
      'activeOnboardees', 15
    ),
    'unitCents', JSON_OBJECT(
      'school', 2500,
      'program', 1000,
      'admin', 500,
      'onboardee', 400
    ),
    'smsUnitCents', JSON_OBJECT(
      'outboundClient', 0,
      'notification', 0
    )
  )
)
ON DUPLICATE KEY UPDATE pricing_json = pricing_json;

-- Per-agency overrides (JSON merge overlay)
ALTER TABLE agency_billing_accounts
  ADD COLUMN pricing_override_json JSON NULL
  COMMENT 'Optional override pricing JSON merged over platform default pricing_json';

