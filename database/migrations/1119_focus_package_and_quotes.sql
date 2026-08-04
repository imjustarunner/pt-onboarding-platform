-- Migration 1119: Focus Package ($80 list / $0 grandfather) + quote image pools

-- Enable Focus Package flag; keep focusMusicEnabled true for backward compatibility
UPDATE agencies
SET feature_flags = JSON_SET(
  COALESCE(feature_flags, JSON_OBJECT()),
  '$.focusPackageEnabled',
  TRUE,
  '$.focusMusicEnabled',
  TRUE
);

INSERT INTO agency_feature_entitlement_events
  (agency_id, feature_key, event_type, actor_user_id, actor_role, effective_at, notes)
SELECT id, 'focusPackage', 'enabled', NULL, 'system', NOW(),
       'Grandfathered Focus Package (Music + Session) at $0 for existing tenants (migration 1119)'
FROM agencies;

UPDATE agency_billing_accounts aba
SET pricing_override_json = JSON_SET(
  COALESCE(aba.pricing_override_json, JSON_OBJECT()),
  '$.featureCatalog.focusPackage.tenantMonthlyCents',
  0,
  '$.featureCatalog.focusPackage.userMonthlyCents',
  0,
  '$.featureCatalog.focusMusic.tenantMonthlyCents',
  0,
  '$.featureCatalog.focusMusic.userMonthlyCents',
  0
);

UPDATE agency_billing_accounts aba
SET feature_entitlements_json = JSON_SET(
  COALESCE(aba.feature_entitlements_json, JSON_OBJECT()),
  '$.focusPackage.enabled', TRUE,
  '$.focusPackage.available', TRUE,
  '$.focusPackage.unitAmountCents', 0,
  '$.focusMusic.enabled', TRUE,
  '$.focusMusic.available', TRUE,
  '$.focusMusic.unitAmountCents', 0
);

CREATE TABLE IF NOT EXISTS focus_quote_images (
  id INT PRIMARY KEY AUTO_INCREMENT,
  scope ENUM('platform', 'agency', 'user') NOT NULL DEFAULT 'platform',
  agency_id INT NULL,
  user_id INT NULL COMMENT 'Owner when scope=user',
  storage_path VARCHAR(512) NOT NULL,
  title VARCHAR(200) NULL,
  quote_text VARCHAR(500) NULL,
  attribution VARCHAR(200) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_focus_quotes_scope (scope, agency_id, is_active),
  INDEX idx_focus_quotes_user (user_id, is_active),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_focus_quote_hidden (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  focus_quote_image_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_hidden_quote (user_id, focus_quote_image_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (focus_quote_image_id) REFERENCES focus_quote_images(id) ON DELETE CASCADE
);

-- Seed platform quote references (served from assets/Focus/)
INSERT INTO focus_quote_images (scope, storage_path, title, quote_text, attribution)
VALUES
  ('platform', 'Focus/Aug 4, 2026, 04_01_31 AM.png', 'Discipline', 'Discipline is choosing between what you want now and what you want most.', 'Unknown'),
  ('platform', 'Focus/Aug 4, 2026, 04_08_47 AM.png', 'Focus', 'Where focus goes, energy flows.', NULL),
  ('platform', 'Focus/Aug 4, 2026, 04_08_50 AM.png', 'Progress', 'Small steps every day lead to big results.', NULL),
  ('platform', 'Focus/Aug 4, 2026, 04_08_51 AM.png', 'Clarity', 'Clarity comes from engagement, not thought.', NULL),
  ('platform', 'Focus/Aug 4, 2026, 04_08_53 AM.png', 'Presence', 'Be where your feet are.', NULL),
  ('platform', 'Focus/Aug 4, 2026, 04_09_02 AM.png', 'Intention', 'Begin with the end in mind.', NULL),
  ('platform', 'Focus/Aug 4, 2026, 04_13_53 AM.png', 'Steady', 'Consistency compounds.', NULL);
